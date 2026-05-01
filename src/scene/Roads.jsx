import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useStyle } from '../context/StyleContext'
import { useQuality } from '../context/QualityContext'
import useNycMask from '../hooks/useNycMask'
import { loadLand } from '../lib/landData'
import { loadRoadsManifest } from '../lib/manifests'
import RoadsWorker from '../workers/roadsWorker.js?worker'

const CHECK_EVERY = 15
// Cap concurrent fetch+build dispatches so when the camera moves, the queue
// stays small and the next tick can re-prioritize by distance instead of
// flushing every newly-in-range tile at once. 6 keeps the single road worker
// fed without queuing very-far tiles ahead of nearby ones.
const MAX_IN_FLIGHT = 6
// LRU bound on built road geometry. Each entry is small (a few KB to a few
// hundred KB), so a generous cap is cheap and means re-visiting a recent area
// is a one-frame state update with no fetch and no worker dispatch.
const GEOM_CACHE_SIZE = 128

function makeBufferGeometry({ positions, normals, indices }) {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3))
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), 3))
  g.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1))
  return g
}

function lruGet(map, key) {
  if (!map.has(key)) return null
  const v = map.get(key)
  map.delete(key)
  map.set(key, v)
  return v
}

function lruSet(map, key, value, limit) {
  if (map.has(key)) map.delete(key)
  map.set(key, value)
  while (map.size > limit) {
    const oldest = map.keys().next().value
    map.delete(oldest)
  }
}

function RoadTile({ entry, roadMat, bridgeMat, pillarMat }) {
  const roadGeom = useMemo(() => entry.road ? makeBufferGeometry(entry.road) : null, [entry.road])
  const bridgeGeom = useMemo(() => entry.bridge ? makeBufferGeometry(entry.bridge) : null, [entry.bridge])
  const pillarGeom = useMemo(() => entry.pillar ? makeBufferGeometry(entry.pillar) : null, [entry.pillar])
  useEffect(() => () => {
    roadGeom?.dispose()
    bridgeGeom?.dispose()
    pillarGeom?.dispose()
  }, [roadGeom, bridgeGeom, pillarGeom])
  return (
    <>
      {roadGeom && <mesh geometry={roadGeom} material={roadMat} />}
      {bridgeGeom && <mesh geometry={bridgeGeom} material={bridgeMat} />}
      {pillarGeom && <mesh geometry={pillarGeom} material={pillarMat} />}
    </>
  )
}

export default function Roads() {
  const { camera } = useThree()
  const style = useStyle()
  const { renderRadius } = useQuality()
  const mask = useNycMask()

  const radiusRef = useRef(renderRadius)
  useEffect(() => { radiusRef.current = renderRadius }, [renderRadius])

  const maskRef = useRef(mask)
  useEffect(() => { maskRef.current = mask }, [mask])

  const [tileGeoms, setTileGeoms] = useState(new Map())
  const loadedRef = useRef(new Set())
  const inFlightRef = useRef(new Set())
  const manifestRef = useRef(null)
  const workerRef = useRef(null)
  const frameRef = useRef(0)
  // Persistent cache of fetched raw tile JSON: tileId -> tile. Avoids
  // re-fetching when the camera leaves and re-enters an area.
  const tileDataRef = useRef(new Map())
  // LRU cache of built geometry keyed by tileId. On a hit we skip both fetch
  // and worker entirely.
  const geomCacheRef = useRef(new Map())

  useEffect(() => {
    const w = new RoadsWorker()
    w.onmessage = ({ data }) => {
      if (data.type !== 'ROAD_TILE_READY') return
      const { tileId, road, bridge, pillar } = data
      inFlightRef.current.delete(tileId)
      if (!road && !bridge && !pillar) return
      lruSet(geomCacheRef.current, tileId, { road, bridge, pillar }, GEOM_CACHE_SIZE)
      loadedRef.current.add(tileId)
      setTileGeoms((prev) => new Map(prev).set(tileId, { road, bridge, pillar }))
    }
    workerRef.current = w
    // Hand the worker the mask data the main thread is already loading,
    // instead of letting it issue a duplicate fetch for land.json. Workers
    // process messages in FIFO order, so any BUILD_ROAD_TILE posted afterwards
    // queues behind getMask() inside the worker until INIT_MASK lands.
    loadLand()
      .then((land) => w.postMessage({ type: 'INIT_MASK', land }))
      .catch((err) => console.error('[Roads] mask init:', err))
    // Force the next useFrame to run the in-range check. Mirrors Buildings.jsx
    // for the workers-finish-last race against the manifest fetch.
    frameRef.current = CHECK_EVERY - 1
    return () => w.terminate()
  }, [])

  useEffect(() => {
    loadRoadsManifest()
      .then((m) => {
        manifestRef.current = m
        // Force the next useFrame to run the in-range check instead of
        // waiting up to ~250ms for the periodic CHECK_EVERY tick.
        frameRef.current = CHECK_EVERY - 1
      })
      .catch((err) => console.error('[Roads] manifest fetch:', err))
  }, [])

  useFrame(() => {
    if (++frameRef.current % CHECK_EVERY !== 0) return
    const manifest = manifestRef.current
    if (!manifest || !workerRef.current) return
    const m = maskRef.current
    const { x, y, z } = camera.position
    const radius = Math.max(radiusRef.current, y * 1.5)
    const r2 = radius * radius
    const inRange = new Set()
    const distById = new Map()
    for (const t of manifest.tiles) {
      // Skip tiles entirely outside the visible world — saves the network fetch
      // for far-Long-Island and far-NJ tiles even before per-segment filtering.
      if (m && !m.bboxIntersects(t.bounds)) continue
      const cx = (t.bounds.minX + t.bounds.maxX) / 2
      const cz = (t.bounds.minZ + t.bounds.maxZ) / 2
      const d2 = (x - cx) * (x - cx) + (z - cz) * (z - cz)
      if (d2 < r2) {
        inRange.add(t.id)
        distById.set(t.id, d2)
      }
    }

    // Build a sorted candidate list (nearest first) so when MAX_IN_FLIGHT clips
    // the queue, the closest pending tiles are dispatched and far tiles wait
    // for the next tick. Camera-move re-prioritization is implicit.
    const candidates = []
    for (const t of manifest.tiles) {
      if (!inRange.has(t.id)) continue
      if (loadedRef.current.has(t.id) || inFlightRef.current.has(t.id)) continue
      candidates.push(t)
    }
    candidates.sort((a, b) => distById.get(a.id) - distById.get(b.id))

    for (const t of candidates) {
      if (inFlightRef.current.size >= MAX_IN_FLIGHT) break
      inFlightRef.current.add(t.id)

      // Geom cache hit → skip fetch + worker entirely.
      const cachedGeom = lruGet(geomCacheRef.current, t.id)
      if (cachedGeom) {
        inFlightRef.current.delete(t.id)
        loadedRef.current.add(t.id)
        setTileGeoms((prev) => new Map(prev).set(t.id, cachedGeom))
        continue
      }

      // Tile-data cache hit → skip fetch, dispatch to worker.
      const cachedTile = tileDataRef.current.get(t.id)
      if (cachedTile) {
        workerRef.current.postMessage({ type: 'BUILD_ROAD_TILE', tileId: t.id, tile: cachedTile })
        continue
      }

      fetch(`/data/manhattan/${t.file}`)
        .then((r) => r.json())
        .then((data) => {
          tileDataRef.current.set(t.id, data)
          if (!workerRef.current) {
            inFlightRef.current.delete(t.id)
            return
          }
          workerRef.current.postMessage({ type: 'BUILD_ROAD_TILE', tileId: t.id, tile: data })
        })
        .catch(() => inFlightRef.current.delete(t.id))
    }

    const toRemove = []
    for (const id of loadedRef.current) if (!inRange.has(id)) toRemove.push(id)
    if (toRemove.length > 0) {
      for (const id of toRemove) loadedRef.current.delete(id)
      setTileGeoms((prev) => {
        const next = new Map(prev)
        for (const id of toRemove) next.delete(id)
        return next
      })
    }
  })

  if (!style.roadMaterial) return null
  // Hold off rendering until the mask loads. Otherwise we'd flash the full
  // bbox (NJ + Nassau Co.) for one frame before the filter kicks in.
  if (!mask) return null
  return (
    <>
      {[...tileGeoms.entries()].map(([id, entry]) => (
        <RoadTile
          key={id}
          entry={entry}
          roadMat={style.roadMaterial}
          bridgeMat={style.bridgeMaterial ?? style.roadMaterial}
          pillarMat={style.bridgePillarMaterial ?? style.bridgeMaterial ?? style.roadMaterial}
        />
      ))}
    </>
  )
}

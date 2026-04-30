import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useStyle } from '../context/StyleContext'
import { useQuality } from '../context/QualityContext'
import useNycMask from '../hooks/useNycMask'
import RoadsWorker from '../workers/roadsWorker.js?worker'

const MANIFEST_URL = '/data/manhattan/roads_manifest.json'
const CHECK_EVERY = 15

function makeBufferGeometry({ positions, normals, indices }) {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3))
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), 3))
  g.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1))
  return g
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

  useEffect(() => {
    const w = new RoadsWorker()
    w.onmessage = ({ data }) => {
      if (data.type !== 'ROAD_TILE_READY') return
      const { tileId, road, bridge, pillar } = data
      inFlightRef.current.delete(tileId)
      if (!road && !bridge && !pillar) return
      loadedRef.current.add(tileId)
      setTileGeoms((prev) => new Map(prev).set(tileId, { road, bridge, pillar }))
    }
    workerRef.current = w
    return () => w.terminate()
  }, [])

  useEffect(() => {
    fetch(MANIFEST_URL)
      .then((r) => r.json())
      .then((m) => { manifestRef.current = m })
      .catch((err) => console.error('[Roads] manifest fetch:', err))
  }, [])

  useFrame(() => {
    if (++frameRef.current % CHECK_EVERY !== 0) return
    const manifest = manifestRef.current
    if (!manifest || !workerRef.current) return
    const m = maskRef.current
    const { x, y, z } = camera.position
    const radius = Math.max(radiusRef.current, y * 1.5)
    const inRange = new Set()
    for (const t of manifest.tiles) {
      // Skip tiles entirely outside the visible world — saves the network fetch
      // for far-Long-Island and far-NJ tiles even before per-segment filtering.
      if (m && !m.bboxIntersects(t.bounds)) continue
      const cx = (t.bounds.minX + t.bounds.maxX) / 2
      const cz = (t.bounds.minZ + t.bounds.maxZ) / 2
      if (Math.hypot(x - cx, z - cz) < radius) inRange.add(t.id)
    }

    for (const t of manifest.tiles) {
      if (!inRange.has(t.id)) continue
      if (loadedRef.current.has(t.id) || inFlightRef.current.has(t.id)) continue
      inFlightRef.current.add(t.id)
      fetch(`/data/manhattan/${t.file}`)
        .then((r) => r.json())
        .then((data) => {
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

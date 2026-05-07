import { useEffect, useMemo, useRef, useState } from 'react'
import { useThree } from '@react-three/fiber'
import { useStyle } from '../context/StyleContext'
import { useQuality } from '../context/QualityContext'
import { useSelectionStore } from '../context/SelectionContext'
import useNycMask from '../hooks/useNycMask'
import { loadLand } from '../lib/landData'
import { loadRoadsManifest } from '../lib/manifests'
import { lruGet, lruSet } from '../lib/lru'
import { makeBufferGeometry } from '../lib/threeBuffers'
import { useTileStreamer } from '../hooks/useTileStreamer'
import { loadingState } from '../ui/loadingState'
import RoadsWorker from '../workers/roadsWorker.js?worker'

const CHECK_EVERY = 5
// Cap concurrent fetch+build dispatches so when the camera moves, the queue
// stays small and the next tick can re-prioritize by distance instead of
// flushing every newly-in-range tile at once.
const MAX_IN_FLIGHT = 8
// Match Buildings' worker count. Roads has ~6,800 tile files (more than
// Buildings' ~3,200 because it extends across bridges to NJ/Long Island) and
// the worker also splits roads/bridges/pillars, so it's the slower of the two
// pipelines — the extra worker matters here.
const NUM_WORKERS = Math.max(1, Math.min(3, (typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency ?? 4) : 4) - 1))
// LRU bound on built road geometry. Bumped from 128 because the dataset is
// twice the size of Buildings (~6,800 tiles); 512 entries (~25–60 MB) gives
// comparable revisit hit rate to Buildings' 256/3,200.
const GEOM_CACHE_SIZE = 512

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
  const workersRef = useRef([])
  const nextWorkerRef = useRef(0)
  // Persistent raw tile JSON cache: avoids re-fetching on camera leave/return.
  const tileDataRef = useRef(new Map())
  // LRU cache of built geometry by tileId. A hit skips both fetch and worker.
  const geomCacheRef = useRef(new Map())
  const abortersRef = useRef(new Map())

  const { forceTick, prefetchAround } = useTileStreamer({
    checkEvery: CHECK_EVERY,
    maxInFlight: MAX_IN_FLIGHT,
    getManifest: () => manifestRef.current,
    camera,
    getRadius: () => radiusRef.current,
    // Roads uses the NYC mask to skip tiles fully outside the visible world,
    // saving fetches for far Long Island / NJ tiles.
    getMask: () => maskRef.current,
    loadedRef,
    inFlightRef,
    tileDataRef,
    abortersRef,
    // Geom-cache hit: update render state directly and skip fetch + worker.
    tryGeomCache: (tileId) => {
      const hit = lruGet(geomCacheRef.current, tileId)
      if (!hit) return false
      setTileGeoms(prev => new Map(prev).set(tileId, hit))
      return true
    },
    onDispatch: (tileId, data) => {
      const ws = workersRef.current
      if (ws.length === 0) return
      const w = ws[nextWorkerRef.current]
      nextWorkerRef.current = (nextWorkerRef.current + 1) % ws.length
      w.postMessage({ type: 'BUILD_ROAD_TILE', tileId, tile: data })
    },
    onRemove: (ids) => {
      setTileGeoms(prev => {
        const next = new Map(prev)
        for (const id of ids) next.delete(id)
        return next
      })
    },
  })

  useEffect(() => {
    const handleMessage = ({ data }) => {
      if (data.type !== 'ROAD_TILE_READY') return
      const { tileId, road, bridge, pillar } = data
      // The tick loop deletes from inFlightRef when a tile leaves range. Cache
      // the result either way for return visits, but only push to React state
      // if the tile is still wanted.
      const wasWanted = inFlightRef.current.has(tileId)
      inFlightRef.current.delete(tileId)
      if (!road && !bridge && !pillar) return
      lruSet(geomCacheRef.current, tileId, { road, bridge, pillar }, GEOM_CACHE_SIZE)
      if (!wasWanted) return
      loadedRef.current.add(tileId)
      setTileGeoms(prev => new Map(prev).set(tileId, { road, bridge, pillar }))
    }
    const workers = []
    // Hand each worker the main thread's already-cached land data so they don't
    // issue duplicate fetches. Messages queue in FIFO order, so any
    // BUILD_ROAD_TILE dispatched afterwards lands safely after INIT_MASK.
    loadLand()
      .then((land) => {
        for (let i = 0; i < NUM_WORKERS; i++) {
          const w = new RoadsWorker()
          w.onmessage = handleMessage
          w.postMessage({ type: 'INIT_MASK', land })
          workers.push(w)
        }
        workersRef.current = workers
        forceTick()
      })
      .catch((err) => console.error('[Roads] mask init:', err))
    return () => {
      for (const w of workers) w.terminate()
      workersRef.current = []
    }
  }, [forceTick])

  useEffect(() => {
    loadRoadsManifest()
      .then((m) => {
        manifestRef.current = m
        forceTick()
      })
      .catch((err) => console.error('[Roads] manifest fetch:', err))
  }, [forceTick])

  // Publish in-flight count to the shared loading-indicator singleton.
  useEffect(() => {
    const id = setInterval(() => {
      loadingState.roadsInFlight = inFlightRef.current.size
    }, 100)
    return () => {
      clearInterval(id)
      loadingState.roadsInFlight = 0
    }
  }, [])

  // Destination prefetch: warm road tile JSON for minimap / address-search
  // targets during the camera-flight lerp, so bridges and roads at the
  // destination skip the network round-trip on arrival.
  const target = useSelectionStore(s => s.target)
  useEffect(() => {
    if (!target) return
    const r = Math.max(radiusRef.current, camera.position.y * 1.5)
    prefetchAround(target.x, target.z, r)
  }, [target, camera, prefetchAround])

  if (!style.roadMaterial) return null
  // Wait for the mask before rendering to avoid a one-frame flash of out-of-NYC
  // tiles (Long Island, NJ) before the per-tile bbox filter kicks in.
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

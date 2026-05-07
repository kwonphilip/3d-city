import { useEffect, useRef, useState, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useStyle } from '../context/StyleContext'
import { useQuality } from '../context/QualityContext'
import { useBuildingRegistry } from '../context/BuildingRegistry'
import { useSelectionStore } from '../context/SelectionContext'
import { loadLand } from '../lib/landData'
import { loadBuildingsManifest } from '../lib/manifests'
import { pointInRing } from '../lib/polygons'
import { lruGet, lruSet } from '../lib/lru'
import { useTileStreamer } from '../hooks/useTileStreamer'
import GeometryWorker from '../workers/geometryWorker.js?worker'

const CHECK_EVERY = 5
// Worker pool: parallel extrude across cores. Capped because each worker
// keeps a copy of THREE in memory (the geometry worker bundle is ~135 kB) and
// because contention for the GPU upload at the end is serialized anyway.
const NUM_WORKERS = Math.max(1, Math.min(3, (typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency ?? 4) : 4) - 1))
// Cap concurrent dispatches so the camera-move re-prioritization at each tick
// has slots to fill with newly-near tiles. 4× workers keeps every worker fed
// across the ~250ms tick gap (each tile builds in ~20–50ms) while bounding
// the wasted work when the camera moves and in-flight far tiles arrive after
// they've already left range.
const MAX_IN_FLIGHT = NUM_WORKERS * 4
// LRU bound on the (tileId|minHeight|boroughs)-keyed geometry cache. The full
// dataset is ~3,200 tiles; 256 entries (~25–60 MB) covers a comfortable
// browse history so revisiting a previously-seen area renders in one frame
// from cache instead of re-fetching + re-extruding.
const GEOM_CACHE_SIZE = 256

function TileMesh({ posArr, nrmArr, idxArr, material }) {
  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(posArr, 3))
    g.setAttribute('normal', new THREE.BufferAttribute(nrmArr, 3))
    g.setIndex(new THREE.BufferAttribute(idxArr, 1))
    return g
  }, [posArr, nrmArr, idxArr])

  useEffect(() => () => geom.dispose(), [geom])

  return <mesh geometry={geom} material={material} />
}

// Tags each building's `_borough` with the landmass ring that contains its
// center. Idempotent: skips already-tagged buildings, so repeated calls only
// do the ring scan once per building over the session.
function tagBuildingsWithBorough(buildings, ringsByBorough) {
  for (const b of buildings) {
    if (b._borough !== undefined) continue
    const [bx, bz] = b.center
    let found = null
    outer: for (const [name, rings] of ringsByBorough) {
      for (const ring of rings) {
        if (pointInRing(bx, bz, ring)) { found = name; break outer }
      }
    }
    b._borough = found
  }
}

// Stable serialization of the borough toggle state so the flush effect only
// fires when the enabled set actually changes, not on every render.
function boroughsKey(boroughs) {
  return Object.entries(boroughs)
    .filter(([, on]) => on)
    .map(([k]) => k)
    .sort()
    .join('|')
}

export default function Buildings() {
  const { camera } = useThree()
  const { buildingMaterial } = useStyle()
  const { renderRadius, minBuildingHeight, boroughs } = useQuality()
  const addTile = useBuildingRegistry(s => s.addTile)
  const removeTile = useBuildingRegistry(s => s.removeTile)

  const qualityRef = useRef({ renderRadius, minBuildingHeight, boroughs })
  useEffect(() => {
    qualityRef.current = { renderRadius, minBuildingHeight, boroughs }
  }, [renderRadius, minBuildingHeight, boroughs])

  const [renderedTiles, setRenderedTiles] = useState(new Map())
  const loadedIdsRef = useRef(new Set())
  const inFlightRef = useRef(new Set())
  // Pool of geometry workers + round-robin index so successive dispatches go
  // to different workers and run in parallel.
  const workersRef = useRef([])
  const nextWorkerRef = useRef(0)
  const manifestRef = useRef(null)
  // Map<boroughName, ring[]> — outer rings per landmass name. Used by the
  // borough filter to decide which buildings keep their 3D form.
  const ringsByBoroughRef = useRef(null)
  // Persistent raw-tile cache: tileId → { buildings }. Survives borough
  // flushes so re-enabling a borough re-uses already-fetched data.
  const tileDataRef = useRef(new Map())
  // LRU geometry cache keyed by (tileId|minHeight|boroughs). Toggling back to
  // a previously-seen configuration is a one-frame state update with no worker.
  const geomCacheRef = useRef(new Map())
  const abortersRef = useRef(new Map())

  const { forceTick, prefetchAround } = useTileStreamer({
    checkEvery: CHECK_EVERY,
    maxInFlight: MAX_IN_FLIGHT,
    getManifest: () => manifestRef.current,
    camera,
    getRadius: () => qualityRef.current.renderRadius,
    loadedRef: loadedIdsRef,
    inFlightRef,
    tileDataRef,
    abortersRef,
    onDispatch: (tileId, { buildings }) => {
      const ws = workersRef.current
      if (ws.length === 0) { inFlightRef.current.delete(tileId); return }

      const { minBuildingHeight: minH, boroughs: brs } = qualityRef.current
      const ringsByBorough = ringsByBoroughRef.current
      const filterEnabled = ringsByBorough != null
      const enabledSet = new Set()
      if (filterEnabled) {
        for (const [name, on] of Object.entries(brs)) if (on) enabledSet.add(name)
      }

      let kept = buildings
      if (filterEnabled) {
        if (enabledSet.size === 0) { inFlightRef.current.delete(tileId); return }
        tagBuildingsWithBorough(buildings, ringsByBorough)
        kept = buildings.filter(b => enabledSet.has(b._borough))
      }
      if (kept.length === 0) { inFlightRef.current.delete(tileId); return }

      const sortedEnabled = filterEnabled ? [...enabledSet].sort().join(',') : '*'
      const cacheKey = `${tileId}|${minH}|${sortedEnabled}`
      const hit = lruGet(geomCacheRef.current, cacheKey)
      if (hit) {
        inFlightRef.current.delete(tileId)
        loadedIdsRef.current.add(tileId)
        setRenderedTiles(prev => new Map(prev).set(tileId, {
          posArr: hit.posArr, nrmArr: hit.nrmArr, idxArr: hit.idxArr,
        }))
        addTile(tileId, hit.buildingMeta)
        return
      }

      const w = ws[nextWorkerRef.current]
      nextWorkerRef.current = (nextWorkerRef.current + 1) % ws.length
      w.postMessage({ type: 'BUILD_TILE', tileId, cacheKey, buildings: kept, minHeight: minH })
    },
    onRemove: (ids) => {
      for (const id of ids) removeTile(id)
      setRenderedTiles(prev => {
        const next = new Map(prev)
        for (const id of ids) next.delete(id)
        return next
      })
    },
  })

  useEffect(() => {
    const handleMessage = ({ data }) => {
      if (data.type !== 'TILE_READY') return
      const { tileId, cacheKey, positions, normals, indices, buildingMeta, empty } = data
      // The tick loop deletes from inFlightRef when a tile leaves range. If
      // the worker result arrives after that, we still want the geom cache
      // populated for the next return visit, but we don't render a tile
      // that's no longer in view.
      const wasWanted = inFlightRef.current.has(tileId)
      inFlightRef.current.delete(tileId)
      if (empty) return
      const posArr = new Float32Array(positions)
      const nrmArr = new Float32Array(normals)
      const idxArr = new Uint32Array(indices)
      if (cacheKey) {
        lruSet(geomCacheRef.current, cacheKey, { posArr, nrmArr, idxArr, buildingMeta }, GEOM_CACHE_SIZE)
      }
      if (!wasWanted) return
      loadedIdsRef.current.add(tileId)
      setRenderedTiles(prev => new Map(prev).set(tileId, { posArr, nrmArr, idxArr }))
      addTile(tileId, buildingMeta)
    }
    const workers = []
    for (let i = 0; i < NUM_WORKERS; i++) {
      const w = new GeometryWorker()
      w.onmessage = handleMessage
      workers.push(w)
    }
    workersRef.current = workers
    // Force a tick because the manifest may have loaded before workers were
    // ready, meaning its frameRef bump hit a useFrame that bailed early.
    forceTick()
    return () => { for (const w of workers) w.terminate(); workersRef.current = [] }
  }, [addTile, forceTick])

  useEffect(() => {
    loadBuildingsManifest().then((m) => {
      manifestRef.current = m
      // Skip the next ~250ms wait for the periodic CHECK_EVERY tick.
      forceTick()
    })
  }, [forceTick])

  // Destination prefetch: when the user picks a target via minimap or address
  // search, useCameraFlight lerps over ~1s. Warm the tile JSON for the
  // destination cluster during that flight so the burst tick on arrival skips
  // the network round-trip and only pays the worker extrude time.
  const target = useSelectionStore(s => s.target)
  useEffect(() => {
    if (!target) return
    // Use whichever is bigger between the slider floor and the altitude-scaled
    // radius the streamer will use on arrival, so the prefetched cluster
    // matches what'll actually be requested.
    const r = Math.max(qualityRef.current.renderRadius, camera.position.y * 1.5)
    prefetchAround(target.x, target.z, r)
  }, [target, camera, prefetchAround])

  // Load all borough/region rings indexed by name. Shares one fetch with
  // Terrain and Minimap via the loadLand cache.
  useEffect(() => {
    loadLand()
      .then(d => {
        const map = new Map()
        for (const lm of d.landmasses || []) {
          if (!lm?.name || !lm.outer || lm.outer.length < 3) continue
          if (!map.has(lm.name)) map.set(lm.name, [])
          map.get(lm.name).push(lm.outer)
        }
        ringsByBoroughRef.current = map
      })
      .catch(() => { /* filter unavailable; render everything */ })
  }, [])

  // Borough toggle change → flush loaded tiles to re-stream with the new filter.
  // The geom cache key includes the borough set, so toggling back to a
  // previously-seen configuration is a one-frame state update.
  const flushKey = boroughsKey(boroughs)
  useEffect(() => {
    for (const id of loadedIdsRef.current) removeTile(id)
    loadedIdsRef.current.clear()
    inFlightRef.current.clear()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRenderedTiles(new Map())
    forceTick()
  }, [flushKey, removeTile, forceTick])

  return (
    <>
      {[...renderedTiles.entries()].map(([id, { posArr, nrmArr, idxArr }]) => (
        <TileMesh
          key={id}
          posArr={posArr}
          nrmArr={nrmArr}
          idxArr={idxArr}
          material={buildingMaterial}
        />
      ))}
    </>
  )
}

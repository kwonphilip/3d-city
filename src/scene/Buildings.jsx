import { useEffect, useRef, useState, useMemo } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useStyle } from '../context/StyleContext'
import { useQuality } from '../context/QualityContext'
import { usePerfModeStore } from '../context/PerfModeContext'
import { useBuildingRegistry } from '../context/BuildingRegistry'
import { loadLand } from '../lib/landData'
import GeometryWorker from '../workers/geometryWorker.js?worker'

const MANIFEST_URL = '/data/manhattan/manifest.json'
const CHECK_EVERY = 15
// Worker pool: parallel extrude across cores. Capped because each worker
// keeps a copy of THREE in memory (the geometry worker bundle is ~135 kB) and
// because contention for the GPU upload at the end is serialized anyway.
const NUM_WORKERS = Math.max(1, Math.min(3, (typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency ?? 4) : 4) - 1))
// Cap concurrent dispatches so when the camera moves, the worker queue stays
// small and the next check tick can re-prioritize by distance instead of
// waiting on stale far-tile builds. 2× workers leaves enough in-flight to keep
// every worker busy without queuing too far ahead.
const MAX_IN_FLIGHT = NUM_WORKERS * 2
// LRU bound on the (tileId|minHeight|boroughs)-keyed geometry cache. Sized so
// one full borough configuration (~30 Manhattan tiles) plus headroom for a
// couple of recent toggles fits without thrash. Each entry is ~50–150 KB.
const GEOM_CACHE_SIZE = 64
// ─── Performance-mode reveal knobs ──────────────────────────────────────────
// Radius in metres around the user's double-click that reveals buildings.
// Tile grid is 500m, so values under ~250m typically touch only 1–4 tiles
// regardless of exact radius. Edit and HMR will pick it up live.
const POPUP_RADIUS_M = 50
// Duration of the scale.y grow-out-of-the-ground animation when a tile mounts
// in perf mode. Longer = more dramatic; 600ms feels like "pop up, settle."
const REVEAL_DURATION_MS = 600

function TileMesh({ posArr, nrmArr, idxArr, material, animateReveal }) {
  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(posArr, 3))
    g.setAttribute('normal', new THREE.BufferAttribute(nrmArr, 3))
    g.setIndex(new THREE.BufferAttribute(idxArr, 1))
    return g
  }, [posArr, nrmArr, idxArr])

  useEffect(() => () => geom.dispose(), [geom])

  const groupRef = useRef(null)
  const startRef = useRef(null)
  // Smoothstep ease-out from scale.y = 0 to 1. Buildings appear to grow out of
  // the ground. Only fires when animateReveal is true (perf mode); otherwise
  // the group stays at scale 1.
  useFrame((state) => {
    const g = groupRef.current
    if (!g) return
    if (!animateReveal) {
      if (g.scale.y !== 1) g.scale.y = 1
      return
    }
    if (startRef.current == null) startRef.current = state.clock.elapsedTime
    const t = Math.min(1, (state.clock.elapsedTime - startRef.current) / (REVEAL_DURATION_MS / 1000))
    g.scale.y = t * t * (3 - 2 * t)
  })

  return (
    <group ref={groupRef} scale={[1, animateReveal ? 0.001 : 1, 1]}>
      <mesh geometry={geom} material={material} />
    </group>
  )
}

function pointInRing(x, z, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], zi = ring[i][1]
    const xj = ring[j][0], zj = ring[j][1]
    const intersect = (zi > z) !== (zj > z) &&
      x < ((xj - xi) * (z - zi)) / (zj - zi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

// Tag each building's `_borough` with the name of the landmass containing its
// center (or null if outside all). Idempotent: skips already-tagged buildings,
// so it's safe to call on every dispatch — the per-borough ring scan only runs
// once per building over the session.
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

// Map-based LRU: re-inserting a key moves it to the end of insertion order,
// so eviction by `keys().next()` always drops the oldest.
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

// Stable serialization of the boroughs object so the flush effect only fires
// when the *set* of enabled boroughs actually changes (not on every render).
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
  const performanceMode = usePerfModeStore(s => s.performanceMode)
  const popupCenter = usePerfModeStore(s => s.popupCenter)
  const addTile = useBuildingRegistry(s => s.addTile)
  const removeTile = useBuildingRegistry(s => s.removeTile)
  const setManifestReady = useBuildingRegistry(s => s.setManifestReady)

  const qualityRef = useRef({ renderRadius, minBuildingHeight, boroughs })
  useEffect(() => {
    qualityRef.current = { renderRadius, minBuildingHeight, boroughs }
  }, [renderRadius, minBuildingHeight, boroughs])

  const perfRef = useRef({ performanceMode, popupCenter })
  useEffect(() => {
    perfRef.current = { performanceMode, popupCenter }
  }, [performanceMode, popupCenter])

  const [renderedTiles, setRenderedTiles] = useState(new Map())
  const loadedIdsRef = useRef(new Set())
  const inFlightRef = useRef(new Set())
  // Pool of geometry workers + round-robin index so successive dispatches go
  // to different workers and run in parallel.
  const workersRef = useRef([])
  const nextWorkerRef = useRef(0)
  const manifestRef = useRef(null)
  // Map<boroughName, ring[]> — each value is an array of outer rings. Used by the
  // borough filter to decide which buildings keep their 3D form.
  const ringsByBoroughRef = useRef(null)
  // Persistent cache of fetched tile JSON: tileId -> { buildings }. Survives
  // borough flushes so toggling re-uses already-fetched data instead of
  // hitting the network again.
  const tileDataRef = useRef(new Map())
  // LRU cache of built geometry keyed by (tileId|minHeight|boroughs). On a
  // hit we skip the worker entirely — toggling back to a previously-seen
  // configuration is a one-frame state update.
  const geomCacheRef = useRef(new Map())
  const frameRef = useRef(0)

  useEffect(() => {
    const handleMessage = ({ data }) => {
      if (data.type !== 'TILE_READY') return
      const { tileId, cacheKey, positions, normals, indices, buildingMeta, empty } = data
      inFlightRef.current.delete(tileId)
      if (empty) return
      const posArr = new Float32Array(positions)
      const nrmArr = new Float32Array(normals)
      const idxArr = new Uint32Array(indices)
      if (cacheKey) {
        lruSet(geomCacheRef.current, cacheKey, { posArr, nrmArr, idxArr, buildingMeta }, GEOM_CACHE_SIZE)
      }
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
    // Force the next useFrame to run the in-range check. If the manifest
    // already resolved before workers were ready, its frameRef bump fired
    // into a useFrame that bailed (workers.length === 0). Bumping again
    // here covers the workers-finish-last case.
    frameRef.current = CHECK_EVERY - 1
    return () => {
      for (const w of workers) w.terminate()
      workersRef.current = []
    }
  }, [addTile])

  useEffect(() => {
    fetch(MANIFEST_URL).then(r => r.json()).then(m => {
      manifestRef.current = m
      setManifestReady()
      // Force the next useFrame to run the in-range check instead of
      // waiting up to ~250ms for the periodic CHECK_EVERY tick.
      frameRef.current = CHECK_EVERY - 1
    })
  }, [setManifestReady])

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
      .catch(() => { /* filter unavailable; treat as no filter */ })
  }, [])

  // Toggle change → flush loaded tiles so they re-fetch under the new filter.
  // Perf-mode toggle and popup-center change also flush, so the active set
  // re-evaluates immediately under the new center / radius rules.
  const flushKey = boroughsKey(boroughs)
  const popupKey = popupCenter ? `${popupCenter.x.toFixed(1)}_${popupCenter.z.toFixed(1)}` : ''
  useEffect(() => {
    for (const id of loadedIdsRef.current) removeTile(id)
    loadedIdsRef.current.clear()
    inFlightRef.current.clear()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRenderedTiles(new Map())
    // Fire the in-range check on the very next frame instead of waiting up to
    // ~CHECK_EVERY frames (~750ms at 60fps) for the periodic tick.
    frameRef.current = CHECK_EVERY - 1
  }, [flushKey, performanceMode, popupKey, removeTile])

  useFrame(() => {
    if (++frameRef.current % CHECK_EVERY !== 0) return
    const manifest = manifestRef.current
    const workers = workersRef.current
    if (!manifest || workers.length === 0) return

    const { x, y, z } = camera.position
    const { renderRadius: baseRadius, minBuildingHeight: minH, boroughs: brs } = qualityRef.current
    const { performanceMode: pm, popupCenter: pc } = perfRef.current
    const inRange = new Set()
    const distById = new Map()

    if (pm) {
      // Perf mode: only tiles whose bbox intersects a small circle around the
      // last double-click. AABB-circle test (not center-distance) so a click
      // near a tile boundary still loads the neighbour.
      if (pc) {
        const r = POPUP_RADIUS_M
        const r2 = r * r
        for (const tile of manifest.tiles) {
          const b = tile.bounds
          const dx = Math.max(b.minX - pc.x, 0, pc.x - b.maxX)
          const dz = Math.max(b.minZ - pc.z, 0, pc.z - b.maxZ)
          const d2 = dx * dx + dz * dz
          if (d2 < r2) {
            inRange.add(tile.id)
            // Sort by tile-center distance from popup so nearest dispatches first.
            const tcx = (b.minX + b.maxX) / 2
            const tcz = (b.minZ + b.maxZ) / 2
            distById.set(tile.id, (pc.x - tcx) ** 2 + (pc.z - tcz) ** 2)
          }
        }
      }
      // popupCenter null → leave inRange empty so all tiles unload.
    } else {
      const radius = Math.max(baseRadius, y * 1.5)
      const r2 = radius * radius
      for (const tile of manifest.tiles) {
        const b = tile.bounds
        const cx = (b.minX + b.maxX) / 2
        const cz = (b.minZ + b.maxZ) / 2
        const d2 = (x - cx) * (x - cx) + (z - cz) * (z - cz)
        if (d2 < r2) {
          inRange.add(tile.id)
          distById.set(tile.id, d2)
        }
      }
    }

    // Compute the enabled-borough name set once per check. If rings haven't
    // loaded yet, fall back to "render everything" so we don't show an empty
    // city. Buildings are tagged on first dispatch (idempotent), so per-tile
    // filter is an O(1) Set.has(name) per building instead of a per-ring scan.
    // Perf mode bypasses the borough filter entirely — the click point is the
    // only thing that decides what's visible.
    const ringsByBorough = ringsByBoroughRef.current
    const filterEnabled = ringsByBorough != null && !pm
    const enabledSet = new Set()
    if (filterEnabled) {
      for (const [name, on] of Object.entries(brs)) if (on) enabledSet.add(name)
    }
    const anyEnabled = enabledSet.size > 0

    const sortedEnabled = pm ? 'perf' : (filterEnabled ? [...enabledSet].sort().join(',') : '*')

    const dispatch = (tileId, buildings) => {
      const ws = workersRef.current
      if (ws.length === 0) {
        inFlightRef.current.delete(tileId)
        return
      }
      let kept = buildings
      if (filterEnabled) {
        if (!anyEnabled) {
          inFlightRef.current.delete(tileId)
          return
        }
        tagBuildingsWithBorough(buildings, ringsByBorough)
        kept = buildings.filter(b => enabledSet.has(b._borough))
      }
      if (kept.length === 0) {
        inFlightRef.current.delete(tileId)
        return
      }
      const cacheKey = `${tileId}|${minH}|${sortedEnabled}`
      const hit = lruGet(geomCacheRef.current, cacheKey)
      if (hit) {
        inFlightRef.current.delete(tileId)
        loadedIdsRef.current.add(tileId)
        setRenderedTiles(prev => new Map(prev).set(tileId, {
          posArr: hit.posArr,
          nrmArr: hit.nrmArr,
          idxArr: hit.idxArr,
        }))
        addTile(tileId, hit.buildingMeta)
        return
      }
      const w = ws[nextWorkerRef.current]
      nextWorkerRef.current = (nextWorkerRef.current + 1) % ws.length
      w.postMessage({
        type: 'BUILD_TILE',
        tileId,
        cacheKey,
        buildings: kept,
        minHeight: minH,
      })
    }

    // Build a sorted candidate list (nearest first) so when the cap clips the
    // queue, the closest pending tiles are dispatched and far-out tiles wait
    // for the next tick. Camera-move re-sorting is implicit via this rebuild.
    const candidates = []
    for (const tile of manifest.tiles) {
      if (!inRange.has(tile.id)) continue
      if (loadedIdsRef.current.has(tile.id) || inFlightRef.current.has(tile.id)) continue
      candidates.push(tile)
    }
    candidates.sort((a, b) => distById.get(a.id) - distById.get(b.id))

    for (const tile of candidates) {
      if (inFlightRef.current.size >= MAX_IN_FLIGHT) break
      inFlightRef.current.add(tile.id)

      const cached = tileDataRef.current.get(tile.id)
      if (cached) {
        dispatch(tile.id, cached.buildings)
      } else {
        fetch(`/data/manhattan/${tile.file}`)
          .then(r => r.json())
          .then(({ buildings }) => {
            tileDataRef.current.set(tile.id, { buildings })
            dispatch(tile.id, buildings)
          })
          .catch(() => inFlightRef.current.delete(tile.id))
      }
    }

    const toRemove = []
    for (const id of loadedIdsRef.current) {
      if (!inRange.has(id)) toRemove.push(id)
    }
    if (toRemove.length > 0) {
      for (const id of toRemove) {
        loadedIdsRef.current.delete(id)
        removeTile(id)
      }
      setRenderedTiles(prev => {
        const next = new Map(prev)
        for (const id of toRemove) next.delete(id)
        return next
      })
    }
  })

  return (
    <>
      {[...renderedTiles.entries()].map(([id, { posArr, nrmArr, idxArr }]) => (
        <TileMesh
          key={id}
          posArr={posArr}
          nrmArr={nrmArr}
          idxArr={idxArr}
          material={buildingMaterial}
          animateReveal={performanceMode}
        />
      ))}
    </>
  )
}

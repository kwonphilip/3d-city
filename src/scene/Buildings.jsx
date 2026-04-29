import { useEffect, useRef, useState, useMemo } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useStyle } from '../context/StyleContext'
import { useQuality } from '../context/QualityContext'
import { useBuildingRegistry } from '../context/BuildingRegistry'
import GeometryWorker from '../workers/geometryWorker.js?worker'

const MANIFEST_URL = '/data/manhattan/manifest.json'
const LAND_URL = '/data/manhattan/land.json'
const CHECK_EVERY = 45

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
  const addTile = useBuildingRegistry(s => s.addTile)
  const removeTile = useBuildingRegistry(s => s.removeTile)

  const qualityRef = useRef({ renderRadius, minBuildingHeight, boroughs })
  useEffect(() => {
    qualityRef.current = { renderRadius, minBuildingHeight, boroughs }
  }, [renderRadius, minBuildingHeight, boroughs])

  const [renderedTiles, setRenderedTiles] = useState(new Map())
  const loadedIdsRef = useRef(new Set())
  const inFlightRef = useRef(new Set())
  const workerRef = useRef(null)
  const manifestRef = useRef(null)
  // Map<boroughName, ring[]> — each value is an array of outer rings. Used by the
  // borough filter to decide which buildings keep their 3D form.
  const ringsByBoroughRef = useRef(null)
  const frameRef = useRef(0)

  useEffect(() => {
    const w = new GeometryWorker()
    w.onmessage = ({ data }) => {
      if (data.type !== 'TILE_READY') return
      const { tileId, positions, normals, indices, buildingMeta, empty } = data
      inFlightRef.current.delete(tileId)
      if (empty) return
      const entry = {
        posArr: new Float32Array(positions),
        nrmArr: new Float32Array(normals),
        idxArr: new Uint32Array(indices),
      }
      loadedIdsRef.current.add(tileId)
      setRenderedTiles(prev => new Map(prev).set(tileId, entry))
      addTile(tileId, buildingMeta)
    }
    workerRef.current = w
    return () => w.terminate()
  }, [addTile])

  useEffect(() => {
    fetch(MANIFEST_URL).then(r => r.json()).then(m => { manifestRef.current = m })
  }, [])

  // Load all borough/region rings indexed by name.
  useEffect(() => {
    fetch(LAND_URL)
      .then(r => r.json())
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
  const flushKey = boroughsKey(boroughs)
  useEffect(() => {
    for (const id of loadedIdsRef.current) removeTile(id)
    loadedIdsRef.current.clear()
    inFlightRef.current.clear()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRenderedTiles(new Map())
  }, [flushKey, removeTile])

  useFrame(() => {
    if (++frameRef.current % CHECK_EVERY !== 0) return
    const manifest = manifestRef.current
    if (!manifest || !workerRef.current) return

    const { x, y, z } = camera.position
    const { renderRadius: baseRadius, minBuildingHeight: minH, boroughs: brs } = qualityRef.current
    const radius = Math.max(baseRadius, y * 1.5)
    const inRange = new Set()

    for (const tile of manifest.tiles) {
      const b = tile.bounds
      const cx = (b.minX + b.maxX) / 2
      const cz = (b.minZ + b.maxZ) / 2
      if (Math.hypot(x - cx, z - cz) < radius) inRange.add(tile.id)
    }

    // Build a per-frame list of enabled boroughs' rings. If the rings haven't
    // loaded yet, fall back to "render everything" so we don't show an empty city.
    const ringsByBorough = ringsByBoroughRef.current
    const enabledRings = []
    if (ringsByBorough) {
      for (const [name, on] of Object.entries(brs)) {
        if (!on) continue
        const rings = ringsByBorough.get(name)
        if (rings) enabledRings.push(...rings)
      }
    }
    const filterEnabled = ringsByBorough != null
    const anyEnabled = enabledRings.length > 0

    for (const tile of manifest.tiles) {
      if (!inRange.has(tile.id)) continue
      if (loadedIdsRef.current.has(tile.id) || inFlightRef.current.has(tile.id)) continue
      inFlightRef.current.add(tile.id)
      fetch(`/data/manhattan/${tile.file}`)
        .then(r => r.json())
        .then(({ buildings }) => {
          if (!workerRef.current) return
          let kept = buildings
          if (filterEnabled) {
            // No boroughs enabled = no 3D buildings anywhere.
            if (!anyEnabled) {
              inFlightRef.current.delete(tile.id)
              return
            }
            kept = buildings.filter(b => {
              const [bx, bz] = b.center
              for (const ring of enabledRings) if (pointInRing(bx, bz, ring)) return true
              return false
            })
          }
          if (kept.length === 0) {
            inFlightRef.current.delete(tile.id)
            return
          }
          workerRef.current.postMessage({
            type: 'BUILD_TILE',
            tileId: tile.id,
            buildings: kept,
            minHeight: minH,
          })
        })
        .catch(() => inFlightRef.current.delete(tile.id))
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
        <TileMesh key={id} posArr={posArr} nrmArr={nrmArr} idxArr={idxArr} material={buildingMaterial} />
      ))}
    </>
  )
}

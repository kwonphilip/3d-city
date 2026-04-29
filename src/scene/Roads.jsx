import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useStyle } from '../context/StyleContext'
import { useQuality } from '../context/QualityContext'
import useNycMask from '../hooks/useNycMask'
import { clipPathToBbox } from '../lib/nycMask'

const MANIFEST_URL = '/data/manhattan/roads_manifest.json'
const CHECK_EVERY = 45
const ROAD_Y = 4         // above land (3) + small gap
const BRIDGE_Y = 18      // bridge deck height
const PILLAR_RADIUS = 2

// Lane widths in metres by class. Tuned to roughly match street widths in NYC.
const WIDTH = {
  motorway: 14,
  trunk: 11,
  primary: 9,
  secondary: 7,
  tertiary: 5,
  residential: 3.5,
  service: 2.5,
}

function buildRibbonGeometry(segments, y) {
  const positions = []
  const indices = []
  let base = 0
  for (const seg of segments) {
    const hw = (WIDTH[seg.klass] ?? WIDTH.residential) / 2
    const path = seg.path
    for (let i = 0; i < path.length - 1; i++) {
      const [x0, z0] = path[i]
      const [x1, z1] = path[i + 1]
      const dx = x1 - x0, dz = z1 - z0
      const len = Math.hypot(dx, dz)
      if (len === 0) continue
      const nx = -dz / len, nz = dx / len
      positions.push(
        x0 - hw * nx, y, z0 - hw * nz,
        x0 + hw * nx, y, z0 + hw * nz,
        x1 - hw * nx, y, z1 - hw * nz,
        x1 + hw * nx, y, z1 + hw * nz,
      )
      indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2)
      base += 4
    }
  }
  if (positions.length === 0) return null
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  g.setIndex(indices)
  g.computeVertexNormals()
  return g
}

// Pillars at the start + end of each bridge way; also one mid pillar if the way is long.
function buildPillarsGeometry(bridges) {
  const positions = []
  const indices = []
  const segs = 8
  let base = 0
  for (const b of bridges) {
    const path = b.path
    if (path.length < 2) continue
    const points = [path[0]]
    // Length-aware mid pillars every ~120m
    let total = 0
    for (let i = 1; i < path.length; i++) {
      total += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1])
    }
    if (total > 120) {
      let target = 120
      let acc = 0
      for (let i = 1; i < path.length; i++) {
        const d = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1])
        while (acc + d >= target && target < total) {
          const t = (target - acc) / d
          points.push([path[i - 1][0] + t * (path[i][0] - path[i - 1][0]), path[i - 1][1] + t * (path[i][1] - path[i - 1][1])])
          target += 120
        }
        acc += d
      }
    }
    points.push(path[path.length - 1])
    for (const [px, pz] of points) {
      const ringStart = base
      // Build a low-poly cylinder from y=0 to y=BRIDGE_Y
      for (let s = 0; s < segs; s++) {
        const a = (s / segs) * Math.PI * 2
        const cx = Math.cos(a) * PILLAR_RADIUS
        const cz = Math.sin(a) * PILLAR_RADIUS
        positions.push(px + cx, 0, pz + cz)         // bottom
        positions.push(px + cx, BRIDGE_Y, pz + cz)  // top
      }
      // Side quads: connect ring s to ring s+1
      for (let s = 0; s < segs; s++) {
        const a = ringStart + s * 2
        const b1 = ringStart + ((s + 1) % segs) * 2
        // (a,b1,a+1) (b1,b1+1,a+1)
        indices.push(a, b1, a + 1, b1, b1 + 1, a + 1)
      }
      base += segs * 2
    }
  }
  if (positions.length === 0) return null
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  g.setIndex(indices)
  g.computeVertexNormals()
  return g
}

// Apply NYC mask:
// - non-bridge segments: drop unless the midpoint is inside any borough ring
// - bridges: keep when either endpoint is inside, then clip the path to worldBbox
//   so cross-state spans (GWB, Bayonne, Goethals, Outerbridge) terminate at the
//   visible water edge instead of dangling into the void.
function filterTile(tile, mask) {
  if (!mask) return { roads: [], bridges: [] }
  const roads = []
  for (const s of tile.roads) {
    if (mask.contains(s.mid[0], s.mid[1])) roads.push(s)
  }
  const bridges = []
  for (const b of tile.bridges) {
    const path = b.path
    if (!path || path.length < 2) continue
    const start = path[0]
    const end = path[path.length - 1]
    if (!mask.contains(start[0], start[1]) && !mask.contains(end[0], end[1])) continue
    const runs = clipPathToBbox(path, mask.worldBbox)
    for (const run of runs) {
      if (run.length >= 2) bridges.push({ ...b, path: run })
    }
  }
  return { roads, bridges }
}

function TileMeshes({ roads, bridges, roadMat, bridgeMat, pillarMat }) {
  const roadGeom = useMemo(() => buildRibbonGeometry(roads, ROAD_Y), [roads])
  const bridgeGeom = useMemo(() => buildRibbonGeometry(bridges, BRIDGE_Y), [bridges])
  const pillarGeom = useMemo(() => buildPillarsGeometry(bridges), [bridges])
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

function TileEntry({ tile, mask, roadMat, bridgeMat, pillarMat }) {
  const filtered = useMemo(() => filterTile(tile, mask), [tile, mask])
  if (filtered.roads.length === 0 && filtered.bridges.length === 0) return null
  return <TileMeshes {...filtered} roadMat={roadMat} bridgeMat={bridgeMat} pillarMat={pillarMat} />
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

  const [tiles, setTiles] = useState(new Map())
  const loadedRef = useRef(new Set())
  const inFlightRef = useRef(new Set())
  const manifestRef = useRef(null)
  const frameRef = useRef(0)

  useEffect(() => {
    fetch(MANIFEST_URL)
      .then((r) => r.json())
      .then((m) => { manifestRef.current = m })
      .catch((err) => console.error('[Roads] manifest fetch:', err))
  }, [])

  useFrame(() => {
    if (++frameRef.current % CHECK_EVERY !== 0) return
    const manifest = manifestRef.current
    if (!manifest) return
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
          inFlightRef.current.delete(t.id)
          loadedRef.current.add(t.id)
          setTiles((prev) => new Map(prev).set(t.id, data))
        })
        .catch(() => inFlightRef.current.delete(t.id))
    }

    const toRemove = []
    for (const id of loadedRef.current) if (!inRange.has(id)) toRemove.push(id)
    if (toRemove.length > 0) {
      for (const id of toRemove) loadedRef.current.delete(id)
      setTiles((prev) => {
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
      {[...tiles.entries()].map(([id, tile]) => (
        <TileEntry
          key={id}
          tile={tile}
          mask={mask}
          roadMat={style.roadMaterial}
          bridgeMat={style.bridgeMaterial ?? style.roadMaterial}
          pillarMat={style.bridgePillarMaterial ?? style.bridgeMaterial ?? style.roadMaterial}
        />
      ))}
    </>
  )
}

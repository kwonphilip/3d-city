/**
 * Web Worker: filters and builds road / bridge / pillar geometry for one road
 * tile, off the main thread.
 *
 * Input:  { type: 'BUILD_ROAD_TILE', tileId, tile: { roads, bridges } }
 * Output: { type: 'ROAD_TILE_READY', tileId, road | null, bridge | null, pillar | null }
 *         where each non-null field is { positions, normals, indices } as
 *         Transferable ArrayBuffers (consumer wraps them as Float32/Uint32).
 *
 * The worker self-loads /data/manhattan/land.json on first dispatch so it can
 * filter cross-state segments via the same NYC mask the main thread uses. The
 * fetch is parallel to the main-thread mask load and dispatches queue behind
 * `getMask()`.
 */

import { buildMask, clipPathToBbox } from '../lib/nycMask'

const LAND_URL = '/data/manhattan/land.json'
const ROAD_Y = 4
const BRIDGE_Y = 18
const PILLAR_RADIUS = 2

const WIDTH = {
  motorway: 14,
  trunk: 11,
  primary: 9,
  secondary: 7,
  tertiary: 5,
  residential: 3.5,
  service: 2.5,
}

let cachedMask = null
let cachedMaskPromise = null

function getMask() {
  if (cachedMask) return Promise.resolve(cachedMask)
  if (cachedMaskPromise) return cachedMaskPromise
  cachedMaskPromise = fetch(LAND_URL)
    .then((r) => r.json())
    .then((d) => { cachedMask = buildMask(d); return cachedMask })
  return cachedMaskPromise
}

function filterTile(tile, mask) {
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

function buildRibbonBuffers(segments, y) {
  if (segments.length === 0) return null
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
  return finalize(positions, indices)
}

function buildPillarBuffers(bridges) {
  if (bridges.length === 0) return null
  const positions = []
  const indices = []
  const segs = 8
  let base = 0
  for (const b of bridges) {
    const path = b.path
    if (path.length < 2) continue
    const points = [path[0]]
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
      for (let s = 0; s < segs; s++) {
        const a = (s / segs) * Math.PI * 2
        const cx = Math.cos(a) * PILLAR_RADIUS
        const cz = Math.sin(a) * PILLAR_RADIUS
        positions.push(px + cx, 0, pz + cz)
        positions.push(px + cx, BRIDGE_Y, pz + cz)
      }
      for (let s = 0; s < segs; s++) {
        const a = ringStart + s * 2
        const b1 = ringStart + ((s + 1) % segs) * 2
        indices.push(a, b1, a + 1, b1, b1 + 1, a + 1)
      }
      base += segs * 2
    }
  }
  if (positions.length === 0) return null
  return finalize(positions, indices)
}

// Cross-product face normals accumulated per vertex, then normalized — same
// result as THREE.BufferGeometry.computeVertexNormals() but without pulling
// the whole Three.js bundle into this worker.
function computeNormals(positions, indices) {
  const normals = new Float32Array(positions.length)
  for (let t = 0; t < indices.length; t += 3) {
    const ia = indices[t], ib = indices[t + 1], ic = indices[t + 2]
    const ax = positions[ia * 3], ay = positions[ia * 3 + 1], az = positions[ia * 3 + 2]
    const bx = positions[ib * 3], by = positions[ib * 3 + 1], bz = positions[ib * 3 + 2]
    const cx = positions[ic * 3], cy = positions[ic * 3 + 1], cz = positions[ic * 3 + 2]
    const e1x = bx - ax, e1y = by - ay, e1z = bz - az
    const e2x = cx - ax, e2y = cy - ay, e2z = cz - az
    const nx = e1y * e2z - e1z * e2y
    const ny = e1z * e2x - e1x * e2z
    const nz = e1x * e2y - e1y * e2x
    normals[ia * 3] += nx; normals[ia * 3 + 1] += ny; normals[ia * 3 + 2] += nz
    normals[ib * 3] += nx; normals[ib * 3 + 1] += ny; normals[ib * 3 + 2] += nz
    normals[ic * 3] += nx; normals[ic * 3 + 1] += ny; normals[ic * 3 + 2] += nz
  }
  for (let i = 0; i < normals.length; i += 3) {
    const x = normals[i], y = normals[i + 1], z = normals[i + 2]
    const len = Math.hypot(x, y, z) || 1
    normals[i] = x / len; normals[i + 1] = y / len; normals[i + 2] = z / len
  }
  return normals
}

function finalize(positionsArr, indicesArr) {
  const positions = new Float32Array(positionsArr)
  const indices = new Uint32Array(indicesArr)
  const normals = computeNormals(positions, indices)
  return {
    positions: positions.buffer,
    normals: normals.buffer,
    indices: indices.buffer,
  }
}

self.onmessage = ({ data }) => {
  if (data.type !== 'BUILD_ROAD_TILE') return
  const { tileId, tile } = data
  getMask().then((mask) => {
    const filtered = filterTile(tile, mask)
    const road = buildRibbonBuffers(filtered.roads, ROAD_Y)
    const bridge = buildRibbonBuffers(filtered.bridges, BRIDGE_Y)
    const pillar = buildPillarBuffers(filtered.bridges)
    const transfer = []
    if (road) transfer.push(road.positions, road.normals, road.indices)
    if (bridge) transfer.push(bridge.positions, bridge.normals, bridge.indices)
    if (pillar) transfer.push(pillar.positions, pillar.normals, pillar.indices)
    self.postMessage({ type: 'ROAD_TILE_READY', tileId, road, bridge, pillar }, transfer)
  })
}

/**
 * NYC visibility mask built from `land.json`.
 *
 * - `contains(x, z)` is a point-in-polygon test against every borough/harbor-island
 *   ring, with a per-ring bbox prefilter for speed.
 * - `inWorld(x, z)` is a cheap aabb test against the visible world (nycBounds +
 *   padding). The water plane in Terrain.jsx uses the same padding, so anything
 *   passing `inWorld` lands on the visible water plane rather than in the void.
 *
 * Module-level cache: a single fetch is shared across every consumer.
 */

const LAND_URL = '/data/manhattan/land.json'
export const WORLD_PADDING = 600 // metres of water around each landmass

let cachedMask = null
let cachedPromise = null

function ringBbox(ring) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
  for (const [x, z] of ring) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (z < minZ) minZ = z
    if (z > maxZ) maxZ = z
  }
  return { minX, maxX, minZ, maxZ }
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

export function buildMask(land) {
  const entries = []
  for (const lm of land.landmasses || []) {
    if (!lm?.outer || lm.outer.length < 3) continue
    entries.push({ bbox: ringBbox(lm.outer), ring: lm.outer })
  }
  const nyc = land.nycBounds
  const worldBbox = nyc
    ? {
        minX: nyc.minX - WORLD_PADDING,
        maxX: nyc.maxX + WORLD_PADDING,
        minZ: nyc.minZ - WORLD_PADDING,
        maxZ: nyc.maxZ + WORLD_PADDING,
      }
    : null

  return {
    worldBbox,
    contains(x, z) {
      for (const e of entries) {
        const b = e.bbox
        if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue
        if (pointInRing(x, z, e.ring)) return true
      }
      return false
    },
    inWorld(x, z) {
      if (!worldBbox) return true
      return x >= worldBbox.minX && x <= worldBbox.maxX && z >= worldBbox.minZ && z <= worldBbox.maxZ
    },
    bboxIntersects(b) {
      if (!worldBbox) return true
      return !(b.maxX < worldBbox.minX || b.minX > worldBbox.maxX || b.maxZ < worldBbox.minZ || b.minZ > worldBbox.maxZ)
    },
  }
}

export function loadMask() {
  if (cachedMask) return Promise.resolve(cachedMask)
  if (cachedPromise) return cachedPromise
  cachedPromise = fetch(LAND_URL)
    .then((r) => r.json())
    .then((d) => { cachedMask = buildMask(d); return cachedMask })
    .catch((err) => { cachedPromise = null; throw err })
  return cachedPromise
}

/**
 * Liang-Barsky polyline clipping against an axis-aligned bbox.
 * Returns an array of sub-paths (each a list of [x, z] verts) entirely inside
 * the bbox. Crossings produce new boundary verts so sub-paths terminate cleanly
 * at the bbox edge.
 */
export function clipPathToBbox(path, bbox) {
  if (!bbox || path.length < 2) return [path]
  const inside = (p) => p[0] >= bbox.minX && p[0] <= bbox.maxX && p[1] >= bbox.minZ && p[1] <= bbox.maxZ

  const clipSegment = (p1, p2) => {
    let t0 = 0, t1 = 1
    const dx = p2[0] - p1[0], dz = p2[1] - p1[1]
    const p = [-dx, dx, -dz, dz]
    const q = [p1[0] - bbox.minX, bbox.maxX - p1[0], p1[1] - bbox.minZ, bbox.maxZ - p1[1]]
    for (let i = 0; i < 4; i++) {
      if (p[i] === 0) {
        if (q[i] < 0) return null
      } else {
        const r = q[i] / p[i]
        if (p[i] < 0) { if (r > t1) return null; if (r > t0) t0 = r }
        else { if (r < t0) return null; if (r < t1) t1 = r }
      }
    }
    return [
      [p1[0] + t0 * dx, p1[1] + t0 * dz],
      [p1[0] + t1 * dx, p1[1] + t1 * dz],
    ]
  }

  const runs = []
  let current = []
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1]
    const aIn = inside(a), bIn = inside(b)
    if (aIn && bIn) {
      if (current.length === 0) current.push(a)
      current.push(b)
    } else if (aIn && !bIn) {
      const c = clipSegment(a, b)
      if (c) {
        if (current.length === 0) current.push(c[0])
        current.push(c[1])
      }
      if (current.length >= 2) runs.push(current)
      current = []
    } else if (!aIn && bIn) {
      const c = clipSegment(a, b)
      if (c) current = [c[0], c[1]]
    } else {
      // Both endpoints outside, but the segment might still cross the bbox.
      const c = clipSegment(a, b)
      if (c) runs.push([c[0], c[1]])
    }
  }
  if (current.length >= 2) runs.push(current)
  return runs
}

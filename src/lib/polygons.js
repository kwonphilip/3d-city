// Pure polygon math — no THREE import so this module is safe to bundle into
// Web Workers (roadsWorker → nycMask → polygons).

// Axis-aligned bounding box of a ring (array of [x, z] pairs).
export function ringBbox(ring) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
  for (const [x, z] of ring) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (z < minZ) minZ = z
    if (z > maxZ) maxZ = z
  }
  return { minX, maxX, minZ, maxZ }
}

// Ray-casting even-odd rule: counts how many polygon edges a horizontal ray
// from (x, z) crosses — an odd count means the point is inside.
export function pointInRing(x, z, ring) {
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

// Arithmetic centroid of a ring's vertices.
export function ringCentroid(ring) {
  let cx = 0, cz = 0
  for (const [x, z] of ring) { cx += x; cz += z }
  return [cx / ring.length, cz / ring.length]
}

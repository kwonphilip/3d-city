/**
 * Post-processing pass: connectivity flood-fill to drop NJ-only bridge fragments.
 *
 * A bridge segment is "anchored" if any vertex lies inside an NYC landmass polygon.
 * From anchored segments we BFS through shared endpoints (quantized to 0.1m) to
 * find all reachable segments. Anything not reachable is dropped (e.g. NJ viaducts
 * that don't connect to any NYC-land-anchored structure).
 *
 * Run after build-roads.mjs: node scripts/fix-bridges.mjs
 */

import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROADS_DIR = path.join(__dirname, '..', 'public', 'data', 'manhattan', 'roads')
const LAND_FILE = path.join(__dirname, '..', 'public', 'data', 'manhattan', 'land.json')

// ─── point-in-polygon (ray-casting, same as polygons.js) ─────────────────────

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

function buildLandTest(land) {
  const entries = []
  for (const lm of land.landmasses || []) {
    if (!lm?.outer || lm.outer.length < 3) continue
    entries.push({ bbox: ringBbox(lm.outer), ring: lm.outer })
  }
  return function onLand(x, z) {
    for (const e of entries) {
      const b = e.bbox
      if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue
      if (pointInRing(x, z, e.ring)) return true
    }
    return false
  }
}

// ─── endpoint key (matches build-roads.mjs rounding) ─────────────────────────

function epKey(pt) {
  return Math.round(pt[0] * 10) + '_' + Math.round(pt[1] * 10)
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const land = JSON.parse(await fs.readFile(LAND_FILE, 'utf8'))
  const onLand = buildLandTest(land)

  // Load all tile files
  const files = (await fs.readdir(ROADS_DIR)).filter(f => f.startsWith('road_') && f.endsWith('.json'))
  console.log(`Loading ${files.length} tile files…`)

  const tileData = new Map() // filename → parsed tile object
  const allBridges = []     // flat list across all tiles

  for (const file of files) {
    const tile = JSON.parse(await fs.readFile(path.join(ROADS_DIR, file), 'utf8'))
    tileData.set(file, tile)
    for (const b of tile.bridges || []) {
      b._file = file
      allBridges.push(b)
    }
  }

  console.log(`Total bridges: ${allBridges.length}`)

  // Build endpoint → [bridge, ...] adjacency map
  const epMap = new Map() // epKey → Set of bridge objects
  for (const b of allBridges) {
    const path = b.path
    if (!path || path.length < 2) continue
    const start = epKey(path[0])
    const end = epKey(path[path.length - 1])
    if (!epMap.has(start)) epMap.set(start, new Set())
    if (!epMap.has(end)) epMap.set(end, new Set())
    epMap.get(start).add(b)
    epMap.get(end).add(b)
  }

  // Find directly anchored bridges (any vertex on NYC land)
  const anchored = new Set()
  for (const b of allBridges) {
    for (const [x, z] of b.path) {
      if (onLand(x, z)) { anchored.add(b); break }
    }
  }
  console.log(`Directly anchored (vertex on land): ${anchored.size}`)

  // BFS flood-fill from anchored through shared endpoints
  const reachable = new Set(anchored)
  const queue = [...anchored]
  let qi = 0
  while (qi < queue.length) {
    const b = queue[qi++]
    const path = b.path
    const keys = [epKey(path[0]), epKey(path[path.length - 1])]
    for (const k of keys) {
      const neighbors = epMap.get(k)
      if (!neighbors) continue
      for (const nb of neighbors) {
        if (!reachable.has(nb)) {
          reachable.add(nb)
          queue.push(nb)
        }
      }
    }
  }

  const dropped = allBridges.length - reachable.size
  console.log(`Reachable via flood-fill from anchors: ${reachable.size}`)
  console.log(`Dropped (NJ-only, no NYC connection): ${dropped}`)

  // Rewrite each tile file, filtering bridges to only reachable
  let tilesChanged = 0
  for (const [file, tile] of tileData) {
    const before = (tile.bridges || []).length
    tile.bridges = (tile.bridges || []).filter(b => reachable.has(b))
    // Remove internal _file annotation before writing
    for (const b of tile.bridges) delete b._file
    const after = tile.bridges.length
    if (after !== before) {
      await fs.writeFile(path.join(ROADS_DIR, file), JSON.stringify(tile))
      tilesChanged++
    }
  }

  // Clean _file from any bridges remaining in allBridges that weren't written (shouldn't happen)
  console.log(`\nDone. ${tilesChanged} tile files updated, ${dropped} NJ bridge segments removed.`)
}

main().catch((err) => { console.error(err); process.exit(1) })

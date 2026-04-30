/**
 * Audit script: counts buildings per borough in the tiled dataset and compares
 * against NYC Planning reference counts to surface gaps.
 *
 * Usage: node scripts/audit-buildings.mjs
 *
 * Reads:
 *   public/data/manhattan/land.json     (borough rings, name = borough label)
 *   public/data/manhattan/manifest.json (tile list)
 *   public/data/manhattan/tile_*.json   (each tile's buildings)
 *
 * Output:
 *   - Per-borough counts vs NYC Planning reference
 *   - Tiles where coverage looks sparse relative to area
 *
 * Reference counts (NYC Planning, ~2023 building footprints):
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import url from 'node:url'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const DATA_DIR = path.resolve(__dirname, '../public/data/manhattan')

// NYC Planning Building Footprints reference counts (rounded)
const REFERENCE = {
  Manhattan: 46_000,
  Bronx: 92_000,
  Brooklyn: 316_000,
  Queens: 436_000,
  'Staten Island': 141_000,
}
const TOTAL_REFERENCE = Object.values(REFERENCE).reduce((a, b) => a + b, 0)

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
    const intersect = (zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

function classifyBorough(x, z, rings) {
  for (const r of rings) {
    const b = r.bbox
    if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue
    if (pointInRing(x, z, r.ring)) return r.name
  }
  return null
}

async function main() {
  const t0 = Date.now()
  const land = JSON.parse(await fs.readFile(path.join(DATA_DIR, 'land.json'), 'utf8'))
  const manifest = JSON.parse(await fs.readFile(path.join(DATA_DIR, 'manifest.json'), 'utf8'))

  // Only count rings whose name maps to a known borough
  const rings = []
  for (const lm of land.landmasses) {
    if (!REFERENCE[lm.name]) continue
    if (!lm.outer || lm.outer.length < 3) continue
    rings.push({ name: lm.name, ring: lm.outer, bbox: ringBbox(lm.outer) })
  }
  console.log(`Loaded ${rings.length} borough rings across ${Object.keys(REFERENCE).length} boroughs`)

  const counts = Object.fromEntries(Object.keys(REFERENCE).map((k) => [k, 0]))
  let unclassified = 0
  let totalBuildings = 0

  // Per-tile borough share, used to find sparse cells
  const tileStats = []

  let processed = 0
  for (const t of manifest.tiles) {
    const tile = JSON.parse(await fs.readFile(path.join(DATA_DIR, t.file), 'utf8'))
    const tilePerBorough = Object.fromEntries(Object.keys(REFERENCE).map((k) => [k, 0]))
    let tileUnclassified = 0
    for (const b of tile.buildings) {
      totalBuildings++
      const [x, z] = b.center
      const name = classifyBorough(x, z, rings)
      if (name) {
        counts[name]++
        tilePerBorough[name]++
      } else {
        unclassified++
        tileUnclassified++
      }
    }
    tileStats.push({
      id: t.id,
      bounds: t.bounds,
      total: tile.buildings.length,
      perBorough: tilePerBorough,
      unclassified: tileUnclassified,
    })
    processed++
    if (processed % 500 === 0) console.log(`  ${processed}/${manifest.tiles.length} tiles…`)
  }

  console.log(`\nProcessed ${processed} tiles, ${totalBuildings} buildings in ${((Date.now() - t0) / 1000).toFixed(1)}s\n`)

  // Per-borough report
  console.log('Borough'.padEnd(16), 'Found'.padStart(10), 'Reference'.padStart(12), 'Coverage'.padStart(10))
  console.log('-'.repeat(50))
  for (const [name, ref] of Object.entries(REFERENCE)) {
    const found = counts[name]
    const pct = ((found / ref) * 100).toFixed(1)
    const flag = found < ref * 0.7 ? ' ← LOW' : ''
    console.log(name.padEnd(16), String(found).padStart(10), String(ref).padStart(12), `${pct}%`.padStart(10), flag)
  }
  console.log('-'.repeat(50))
  const totalFound = Object.values(counts).reduce((a, b) => a + b, 0)
  const totalPct = ((totalFound / TOTAL_REFERENCE) * 100).toFixed(1)
  console.log('TOTAL'.padEnd(16), String(totalFound).padStart(10), String(TOTAL_REFERENCE).padStart(12), `${totalPct}%`.padStart(10))
  console.log(`\nUnclassified (off all rings): ${unclassified} (${((unclassified / totalBuildings) * 100).toFixed(1)}%)`)

  // Sparse hotspot scan: bucket per-borough density into 2km cells (4×4 tile blocks)
  // and flag cells where the dominant borough has an unusually low building/km² density.
  console.log('\nSparse 2km cells (dominant borough, density ratio < 0.3 of borough median):')
  const cells = new Map()
  for (const t of tileStats) {
    const cellX = Math.floor(t.bounds.minX / 2000)
    const cellZ = Math.floor(t.bounds.minZ / 2000)
    const key = `${cellX}_${cellZ}`
    let c = cells.get(key)
    if (!c) {
      c = { cellX, cellZ, total: 0, perBorough: Object.fromEntries(Object.keys(REFERENCE).map((k) => [k, 0])) }
      cells.set(key, c)
    }
    c.total += t.total
    for (const k of Object.keys(REFERENCE)) c.perBorough[k] += t.perBorough[k]
  }

  // For each borough, compute median 2km-cell density and flag low cells whose dominant borough is this one
  const cellsByBorough = {}
  for (const c of cells.values()) {
    let dominant = null, max = 0
    for (const [k, v] of Object.entries(c.perBorough)) {
      if (v > max) { max = v; dominant = k }
    }
    if (!dominant || max < 50) continue // skip mostly-water cells
    if (!cellsByBorough[dominant]) cellsByBorough[dominant] = []
    cellsByBorough[dominant].push({ ...c, dominant, dominantCount: max })
  }
  for (const [borough, cs] of Object.entries(cellsByBorough)) {
    const sorted = [...cs].map((c) => c.dominantCount).sort((a, b) => a - b)
    const median = sorted[Math.floor(sorted.length / 2)]
    const sparse = cs.filter((c) => c.dominantCount < median * 0.3 && c.dominantCount < 800)
    if (sparse.length === 0) continue
    console.log(`  ${borough}: median ${median} bldgs/cell, ${sparse.length} sparse cell(s)`)
    sparse.sort((a, b) => a.dominantCount - b.dominantCount)
    for (const c of sparse.slice(0, 10)) {
      console.log(`    cell (${c.cellX * 2}km, ${c.cellZ * 2}km) → ${c.dominantCount} bldgs (${((c.dominantCount / median) * 100).toFixed(0)}% of median)`)
    }
  }
}

main().catch((err) => { console.error(err); process.exit(1) })

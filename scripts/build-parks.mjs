/**
 * Offline data pipeline: OpenStreetMap Overpass → park polygons.
 * Run once: node scripts/build-parks.mjs
 * Output: public/data/manhattan/parks.json
 *
 * Fetches green-space features (parks, gardens, grass, recreation, cemeteries)
 * across Manhattan + surrounding boroughs + NJ Hudson waterfront. Total park
 * area is small enough to render as one merged geometry; no tiling.
 */

import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_FILE = path.join(__dirname, '..', 'public', 'data', 'manhattan', 'parks.json')

const ORIGIN_LAT = 40.758
const ORIGIN_LON = -73.9855
const LAT_TO_M = 111139
const LON_TO_M = 111139 * Math.cos(ORIGIN_LAT * (Math.PI / 180))

const SIMPLIFY_TOLERANCE = 2
const MIN_AREA_M2 = 200  // drop tiny pocket parks; below this is visual noise

const BANDS = [
  [40.700, 40.756],
  [40.756, 40.812],
  [40.812, 40.882],
]
const WEST = -74.05
const EAST = -73.907

const OVERPASS_INSTANCES = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.osm.ch/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter',
]
const MAX_RETRIES_PER_INSTANCE = 2
const RETRY_DELAY_MS = 5000

// ─── helpers ──────────────────────────────────────────────────────────────────

function project(lon, lat) {
  return [(lon - ORIGIN_LON) * LON_TO_M, -(lat - ORIGIN_LAT) * LAT_TO_M]
}

function round1(pts) { return pts.map(([x, z]) => [Math.round(x * 10) / 10, Math.round(z * 10) / 10]) }

function ptSegDist(p, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1]
  const len2 = dx * dx + dz * dz
  if (len2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1])
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / len2))
  return Math.hypot(a[0] + t * dx - p[0], a[1] + t * dz - p[1])
}

function simplify(pts, tol) {
  if (pts.length <= 3) return pts
  let maxD = 0, idx = 0
  for (let i = 1; i < pts.length - 1; i++) {
    const d = ptSegDist(pts[i], pts[0], pts[pts.length - 1])
    if (d > maxD) { maxD = d; idx = i }
  }
  if (maxD > tol) {
    return [...simplify(pts.slice(0, idx + 1), tol).slice(0, -1), ...simplify(pts.slice(idx), tol)]
  }
  return [pts[0], pts[pts.length - 1]]
}

function polygonArea(pts) {
  let a = 0
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1]
  }
  return Math.abs(a / 2)
}

async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)) }

async function fetchOverpass(query) {
  let lastErr
  for (const url of OVERPASS_INSTANCES) {
    for (let attempt = 1; attempt <= MAX_RETRIES_PER_INSTANCE; attempt++) {
      try {
        console.log(`    → ${url} (attempt ${attempt})`)
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json',
            'User-Agent': '3d-city build-parks.mjs (personal project)',
          },
          body: 'data=' + encodeURIComponent(query),
          signal: AbortSignal.timeout(180_000),
        })
        if (!res.ok) {
          const body = await res.text()
          console.log(`      HTTP ${res.status}: ${body.slice(0, 150).replace(/\s+/g, ' ')}`)
          throw new Error(`HTTP ${res.status}`)
        }
        return await res.json()
      } catch (err) {
        console.log(`      failed: ${err.message}`)
        lastErr = err
        if (attempt < MAX_RETRIES_PER_INSTANCE) await sleep(RETRY_DELAY_MS)
      }
    }
  }
  throw lastErr
}

async function fetchBand(south, north) {
  const bbox = `${south},${WEST},${north},${EAST}`
  // Both ways and relations can carry park-like tags. Relations (multipolygons) are
  // common for large parks like Central Park (which has internal water).
  const query = `
[out:json][timeout:120];
(
  way["leisure"~"^(park|garden|recreation_ground)$"](${bbox});
  way["landuse"~"^(grass|cemetery|recreation_ground|forest|meadow)$"](${bbox});
  rel["leisure"~"^(park|garden|recreation_ground)$"](${bbox});
  rel["landuse"~"^(grass|cemetery|recreation_ground|forest|meadow)$"](${bbox});
);
out body geom;
`
  const data = await fetchOverpass(query)
  return data.elements || []
}

// ─── element processing ───────────────────────────────────────────────────────

function processWay(el) {
  if (!el.geometry || el.geometry.length < 4) return null
  const pts = el.geometry.map(({ lon, lat }) => project(lon, lat))
  // Close ring if needed
  const first = pts[0], last = pts[pts.length - 1]
  if (first[0] !== last[0] || first[1] !== last[1]) pts.push([...first])
  const simplified = simplify(pts, SIMPLIFY_TOLERANCE)
  if (simplified.length < 4) return null
  if (polygonArea(simplified) < MIN_AREA_M2) return null
  return {
    name: el.tags?.name || null,
    outer: round1(simplified),
    holes: [],
  }
}

function processRelation(el) {
  if (!el.members) return []
  const outerWays = el.members.filter((m) => m.type === 'way' && m.role === 'outer' && m.geometry?.length)
  const innerWays = el.members.filter((m) => m.type === 'way' && m.role === 'inner' && m.geometry?.length)
  if (outerWays.length === 0) return []

  // Each outer way that's already closed becomes its own polygon. We don't try
  // to stitch fragmented outers — for parks, NYC data is typically pre-closed.
  const polygons = []
  for (const w of outerWays) {
    const pts = w.geometry.map((p) => project(p.lon, p.lat))
    const first = pts[0], last = pts[pts.length - 1]
    if (first[0] !== last[0] || first[1] !== last[1]) pts.push([...first])
    const simplified = simplify(pts, SIMPLIFY_TOLERANCE)
    if (simplified.length < 4) continue
    if (polygonArea(simplified) < MIN_AREA_M2) continue
    polygons.push({
      name: el.tags?.name || null,
      outer: round1(simplified),
      holes: [],
    })
  }

  // Best-effort: attach inner rings (holes) to whichever outer polygon spatially contains them.
  // For typical park data, holes are small (water bodies, baseball diamonds) inside one outer.
  if (innerWays.length > 0 && polygons.length > 0) {
    for (const w of innerWays) {
      const pts = w.geometry.map((p) => project(p.lon, p.lat))
      const first = pts[0], last = pts[pts.length - 1]
      if (first[0] !== last[0] || first[1] !== last[1]) pts.push([...first])
      const simplified = simplify(pts, SIMPLIFY_TOLERANCE)
      if (simplified.length < 4) continue
      // Just attach to the first outer (good enough for our visual purpose).
      polygons[0].holes.push(round1(simplified))
    }
  }

  return polygons
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  await fs.mkdir(path.dirname(OUT_FILE), { recursive: true })
  const seen = new Set()
  const parks = []
  let processed = 0, skipped = 0, dupes = 0

  console.log(`\nFetching parks across ${BANDS.length} bands…`)

  for (let i = 0; i < BANDS.length; i++) {
    const [south, north] = BANDS[i]
    console.log(`  Band ${i} [${south.toFixed(3)}–${north.toFixed(3)}]…`)
    const elements = await fetchBand(south, north)
    console.log(`    → ${elements.length} elements`)

    for (const el of elements) {
      const key = `${el.type}:${el.id}`
      if (seen.has(key)) { dupes++; continue }
      seen.add(key)
      if (el.type === 'way') {
        const p = processWay(el)
        if (p) { parks.push(p); processed++ } else { skipped++ }
      } else if (el.type === 'relation') {
        const polys = processRelation(el)
        if (polys.length === 0) skipped++
        else { parks.push(...polys); processed += polys.length }
      }
    }

    if (i < BANDS.length - 1) await sleep(2000)
  }

  console.log(`\nProcessed: ${processed} | Skipped: ${skipped} | Dupes: ${dupes}`)

  const out = {
    origin: { lat: ORIGIN_LAT, lon: ORIGIN_LON },
    generatedAt: new Date().toISOString(),
    source: 'OpenStreetMap (Overpass)',
    parks,
  }

  const json = JSON.stringify(out)
  await fs.writeFile(OUT_FILE, json)

  console.log(`\nWrote ${parks.length} park polygons (${(json.length / 1024).toFixed(1)} KB) to ${OUT_FILE}`)
  // Show a few of the largest by name
  const largest = parks
    .map((p) => ({ name: p.name, area: polygonArea(p.outer) }))
    .filter((p) => p.name)
    .sort((a, b) => b.area - a.area)
    .slice(0, 10)
  console.log('Largest named parks:')
  for (const p of largest) console.log(`  ${p.name}: ${(p.area / 1000).toFixed(0)} km²×k m²`)
}

main().catch((err) => { console.error(err); process.exit(1) })

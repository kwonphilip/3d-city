/**
 * Offline data pipeline: OpenStreetMap Overpass → tiled road JSON.
 * Run once: node scripts/build-roads.mjs
 * Output: public/data/manhattan/roads/road_X_Z.json + roads_manifest.json
 *
 * Fetches highway ways across Manhattan in N-S bands. Each road segment is
 * bucketed into a 500m tile by its midpoint. Bridges are split into a separate
 * `bridges` array per tile so the renderer can elevate them.
 */

import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.join(__dirname, '..', 'public', 'data', 'manhattan', 'roads')
const MANIFEST_FILE = path.join(__dirname, '..', 'public', 'data', 'manhattan', 'roads_manifest.json')
const CHECKPOINT_FILE = path.join(OUT_DIR, '_checkpoint.json')

// Projection — must match src/lib/projection.js
const ORIGIN_LAT = 40.758
const ORIGIN_LON = -73.9855
const LAT_TO_M = 111139
const LON_TO_M = 111139 * Math.cos(ORIGIN_LAT * (Math.PI / 180))

const TILE_SIZE = 500
const SIMPLIFY_TOLERANCE = 1.5
const MAX_RETRIES_PER_INSTANCE = 2
const RETRY_DELAY_MS = 5000

// All-NYC coverage. Roads are denser than buildings per row, so smaller bands.
const BANDS = [
  [40.495, 40.560], [40.560, 40.610], [40.610, 40.650],
  [40.650, 40.685], [40.685, 40.715], [40.715, 40.745],
  [40.745, 40.775], [40.775, 40.805], [40.805, 40.835],
  [40.835, 40.865], [40.865, 40.920],
]
const WEST = -74.265
const EAST = -73.700

const ALLOWED_CLASSES = new Set([
  'motorway', 'motorway_link',
  'trunk', 'trunk_link',
  'primary', 'primary_link',
  'secondary', 'secondary_link',
  'tertiary', 'tertiary_link',
  'residential',
  'unclassified',
  'service',
])

const OVERPASS_INSTANCES = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.osm.ch/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter',
]

// ─── helpers ──────────────────────────────────────────────────────────────────

function project(lon, lat) {
  return [(lon - ORIGIN_LON) * LON_TO_M, -(lat - ORIGIN_LAT) * LAT_TO_M]
}

function ptSegDist(p, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1]
  const len2 = dx * dx + dz * dz
  if (len2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1])
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / len2))
  return Math.hypot(a[0] + t * dx - p[0], a[1] + t * dz - p[1])
}

function simplify(pts, tol) {
  if (pts.length <= 2) return pts
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

function classify(highway) {
  // Normalise *_link variants down to the base class for rendering.
  if (highway.startsWith('motorway')) return 'motorway'
  if (highway.startsWith('trunk')) return 'trunk'
  if (highway.startsWith('primary')) return 'primary'
  if (highway.startsWith('secondary')) return 'secondary'
  if (highway.startsWith('tertiary')) return 'tertiary'
  if (highway === 'residential' || highway === 'unclassified') return 'residential'
  return 'service'
}

function tileKey(x, z) { return `${Math.floor(x / TILE_SIZE)}_${Math.floor(z / TILE_SIZE)}` }
function tileBounds(key) {
  const [tx, tz] = key.split('_').map(Number)
  return { minX: tx * TILE_SIZE, maxX: (tx + 1) * TILE_SIZE, minZ: tz * TILE_SIZE, maxZ: (tz + 1) * TILE_SIZE }
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
            'User-Agent': '3d-city build-roads.mjs (personal project)',
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
  const query = `[out:json][timeout:120];way["highway"](${bbox});out body geom qt;`
  const data = await fetchOverpass(query)
  return data.elements || []
}

// ─── element processing ───────────────────────────────────────────────────────

function processElement(el) {
  if (el.type !== 'way' || !el.geometry || el.geometry.length < 2) return null
  const tags = el.tags || {}
  const hwy = tags.highway
  if (!hwy || !ALLOWED_CLASSES.has(hwy)) return null

  const klass = classify(hwy)
  const isBridge = tags.bridge === 'yes' || tags.bridge === 'viaduct' || tags.man_made === 'bridge'

  const projected = el.geometry.map(({ lon, lat }) => project(lon, lat))
  const simplified = simplify(projected, SIMPLIFY_TOLERANCE)
  if (simplified.length < 2) return null

  // Round to 0.1m and pick midpoint for tile bucketing.
  const path = simplified.map(([x, z]) => [Math.round(x * 10) / 10, Math.round(z * 10) / 10])
  const mid = path[Math.floor(path.length / 2)]

  return {
    id: String(el.id),
    klass,
    bridge: isBridge,
    path,
    mid,
  }
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true })

  let checkpoint = { completedBands: [], seenIds: [] }
  try {
    checkpoint = JSON.parse(await fs.readFile(CHECKPOINT_FILE, 'utf8'))
    console.log(`Resuming from checkpoint. Completed bands: ${checkpoint.completedBands.join(', ')}`)
  } catch { /* fresh */ }

  const seen = new Set(checkpoint.seenIds)
  const tiles = new Map() // tileKey -> { roads: [], bridges: [] }
  let processed = 0, skipped = 0, dupes = 0

  for (const bandIdx of checkpoint.completedBands) {
    const bandFile = path.join(OUT_DIR, `_band_${bandIdx}.json`)
    try {
      const segs = JSON.parse(await fs.readFile(bandFile, 'utf8'))
      for (const s of segs) {
        const key = tileKey(s.mid[0], s.mid[1])
        if (!tiles.has(key)) tiles.set(key, { roads: [], bridges: [] })
        const bucket = tiles.get(key)
        if (s.bridge) bucket.bridges.push(s); else bucket.roads.push(s)
        processed++
      }
    } catch { /* missing */ }
  }

  console.log(`\nFetching ${BANDS.length} road bands…`)

  for (let i = 0; i < BANDS.length; i++) {
    if (checkpoint.completedBands.includes(i)) {
      console.log(`  Band ${i}: cached, skip`)
      continue
    }
    const [south, north] = BANDS[i]
    console.log(`  Band ${i} [${south.toFixed(3)}–${north.toFixed(3)}]…`)

    const elements = await fetchBand(south, north)
    console.log(`    → ${elements.length} elements`)
    const bandSegs = []

    for (const el of elements) {
      if (seen.has(el.id)) { dupes++; continue }
      seen.add(el.id)
      const seg = processElement(el)
      if (!seg) { skipped++; continue }
      bandSegs.push(seg)
      const key = tileKey(seg.mid[0], seg.mid[1])
      if (!tiles.has(key)) tiles.set(key, { roads: [], bridges: [] })
      const bucket = tiles.get(key)
      if (seg.bridge) bucket.bridges.push(seg); else bucket.roads.push(seg)
      processed++
    }

    await fs.writeFile(path.join(OUT_DIR, `_band_${i}.json`), JSON.stringify(bandSegs))
    checkpoint.completedBands.push(i)
    checkpoint.seenIds = [...seen]
    await fs.writeFile(CHECKPOINT_FILE, JSON.stringify(checkpoint))
    console.log(`    Checkpoint saved. Running total: ${processed} segments`)

    if (i < BANDS.length - 1) await sleep(2000)
  }

  console.log(`\nAll bands done. processed=${processed} skipped=${skipped} dupes=${dupes}`)
  console.log(`Writing ${tiles.size} tile files…`)

  const manifest = {
    origin: { lat: ORIGIN_LAT, lon: ORIGIN_LON },
    tileSize: TILE_SIZE,
    source: 'OpenStreetMap (Overpass)',
    generatedAt: new Date().toISOString(),
    tiles: [],
  }

  for (const [key, { roads, bridges }] of tiles) {
    const file = `road_${key}.json`
    await fs.writeFile(path.join(OUT_DIR, file), JSON.stringify({ tileId: key, bounds: tileBounds(key), roads, bridges }))
    manifest.tiles.push({ id: key, file: `roads/${file}`, bounds: tileBounds(key), roadCount: roads.length, bridgeCount: bridges.length })
  }

  await fs.writeFile(MANIFEST_FILE, JSON.stringify(manifest, null, 2))

  // Cleanup
  try {
    await fs.unlink(CHECKPOINT_FILE)
    for (let i = 0; i < BANDS.length; i++) {
      await fs.unlink(path.join(OUT_DIR, `_band_${i}.json`)).catch(() => {})
    }
  } catch { /* */ }

  console.log(`Done. ${tiles.size} tiles → ${OUT_DIR}`)
}

main().catch((err) => { console.error(err); process.exit(1) })

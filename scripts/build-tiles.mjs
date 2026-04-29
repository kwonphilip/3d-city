/**
 * Offline data pipeline: OpenStreetMap Overpass → tiled JSON.
 * Run once: node scripts/build-tiles.mjs
 * Output: data/manhattan/manifest.json + data/manhattan/tile_X_Z.json
 *
 * Fetches Manhattan in N-S bands. Checkpoints after each band so the script
 * can be re-run to resume if a band times out.
 */

import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.join(__dirname, '..', 'public', 'data', 'manhattan')
const CHECKPOINT_FILE = path.join(OUT_DIR, '_checkpoint.json')

// Projection — must match src/lib/projection.js
const ORIGIN_LAT = 40.758
const ORIGIN_LON = -73.9855
const LAT_TO_M = 111139
const LON_TO_M = 111139 * Math.cos(ORIGIN_LAT * (Math.PI / 180))

const TILE_SIZE = 500
const SIMPLIFY_TOLERANCE = 0.8  // metres
const MIN_HEIGHT_M = 2
const DEFAULT_HEIGHT_M = 8
const M_PER_FLOOR = 3.5
const MAX_RETRIES = 4
const RETRY_DELAY_MS = 8000

// All-NYC coverage. Each band ~0.015° (~1.7 km) tall in dense areas, larger in
// sparser Staten Island / outer Queens. Monotonic, no overlaps.
const BANDS = [
  [40.495, 40.530], [40.530, 40.560], [40.560, 40.585], [40.585, 40.610],
  [40.610, 40.630], [40.630, 40.650], [40.650, 40.670], [40.670, 40.685],
  [40.685, 40.700], [40.700, 40.715], [40.715, 40.730], [40.730, 40.745],
  [40.745, 40.760], [40.760, 40.775], [40.775, 40.790], [40.790, 40.805],
  [40.805, 40.820], [40.820, 40.835], [40.835, 40.850], [40.850, 40.865],
  [40.865, 40.885], [40.885, 40.920],
]
const WEST = -74.265  // Staten Island west tip
const EAST = -73.700  // Queens east tip (Far Rockaway / JFK)

const OVERPASS_INSTANCES = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.osm.ch/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter',
]
let instanceIdx = 0

// ─── geometry helpers ─────────────────────────────────────────────────────────

function project(lon, lat) {
  return [(lon - ORIGIN_LON) * LON_TO_M, -(lat - ORIGIN_LAT) * LAT_TO_M]
}

function signedArea(pts) {
  let a = 0
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1]
  }
  return a / 2
}

function ensureWinding(pts) {
  return signedArea(pts) > 0 ? pts.slice().reverse() : pts
}

function ptSegDist(p, a, b) {
  const dx = b[0]-a[0], dz = b[1]-a[1]
  const len2 = dx*dx+dz*dz
  if (len2 === 0) return Math.hypot(p[0]-a[0], p[1]-a[1])
  const t = Math.max(0, Math.min(1, ((p[0]-a[0])*dx+(p[1]-a[1])*dz)/len2))
  return Math.hypot(a[0]+t*dx-p[0], a[1]+t*dz-p[1])
}

function simplify(pts, tol) {
  if (pts.length <= 3) return pts
  let maxD = 0, idx = 0
  for (let i = 1; i < pts.length-1; i++) {
    const d = ptSegDist(pts[i], pts[0], pts[pts.length-1])
    if (d > maxD) { maxD = d; idx = i }
  }
  if (maxD > tol) {
    return [...simplify(pts.slice(0, idx+1), tol).slice(0,-1), ...simplify(pts.slice(idx), tol)]
  }
  return [pts[0], pts[pts.length-1]]
}

function parseHeight(tags) {
  if (tags.height) {
    const val = parseFloat(String(tags.height))
    if (isFinite(val)) return /ft|'/.test(tags.height) ? val * 0.3048 : val
  }
  const levels = parseInt(tags['building:levels'] || tags.levels || '0')
  if (levels > 0) return levels * M_PER_FLOOR
  return DEFAULT_HEIGHT_M
}

// ─── Overpass fetch with retry ────────────────────────────────────────────────

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function fetchBand(south, north, bandIdx) {
  const bbox = `${south},${WEST},${north},${EAST}`
  const query = `[out:json][timeout:90];way["building"](${bbox});out body geom qt;`

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const url = OVERPASS_INSTANCES[instanceIdx % OVERPASS_INSTANCES.length]
    if (attempt > 0) {
      const delay = RETRY_DELAY_MS * attempt
      console.log(`    retry ${attempt}/${MAX_RETRIES} in ${delay/1000}s (instance: ${url})…`)
      await sleep(delay)
      instanceIdx++  // try next instance on retry
    }

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
          'User-Agent': '3d-city build-tiles.mjs (personal project)',
        },
        body: 'data=' + encodeURIComponent(query),
        signal: AbortSignal.timeout(180_000),
      })

      if (res.status === 504 || res.status === 429 || res.status === 406) {
        console.log(`    HTTP ${res.status}, will retry…`)
        continue
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const json = await res.json()
      // Overpass sometimes returns 200 OK with { remark: "...error..." } when overloaded.
      // Treat as a retryable failure rather than a successful empty band.
      if (json.remark && (!json.elements || json.elements.length === 0)) {
        console.log(`    overpass remark: "${json.remark.slice(0, 120)}"`)
        continue
      }
      console.log(`    → ${json.elements.length} elements`)
      return json.elements
    } catch (err) {
      if (attempt === MAX_RETRIES) throw err
      console.log(`    error: ${err.message}, will retry…`)
    }
  }
}

// ─── element processing ───────────────────────────────────────────────────────

function processElement(el) {
  if (el.type !== 'way' || !el.geometry || el.geometry.length < 4) return null
  const tags = el.tags || {}
  const height = parseHeight(tags)
  if (height < MIN_HEIGHT_M) return null

  const ring = el.geometry.map(({ lon, lat }) => project(lon, lat))
  const first = ring[0], last = ring[ring.length-1]
  if (first[0] !== last[0] || first[1] !== last[1]) ring.push([...first])

  const simplified = simplify(ring, SIMPLIFY_TOLERANCE)
  if (simplified.length < 3) return null

  const wound = ensureWinding(simplified)
  let cx = 0, cz = 0
  for (const [x, z] of wound) { cx += x; cz += z }
  cx /= wound.length; cz /= wound.length

  return {
    id: String(el.id),
    footprint: wound.map(([x, z]) => [Math.round(x*10)/10, Math.round(z*10)/10]),
    height: Math.round(height * 10) / 10,
    center: [Math.round(cx*10)/10, Math.round(cz*10)/10],
  }
}

function tileKey(x, z) { return `${Math.floor(x/TILE_SIZE)}_${Math.floor(z/TILE_SIZE)}` }
function tileBounds(key) {
  const [tx, tz] = key.split('_').map(Number)
  return { minX: tx*TILE_SIZE, maxX: (tx+1)*TILE_SIZE, minZ: tz*TILE_SIZE, maxZ: (tz+1)*TILE_SIZE }
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true })

  // Load checkpoint if it exists
  let checkpoint = { completedBands: [], seenIds: [] }
  try {
    checkpoint = JSON.parse(await fs.readFile(CHECKPOINT_FILE, 'utf8'))
    console.log(`Resuming from checkpoint. Completed bands: ${checkpoint.completedBands.join(', ')}`)
  } catch { /* fresh start */ }

  const seen = new Set(checkpoint.seenIds)
  const tiles = new Map()
  let processed = 0, skipped = 0, dupes = 0

  // Load existing tile data from previous runs
  for (const bandIdx of checkpoint.completedBands) {
    const bandFile = path.join(OUT_DIR, `_band_${bandIdx}.json`)
    try {
      const buildings = JSON.parse(await fs.readFile(bandFile, 'utf8'))
      for (const b of buildings) {
        const key = tileKey(b.center[0], b.center[1])
        if (!tiles.has(key)) tiles.set(key, [])
        tiles.get(key).push(b)
        processed++
      }
    } catch { /* ignore missing band files */ }
  }

  console.log(`\nFetching ${BANDS.length} bands for Manhattan buildings…`)

  for (let i = 0; i < BANDS.length; i++) {
    if (checkpoint.completedBands.includes(i)) {
      console.log(`  Band ${i}: already done, skipping`)
      continue
    }

    const [south, north] = BANDS[i]
    console.log(`  Band ${i} [${south.toFixed(3)}–${north.toFixed(3)}]…`)

    const elements = await fetchBand(south, north, i)
    const bandBuildings = []

    for (const el of elements) {
      if (seen.has(el.id)) { dupes++; continue }
      seen.add(el.id)
      const b = processElement(el)
      if (!b) { skipped++; continue }
      bandBuildings.push(b)
      const key = tileKey(b.center[0], b.center[1])
      if (!tiles.has(key)) tiles.set(key, [])
      tiles.get(key).push(b)
      processed++
    }

    // Save band checkpoint
    await fs.writeFile(path.join(OUT_DIR, `_band_${i}.json`), JSON.stringify(bandBuildings))
    checkpoint.completedBands.push(i)
    checkpoint.seenIds = [...seen]
    await fs.writeFile(CHECKPOINT_FILE, JSON.stringify(checkpoint))
    console.log(`    Checkpoint saved. Running total: ${processed} buildings`)

    // Brief pause between bands to be polite to the API
    if (i < BANDS.length - 1) await sleep(2000)
  }

  console.log(`\nAll bands complete. Processed: ${processed} | Skipped: ${skipped} | Dupes: ${dupes}`)
  console.log(`Writing ${tiles.size} tile files…`)

  const manifest = {
    origin: { lat: ORIGIN_LAT, lon: ORIGIN_LON },
    tileSize: TILE_SIZE,
    borough: 'manhattan',
    source: 'OpenStreetMap (Overpass)',
    generatedAt: new Date().toISOString(),
    tiles: [],
  }

  for (const [key, buildings] of tiles) {
    const file = `tile_${key}.json`
    await fs.writeFile(path.join(OUT_DIR, file), JSON.stringify({ tileId: key, bounds: tileBounds(key), buildings }))
    manifest.tiles.push({ id: key, file, bounds: tileBounds(key), buildingCount: buildings.length })
  }

  await fs.writeFile(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2))

  // Clean up checkpoint and band files
  try {
    await fs.unlink(CHECKPOINT_FILE)
    for (let i = 0; i < BANDS.length; i++) {
      await fs.unlink(path.join(OUT_DIR, `_band_${i}.json`)).catch(() => {})
    }
  } catch { /* ignore */ }

  console.log(`Done. ${tiles.size} tiles written to ${OUT_DIR}`)
}

main().catch(err => { console.error(err); process.exit(1) })

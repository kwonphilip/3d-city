/**
 * Offline data pipeline: NYC OpenData Building Footprints → tiled JSON.
 * Run once: node scripts/build-tiles.mjs
 * Output: public/data/manhattan/manifest.json + public/data/manhattan/tile_X_Z.json
 *
 * Replaces the prior Overpass-based pipeline. NYC OpenData provides authoritative
 * city-wide footprints with measured `heightroof` / `groundelev` fields and no
 * per-query truncation risk. The Overpass version produced silent ~2km horizontal
 * gaps when a single band's response exceeded Overpass memory limits.
 *
 * Pages the Socrata SODA endpoint at $limit=50000. Checkpoints per page so the
 * script can resume after an interruption.
 *
 * NYC OpenData dataset id is hard-coded below — if NYC migrates the dataset,
 * update DATASET_ID. Verify schema (heightroof, groundelev, the_geom) hasn't
 * changed at https://data.cityofnewyork.us/.
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
const SIMPLIFY_TOLERANCE = 0.8
const MIN_HEIGHT_M = 2
const DEFAULT_HEIGHT_M = 8
const FT_TO_M = 0.3048

// NYC OpenData "Building Footprints". Fields used:
//   bin              — Building Identification Number (string id)
//   height_roof      — height of highest roof point above ground level (feet, AGL)
//   ground_elevation — ground elevation NAVD88 (feet) — informational only
//   the_geom         — Polygon or MultiPolygon, lon/lat (WGS84)
const DATASET_ID = '5zhs-2jue'
const PAGE_SIZE = 50000
const SODA_URL = `https://data.cityofnewyork.us/resource/${DATASET_ID}.geojson`
const MAX_RETRIES = 4
const RETRY_DELAY_MS = 5000

// ─── geometry helpers (unchanged from the OSM pipeline) ───────────────────────

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

function parseHeight(props) {
  const hr = parseFloat(props.height_roof)
  // height_roof is AGL feet. Reject implausible values (>2000ft = ~610m,
  // taller than One World Trade) — fall back to default rather than render
  // a glitchy spike.
  if (isFinite(hr) && hr > 0 && hr < 2000) return hr * FT_TO_M
  return DEFAULT_HEIGHT_M
}

function tileKey(x, z) { return `${Math.floor(x / TILE_SIZE)}_${Math.floor(z / TILE_SIZE)}` }
function tileBounds(key) {
  const [tx, tz] = key.split('_').map(Number)
  return { minX: tx * TILE_SIZE, maxX: (tx + 1) * TILE_SIZE, minZ: tz * TILE_SIZE, maxZ: (tz + 1) * TILE_SIZE }
}

// ─── Socrata fetch with retry ─────────────────────────────────────────────────

async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)) }

async function fetchPage(offset) {
  const params = new URLSearchParams({
    $limit: String(PAGE_SIZE),
    $offset: String(offset),
    $select: 'bin,height_roof,the_geom',
    $order: 'bin',
  })
  const url = `${SODA_URL}?${params}`

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = RETRY_DELAY_MS * attempt
      console.log(`    retry ${attempt}/${MAX_RETRIES} in ${delay / 1000}s…`)
      await sleep(delay)
    }
    try {
      const res = await fetch(url, {
        headers: {
          'Accept': 'application/geo+json',
          'User-Agent': '3d-city build-tiles.mjs (personal project)',
        },
        signal: AbortSignal.timeout(180_000),
      })
      if (res.status === 429 || res.status === 503 || res.status === 504) {
        console.log(`    HTTP ${res.status}, will retry…`)
        continue
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
      return await res.json()
    } catch (err) {
      if (attempt === MAX_RETRIES) throw err
      console.log(`    error: ${err.message}, will retry…`)
    }
  }
}

// ─── feature processing ──────────────────────────────────────────────────────

// Process one outer ring (GeoJSON [lon, lat] pairs) into the tile schema.
function processRing(outerRing, height, idStr) {
  if (!outerRing || outerRing.length < 4) return null
  const ring = outerRing.map(([lon, lat]) => project(lon, lat))
  const first = ring[0], last = ring[ring.length - 1]
  if (first[0] !== last[0] || first[1] !== last[1]) ring.push([...first])
  const simplified = simplify(ring, SIMPLIFY_TOLERANCE)
  if (simplified.length < 3) return null
  const wound = ensureWinding(simplified)
  let cx = 0, cz = 0
  for (const [x, z] of wound) { cx += x; cz += z }
  cx /= wound.length; cz /= wound.length
  return {
    id: idStr,
    footprint: wound.map(([x, z]) => [Math.round(x * 10) / 10, Math.round(z * 10) / 10]),
    height: Math.round(height * 10) / 10,
    center: [Math.round(cx * 10) / 10, Math.round(cz * 10) / 10],
  }
}

function processFeature(feat, fallbackId) {
  const props = feat.properties || {}
  const geom = feat.geometry
  if (!geom) return []
  const height = parseHeight(props)
  if (height < MIN_HEIGHT_M) return []
  const baseId = props.bin ? String(props.bin) : `f${fallbackId}`
  const out = []
  if (geom.type === 'Polygon') {
    const b = processRing(geom.coordinates[0], height, baseId)
    if (b) out.push(b)
  } else if (geom.type === 'MultiPolygon') {
    geom.coordinates.forEach((poly, i) => {
      const id = geom.coordinates.length > 1 ? `${baseId}-${i}` : baseId
      const b = processRing(poly[0], height, id)
      if (b) out.push(b)
    })
  }
  return out
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function clearOldTiles() {
  const entries = await fs.readdir(OUT_DIR)
  for (const name of entries) {
    if (name.startsWith('tile_') && name.endsWith('.json')) {
      await fs.unlink(path.join(OUT_DIR, name)).catch(() => {})
    }
  }
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true })

  let checkpoint = { completedPages: [] }
  let resuming = false
  try {
    checkpoint = JSON.parse(await fs.readFile(CHECKPOINT_FILE, 'utf8'))
    resuming = true
    console.log(`Resuming from checkpoint. Completed pages: ${checkpoint.completedPages.length}`)
  } catch { /* fresh start */ }

  if (!resuming) {
    console.log('Fresh run — clearing old tile_*.json files…')
    await clearOldTiles()
  }

  const tiles = new Map()
  let processed = 0, skipped = 0

  // Replay completed-page buffers into tile map
  for (const pageIdx of checkpoint.completedPages) {
    const pageFile = path.join(OUT_DIR, `_page_${pageIdx}.json`)
    try {
      const buildings = JSON.parse(await fs.readFile(pageFile, 'utf8'))
      for (const b of buildings) {
        const key = tileKey(b.center[0], b.center[1])
        if (!tiles.has(key)) tiles.set(key, [])
        tiles.get(key).push(b)
        processed++
      }
    } catch { /* missing; that page will refetch */ }
  }

  console.log(`\nFetching NYC OpenData Building Footprints (dataset ${DATASET_ID})…`)

  const completed = new Set(checkpoint.completedPages)
  let pageIdx = 0
  while (true) {
    if (completed.has(pageIdx)) { pageIdx++; continue }
    const offset = pageIdx * PAGE_SIZE
    console.log(`  Page ${pageIdx} (offset ${offset})…`)

    const fc = await fetchPage(offset)
    const features = fc.features || []
    if (features.length === 0) {
      console.log('    empty page — done')
      break
    }

    const pageBuildings = []
    for (let i = 0; i < features.length; i++) {
      const buildings = processFeature(features[i], `${pageIdx}-${i}`)
      if (buildings.length === 0) { skipped++; continue }
      for (const b of buildings) {
        pageBuildings.push(b)
        const key = tileKey(b.center[0], b.center[1])
        if (!tiles.has(key)) tiles.set(key, [])
        tiles.get(key).push(b)
        processed++
      }
    }

    await fs.writeFile(path.join(OUT_DIR, `_page_${pageIdx}.json`), JSON.stringify(pageBuildings))
    checkpoint.completedPages.push(pageIdx)
    completed.add(pageIdx)
    await fs.writeFile(CHECKPOINT_FILE, JSON.stringify(checkpoint))
    console.log(`    → ${features.length} features, ${pageBuildings.length} buildings. Running total: ${processed}`)

    if (features.length < PAGE_SIZE) {
      console.log('    last page')
      break
    }
    pageIdx++
    await sleep(500)
  }

  console.log(`\nAll pages complete. Processed: ${processed} | Skipped: ${skipped}`)
  console.log(`Writing ${tiles.size} tile files…`)

  // Slim manifest format — `[gridX, gridZ]` per tile, runtime derives
  // id/file/bounds. See src/lib/manifests.js. Drops ~95% of the manifest
  // bytes vs. the verbose shape we used previously.
  const manifestTiles = []
  for (const [key, buildings] of tiles) {
    const file = `tile_${key}.json`
    const bounds = tileBounds(key)
    await fs.writeFile(path.join(OUT_DIR, file), JSON.stringify({ tileId: key, bounds, buildings }))
    const [gx, gz] = key.split('_').map(Number)
    manifestTiles.push([gx, gz])
  }

  const manifest = {
    v: 2,
    origin: { lat: ORIGIN_LAT, lon: ORIGIN_LON },
    tileSize: TILE_SIZE,
    tiles: manifestTiles,
  }
  await fs.writeFile(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest))

  // Clean up checkpoint and per-page files
  try {
    await fs.unlink(CHECKPOINT_FILE)
    for (const idx of checkpoint.completedPages) {
      await fs.unlink(path.join(OUT_DIR, `_page_${idx}.json`)).catch(() => {})
    }
  } catch { /* ignore */ }

  console.log(`Done. ${tiles.size} tiles written to ${OUT_DIR}`)
}

main().catch((err) => { console.error(err); process.exit(1) })

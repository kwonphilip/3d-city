/**
 * Offline data pipeline: NYC OpenData Borough Boundaries (GeoJSON) +
 * OpenStreetMap Overpass coastline for NJ → Manhattan landmass polygons.
 * Run once: node scripts/build-land.mjs
 * Output: public/data/manhattan/land.json
 *
 * Data sources:
 *   NYC: NYC OpenData "Borough Boundaries (water areas excluded)" — MultiPolygon
 *        per borough, definitive city-issued shoreline. Dataset id: gthc-hcne.
 *   NJ:  OpenStreetMap natural=coastline ways within the Hudson waterfront bbox,
 *        stitched into closed rings.
 *   Outlying islands: OSM place=island ways (Ellis, Liberty, Governors, U Thant
 *        if not already included by the boroughs).
 */

import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_FILE = path.join(__dirname, '..', 'public', 'data', 'manhattan', 'land.json')

const ORIGIN_LAT = 40.758
const ORIGIN_LON = -73.9855
const LAT_TO_M = 111139
const LON_TO_M = 111139 * Math.cos(ORIGIN_LAT * (Math.PI / 180))

const SIMPLIFY_TOLERANCE = 5

const NYC_BOROUGHS_URL = 'https://data.cityofnewyork.us/api/geospatial/gthc-hcne?method=export&format=GeoJSON'

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
            'User-Agent': '3d-city build-land.mjs (personal project)',
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

const eq = (a, b) => a[0] === b[0] && a[1] === b[1]
const closed = (r) => r.length > 2 && eq(r[0], r[r.length - 1])

function stitchWays(ways) {
  const segs = ways.map((w) => w.geometry.map((p) => [p.lon, p.lat]))
  const rings = []
  while (segs.length > 0) {
    let ring = segs.shift().slice()
    let progress = true
    while (progress && !closed(ring)) {
      progress = false
      for (let i = 0; i < segs.length; i++) {
        const seg = segs[i]
        const head = ring[0], tail = ring[ring.length - 1]
        if (eq(seg[0], tail))                   { ring.push(...seg.slice(1));               segs.splice(i, 1); progress = true; break }
        else if (eq(seg[seg.length - 1], tail)) { for (let k = seg.length - 2; k >= 0; k--) ring.push(seg[k]); segs.splice(i, 1); progress = true; break }
        else if (eq(seg[seg.length - 1], head)) { ring.unshift(...seg.slice(0, -1));        segs.splice(i, 1); progress = true; break }
        else if (eq(seg[0], head))              { for (let k = seg.length - 1; k > 0; k--) ring.unshift(seg[k]); segs.splice(i, 1); progress = true; break }
      }
    }
    rings.push(ring)
  }
  return rings
}

// ─── data sources ─────────────────────────────────────────────────────────────

async function fetchNYC() {
  console.log('\nFetching NYC OpenData borough boundaries...')
  console.log(`  → ${NYC_BOROUGHS_URL}`)
  const res = await fetch(NYC_BOROUGHS_URL, { signal: AbortSignal.timeout(120_000) })
  if (!res.ok) throw new Error(`NYC OpenData HTTP ${res.status}`)
  const data = await res.json()
  console.log(`  ${data.features.length} borough features`)

  const landmasses = []
  for (const feature of data.features) {
    const name = feature.properties?.boroname || 'NYC'
    const geom = feature.geometry
    const polys = geom.type === 'MultiPolygon'
      ? geom.coordinates
      : geom.type === 'Polygon'
      ? [geom.coordinates]
      : []
    let added = 0
    for (const poly of polys) {
      // poly = [outer, hole1, hole2, ...] each being [[lon, lat], ...]
      const outerProjected = poly[0].map(([lon, lat]) => project(lon, lat))
      const outer = simplify(outerProjected, SIMPLIFY_TOLERANCE)
      if (outer.length < 3) continue
      const holes = poly.slice(1)
        .map((ring) => simplify(ring.map(([lon, lat]) => project(lon, lat)), SIMPLIFY_TOLERANCE))
        .filter((h) => h.length >= 3)
      landmasses.push({ name, outer: round1(outer), holes: holes.map(round1) })
      added++
    }
    console.log(`  ${name}: ${added} polygon(s)`)
  }
  return landmasses
}

async function fetchNJShoreline() {
  // OSM admin_level=8 = NJ municipality. Each relation's outer ways form the
  // city boundary, which (unlike natural=coastline) covers the entire municipality
  // as a filled polygon — no ring-closure issues.
  console.log('\nFetching NJ municipalities (OSM admin_level=8)...')
  const query = `
[out:json][timeout:90];
rel["boundary"="administrative"]["admin_level"="8"](40.685,-74.10,40.825,-73.99);
out geom;
`
  const data = await fetchOverpass(query)
  const rels = (data.elements || []).filter((e) => e.type === 'relation' && e.members)
  console.log(`  ${rels.length} municipality relations`)

  const landmasses = []
  for (const rel of rels) {
    const cityName = rel.tags?.name || 'NJ'
    const outerWays = rel.members.filter((m) => m.type === 'way' && m.role === 'outer' && m.geometry?.length)
    if (outerWays.length === 0) continue
    const rings = stitchWays(outerWays)
    let added = 0
    for (const ring of rings) {
      const projected = ring.map(([lon, lat]) => project(lon, lat))
      const simplified = simplify(projected, SIMPLIFY_TOLERANCE)
      if (simplified.length < 3) continue
      // Tag every NJ landmass with the same group name "NJ Hudson Waterfront" so the
      // borough toggle in the UI groups them. Real city name kept in `subname`.
      landmasses.push({ name: 'NJ Hudson Waterfront', subname: cityName, outer: round1(simplified) })
      added++
    }
    if (added > 0) console.log(`  ${cityName}: ${added} polygon(s)`)
  }
  return landmasses
}

async function fetchOutlyingIslands() {
  console.log('\nFetching outlying islands (federal land not in any borough)...')
  const query = `
[out:json][timeout:90];
(
  way["place"="island"](40.685,-74.05,40.815,-73.95);
  way["place"="islet"](40.685,-74.05,40.815,-73.95);
);
out geom;
`
  const data = await fetchOverpass(query)
  const ways = (data.elements || []).filter((e) => e.type === 'way' && e.geometry?.length)
  console.log(`  ${ways.length} island ways`)

  // Skip Manhattan + ones already covered by boroughs (Roosevelt, Randall's, Wards, U Thant).
  const skipNames = new Set(['Manhattan', 'Roosevelt Island', "Randall's Island", 'Wards Island', 'U Thant Island', 'Little Island'])
  return ways
    .filter((w) => !skipNames.has(w.tags?.name || ''))
    .map((w) => ({
      name: w.tags?.name || 'island',
      outer: round1(simplify(w.geometry.map((p) => [p.lon, p.lat]).map(([lon, lat]) => project(lon, lat)), SIMPLIFY_TOLERANCE)),
    }))
    .filter((lm) => lm.outer.length >= 3)
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  await fs.mkdir(path.dirname(OUT_FILE), { recursive: true })

  const landmasses = []

  // NYC (authoritative)
  try {
    landmasses.push(...(await fetchNYC()))
  } catch (err) {
    console.error('NYC OpenData fetch failed:', err.message)
    console.error('Cannot continue without NYC borough data.')
    process.exit(1)
  }

  // NJ (OSM)
  try {
    landmasses.push(...(await fetchNJShoreline()))
  } catch (err) {
    console.warn('NJ shoreline fetch failed (continuing without):', err.message)
  }

  // Outlying federal islands
  try {
    landmasses.push(...(await fetchOutlyingIslands()))
  } catch (err) {
    console.warn('Outlying islands fetch failed (continuing without):', err.message)
  }

  const out = {
    origin: { lat: ORIGIN_LAT, lon: ORIGIN_LON },
    generatedAt: new Date().toISOString(),
    sources: {
      nyc: 'NYC OpenData — Borough Boundaries (gthc-hcne)',
      nj: 'OpenStreetMap (Overpass) natural=coastline',
      islands: 'OpenStreetMap (Overpass) place=island',
    },
    landmasses,
  }

  const json = JSON.stringify(out)
  await fs.writeFile(OUT_FILE, json)

  console.log(`\nWrote ${landmasses.length} landmasses (${(json.length / 1024).toFixed(1)} KB) to ${OUT_FILE}`)
  for (const lm of landmasses) console.log(`  - ${lm.name}: ${lm.outer.length} pts${lm.holes?.length ? `, ${lm.holes.length} hole(s)` : ''}`)
}

main().catch((err) => { console.error(err); process.exit(1) })

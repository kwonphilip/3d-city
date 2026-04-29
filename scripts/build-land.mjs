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
import ClipperLib from 'clipper-lib'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_FILE = path.join(__dirname, '..', 'public', 'data', 'manhattan', 'land.json')

const ORIGIN_LAT = 40.758
const ORIGIN_LON = -73.9855
const LAT_TO_M = 111139
const LON_TO_M = 111139 * Math.cos(ORIGIN_LAT * (Math.PI / 180))

const SIMPLIFY_TOLERANCE = 5
const WATER_BUFFER_M = 600       // halo around every landmass in the water shape
const WATER_SIMPLIFY_TOL = 10    // Douglas-Peucker tol applied to offset rings
const CLIPPER_SCALE = 1000       // clipper-lib uses integers; 1000 = mm precision
const CLIPPER_ARC_TOLERANCE = 0.25 * CLIPPER_SCALE // ~0.25m chord error on offset arcs

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

// ─── water-shape buffer ───────────────────────────────────────────────────────
// Each landmass is dilated outward by WATER_BUFFER_M using ClipperOffset (which
// implements true polygon offset — Minkowski sum with a disc — handling concave
// edges, sharp corners, and self-intersection cleanup natively). All offsets
// are then unioned via Clipper to merge overlapping borough halos. Output is
// one or more closed polygons hugging the NYC outline.

function ringToClipper(ring) {
  // Strip duplicate close-vertex if present; clipper closes implicitly.
  const f = ring[0], l = ring[ring.length - 1]
  const open = f[0] === l[0] && f[1] === l[1] ? ring.slice(0, -1) : ring
  return open.map(([x, y]) => ({
    X: Math.round(x * CLIPPER_SCALE),
    Y: Math.round(y * CLIPPER_SCALE),
  }))
}

function clipperToRing(path) {
  return path.map((p) => [p.X / CLIPPER_SCALE, p.Y / CLIPPER_SCALE])
}

// Run ClipperOffset for one or many rings, returning the union of their offsets.
function offsetRings(rings, distance) {
  const co = new ClipperLib.ClipperOffset(2.0, CLIPPER_ARC_TOLERANCE)
  for (const r of rings) {
    if (r.length < 3) continue
    co.AddPath(ringToClipper(r), ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon)
  }
  const solution = new ClipperLib.Paths()
  co.Execute(solution, distance * CLIPPER_SCALE)
  return solution
}

// Convert Clipper Paths into [{outer, holes}] using the standard non-zero
// winding interpretation (positive area = outer, negative = hole). Outer rings
// are matched to their containing holes by point-in-polygon.
function clipperPathsToPolygons(paths) {
  const outers = []
  const holes = []
  for (const path of paths) {
    if (path.length < 3) continue
    const ring = clipperToRing(path)
    const simplified = simplify(ring, WATER_SIMPLIFY_TOL)
    if (simplified.length < 3) continue
    if (ClipperLib.Clipper.Orientation(path)) outers.push(simplified)
    else holes.push(simplified)
  }
  // For each hole, find the outer ring that contains it.
  const polys = outers.map((outer) => ({ outer: round1(outer), holes: [] }))
  for (const hole of holes) {
    const [hx, hy] = hole[0]
    let bestIdx = -1
    let bestArea = Infinity
    for (let i = 0; i < polys.length; i++) {
      if (!pointInRing(hx, hy, polys[i].outer)) continue
      const area = Math.abs(signedArea(polys[i].outer))
      if (area < bestArea) { bestArea = area; bestIdx = i }
    }
    if (bestIdx >= 0) polys[bestIdx].holes.push(round1(hole))
  }
  return polys
}

function signedArea(ring) {
  let a = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1]
  }
  return a / 2
}

function pointInRing(x, y, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1]
    const xj = ring[j][0], yj = ring[j][1]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function computeWaterShape(landmasses) {
  if (landmasses.length === 0) return []
  console.log(`\nBuffering ${landmasses.length} landmasses by ${WATER_BUFFER_M}m for water shape...`)
  const rings = landmasses
    .filter((lm) => lm.outer && lm.outer.length >= 3)
    .map((lm) => lm.outer)

  // ClipperOffset over all rings at once — overlapping offsets are merged in
  // the same pass, no separate union step needed.
  const offset = offsetRings(rings, WATER_BUFFER_M)
  const polys = clipperPathsToPolygons(offset)

  console.log(`  → ${polys.length} water polygon(s)`)
  for (const p of polys) console.log(`    outer ${p.outer.length} pts${p.holes.length ? `, ${p.holes.length} hole(s)` : ''}`)
  return polys
}

// Compute the union axis-aligned bbox over every kept landmass (outer + holes).
function computeBounds(landmasses) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
  const sweep = (pts) => {
    for (const [x, z] of pts) {
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (z < minZ) minZ = z
      if (z > maxZ) maxZ = z
    }
  }
  for (const lm of landmasses) {
    sweep(lm.outer)
    if (lm.holes) for (const h of lm.holes) sweep(h)
  }
  if (!isFinite(minX)) return null
  return { minX, maxX, minZ, maxZ }
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  await fs.mkdir(path.dirname(OUT_FILE), { recursive: true })

  const landmasses = []

  // NYC (authoritative — covers all 5 boroughs + Roosevelt/Randalls/U Thant)
  try {
    landmasses.push(...(await fetchNYC()))
  } catch (err) {
    console.error('NYC OpenData fetch failed:', err.message)
    console.error('Cannot continue without NYC borough data.')
    process.exit(1)
  }

  // Outlying NYC harbor islands (Liberty / Ellis / Governors / Little Island)
  try {
    landmasses.push(...(await fetchOutlyingIslands()))
  } catch (err) {
    console.warn('Outlying islands fetch failed (continuing without):', err.message)
  }

  const nycBounds = computeBounds(landmasses)
  const waterShape = computeWaterShape(landmasses)

  const out = {
    origin: { lat: ORIGIN_LAT, lon: ORIGIN_LON },
    generatedAt: new Date().toISOString(),
    sources: {
      nyc: 'NYC OpenData — Borough Boundaries (gthc-hcne)',
      islands: 'OpenStreetMap (Overpass) place=island',
    },
    nycBounds,
    waterShape,
    landmasses,
  }

  const json = JSON.stringify(out)
  await fs.writeFile(OUT_FILE, json)

  console.log(`\nWrote ${landmasses.length} landmasses (${(json.length / 1024).toFixed(1)} KB) to ${OUT_FILE}`)
  if (nycBounds) {
    console.log(`NYC bounds: x=[${nycBounds.minX.toFixed(0)}, ${nycBounds.maxX.toFixed(0)}], z=[${nycBounds.minZ.toFixed(0)}, ${nycBounds.maxZ.toFixed(0)}]`)
    console.log(`  ${(nycBounds.maxX - nycBounds.minX).toFixed(0)}m wide × ${(nycBounds.maxZ - nycBounds.minZ).toFixed(0)}m tall`)
  }
  for (const lm of landmasses.slice(0, 12)) console.log(`  - ${lm.name}: ${lm.outer.length} pts${lm.holes?.length ? `, ${lm.holes.length} hole(s)` : ''}`)
  if (landmasses.length > 12) console.log(`  … and ${landmasses.length - 12} more`)
}

main().catch((err) => { console.error(err); process.exit(1) })

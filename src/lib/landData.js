// Module-level cached fetch for /data/manhattan/land.json.
//
// Buildings.jsx, Terrain.jsx, and Minimap.jsx all need the same payload.
// Without this, each component fired its own fetch on cold start —
// three concurrent ~309 KB requests + three JSON parses for the same data.
// Mirrors the pattern in lib/nycMask.js's loadMask().

const LAND_URL = '/data/manhattan/land.json'

let cached = null
let cachedPromise = null

export function loadLand() {
  if (cached) return Promise.resolve(cached)
  if (cachedPromise) return cachedPromise
  cachedPromise = fetch(LAND_URL)
    .then((r) => r.json())
    .then((d) => { cached = d; return d })
    .catch((err) => { cachedPromise = null; throw err })
  return cachedPromise
}

// Module-level cached fetches for the buildings + roads manifests.
//
// Manifests on disk are stored in a slim format:
//   { v, origin, tileSize, tiles: [[gridX, gridZ], ...] }
// We inflate to the verbose shape the renderers expect:
//   { tiles: [{ id, file, bounds: { minX, maxX, minZ, maxZ } }, ...] }
// once on load, so the per-tick distance check sees the same shape it always
// did. The slim format trims the buildings manifest from ~660 KB to ~30 KB and
// the roads manifest from ~1.6 MB to ~75 KB — most of the cold-start payload
// before the first paint.
//
// Sequencing matters at cold start: the buildings manifest is the
// critical-path file (the first paint of 3D content waits on it), so we want
// it to win the bandwidth race against the larger roads manifest. The roads
// loader awaits the buildings loader, so even though both are kicked off
// during component mount, the roads manifest fetch only enters the network
// queue after the buildings JSON has arrived.

import { dataUrl } from './dataPaths'

const BUILDINGS_URL = dataUrl('manifest.json')
const ROADS_URL = dataUrl('roads_manifest.json')

function inflate(slim, fileFor) {
  const tileSize = slim.tileSize ?? 500
  const tiles = []
  for (const entry of slim.tiles) {
    // Slim format: [gridX, gridZ]. Verbose format: { id, file, bounds, ... }.
    // Pass-through if a regenerated manifest still hasn't been slimified yet.
    if (Array.isArray(entry)) {
      const [gx, gz] = entry
      const id = `${gx}_${gz}`
      tiles.push({
        id,
        file: fileFor(id),
        bounds: {
          minX: gx * tileSize,
          maxX: (gx + 1) * tileSize,
          minZ: gz * tileSize,
          maxZ: (gz + 1) * tileSize,
        },
      })
    } else {
      tiles.push(entry)
    }
  }
  return { origin: slim.origin, tileSize, tiles }
}

let cachedBuildings = null
let buildingsPromise = null

export function loadBuildingsManifest() {
  if (cachedBuildings) return Promise.resolve(cachedBuildings)
  if (buildingsPromise) return buildingsPromise
  buildingsPromise = fetch(BUILDINGS_URL)
    .then((r) => r.json())
    .then((m) => {
      cachedBuildings = inflate(m, (id) => `tile_${id}.json`)
      return cachedBuildings
    })
    .catch((err) => { buildingsPromise = null; throw err })
  return buildingsPromise
}

let cachedRoads = null
let roadsPromise = null

export function loadRoadsManifest() {
  if (cachedRoads) return Promise.resolve(cachedRoads)
  if (roadsPromise) return roadsPromise
  roadsPromise = loadBuildingsManifest()
    .then(() => fetch(ROADS_URL))
    .then((r) => r.json())
    .then((m) => {
      cachedRoads = inflate(m, (id) => `roads/road_${id}.json`)
      return cachedRoads
    })
    .catch((err) => { roadsPromise = null; throw err })
  return roadsPromise
}

// Module-level cached fetches for the buildings + roads manifests.
//
// Sequencing matters at cold start: the buildings manifest is the
// critical-path file (the first paint of 3D content waits on it), so we want
// it to win the bandwidth race against the much larger roads manifest. The
// roads loader awaits the buildings loader, so even though both are kicked off
// during component mount, the roads manifest fetch only enters the network
// queue after the buildings JSON has arrived.

const BUILDINGS_URL = '/data/manhattan/manifest.json'
const ROADS_URL = '/data/manhattan/roads_manifest.json'

let cachedBuildings = null
let buildingsPromise = null

export function loadBuildingsManifest() {
  if (cachedBuildings) return Promise.resolve(cachedBuildings)
  if (buildingsPromise) return buildingsPromise
  buildingsPromise = fetch(BUILDINGS_URL)
    .then((r) => r.json())
    .then((m) => { cachedBuildings = m; return m })
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
    .then((m) => { cachedRoads = m; return m })
    .catch((err) => { roadsPromise = null; throw err })
  return roadsPromise
}

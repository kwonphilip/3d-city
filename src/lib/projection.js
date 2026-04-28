// Manhattan-centered local tangent plane projection.
// Origin ≈ Times Square. X = east (m), Z = south (m, so north = -Z).
const ORIGIN_LAT = 40.758
const ORIGIN_LON = -73.9855
const LAT_TO_M = 111139
const LON_TO_M = 111139 * Math.cos(ORIGIN_LAT * (Math.PI / 180))

export function lonLatToLocal(lon, lat) {
  return {
    x: (lon - ORIGIN_LON) * LON_TO_M,
    z: -(lat - ORIGIN_LAT) * LAT_TO_M,
  }
}

export function localToLonLat(x, z) {
  return {
    lon: ORIGIN_LON + x / LON_TO_M,
    lat: ORIGIN_LAT + (-z) / LAT_TO_M,
  }
}

export { ORIGIN_LAT, ORIGIN_LON }

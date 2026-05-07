// Tile streaming activity counters. Writers (Buildings/Roads inside Canvas)
// push their inFlightRef sizes here on a 100ms interval; the LoadingIndicator
// HTML overlay polls them at the same cadence. Mutable singleton (same pattern
// as minimapState) since context doesn't bridge the Canvas/HTML boundary.
export const loadingState = {
  buildingsInFlight: 0,
  roadsInFlight: 0,
}

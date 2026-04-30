import { create } from 'zustand'

// Keyed by tileId so tiles can be added/removed atomically as they stream.
// Each tile holds a Map<buildingId, {id, footprint, height, center}>.
export const useBuildingRegistry = create((set, get) => ({
  tiles: new Map(),
  // True once Buildings.jsx has fetched manifest.json. MapView's loading
  // overlay uses this in perf mode (where no tiles auto-load) to know
  // the canvas is interactive and the spinner can fade.
  manifestReady: false,

  setManifestReady: () => set({ manifestReady: true }),

  addTile: (tileId, buildings) => set((s) => {
    const next = new Map(s.tiles)
    const inner = new Map()
    for (const b of buildings) inner.set(b.id, b)
    next.set(tileId, inner)
    return { tiles: next }
  }),

  removeTile: (tileId) => set((s) => {
    if (!s.tiles.has(tileId)) return s
    const next = new Map(s.tiles)
    next.delete(tileId)
    return { tiles: next }
  }),

  // Linear scan — fine at 12k buildings for an interactive lookup that runs once per selection change.
  findNearest: (x, z, maxDist = 80) => {
    let best = null
    let bestDist = maxDist
    for (const tile of get().tiles.values()) {
      for (const b of tile.values()) {
        const d = Math.hypot(b.center[0] - x, b.center[1] - z)
        if (d < bestDist) {
          best = b
          bestDist = d
        }
      }
    }
    return best
  },
}))

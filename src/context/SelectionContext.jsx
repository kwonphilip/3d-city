import { create } from 'zustand'
import { lonLatToLocal } from '../lib/projection'

export const useSelectionStore = create((set) => ({
  // { label, x, z } in local metres, or null
  target: null,
  fly: (label, lon, lat) => {
    const { x, z } = lonLatToLocal(lon, lat)
    set({ target: { label, x, z } })
  },
  flyToWorld: (x, z, label = '') => set({ target: { label, x, z } }),
  clear: () => set({ target: null }),
}))

import { create } from 'zustand'

function detectDefaults() {
  if (window.matchMedia('(pointer: coarse)').matches || window.innerWidth <= 768) {
    return { renderRadius: 1500, minBuildingHeight: 6 }
  }
  const cores = navigator.hardwareConcurrency ?? 4
  const dpr = window.devicePixelRatio ?? 1
  if (cores >= 8 && dpr >= 2) return { renderRadius: 3000, minBuildingHeight: 3 }
  if (cores <= 2 || dpr <= 1) return { renderRadius: 1000, minBuildingHeight: 8 }
  return { renderRadius: 2000, minBuildingHeight: 5 }
}

// Borough keys here must match the `name` field on landmasses in land.json.
const DEFAULT_BOROUGHS = {
  Manhattan: true,
  Brooklyn: true,
  Queens: true,
  Bronx: true,
  'Staten Island': true,
}

export const useQualityStore = create((set) => ({
  ...detectDefaults(),
  boroughs: DEFAULT_BOROUGHS,
  setQuality: (patch) => set(patch),
  setBorough: (name, on) => set((s) => ({ boroughs: { ...s.boroughs, [name]: on } })),
}))

export const useQuality = () => useQualityStore()

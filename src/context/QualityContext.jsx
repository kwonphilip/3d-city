import { create } from 'zustand'

function detectDefaults() {
  const cores = navigator.hardwareConcurrency ?? 4
  const dpr = window.devicePixelRatio ?? 1
  if (cores >= 8 && dpr >= 2) return { renderRadius: 3000, minBuildingHeight: 3 }
  if (cores <= 2 || dpr <= 1) return { renderRadius: 1000, minBuildingHeight: 8 }
  return { renderRadius: 2000, minBuildingHeight: 5 }
}

export const useQualityStore = create((set) => ({
  ...detectDefaults(),
  setQuality: (patch) => set(patch),
}))

export const useQuality = () => useQualityStore()

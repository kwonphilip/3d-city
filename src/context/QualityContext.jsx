import { create } from 'zustand'

export const useQualityStore = create((set) => ({
  renderRadius: 2000,
  minBuildingHeight: 5,
  setQuality: (patch) => set(patch),
}))

export const useQuality = () => useQualityStore()

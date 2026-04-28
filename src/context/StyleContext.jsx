import { create } from 'zustand'
import { STYLE_REGISTRY, DEFAULT_STYLE_ID } from '../styles/index'

const defaultStyle = STYLE_REGISTRY.find(s => s.id === DEFAULT_STYLE_ID)

export const useStyleStore = create((set) => ({
  style: defaultStyle,
  setStyleById: (id) => {
    const s = STYLE_REGISTRY.find(p => p.id === id)
    if (s) set({ style: s })
  },
}))

// Convenience hook matching prior API: useStyle().style, useStyle().buildingMaterial, etc.
export const useStyle = () => useStyleStore(s => s.style)

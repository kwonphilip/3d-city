import { create } from 'zustand'

// Performance mode: instead of streaming buildings around the camera, only show
// a small radius around the user's last double-click. The streaming logic lives
// in Buildings.jsx; this store just holds the toggle and the click point.
export const usePerfModeStore = create((set) => ({
  performanceMode: false,
  popupCenter: null, // { x, z } in world metres, or null
  setPerformanceMode: (on) => set({ performanceMode: on, popupCenter: on ? null : null }),
  setPopupCenter: (xz) => set({ popupCenter: xz }),
}))

export const usePerfMode = () => usePerfModeStore()

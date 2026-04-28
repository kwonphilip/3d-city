/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState } from 'react'
import * as THREE from 'three'

const defaultStyle = {
  id: 'lowPolyFlat',
  background: '#0a0a1a',
  buildingMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#4a7fbf') }),
  highlightMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#ff8844') }),
}

const StyleContext = createContext(defaultStyle)
export const useStyle = () => useContext(StyleContext)

export function StyleProvider({ children }) {
  const [style] = useState(defaultStyle)
  return <StyleContext.Provider value={style}>{children}</StyleContext.Provider>
}

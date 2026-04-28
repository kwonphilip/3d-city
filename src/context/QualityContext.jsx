/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState } from 'react'

const defaults = { renderRadius: 2000, minBuildingHeight: 5 }

const QualityContext = createContext(defaults)
export const useQuality = () => useContext(QualityContext)

export function QualityProvider({ children }) {
  const [quality, setQuality] = useState(defaults)
  const update = (patch) => setQuality(q => ({ ...q, ...patch }))
  return (
    <QualityContext.Provider value={{ ...quality, setQuality: update }}>
      {children}
    </QualityContext.Provider>
  )
}

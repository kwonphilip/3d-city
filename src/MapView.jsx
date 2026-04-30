import { useEffect, useState } from 'react'
import CityCanvas from './scene/CityCanvas'
import Nav from './ui/Nav'
import StylePicker from './ui/StylePicker'
import QualityPanel from './ui/QualityPanel'
import Compass from './ui/Compass'
import Minimap from './ui/Minimap'
import { useBuildingRegistry } from './context/BuildingRegistry'
import './ui/tooltip.css'

export default function MapView() {
  const ready = useBuildingRegistry((s) => s.tiles.size > 0)
  const [loadingMounted, setLoadingMounted] = useState(true)
  useEffect(() => {
    if (!ready) return
    const t = setTimeout(() => setLoadingMounted(false), 450)
    return () => clearTimeout(t)
  }, [ready])

  return (
    <div className="app">
      <CityCanvas />
      <Nav />
      <div className="ui-overlay">
        <Compass />
        <StylePicker />
        <QualityPanel />
      </div>
      <Minimap />
      {loadingMounted && (
        <div className={`app-loading${ready ? ' app-loading-hidden' : ''}`}>
          <div className="app-loading-spinner" />
          <span>Loading Manhattan…</span>
        </div>
      )}
    </div>
  )
}

import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import CityCanvas from './scene/CityCanvas'
import Nav from './ui/Nav'
import StylePicker from './ui/StylePicker'
import QualityPanel from './ui/QualityPanel'
import Compass from './ui/Compass'
import Minimap from './ui/Minimap'
import { usePerfModeStore } from './context/PerfModeContext'
import { useBuildingRegistry } from './context/BuildingRegistry'
import './ui/tooltip.css'

export default function MapView() {
  const [searchParams] = useSearchParams()
  useEffect(() => {
    if (searchParams.get('mode') === 'performance') {
      usePerfModeStore.setState({ performanceMode: true })
    }
  }, [searchParams])

  // Hide the loading overlay once the first building tile is registered.
  // We keep the element mounted briefly after that so the CSS opacity
  // transition can play out.
  const hasTile = useBuildingRegistry((s) => s.tiles.size > 0)
  const [loadingMounted, setLoadingMounted] = useState(true)
  useEffect(() => {
    if (!hasTile) return
    const t = setTimeout(() => setLoadingMounted(false), 450)
    return () => clearTimeout(t)
  }, [hasTile])

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
        <div className={`app-loading${hasTile ? ' app-loading-hidden' : ''}`}>
          <div className="app-loading-spinner" />
          <span>Loading Manhattan…</span>
        </div>
      )}
    </div>
  )
}

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

  // Hide the loading overlay once the canvas is interactive. In normal mode
  // that means the first building tile has registered. In perf mode no tiles
  // auto-load (they wait for a double-click), so manifestReady alone is
  // enough — the user can pan/click as soon as that's true.
  const performanceMode = usePerfModeStore((s) => s.performanceMode)
  const hasTile = useBuildingRegistry((s) => s.tiles.size > 0)
  const manifestReady = useBuildingRegistry((s) => s.manifestReady)
  const ready = hasTile || (performanceMode && manifestReady)
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

import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import CityCanvas from './scene/CityCanvas'
import Nav from './ui/Nav'
import StylePicker from './ui/StylePicker'
import QualityPanel from './ui/QualityPanel'
import Compass from './ui/Compass'
import Minimap from './ui/Minimap'
import { usePerfModeStore } from './context/PerfModeContext'
import './ui/tooltip.css'

export default function MapView() {
  const [searchParams] = useSearchParams()
  useEffect(() => {
    if (searchParams.get('mode') === 'performance') {
      usePerfModeStore.setState({ performanceMode: true })
    }
  }, [searchParams])
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
    </div>
  )
}

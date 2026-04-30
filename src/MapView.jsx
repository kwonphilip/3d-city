import CityCanvas from './scene/CityCanvas'
import Nav from './ui/Nav'
import StylePicker from './ui/StylePicker'
import QualityPanel from './ui/QualityPanel'
import Compass from './ui/Compass'
import Minimap from './ui/Minimap'

export default function MapView() {
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

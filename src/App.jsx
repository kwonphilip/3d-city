import './App.css'
import CityCanvas from './scene/CityCanvas'
import Nav from './ui/Nav'
import StylePicker from './ui/StylePicker'
import QualityPanel from './ui/QualityPanel'

export default function App() {
  return (
    <div className="app">
      <CityCanvas />
      <Nav />
      <div className="ui-overlay">
        <StylePicker />
        <QualityPanel />
      </div>
    </div>
  )
}

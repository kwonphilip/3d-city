import './App.css'
import CityCanvas from './scene/CityCanvas'
import StylePicker from './ui/StylePicker'

export default function App() {
  return (
    <div className="app">
      <CityCanvas />
      <div className="ui-overlay">
        <StylePicker />
      </div>
    </div>
  )
}

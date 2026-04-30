import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './App.css'
import MapView from './MapView'
import Landing from './pages/Landing'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/map" element={<MapView />} />
      </Routes>
    </BrowserRouter>
  )
}

import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './App.css'
import './ErrorBoundary.css'
import ErrorBoundary from './ErrorBoundary'
import MapView from './MapView'
import Landing from './pages/Landing'

export default function App() {
  // basename pulls Vite's base prefix in (`/` in dev, `/3d-city/` on the
  // GitHub Pages project deploy) so the router compares the path *after* the
  // base — otherwise the deployed URL `/3d-city/` matches no route and the
  // page renders blank.
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <ErrorBoundary>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/map" element={<MapView />} />
        </Routes>
      </ErrorBoundary>
    </BrowserRouter>
  )
}

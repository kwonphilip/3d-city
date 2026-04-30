import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// StrictMode is intentionally off: the geometry-worker pool in
// scene/Buildings.jsx and the road worker can't tolerate dev-mode
// double-mount cleanly — workers get terminated mid-dispatch and the
// in-flight tile messages just disappear, which manifested as slow
// first paints and occasional blank-page crashes after route navigation.
createRoot(document.getElementById('root')).render(<App />)

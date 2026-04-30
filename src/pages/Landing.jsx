import { Link } from 'react-router-dom'
import './Landing.css'

export default function Landing() {
  return (
    <main className="landing">
      <h1>3D NYC</h1>
      <div className="landing-buttons">
        <Link to="/map?mode=performance" className="landing-button">
          Performance mode
        </Link>
        <Link to="/map" className="landing-button">
          Full city
        </Link>
      </div>
    </main>
  )
}

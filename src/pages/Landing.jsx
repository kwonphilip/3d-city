import { Link } from 'react-router-dom'
import './Landing.css'

export default function Landing() {
  return (
    <main className="landing">
      <div className="landing-bg" aria-hidden="true">
        <svg viewBox="0 0 1200 320" preserveAspectRatio="xMidYEnd slice">
          <defs>
            <linearGradient id="sky" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#0b1024" />
              <stop offset="60%" stopColor="#1a2a55" />
              <stop offset="100%" stopColor="#3b4f8a" />
            </linearGradient>
          </defs>
          <rect width="1200" height="320" fill="url(#sky)" />
          {/* Far skyline */}
          <g fill="#1d2a4a" opacity="0.85">
            <rect x="0"   y="200" width="60"  height="120" />
            <rect x="55"  y="180" width="40"  height="140" />
            <rect x="90"  y="210" width="70"  height="110" />
            <rect x="155" y="160" width="50"  height="160" />
            <rect x="200" y="190" width="80"  height="130" />
            <rect x="275" y="170" width="55"  height="150" />
            <rect x="325" y="200" width="65"  height="120" />
            <rect x="385" y="150" width="60"  height="170" />
            <rect x="440" y="180" width="75"  height="140" />
            <rect x="510" y="190" width="50"  height="130" />
            <rect x="555" y="170" width="65"  height="150" />
            <rect x="615" y="200" width="55"  height="120" />
            <rect x="665" y="160" width="70"  height="160" />
            <rect x="730" y="190" width="60"  height="130" />
            <rect x="785" y="180" width="80"  height="140" />
            <rect x="860" y="200" width="55"  height="120" />
            <rect x="910" y="170" width="65"  height="150" />
            <rect x="970" y="190" width="50"  height="130" />
            <rect x="1015" y="160" width="75" height="160" />
            <rect x="1085" y="190" width="55" height="130" />
            <rect x="1135" y="180" width="65" height="140" />
          </g>
          {/* Foreground skyline */}
          <g fill="#0a1227">
            <rect x="0"   y="240" width="80"  height="80" />
            <rect x="75"  y="220" width="60"  height="100" />
            <rect x="130" y="250" width="90"  height="70" />
            <rect x="215" y="230" width="70"  height="90" />
            <rect x="280" y="210" width="100" height="110" />
            <rect x="375" y="240" width="80"  height="80" />
            <rect x="450" y="220" width="90"  height="100" />
            <rect x="535" y="200" width="70"  height="120" />
            <rect x="600" y="230" width="100" height="90" />
            <rect x="695" y="240" width="80"  height="80" />
            <rect x="770" y="210" width="90"  height="110" />
            <rect x="855" y="230" width="70"  height="90" />
            <rect x="920" y="220" width="100" height="100" />
            <rect x="1015" y="240" width="80" height="80" />
            <rect x="1090" y="210" width="110" height="110" />
          </g>
        </svg>
      </div>

      <div className="landing-content">
        <h1 className="landing-title">3D NYC</h1>
        <p className="landing-subtitle">Interactive 3D model of New York City.<br /><br />Loading may take a few moments due to large number of 3D models. Please adjust "Render Radius" to optimize performance.</p>

        <div className="landing-buttons">
          <Link to="/map" className="landing-button landing-button-full">
            <div className="landing-button-title">Enter the city</div>
            <div className="landing-button-desc">
              Explore Manhattan with all controls. Adjust render radius, height threshold, and toggle other boroughs.
            </div>
          </Link>
        </div>
      </div>
    </main>
  )
}

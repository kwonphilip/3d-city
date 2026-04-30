import { useEffect, useRef } from 'react'
import { compassRef } from './compassState'
import './Compass.css'

export default function Compass() {
  const dialRef = useRef(null)

  useEffect(() => {
    let raf = 0
    const tick = () => {
      const el = dialRef.current
      if (el) {
        // Rotate dial opposite to camera heading so N stays at world-north.
        const deg = -compassRef.heading * (180 / Math.PI)
        el.style.transform = `rotate(${deg}deg)`
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div className="compass" aria-label="Compass">
      <div ref={dialRef} className="compass-dial">
        <span className="compass-mark compass-n">N</span>
        <span className="compass-mark compass-e">E</span>
        <span className="compass-mark compass-s">S</span>
        <span className="compass-mark compass-w">W</span>
        <svg viewBox="-50 -50 100 100" className="compass-needle">
          <polygon points="0,-36 6,4 0,0 -6,4" fill="#e94f4f" />
          <polygon points="0,36 6,-4 0,0 -6,-4" fill="#cccccc" />
        </svg>
      </div>
    </div>
  )
}

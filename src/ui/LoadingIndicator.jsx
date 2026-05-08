import { useEffect, useRef, useState } from 'react'
import { loadingState } from './loadingState'
import useIsMobile from '../hooks/useIsMobile'
import skylineUrl from '../assets/nyc-skyline.svg'
import './LoadingIndicator.css'

const REFRESH_MS = 100

export default function LoadingIndicator() {
  const isMobile = useIsMobile()
  const [count, setCount] = useState(0)
  const lastRef = useRef(0)

  useEffect(() => {
    let raf = 0
    const tick = (now) => {
      if (now - lastRef.current >= REFRESH_MS) {
        lastRef.current = now
        const c = loadingState.buildingsInFlight + loadingState.roadsInFlight
        setCount((prev) => (prev === c ? prev : c))
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const active = count > 0
  return (
    <div
      className={`loading-indicator${active ? ' loading-indicator-active' : ''}${isMobile ? ' loading-indicator-mobile' : ''}`}
      aria-live="polite"
      aria-label={active ? `Loading ${count} tiles` : 'Idle'}
    >
      <div
        className="loading-indicator-skyline"
        style={{ '--skyline-mask': `url(${skylineUrl})` }}
      >
        <img
          className="skyline-layer-base"
          src={skylineUrl}
          alt=""
          aria-hidden="true"
        />
        <div className="skyline-shimmer" aria-hidden="true" />
      </div>
      <span className="loading-indicator-count">
        {count} {count === 1 ? 'tile' : 'tiles'} loading
      </span>
    </div>
  )
}

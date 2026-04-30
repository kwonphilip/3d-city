import { useEffect, useRef, useState } from 'react'
import { useSelectionStore } from '../context/SelectionContext'
import { minimapState } from './minimapState'
import './Minimap.css'

const LAND_URL = '/data/manhattan/land.json'
const W = 180
const H = 220
const PAD = 800 // metres of padding around land bbox

// Names whose polygons make up the rendered "world" we want to navigate. The
// rest of the boroughs ship in land.json but aren't toggled on by default and
// would balloon the bbox to ~47 km, shrinking Manhattan to a sliver.
const SHOWN_NAMES = new Set(['Manhattan', 'Ellis Island'])

function filterLandmasses(landmasses) {
  return landmasses.filter((lm) => SHOWN_NAMES.has(lm.name) && lm.outer && lm.outer.length >= 3)
}

function computeBbox(landmasses) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
  for (const lm of landmasses) {
    for (const [x, z] of lm.outer) {
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (z < minZ) minZ = z
      if (z > maxZ) maxZ = z
    }
  }
  return { minX: minX - PAD, maxX: maxX + PAD, minZ: minZ - PAD, maxZ: maxZ + PAD }
}

function makeProjection(bbox) {
  const dx = bbox.maxX - bbox.minX
  const dz = bbox.maxZ - bbox.minZ
  const scale = Math.min(W / dx, H / dz)
  const offX = (W - scale * dx) / 2
  const offZ = (H - scale * dz) / 2
  return {
    worldToPx: (x, z) => [(x - bbox.minX) * scale + offX, (z - bbox.minZ) * scale + offZ],
    pxToWorld: (px, pz) => [(px - offX) / scale + bbox.minX, (pz - offZ) / scale + bbox.minZ],
    scale,
  }
}

function bakeLand(landmasses, proj) {
  const off = document.createElement('canvas')
  off.width = W
  off.height = H
  const ctx = off.getContext('2d')
  // Water — dark blue.
  ctx.fillStyle = '#0d1830'
  ctx.fillRect(0, 0, W, H)
  // Land — clearly brighter so Manhattan reads at a glance.
  ctx.fillStyle = '#5d7ea8'
  ctx.strokeStyle = '#9bb3d4'
  ctx.lineWidth = 0.75
  for (const lm of landmasses) {
    ctx.beginPath()
    for (let i = 0; i < lm.outer.length; i++) {
      const [px, pz] = proj.worldToPx(lm.outer[i][0], lm.outer[i][1])
      if (i === 0) ctx.moveTo(px, pz)
      else ctx.lineTo(px, pz)
    }
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  }
  return off
}

export default function Minimap() {
  const canvasRef = useRef(null)
  const flyToWorld = useSelectionStore((s) => s.flyToWorld)
  const [land, setLand] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetch(LAND_URL).then((r) => r.json()).then((d) => {
      if (!cancelled) setLand(d.landmasses)
    }).catch((err) => console.error('[Minimap] land fetch:', err))
    return () => { cancelled = true }
  }, [])

  const projRef = useRef(null)
  const bboxRef = useRef(null)
  const bakedRef = useRef(null)
  useEffect(() => {
    if (!land) return
    const filtered = filterLandmasses(land)
    if (filtered.length === 0) return
    const bbox = computeBbox(filtered)
    const proj = makeProjection(bbox)
    projRef.current = proj
    bboxRef.current = bbox
    bakedRef.current = bakeLand(filtered, proj)
  }, [land])

  useEffect(() => {
    if (!land) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let raf = 0
    let last = 0
    const REDRAW_MS = 100 // ~10 Hz
    const tick = (now) => {
      if (now - last >= REDRAW_MS && bakedRef.current && projRef.current) {
        last = now
        const proj = projRef.current
        ctx.drawImage(bakedRef.current, 0, 0)

        const { cam, tgt, radius } = minimapState
        const [tx, tz] = proj.worldToPx(tgt.x, tgt.z)
        const [cx, cz] = proj.worldToPx(cam.x, cam.z)

        // Visible-area circle around the look-at target.
        if (radius > 0) {
          ctx.beginPath()
          ctx.arc(tx, tz, radius * proj.scale, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(255, 200, 80, 0.15)'
          ctx.strokeStyle = 'rgba(255, 200, 80, 0.55)'
          ctx.lineWidth = 1
          ctx.fill()
          ctx.stroke()
        }

        // Heading line camera → target.
        ctx.beginPath()
        ctx.moveTo(cx, cz)
        ctx.lineTo(tx, tz)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)'
        ctx.lineWidth = 1
        ctx.stroke()

        // Camera marker.
        ctx.beginPath()
        ctx.arc(cx, cz, 3.5, 0, Math.PI * 2)
        ctx.fillStyle = '#ff6464'
        ctx.fill()
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [land])

  function handleClick(e) {
    const proj = projRef.current
    const bbox = bboxRef.current
    if (!proj || !bbox) return
    const rect = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - rect.left
    const pz = e.clientY - rect.top
    const [wx, wz] = proj.pxToWorld(px, pz)
    // Clamp to the rendered-world bbox so a click in the water margin still
    // flies the camera to a sensible point on land instead of off-grid.
    const cx = Math.min(bbox.maxX, Math.max(bbox.minX, wx))
    const cz = Math.min(bbox.maxZ, Math.max(bbox.minZ, wz))
    flyToWorld(cx, cz)
  }

  return (
    <div
      className="minimap"
      data-tooltip="Click anywhere to fly the camera there. The yellow circle shows roughly what's visible right now."
      data-tooltip-pos="left"
    >
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        onClick={handleClick}
        aria-label="Minimap — click to fly to location"
      />
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { useSelectionStore } from '../context/SelectionContext'
import { minimapState } from './minimapState'
import './Minimap.css'

const LAND_URL = '/data/manhattan/land.json'
const W = 180
const H = 220
const PAD = 1500 // metres of padding around land bbox

function computeBbox(landmasses) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
  for (const lm of landmasses) {
    if (!lm.outer) continue
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
  ctx.fillStyle = '#1a2332'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#3a4a5e'
  ctx.strokeStyle = '#5a7090'
  ctx.lineWidth = 0.5
  for (const lm of landmasses) {
    if (!lm.outer || lm.outer.length < 3) continue
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
  const bakedRef = useRef(null)
  useEffect(() => {
    if (!land) return
    const bbox = computeBbox(land)
    const proj = makeProjection(bbox)
    projRef.current = proj
    bakedRef.current = bakeLand(land, proj)
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
    if (!proj) return
    const rect = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - rect.left
    const pz = e.clientY - rect.top
    const [wx, wz] = proj.pxToWorld(px, pz)
    flyToWorld(wx, wz)
  }

  return (
    <div className="minimap">
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

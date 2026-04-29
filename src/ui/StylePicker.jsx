import { useState } from 'react'
import { STYLE_REGISTRY } from '../styles/index'
import { useStyleStore } from '../context/StyleContext'
import './StylePicker.css'

const CATEGORY_ORDER = ['day', 'night', 'outline']
const CATEGORY_LABEL = { day: 'Day', night: 'Night', outline: 'Outline' }
const PERF_LABEL = { light: 'Light', standard: 'Standard', heavy: 'Heavy' }
const STORAGE_KEY = 'style-picker-open'

function colorFromMaterial(m) {
  if (!m) return null
  if (m.color?.getHexString) return '#' + m.color.getHexString()
  return null
}

function Swatch({ preset }) {
  const bg = preset.background
  const building = colorFromMaterial(preset.buildingMaterial)
  const useParkInSwatch = preset.category === 'day' && preset.parkMaterial
  const accent = useParkInSwatch
    ? colorFromMaterial(preset.parkMaterial)
    : colorFromMaterial(preset.landMaterial)
  const corner = preset.glowColor || colorFromMaterial(preset.highlightMaterial)
  return (
    <div className="sp-swatch" aria-hidden="true">
      <div style={{ background: bg }} />
      <div style={{ background: building || '#888' }} />
      <div style={{ background: accent || '#888' }} />
      <div style={{ background: corner || '#888' }} />
    </div>
  )
}

function StyleCard({ preset, active, onClick }) {
  const tier = preset.perfTier || 'standard'
  return (
    <button
      type="button"
      className={`sp-card${active ? ' sp-active' : ''}`}
      onClick={onClick}
    >
      <Swatch preset={preset} />
      <div className="sp-text">
        <div className="sp-row">
          <span className="sp-label">{preset.label}</span>
          <span className={`sp-perf sp-perf-${tier}`}>{PERF_LABEL[tier] ?? tier}</span>
        </div>
        {preset.description && <div className="sp-desc">{preset.description}</div>}
      </div>
    </button>
  )
}

function readInitialOpen() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export default function StylePicker() {
  const { style, setStyleById } = useStyleStore()
  const [open, setOpen] = useState(readInitialOpen)

  const toggle = () => {
    setOpen((v) => {
      const next = !v
      try { localStorage.setItem(STORAGE_KEY, next ? '1' : '0') } catch { /* ignore */ }
      return next
    })
  }

  // Group presets by category, preserving registry order within each group.
  const groups = new Map()
  for (const cat of CATEGORY_ORDER) groups.set(cat, [])
  for (const p of STYLE_REGISTRY) {
    const cat = p.category || 'night'
    if (!groups.has(cat)) groups.set(cat, [])
    groups.get(cat).push(p)
  }

  return (
    <div className={`style-picker${open ? ' sp-open' : ''}`}>
      <button type="button" className="sp-header" onClick={toggle} aria-expanded={open}>
        <Swatch preset={style} />
        <div className="sp-header-text">
          <div className="sp-header-label">{style.label}</div>
          <div className="sp-header-hint">{open ? 'Hide styles' : 'Change style'}</div>
        </div>
        <span className={`sp-chevron${open ? ' sp-chevron-up' : ''}`} aria-hidden="true">▾</span>
      </button>

      {open && (
        <div className="sp-list">
          {[...groups.entries()].map(([cat, presets]) => {
            if (presets.length === 0) return null
            return (
              <div key={cat} className="sp-group">
                <div className="sp-group-header">{CATEGORY_LABEL[cat] ?? cat}</div>
                {presets.map((p) => (
                  <StyleCard
                    key={p.id}
                    preset={p}
                    active={style.id === p.id}
                    onClick={() => setStyleById(p.id)}
                  />
                ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

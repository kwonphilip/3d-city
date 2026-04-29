import { STYLE_REGISTRY } from '../styles/index'
import { useStyleStore } from '../context/StyleContext'
import './StylePicker.css'

const CATEGORY_ORDER = ['day', 'night', 'outline']
const CATEGORY_LABEL = { day: 'Day', night: 'Night', outline: 'Outline' }

const PERF_LABEL = { light: 'Light', standard: 'Standard', heavy: 'Heavy' }

function colorFromMaterial(m) {
  if (!m) return null
  if (m.color?.getHexString) return '#' + m.color.getHexString()
  return null
}

function Swatch({ preset }) {
  // 2×2 palette preview: background, building, land-or-park, glow-or-highlight.
  // For day-category presets, use park (the green) so the swatch reads as "daytime".
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

export default function StylePicker() {
  const { style, setStyleById } = useStyleStore()

  // Group presets by category, preserving registry order within each group.
  const groups = new Map()
  for (const cat of CATEGORY_ORDER) groups.set(cat, [])
  for (const p of STYLE_REGISTRY) {
    const cat = p.category || 'night'
    if (!groups.has(cat)) groups.set(cat, [])
    groups.get(cat).push(p)
  }

  return (
    <div className="style-picker">
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
  )
}

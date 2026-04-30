import { useQualityStore } from '../context/QualityContext'
import './QualityPanel.css'

const RADIUS_MAX = 12000

const BOROUGH_OPTIONS = [
  { key: 'Manhattan', label: 'Manhattan' },
  { key: 'Brooklyn', label: 'Brooklyn' },
  { key: 'Queens', label: 'Queens' },
  { key: 'Bronx', label: 'Bronx' },
  { key: 'Staten Island', label: 'Staten Island' },
]

export default function QualityPanel() {
  const { renderRadius, minBuildingHeight, boroughs, setQuality, setBorough } = useQualityStore()
  const atMax = renderRadius >= RADIUS_MAX
  return (
    <div className="quality-panel">
      <label
        className="q-row"
        data-tooltip="How far from the camera buildings stream in. Lower values render less of the city — easier on slower machines."
        data-tooltip-pos="left"
      >
        <span>Render radius</span>
        <span className="q-val">{atMax ? 'All Manhattan' : `${renderRadius}m`}</span>
        <input
          type="range"
          min={500}
          max={RADIUS_MAX}
          step={500}
          value={renderRadius}
          onChange={e => setQuality({ renderRadius: Number(e.target.value) })}
        />
      </label>
      <label
        className="q-row"
        data-tooltip="Hide buildings shorter than this. Higher values keep only skyscrapers — good for a cleaner skyline view at distance."
        data-tooltip-pos="left"
      >
        <span>Min height</span>
        <span className="q-val">{minBuildingHeight}m</span>
        <input
          type="range"
          min={0}
          max={50}
          step={1}
          value={minBuildingHeight}
          onChange={e => setQuality({ minBuildingHeight: Number(e.target.value) })}
        />
      </label>
      <div
        className="q-borough-group"
        data-tooltip="Toggle 3D building rendering per borough. Disabled boroughs still show terrain and roads."
        data-tooltip-pos="left"
      >
        <span className="q-borough-header">3D buildings in</span>
        {BOROUGH_OPTIONS.map(({ key, label }) => (
          <label key={key} className="q-check">
            <input
              type="checkbox"
              checked={!!boroughs[key]}
              onChange={e => setBorough(key, e.target.checked)}
            />
            <span>{label}</span>
          </label>
        ))}
      </div>
    </div>
  )
}

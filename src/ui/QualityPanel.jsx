import { useQualityStore } from '../context/QualityContext'
import './QualityPanel.css'

const RADIUS_MAX = 12000

export default function QualityPanel() {
  const { renderRadius, minBuildingHeight, manhattanOnly, setQuality } = useQualityStore()
  const atMax = renderRadius >= RADIUS_MAX
  return (
    <div className="quality-panel">
      <label className="q-row">
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
      <label className="q-row">
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
      <label className="q-row q-check">
        <input
          type="checkbox"
          checked={manhattanOnly}
          onChange={e => setQuality({ manhattanOnly: e.target.checked })}
        />
        <span>Manhattan only (3D)</span>
      </label>
    </div>
  )
}

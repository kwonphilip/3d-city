import { useQualityStore } from '../context/QualityContext'
import './QualityPanel.css'

export default function QualityPanel() {
  const { renderRadius, minBuildingHeight, setQuality } = useQualityStore()
  return (
    <div className="quality-panel">
      <label className="q-row">
        <span>Render radius</span>
        <span className="q-val">{renderRadius}m</span>
        <input
          type="range"
          min={500}
          max={5000}
          step={250}
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
    </div>
  )
}

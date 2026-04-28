import { STYLE_REGISTRY } from '../styles/index'
import { useStyleStore } from '../context/StyleContext'
import './StylePicker.css'

export default function StylePicker() {
  const { style, setStyleById } = useStyleStore()
  return (
    <div className="style-picker">
      {STYLE_REGISTRY.map(preset => (
        <button
          key={preset.id}
          className={`style-btn${style.id === preset.id ? ' active' : ''}`}
          onClick={() => setStyleById(preset.id)}
        >
          {preset.label}
        </button>
      ))}
    </div>
  )
}

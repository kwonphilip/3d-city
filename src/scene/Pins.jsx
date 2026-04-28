import { useMemo } from 'react'
import { Html } from '@react-three/drei'
import { lonLatToLocal } from '../lib/projection'
import { useSelectionStore } from '../context/SelectionContext'
import pinsData from '../../data/pins.json'

const PIN_HEIGHT = 80

function Pin({ pin }) {
  const fly = useSelectionStore(s => s.fly)
  const { x, z } = useMemo(() => lonLatToLocal(pin.lon, pin.lat), [pin.lon, pin.lat])

  return (
    <group position={[x, 0, z]}>
      {/* vertical stem */}
      <mesh position={[0, PIN_HEIGHT / 2, 0]}>
        <cylinderGeometry args={[1.5, 1.5, PIN_HEIGHT, 6]} />
        <meshBasicMaterial color="#ff7733" />
      </mesh>
      {/* dot on top */}
      <mesh position={[0, PIN_HEIGHT + 8, 0]}>
        <sphereGeometry args={[8, 8, 8]} />
        <meshBasicMaterial color="#ff7733" />
      </mesh>
      <Html
        position={[0, PIN_HEIGHT + 24, 0]}
        center
        distanceFactor={600}
        occlude={false}
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        <div
          style={{
            background: 'rgba(0,0,0,0.7)',
            color: '#fff',
            padding: '3px 8px',
            borderRadius: 4,
            fontSize: 11,
            whiteSpace: 'nowrap',
          }}
        >
          {pin.label}
        </div>
      </Html>
      {/* invisible click target */}
      <mesh
        position={[0, PIN_HEIGHT / 2, 0]}
        onClick={() => fly(pin.label, pin.lon, pin.lat)}
      >
        <cylinderGeometry args={[20, 20, PIN_HEIGHT, 6]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
    </group>
  )
}

export default function Pins() {
  return (
    <>
      {pinsData.map(pin => <Pin key={pin.id} pin={pin} />)}
    </>
  )
}

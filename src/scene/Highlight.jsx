import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useSelectionStore } from '../context/SelectionContext'

const ringMat = new THREE.MeshBasicMaterial({
  color: new THREE.Color('#ff7733'),
  transparent: true,
  opacity: 0.8,
  side: THREE.DoubleSide,
})

export default function Highlight() {
  const target = useSelectionStore(s => s.target)
  const meshRef = useRef(null)

  useFrame(({ clock }) => {
    if (!meshRef.current) return
    // Pulse opacity
    meshRef.current.material.opacity = 0.5 + 0.35 * Math.sin(clock.elapsedTime * 3)
  })

  if (!target) return null

  return (
    <mesh
      ref={meshRef}
      position={[target.x, 1, target.z]}
      rotation={[-Math.PI / 2, 0, 0]}
      material={ringMat}
    >
      <ringGeometry args={[30, 50, 32]} />
    </mesh>
  )
}

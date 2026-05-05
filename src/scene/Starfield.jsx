import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const STAR_COUNT = 5000
const SHELL_RADIUS = 30000

function makeStarPositions(count, radius) {
  const arr = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    // Uniform distribution on a sphere shell.
    const u = Math.random()
    const v = Math.random()
    const theta = 2 * Math.PI * u
    const phi = Math.acos(2 * v - 1)
    const r = radius * (0.85 + Math.random() * 0.15) // slight depth variation
    arr[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta)
    arr[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
    arr[i * 3 + 2] = r * Math.cos(phi)
  }
  return arr
}

export default function Starfield() {
  const groupRef = useRef(null)
  const positions = useMemo(() => makeStarPositions(STAR_COUNT, SHELL_RADIUS), [])
  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    return g
  }, [positions])
  const material = useMemo(
    () => new THREE.PointsMaterial({
      color: 0xffffff,
      size: 7,
      sizeAttenuation: true,
      transparent: true,
      opacity: 1.0,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    }),
    [],
  )

  useFrame((_, dt) => {
    if (groupRef.current) groupRef.current.rotation.y += dt * 0.005
  })

  return (
    <group ref={groupRef}>
      <points geometry={geom} material={material} frustumCulled={false} renderOrder={-2} />
    </group>
  )
}

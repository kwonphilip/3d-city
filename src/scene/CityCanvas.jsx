import { Canvas } from '@react-three/fiber'
import { MapControls } from '@react-three/drei'
import { useStyle } from '../context/StyleContext'
import Buildings from './Buildings'

function Scene() {
  const style = useStyle()
  const Lights = style.lights
  const Ground = style.ground
  return (
    <>
      <color attach="background" args={[style.background]} />
      {Lights && <Lights />}
      {Ground && <Ground />}
      <Buildings />
    </>
  )
}

export default function CityCanvas({ children }) {
  return (
    <Canvas
      camera={{ position: [0, 800, 900], fov: 45, near: 1, far: 25000 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      style={{ width: '100%', height: '100%' }}
    >
      <Scene />
      {children}
      <MapControls
        maxPolarAngle={Math.PI / 2.1}
        minDistance={80}
        maxDistance={6000}
        panSpeed={1.5}
        zoomSpeed={1.2}
      />
    </Canvas>
  )
}

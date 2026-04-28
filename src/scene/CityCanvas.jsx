import { Canvas } from '@react-three/fiber'
import { MapControls } from '@react-three/drei'
import { useStyle } from '../context/StyleContext'
import useCameraFlight from '../hooks/useCameraFlight'
import Buildings from './Buildings'
import Pins from './Pins'
import Highlight from './Highlight'

function CameraRig() {
  useCameraFlight()
  return null
}

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
      <Pins />
      <Highlight />
      <CameraRig />
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
        makeDefault
        maxPolarAngle={Math.PI / 2.1}
        minDistance={80}
        maxDistance={6000}
        panSpeed={1.5}
        zoomSpeed={1.2}
      />
    </Canvas>
  )
}

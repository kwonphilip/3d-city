import { Canvas } from '@react-three/fiber'
import { MapControls } from '@react-three/drei'
import { StyleProvider, useStyle } from '../context/StyleContext'
import { QualityProvider } from '../context/QualityContext'
import Buildings from './Buildings'

function Scene() {
  const { background } = useStyle()
  return (
    <>
      <color attach="background" args={[background]} />
      <ambientLight intensity={0.4} />
      <directionalLight position={[500, 800, 300]} intensity={1.2} castShadow={false} />
      <directionalLight position={[-300, 400, -200]} intensity={0.3} />
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[12000, 12000]} />
        <meshLambertMaterial color="#12121e" />
      </mesh>
      <Buildings />
    </>
  )
}

// Providers live inside Canvas so R3F's separate React root can consume them.
// When Phase 4 needs UI panels to share style/quality state, migrate to Zustand.
function InnerScene() {
  return (
    <StyleProvider>
      <QualityProvider>
        <Scene />
        <MapControls
          maxPolarAngle={Math.PI / 2.1}
          minDistance={80}
          maxDistance={6000}
          panSpeed={1.5}
          zoomSpeed={1.2}
        />
      </QualityProvider>
    </StyleProvider>
  )
}

export default function CityCanvas({ children }) {
  return (
    <Canvas
      camera={{ position: [0, 800, 900], fov: 45, near: 1, far: 25000 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      style={{ width: '100%', height: '100%' }}
    >
      <InnerScene />
      {children}
    </Canvas>
  )
}

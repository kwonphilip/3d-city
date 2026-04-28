import { Canvas } from '@react-three/fiber'
import { MapControls } from '@react-three/drei'

function TestScene() {
  return (
    <>
      <color attach="background" args={['#0a0a1a']} />
      <ambientLight intensity={0.4} />
      <directionalLight position={[500, 800, 300]} intensity={1.2} castShadow={false} />
      <directionalLight position={[-300, 400, -200]} intensity={0.3} />

      {/* Ground plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[8000, 8000]} />
        <meshLambertMaterial color="#1a1a2e" />
      </mesh>

      {/* Grid */}
      <gridHelper args={[8000, 80, '#223', '#161620']} position={[0, 0.5, 0]} />

      {/* Test cube — will be replaced by real buildings in Phase 3 */}
      <mesh position={[0, 50, 0]}>
        <boxGeometry args={[60, 100, 60]} />
        <meshLambertMaterial color="#4488ff" />
      </mesh>
      <mesh position={[120, 30, -80]}>
        <boxGeometry args={[50, 60, 50]} />
        <meshLambertMaterial color="#3366cc" />
      </mesh>
      <mesh position={[-100, 20, 60]}>
        <boxGeometry args={[40, 40, 40]} />
        <meshLambertMaterial color="#2255aa" />
      </mesh>
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
      <TestScene />
      {children}
      <MapControls
        maxPolarAngle={Math.PI / 2.1}
        minDistance={80}
        maxDistance={6000}
        panSpeed={1.5}
        zoomSpeed={1.2}
        target={[0, 0, 0]}
      />
    </Canvas>
  )
}

import * as THREE from 'three'
import { Canvas } from '@react-three/fiber'
import { MapControls } from '@react-three/drei'
import { useStyle } from '../context/StyleContext'
import useCameraFlight from '../hooks/useCameraFlight'
import useIsMobile from '../hooks/useIsMobile'
import Buildings from './Buildings'
import Highlight from './Highlight'
import Terrain from './Terrain'
import Roads from './Roads'
import Starfield from './Starfield'
import NoiseBackground from './NoiseBackground'
import CompassBridge from './CompassBridge'
import MinimapBridge from './MinimapBridge'

function CameraRig() {
  useCameraFlight()
  return null
}

function Scene() {
  const style = useStyle()
  const Lights = style.lights
  return (
    <>
      {!style.transparentBackground && <color attach="background" args={[style.background]} />}
      {style.noiseBackground && (
        <NoiseBackground
          color1={style.noiseBackground.color1}
          color2={style.noiseBackground.color2}
          cloudColor={style.cloudLayer?.color}
          cloudOpacity={style.cloudLayer?.opacity}
        />
      )}
      {Lights && <Lights />}
      {style.stars !== false && <Starfield />}
      <Terrain />
      <Roads />
      <Buildings />
      <Highlight />
      <CameraRig />
      <CompassBridge />
      <MinimapBridge />
    </>
  )
}

export default function CityCanvas({ children }) {
  const isMobile = useIsMobile()
  return (
    <Canvas
      camera={{ position: [0, 800, 900], fov: 45, near: 50, far: 60000 }}
      dpr={isMobile ? [1, 1.5] : [1, 2]}
      gl={{ antialias: true, powerPreference: 'high-performance', logarithmicDepthBuffer: true, alpha: true }}
      style={{ width: '100%', height: '100%' }}
    >
      <Scene />
      {children}
      <MapControls
        makeDefault
        maxPolarAngle={Math.PI / 2.1}
        minDistance={isMobile ? 150 : 80}
        maxDistance={isMobile ? 4000 : 6000}
        panSpeed={isMobile ? 0.8 : 1.5}
        zoomSpeed={isMobile ? 0.9 : 1.2}
        rotateSpeed={isMobile ? 0.7 : 1}
        enableDamping
        dampingFactor={0.1}
        touches={{ ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE }}
      />
    </Canvas>
  )
}

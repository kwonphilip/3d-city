import { useFrame, useThree } from '@react-three/fiber'
import { useQuality } from '../context/QualityContext'
import { minimapState } from '../ui/minimapState'

export default function MinimapBridge() {
  const { camera } = useThree()
  const { renderRadius } = useQuality()
  useFrame(({ controls }) => {
    minimapState.cam.x = camera.position.x
    minimapState.cam.z = camera.position.z
    if (controls?.target) {
      minimapState.tgt.x = controls.target.x
      minimapState.tgt.z = controls.target.z
    }
    // Same formula Buildings.jsx uses for the actual streaming radius.
    minimapState.radius = Math.max(renderRadius, camera.position.y * 1.5)
  })
  return null
}

import { useFrame, useThree } from '@react-three/fiber'
import { compassRef } from '../ui/compassState'

export default function CompassBridge() {
  const { camera } = useThree()
  useFrame(({ controls }) => {
    const tgt = controls?.target
    if (!tgt) return
    // Heading: angle of camera→target on the XZ plane, where 0 = north (-Z).
    const dx = tgt.x - camera.position.x
    const dz = tgt.z - camera.position.z
    compassRef.heading = Math.atan2(dx, -dz)
  })
  return null
}

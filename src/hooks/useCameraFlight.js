import { useRef, useEffect } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useSelectionStore } from '../context/SelectionContext'

const LERP_SPEED = 0.06
const TARGET_HEIGHT = 120  // camera height above target
const TARGET_DISTANCE = 400 // back-offset from target

const tmpTarget = new THREE.Vector3()
const tmpPos = new THREE.Vector3()

export default function useCameraFlight() {
  const { camera } = useThree()
  const flyingRef = useRef(false)
  const destTarget = useRef(new THREE.Vector3())
  const destPos = useRef(new THREE.Vector3())

  const target = useSelectionStore(s => s.target)

  useEffect(() => {
    if (!target) return
    destTarget.current.set(target.x, 0, target.z)
    destPos.current.set(target.x, TARGET_HEIGHT, target.z + TARGET_DISTANCE)
    flyingRef.current = true
  }, [target])

  useFrame(({ controls }) => {
    if (!flyingRef.current) return

    tmpTarget.copy(destTarget.current)
    tmpPos.copy(destPos.current)

    camera.position.lerp(tmpPos, LERP_SPEED)

    if (controls) {
      controls.target.lerp(tmpTarget, LERP_SPEED)
      controls.update()
    }

    const distSq = camera.position.distanceToSquared(tmpPos)
    if (distSq < 25) flyingRef.current = false
  })
}

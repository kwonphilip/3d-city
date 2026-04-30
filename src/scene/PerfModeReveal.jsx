import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { usePerfModeStore } from '../context/PerfModeContext'

// Listens for double-clicks on the canvas while perf mode is on, casts a ray
// into the scene, intersects the y=0 ground plane, and stores the world
// coords as the new popup center. No mesh is created — this avoids fighting
// with R3F's event tree (e.g., terrain or building click handlers).
export default function PerfModeReveal() {
  const { camera, gl, raycaster } = useThree()
  const performanceMode = usePerfModeStore((s) => s.performanceMode)
  const setPopupCenter = usePerfModeStore((s) => s.setPopupCenter)

  useEffect(() => {
    if (!performanceMode) return
    const dom = gl.domElement
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
    const mouse = new THREE.Vector2()
    const hit = new THREE.Vector3()
    const handler = (e) => {
      const rect = dom.getBoundingClientRect()
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(mouse, camera)
      if (raycaster.ray.intersectPlane(plane, hit)) {
        setPopupCenter({ x: hit.x, z: hit.z })
      }
    }
    dom.addEventListener('dblclick', handler)
    return () => dom.removeEventListener('dblclick', handler)
  }, [performanceMode, camera, gl, raycaster, setPopupCenter])

  return null
}

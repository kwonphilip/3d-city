import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useSelectionStore } from '../context/SelectionContext'
import { useBuildingRegistry } from '../context/BuildingRegistry'
import { useStyle } from '../context/StyleContext'

const ringMat = new THREE.MeshBasicMaterial({
  color: new THREE.Color('#ff7733'),
  transparent: true,
  opacity: 0.8,
  side: THREE.DoubleSide,
})

const rotationMatrix = new THREE.Matrix4().makeRotationX(-Math.PI / 2)

function buildExtrudeGeometry(footprint, height) {
  const shape = new THREE.Shape()
  shape.moveTo(footprint[0][0], -footprint[0][1])
  for (let i = 1; i < footprint.length; i++) shape.lineTo(footprint[i][0], -footprint[i][1])
  const g = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false })
  g.applyMatrix4(rotationMatrix)
  return g
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v }
function ramp(v, a, b) { return clamp01((v - a) / (b - a)) }

function BuildingHighlight({ building, style }) {
  const { camera } = useThree()
  const outlineRef = useRef(null)
  const beamRef = useRef(null)

  const buildingGeom = useMemo(() => buildExtrudeGeometry(building.footprint, building.height), [building])
  const edgesGeom = useMemo(() => new THREE.EdgesGeometry(buildingGeom, 25), [buildingGeom])
  const outlineMat = useMemo(
    () => new THREE.LineBasicMaterial({ color: style.highlightOutlineColor || '#ffffff', transparent: true, opacity: 0 }),
    [style.highlightOutlineColor],
  )
  const beamMat = useMemo(
    () => new THREE.MeshBasicMaterial({
      color: style.highlightBeamColor || '#ffffff',
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
    [style.highlightBeamColor],
  )

  useEffect(() => () => {
    buildingGeom.dispose()
    edgesGeom.dispose()
    outlineMat.dispose()
    beamMat.dispose()
  }, [buildingGeom, edgesGeom, outlineMat, beamMat])

  useFrame(({ clock }) => {
    const y = camera.position.y
    // Outline visible when zoomed in; fades out from 1000m to 2500m altitude.
    const outlineOp = 1 - ramp(y, 1000, 2500)
    // Beam visible when zoomed out; fades in from 800m to 2000m, then pulses.
    const beamBase = ramp(y, 800, 2000)
    const beamOp = beamBase * (0.55 + 0.35 * Math.sin(clock.elapsedTime * 2.5))

    if (outlineRef.current) {
      outlineRef.current.material.opacity = outlineOp
      outlineRef.current.visible = outlineOp > 0.01
    }
    if (beamRef.current) {
      beamRef.current.material.opacity = beamOp
      beamRef.current.visible = beamOp > 0.01
    }
  })

  return (
    <>
      {style.highlightOutlineColor && (
        <lineSegments ref={outlineRef} geometry={edgesGeom} material={outlineMat} renderOrder={3} />
      )}
      <mesh
        ref={beamRef}
        position={[building.center[0], building.height + 2000, building.center[1]]}
        material={beamMat}
        renderOrder={3}
      >
        <cylinderGeometry args={[6, 6, 4000, 16]} />
      </mesh>
    </>
  )
}

function RingFallback({ target }) {
  const meshRef = useRef(null)
  useFrame(({ clock }) => {
    if (!meshRef.current) return
    meshRef.current.material.opacity = 0.5 + 0.35 * Math.sin(clock.elapsedTime * 3)
  })
  return (
    <mesh
      ref={meshRef}
      position={[target.x, 1, target.z]}
      rotation={[-Math.PI / 2, 0, 0]}
      material={ringMat}
    >
      <ringGeometry args={[30, 50, 32]} />
    </mesh>
  )
}

export default function Highlight() {
  const target = useSelectionStore((s) => s.target)
  const tiles = useBuildingRegistry((s) => s.tiles)
  const findNearest = useBuildingRegistry((s) => s.findNearest)
  const style = useStyle()

  // Re-runs on target change OR when new tiles stream in (so a highlight that was
  // waiting for the right tile resolves once it arrives).
  const building = useMemo(() => {
    if (!target) return null
    return findNearest(target.x, target.z, 80)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, tiles, findNearest])

  if (!target) return null
  if (!building) return <RingFallback target={target} />
  return <BuildingHighlight building={building} style={style} />
}

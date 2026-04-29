import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { useStyle } from '../context/StyleContext'

const LAND_URL = '/data/manhattan/land.json'
const PARKS_URL = '/data/manhattan/parks.json'
const WATER_SIZE = 80000
const LAND_Y = 3
const PARK_Y = 3.5 // between land (3) and roads (4)

// Generic flat-polygon merge: takes [{outer, holes?}] entries and produces a
// single rotated-onto-XZ ShapeGeometry. Used for both landmasses and parks.
function buildFillGeometry(polygons) {
  const shapes = []
  for (const lm of polygons) {
    const outer = lm.outer
    if (!outer || outer.length < 3) continue
    const shape = new THREE.Shape()
    shape.moveTo(outer[0][0], -outer[0][1])
    for (let i = 1; i < outer.length; i++) shape.lineTo(outer[i][0], -outer[i][1])
    if (lm.holes) {
      for (const hole of lm.holes) {
        if (!hole || hole.length < 3) continue
        const h = new THREE.Path()
        h.moveTo(hole[0][0], -hole[0][1])
        for (let i = 1; i < hole.length; i++) h.lineTo(hole[i][0], -hole[i][1])
        shape.holes.push(h)
      }
    }
    shapes.push(shape)
  }
  if (shapes.length === 0) return null
  const geom = new THREE.ShapeGeometry(shapes)
  geom.rotateX(-Math.PI / 2)
  return geom
}

function buildOutlineGeometry(polygons) {
  const verts = []
  for (const lm of polygons) {
    const pts = lm.outer
    if (!pts || pts.length < 2) continue
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length
      verts.push(pts[i][0], 0, pts[i][1])
      verts.push(pts[j][0], 0, pts[j][1])
    }
    if (lm.holes) {
      for (const hole of lm.holes) {
        if (!hole || hole.length < 2) continue
        for (let i = 0; i < hole.length; i++) {
          const j = (i + 1) % hole.length
          verts.push(hole[i][0], 0, hole[i][1])
          verts.push(hole[j][0], 0, hole[j][1])
        }
      }
    }
  }
  if (verts.length === 0) return null
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
  return g
}

function isLineMaterial(m) {
  return m?.isLineBasicMaterial === true || m?.type === 'LineBasicMaterial'
}

export default function Terrain() {
  const style = useStyle()
  const [landmasses, setLandmasses] = useState(null)
  const [parks, setParks] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetch(LAND_URL)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setLandmasses(d.landmasses) })
      .catch((err) => console.error('[Terrain] land fetch failed:', err))
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    fetch(PARKS_URL)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setParks(d.parks) })
      .catch((err) => console.error('[Terrain] parks fetch failed:', err))
    return () => { cancelled = true }
  }, [])

  const landIsOutline = isLineMaterial(style.landMaterial)
  const parkIsOutline = isLineMaterial(style.parkMaterial)

  const landFillGeom = useMemo(
    () => (!landIsOutline && landmasses) ? buildFillGeometry(landmasses) : null,
    [landmasses, landIsOutline],
  )
  const landOutlineGeom = useMemo(
    () => (landIsOutline && landmasses) ? buildOutlineGeometry(landmasses) : null,
    [landmasses, landIsOutline],
  )
  const parkFillGeom = useMemo(
    () => (style.parkMaterial && !parkIsOutline && parks) ? buildFillGeometry(parks) : null,
    [parks, style.parkMaterial, parkIsOutline],
  )
  const parkOutlineGeom = useMemo(
    () => (style.parkMaterial && parkIsOutline && parks) ? buildOutlineGeometry(parks) : null,
    [parks, style.parkMaterial, parkIsOutline],
  )

  useEffect(() => () => landFillGeom?.dispose(), [landFillGeom])
  useEffect(() => () => landOutlineGeom?.dispose(), [landOutlineGeom])
  useEffect(() => () => parkFillGeom?.dispose(), [parkFillGeom])
  useEffect(() => () => parkOutlineGeom?.dispose(), [parkOutlineGeom])

  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} material={style.waterMaterial}>
        <planeGeometry args={[WATER_SIZE, WATER_SIZE]} />
      </mesh>
      {landFillGeom && (
        <mesh geometry={landFillGeom} material={style.landMaterial} position={[0, LAND_Y, 0]} />
      )}
      {landOutlineGeom && (
        <lineSegments geometry={landOutlineGeom} material={style.landMaterial} position={[0, LAND_Y, 0]} />
      )}
      {parkFillGeom && (
        <mesh geometry={parkFillGeom} material={style.parkMaterial} position={[0, PARK_Y, 0]} />
      )}
      {parkOutlineGeom && (
        <lineSegments geometry={parkOutlineGeom} material={style.parkMaterial} position={[0, PARK_Y, 0]} />
      )}
    </>
  )
}

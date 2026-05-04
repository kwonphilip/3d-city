import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { useStyle } from '../context/StyleContext'
import useNycMask from '../hooks/useNycMask'
import { loadLand } from '../lib/landData'
import { dataUrl } from '../lib/dataPaths'

const PARKS_URL = dataUrl('parks.json')
const LAND_Y = 3
const PARK_Y = 3.5 // between land (3) and roads (4)

function ringCentroid(ring) {
  let cx = 0, cz = 0
  for (const [x, z] of ring) { cx += x; cz += z }
  return [cx / ring.length, cz / ring.length]
}

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
  const mask = useNycMask()
  const [landmasses, setLandmasses] = useState(null)
  const [waterShape, setWaterShape] = useState(null)
  const [parks, setParks] = useState(null)

  useEffect(() => {
    let cancelled = false
    loadLand()
      .then((d) => {
        if (cancelled) return
        setLandmasses(d.landmasses)
        if (d.waterShape) setWaterShape(d.waterShape)
      })
      .catch((err) => console.error('[Terrain] land fetch failed:', err))
    return () => { cancelled = true }
  }, [])

  // Defer parks (~5 MB) until after land has loaded so it doesn't compete
  // for bandwidth with the small critical files (manifest, land, tiles)
  // during cold start. The parks layer renders on top of land anyway, so
  // appearing a beat later isn't visually disruptive.
  useEffect(() => {
    if (!landmasses) return
    let cancelled = false
    const handle = setTimeout(() => {
      fetch(PARKS_URL)
        .then((r) => r.json())
        .then((d) => { if (!cancelled) setParks(d.parks) })
        .catch((err) => console.error('[Terrain] parks fetch failed:', err))
    }, 0)
    return () => { cancelled = true; clearTimeout(handle) }
  }, [landmasses])

  const landIsOutline = isLineMaterial(style.landMaterial)
  const parkIsOutline = isLineMaterial(style.parkMaterial)

  // Drop parks whose centroid isn't on NYC land — kills NJ + Nassau Co. parks
  // that the Overpass bbox sweep pulled in.
  const visibleParks = useMemo(() => {
    if (!parks) return null
    if (!mask) return null // wait for mask to avoid flashing far-bbox parks
    return parks.filter((p) => {
      if (!p.outer || p.outer.length < 3) return false
      const [cx, cz] = ringCentroid(p.outer)
      return mask.contains(cx, cz)
    })
  }, [parks, mask])

  const landFillGeom = useMemo(
    () => (!landIsOutline && landmasses) ? buildFillGeometry(landmasses) : null,
    [landmasses, landIsOutline],
  )
  const landOutlineGeom = useMemo(
    () => (landIsOutline && landmasses) ? buildOutlineGeometry(landmasses) : null,
    [landmasses, landIsOutline],
  )
  const parkFillGeom = useMemo(
    () => (style.parkMaterial && !parkIsOutline && visibleParks) ? buildFillGeometry(visibleParks) : null,
    [visibleParks, style.parkMaterial, parkIsOutline],
  )
  const parkOutlineGeom = useMemo(
    () => (style.parkMaterial && parkIsOutline && visibleParks) ? buildOutlineGeometry(visibleParks) : null,
    [visibleParks, style.parkMaterial, parkIsOutline],
  )

  // Water shape is pre-computed offline by scripts/build-land.mjs (real polygon
  // offset via Clipper, then merged into one or more closed polygons). Runtime
  // just builds geometry from the rings.
  const waterGeom = useMemo(
    () => waterShape ? buildFillGeometry(waterShape) : null,
    [waterShape],
  )

  useEffect(() => () => landFillGeom?.dispose(), [landFillGeom])
  useEffect(() => () => landOutlineGeom?.dispose(), [landOutlineGeom])
  useEffect(() => () => parkFillGeom?.dispose(), [parkFillGeom])
  useEffect(() => () => parkOutlineGeom?.dispose(), [parkOutlineGeom])
  useEffect(() => () => waterGeom?.dispose(), [waterGeom])

  return (
    <>
      {waterGeom && (
        <mesh geometry={waterGeom} material={style.waterMaterial} position={[0, 0, 0]} />
      )}
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

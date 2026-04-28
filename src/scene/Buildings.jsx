import { useEffect, useRef, useState, useMemo } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useStyle } from '../context/StyleContext'
import { useQuality } from '../context/QualityContext'

const MANIFEST_URL = '/data/manhattan/manifest.json'
const CHECK_EVERY = 45 // frames between visibility scans

function TileMesh({ posArr, nrmArr, idxArr, material }) {
  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(posArr, 3))
    g.setAttribute('normal', new THREE.BufferAttribute(nrmArr, 3))
    g.setIndex(new THREE.BufferAttribute(idxArr, 1))
    return g
  }, [posArr, nrmArr, idxArr])

  useEffect(() => () => geom.dispose(), [geom])
  return <mesh geometry={geom} material={material} />
}

export default function Buildings() {
  const { camera } = useThree()
  const { buildingMaterial } = useStyle()
  const { renderRadius, minBuildingHeight } = useQuality()

  const qualityRef = useRef({ renderRadius, minBuildingHeight })
  useEffect(() => { qualityRef.current = { renderRadius, minBuildingHeight } }, [renderRadius, minBuildingHeight])

  // State drives rendering; refs drive useFrame logic without stale closures
  const [renderedTiles, setRenderedTiles] = useState(new Map())
  const loadedIdsRef = useRef(new Set())  // mirrors renderedTiles keys
  const inFlightRef = useRef(new Set())
  const workerRef = useRef(null)
  const manifestRef = useRef(null)
  const frameRef = useRef(0)

  useEffect(() => {
    const w = new Worker(
      new URL('../workers/geometryWorker.js', import.meta.url),
      { type: 'module' },
    )
    w.onmessage = ({ data }) => {
      if (data.type !== 'TILE_READY') return
      const { tileId, positions, normals, indices, empty } = data
      inFlightRef.current.delete(tileId)
      if (empty) return
      const entry = {
        posArr: new Float32Array(positions),
        nrmArr: new Float32Array(normals),
        idxArr: new Uint32Array(indices),
      }
      loadedIdsRef.current.add(tileId)
      setRenderedTiles(prev => new Map(prev).set(tileId, entry))
    }
    workerRef.current = w
    return () => w.terminate()
  }, [])

  useEffect(() => {
    fetch(MANIFEST_URL).then(r => r.json()).then(m => { manifestRef.current = m })
  }, [])

  useFrame(() => {
    if (++frameRef.current % CHECK_EVERY !== 0) return
    const manifest = manifestRef.current
    if (!manifest || !workerRef.current) return

    const { x, z } = camera.position
    const { renderRadius: radius, minBuildingHeight: minH } = qualityRef.current
    const inRange = new Set()

    for (const tile of manifest.tiles) {
      const b = tile.bounds
      const cx = (b.minX + b.maxX) / 2
      const cz = (b.minZ + b.maxZ) / 2
      if (Math.hypot(x - cx, z - cz) < radius) inRange.add(tile.id)
    }

    // Queue newly visible tiles
    for (const tile of manifest.tiles) {
      if (!inRange.has(tile.id)) continue
      if (loadedIdsRef.current.has(tile.id) || inFlightRef.current.has(tile.id)) continue
      inFlightRef.current.add(tile.id)
      fetch(`/data/manhattan/${tile.file}`)
        .then(r => r.json())
        .then(({ buildings }) => {
          if (!workerRef.current) return
          workerRef.current.postMessage({
            type: 'BUILD_TILE',
            tileId: tile.id,
            buildings,
            minHeight: minH,
          })
        })
        .catch(() => inFlightRef.current.delete(tile.id))
    }

    // Dispose tiles that scrolled out of range
    const toRemove = []
    for (const id of loadedIdsRef.current) {
      if (!inRange.has(id)) toRemove.push(id)
    }
    if (toRemove.length > 0) {
      for (const id of toRemove) loadedIdsRef.current.delete(id)
      setRenderedTiles(prev => {
        const next = new Map(prev)
        for (const id of toRemove) next.delete(id)
        return next
      })
    }
  })

  return (
    <>
      {[...renderedTiles.entries()].map(([id, { posArr, nrmArr, idxArr }]) => (
        <TileMesh key={id} posArr={posArr} nrmArr={nrmArr} idxArr={idxArr} material={buildingMaterial} />
      ))}
    </>
  )
}

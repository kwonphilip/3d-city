/**
 * Web Worker: extrudes building footprints into merged BufferGeometry buffers.
 * Runs off the main thread so geometry construction doesn't block rendering.
 *
 * Input:  { type: 'BUILD_TILE', tileId, buildings, minHeight }
 * Output: { type: 'TILE_READY', tileId, positions, normals, indices, buildingMeta }
 *         (positions/normals/indices are Transferable ArrayBuffers)
 */

import * as THREE from 'three'

const rotationMatrix = new THREE.Matrix4().makeRotationX(-Math.PI / 2)

function buildBuilding(building) {
  const { footprint, height } = building
  if (!footprint || footprint.length < 3) return null

  // Shape in XY plane: x = east, y = -z_local (= northward)
  // After rotation -π/2 around X: shape XY → Three.js XZ ground plane, extrusion → Y (up)
  const shape = new THREE.Shape()
  shape.moveTo(footprint[0][0], -footprint[0][1])
  for (let i = 1; i < footprint.length; i++) {
    shape.lineTo(footprint[i][0], -footprint[i][1])
  }

  const geom = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false })
  geom.applyMatrix4(rotationMatrix)
  return geom
}

self.onmessage = ({ data }) => {
  if (data.type !== 'BUILD_TILE') return

  const { tileId, cacheKey, buildings, minHeight = 0 } = data
  const positions = []
  const normals = []
  const indices = []
  const buildingMeta = []
  let baseVertex = 0

  for (const building of buildings) {
    if (building.height < minHeight) continue
    try {
      const geom = buildBuilding(building)
      if (!geom) continue

      const pos = geom.attributes.position.array
      const nrm = geom.attributes.normal.array
      const idx = geom.index ? geom.index.array : null
      const vertCount = pos.length / 3

      for (let i = 0; i < pos.length; i++) positions.push(pos[i])
      for (let i = 0; i < nrm.length; i++) normals.push(nrm[i])

      if (idx) {
        for (let i = 0; i < idx.length; i++) indices.push(idx[i] + baseVertex)
      } else {
        // ExtrudeGeometry is non-indexed: positions already in triangle order.
        for (let i = 0; i < vertCount; i++) indices.push(i + baseVertex)
      }
      baseVertex += vertCount

      buildingMeta.push({
        id: building.id,
        center: building.center,
        height: building.height,
        footprint: building.footprint,
      })
      geom.dispose()
    } catch {
      // skip degenerate polygons silently
    }
  }

  if (buildingMeta.length === 0) {
    self.postMessage({ type: 'TILE_READY', tileId, cacheKey, empty: true, buildingMeta: [] })
    return
  }

  const posArr = new Float32Array(positions)
  const nrmArr = new Float32Array(normals)
  const idxArr = new Uint32Array(indices)

  self.postMessage(
    { type: 'TILE_READY', tileId, cacheKey, positions: posArr.buffer, normals: nrmArr.buffer, indices: idxArr.buffer, buildingMeta },
    [posArr.buffer, nrmArr.buffer, idxArr.buffer],
  )
}

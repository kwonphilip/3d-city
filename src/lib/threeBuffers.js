import * as THREE from 'three'

// Wraps worker-transferred ArrayBuffers into a Three.js BufferGeometry.
export function makeBufferGeometry({ positions, normals, indices }) {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3))
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), 3))
  g.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1))
  return g
}

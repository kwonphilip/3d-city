import * as THREE from 'three'

// Flat / unlit daytime palette — every material is MeshBasicMaterial so the scene
// reads like a 2D atlas viewed in 3D: no shadows, no shading variation.
export default {
  id: 'monoDay',
  label: 'Mono Day',
  description: 'Daylight map, flat / unlit',
  perfTier: 'light',
  category: 'day',
  background: '#dde6ec',
  buildingMaterial: new THREE.MeshBasicMaterial({ color: new THREE.Color('#e3dec8') }),
  highlightMaterial: new THREE.MeshBasicMaterial({ color: new THREE.Color('#4285f4') }),
  highlightOutlineColor: '#1f5fc4',
  highlightBeamColor: '#4285f4',
  waterMaterial: new THREE.MeshBasicMaterial({ color: new THREE.Color('#a8d3eb') }),
  landMaterial: new THREE.MeshBasicMaterial({ color: new THREE.Color('#efe9da') }),
  parkMaterial: new THREE.MeshBasicMaterial({ color: new THREE.Color('#bfdcae') }),
  roadMaterial: new THREE.MeshBasicMaterial({ color: new THREE.Color('#bcb8b0') }),
  bridgeMaterial: new THREE.MeshBasicMaterial({ color: new THREE.Color('#aaa6a0') }),
  bridgePillarMaterial: new THREE.MeshBasicMaterial({ color: new THREE.Color('#8d8a83') }),
  glowColor: null,
  stars: false,
  lights: () => null,
  postFx: null,
}

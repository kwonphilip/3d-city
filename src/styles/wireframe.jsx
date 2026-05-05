import * as THREE from 'three'

export default {
  id: 'wireframe',
  label: 'Wireframe',
  description: 'Pure neon outlines on black',
  perfTier: 'light',
  category: 'outline',
  background: '#000008',
  buildingMaterial: new THREE.MeshBasicMaterial({ color: new THREE.Color('#00ff88'), wireframe: true }),
  highlightMaterial: new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff4488'), wireframe: true }),
  highlightOutlineColor: null, // outline would clash with already-wireframed buildings
  highlightBeamColor: '#ff4488',
  waterMaterial: new THREE.MeshBasicMaterial({ color: new THREE.Color('#000004') }),
  // Outline-only land for wireframe — coastline as lines, no fill.
  landMaterial: new THREE.LineBasicMaterial({ color: new THREE.Color('#00ff88') }),
  roadMaterial: new THREE.MeshBasicMaterial({ color: new THREE.Color('#005544') }),
  bridgeMaterial: new THREE.MeshBasicMaterial({ color: new THREE.Color('#0088ff') }),
  bridgePillarMaterial: new THREE.MeshBasicMaterial({ color: new THREE.Color('#0088ff'), wireframe: true }),
  // Outline-only parks for wireframe — green coastline-style line.
  parkMaterial: new THREE.LineBasicMaterial({ color: new THREE.Color('#33ff88') }),
  clipToLand: true,
  transparentBackground: true,
  glowColor: '#00ff88',
  stars: false, // would clash with the wireframed scene
  lights: () => null,
  postFx: null,
}

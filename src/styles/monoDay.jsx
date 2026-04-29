import * as THREE from 'three'

// Daytime atlas palette: water, land, parks, and roads are all unlit MeshBasicMaterial
// so they read as a flat 2D map. Buildings are MeshLambertMaterial (with sun + ambient
// lights) so each face shades distinctly — without that, identical-color faces blend
// into a single silhouette and look bad in 3D.
export default {
  id: 'monoDay',
  label: 'Mono Day',
  description: 'Daylight map, flat ground + shaded buildings',
  perfTier: 'light',
  category: 'day',
  background: '#dde6ec',
  buildingMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#c8c4be') }),
  highlightMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#4285f4') }),
  highlightOutlineColor: '#1f5fc4',
  highlightBeamColor: '#4285f4',
  waterMaterial: new THREE.MeshBasicMaterial({ color: new THREE.Color('#a8d3eb') }),
  landMaterial: new THREE.MeshBasicMaterial({ color: new THREE.Color('#efe9da') }),
  parkMaterial: new THREE.MeshBasicMaterial({ color: new THREE.Color('#bfdcae') }),
  roadMaterial: new THREE.MeshBasicMaterial({ color: new THREE.Color('#bcb8b0') }),
  bridgeMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#aaa6a0') }),
  bridgePillarMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#8d8a83') }),
  glowColor: null,
  stars: false,
  lights: () => (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight position={[600, 1000, 400]} intensity={1.0} color="#fff5e0" />
      <directionalLight position={[-300, 600, -200]} intensity={0.25} color="#cfd9e8" />
    </>
  ),
  postFx: null,
}

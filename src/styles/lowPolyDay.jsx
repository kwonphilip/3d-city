import * as THREE from 'three'

export default {
  id: 'lowPolyDay',
  label: 'Low-Poly Day',
  description: 'Daylight map, soft shading',
  perfTier: 'standard',
  category: 'day',
  background: '#dde6ec',
  buildingMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#e3dec8') }),
  highlightMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#4285f4') }),
  highlightOutlineColor: '#1f5fc4',
  highlightBeamColor: '#4285f4',
  waterMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#a8d3eb') }),
  landMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#efe9da') }),
  parkMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#bfdcae') }),
  roadMaterial: new THREE.MeshBasicMaterial({ color: new THREE.Color('#bcb8b0') }),
  bridgeMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#aaa6a0') }),
  bridgePillarMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#8d8a83') }),
  glowColor: null, // daytime; the city doesn't need to glow
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

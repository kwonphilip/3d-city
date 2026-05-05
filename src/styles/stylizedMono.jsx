import * as THREE from 'three'

export default {
  id: 'stylizedMono',
  label: 'Paper Map',
  description: 'Cream paper-map, warm tones',
  perfTier: 'light',
  category: 'day',
  background: '#f0ede8',
  buildingMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#c8c4be') }),
  highlightMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#d44000') }),
  highlightOutlineColor: '#a83000',
  highlightBeamColor: '#d44000',
  waterMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#cdd6dd') }),
  landMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#e2dfd9') }),
  roadMaterial: new THREE.MeshBasicMaterial({ color: new THREE.Color('#aeada6') }),
  bridgeMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#9c9a92') }),
  bridgePillarMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#86847c') }),
  parkMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#cfd8c4') }),
  clipToLand: true,
  transparentBackground: true,
  skyGradient: 'linear-gradient(to bottom, #6a8fa8 0%, #b8cdd8 50%, #dde8ee 100%)',
  glowColor: null, // light theme, no glow
  stars: false,
  lights: () => (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight position={[400, 900, 200]} intensity={0.9} castShadow={false} />
    </>
  ),
  postFx: null,
}

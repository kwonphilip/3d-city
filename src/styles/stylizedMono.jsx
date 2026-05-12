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
  waterMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#cdd6dd'), transparent: true, opacity: 0.3 }),
  landMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#e2dfd9'), transparent: true, opacity: 0.3 }),
  roadMaterial: new THREE.MeshBasicMaterial({ color: new THREE.Color('#aeada6'), transparent: true, opacity: 0.8 }),
  bridgeMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#9c9a92'), transparent: true, opacity: 1.0 }),
  bridgePillarMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#86847c'), transparent: true, opacity: 1.0 }),
  parkMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#cfd8c4'), transparent: true, opacity: 1.0 }),
  clipToLand: true,
  transparentBackground: true,
  noiseBackground: { color1: '#c8d8e8', color2: '#edecea' },
  cloudLayer: { color: '#faf8f5', opacity: 0.6 },
  skyClass: 'sky-day-cycle',
  glowColor: null, // light theme, no glow
  stars: false,
  lights: () => (
    <>
      <hemisphereLight args={['#cce0f5', '#9a8870', 0.7]} />
      <directionalLight position={[400, 900, 200]} intensity={0.9} castShadow={false} />
    </>
  ),
  postFx: null,
}

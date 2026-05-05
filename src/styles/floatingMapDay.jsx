import * as THREE from 'three'

export default {
  id: 'lightOutline',
  label: 'Light Outline',
  description: 'Warm neutral void; architectural scale-model aesthetic',
  perfTier: 'light',
  category: 'outline',
  background: '#eeebe6',
  buildingMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#faf8f4') }),
  highlightMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#4060c0') }),
  highlightOutlineColor: '#7090e0',
  highlightBeamColor: '#4060c0',
  waterMaterial: new THREE.MeshBasicMaterial({ visible: false }),
  landMaterial: new THREE.LineBasicMaterial({ color: new THREE.Color('#8a8078') }),
  parkMaterial: new THREE.LineBasicMaterial({ color: new THREE.Color('#6a7858') }),
  roadMaterial: new THREE.MeshBasicMaterial({ color: new THREE.Color('#a09888') }),
  bridgeMaterial: new THREE.MeshBasicMaterial({ color: new THREE.Color('#b8ada0') }),
  bridgePillarMaterial: new THREE.MeshBasicMaterial({ color: new THREE.Color('#787068') }),
  glowColor: '#4060c0',
  stars: false,
  lights: () => (
    <>
      <ambientLight intensity={0.9} color="#f8f4ee" />
      <directionalLight position={[500, 800, 300]} intensity={0.9} color="#ffffff" />
      <directionalLight position={[-300, 400, -200]} intensity={0.1} color="#e8e4dc" />
    </>
  ),
  postFx: null,
}

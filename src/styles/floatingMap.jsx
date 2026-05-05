import * as THREE from 'three'

export default {
  id: 'darkOutline',
  label: 'Dark Outline',
  description: 'Borough outlines + glowing roads; buildings float in the void',
  perfTier: 'light',
  category: 'outline',
  background: '#0a1428',
  buildingMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#e8eef8') }),
  highlightMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#4aa8ff') }),
  highlightOutlineColor: '#9bd4ff',
  highlightBeamColor: '#4aa8ff',
  waterMaterial: new THREE.MeshBasicMaterial({ visible: false }),
  landMaterial: new THREE.LineBasicMaterial({ color: new THREE.Color('#6a7a9a') }),
  parkMaterial: new THREE.LineBasicMaterial({ color: new THREE.Color('#4a7a5a') }),
  roadMaterial: new THREE.MeshBasicMaterial({ color: new THREE.Color('#9bd4ff') }),
  bridgeMaterial: new THREE.MeshBasicMaterial({ color: new THREE.Color('#b8e0ff') }),
  bridgePillarMaterial: new THREE.MeshBasicMaterial({ color: new THREE.Color('#4a5a7a') }),
  glowColor: '#4aa8ff',
  stars: false,
  lights: () => (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight position={[500, 800, 300]} intensity={0.8} color="#ffffff" />
      <directionalLight position={[-400, 600, -200]} intensity={0.3} color="#9bd4ff" />
    </>
  ),
  postFx: null,
}

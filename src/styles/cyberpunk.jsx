import * as THREE from 'three'

export default {
  id: 'cyberpunk',
  label: 'Cyberpunk',
  description: 'Hot pink + cyan, max contrast',
  perfTier: 'standard',
  category: 'night',
  background: '#050010',
  buildingMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#ff2d8a') }),
  highlightMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#fff066') }),
  highlightOutlineColor: '#ffff99',
  highlightBeamColor: '#fff066',
  waterMaterial: new THREE.MeshBasicMaterial({ color: new THREE.Color('#000000') }),
  landMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#1a0a2a') }),
  roadMaterial: new THREE.MeshBasicMaterial({ color: new THREE.Color('#3a1a4a') }),
  bridgeMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#00fff0') }),
  bridgePillarMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#00b8b0') }),
  parkMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#1a2818') }),
  clipToLand: true,
  transparentBackground: true,
  glowColor: '#00fff0',
  stars: true,
  lights: () => (
    <>
      <ambientLight intensity={0.25} color="#ff66cc" />
      <directionalLight position={[600, 700, 200]} intensity={1.0} color="#ff2da0" />
      <directionalLight position={[-500, 400, -300]} intensity={0.6} color="#00fff0" />
    </>
  ),
  postFx: null,
}

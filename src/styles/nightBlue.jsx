import * as THREE from 'three'
import { makeHeightTintMaterial } from '../lib/heightMaterial'

export default {
  id: 'nightBlue',
  label: 'Night Blue',
  description: 'Steel night, warm gold accents',
  perfTier: 'standard',
  category: 'night',
  background: '#080d1f',
  buildingMaterial: makeHeightTintMaterial({ baseColor: '#6a8fc8', topColor: '#9ab8e8', blend: 0.45 }),
  highlightMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#ffaa44') }),
  highlightOutlineColor: '#ffd28a',
  highlightBeamColor: '#ffaa44',
  waterMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#000208') }),
  landMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#3a4566') }),
  roadMaterial: new THREE.MeshBasicMaterial({ color: new THREE.Color('#7390ba') }),
  bridgeMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#a4bce4') }),
  bridgePillarMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#6a82a8') }),
  parkMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#1f3a32') }),
  clipToLand: true,
  transparentBackground: true,
  glowColor: '#4a8aff',
  stars: true,
  lights: () => (
    <>
      <ambientLight intensity={0.35} />
      <directionalLight position={[400, 700, 200]} intensity={0.9} />
      <directionalLight position={[-400, 500, -300]} intensity={0.35} color="#88aaff" />
    </>
  ),
  postFx: null,
}

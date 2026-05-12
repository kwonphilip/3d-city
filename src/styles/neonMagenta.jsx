import * as THREE from 'three'
import { makeHeightTintMaterial } from '../lib/heightMaterial'

export default {
  id: 'neonMagenta',
  label: 'Neon Magenta',
  description: 'Violet city, electric cyan accents',
  perfTier: 'standard',
  category: 'night',
  background: '#100330',
  buildingMaterial: makeHeightTintMaterial({ baseColor: '#7a3a9a', topColor: '#a060c8', blend: 0.5 }),
  highlightMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#00e5ff') }),
  highlightOutlineColor: '#00ffff',
  highlightBeamColor: '#00e5ff',
  waterMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#02000c') }),
  landMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#3a1a52') }),
  roadMaterial: new THREE.MeshBasicMaterial({ color: new THREE.Color('#5a2a78') }),
  bridgeMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#a04dca') }),
  bridgePillarMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#5d2880') }),
  parkMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#2a1d3a') }),
  clipToLand: true,
  transparentBackground: true,
  glowColor: '#ff2db8',
  stars: true,
  lights: () => (
    <>
      <ambientLight intensity={0.3} color="#a060ff" />
      <directionalLight position={[500, 600, 100]} intensity={0.8} color="#ff5cc8" />
      <directionalLight position={[-300, 400, -400]} intensity={0.5} color="#3df0ff" />
    </>
  ),
  postFx: null,
}

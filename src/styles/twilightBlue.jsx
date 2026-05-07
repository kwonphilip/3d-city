import * as THREE from 'three'

export default {
  id: 'twilightBlue',
  label: 'Twilight Blue',
  description: 'Night Blue under a twilight steel sky',
  perfTier: 'standard',
  category: 'night',
  background: '#12100e',
  buildingMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#6a8fc8') }),
  highlightMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#ffaa44') }),
  highlightOutlineColor: '#ffd28a',
  highlightBeamColor: '#ffaa44',
  waterMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#000208') }),
  landMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#3a4566') }),
  roadMaterial: new THREE.MeshBasicMaterial({
    color: new THREE.Color('#7390ba'),
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -4,
  }),
  bridgeMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#a4bce4') }),
  bridgePillarMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#6a82a8') }),
  parkMaterial: new THREE.MeshLambertMaterial({
    color: new THREE.Color('#1f3a32'),
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2,
  }),
  clipToLand: true,
  transparentBackground: true,
  skyGradient: '#2e3d52',
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

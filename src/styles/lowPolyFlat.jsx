import * as THREE from 'three'

export default {
  id: 'lowPolyFlat',
  label: 'Low-Poly Night',
  description: 'Cool blue night, soft shading',
  perfTier: 'standard',
  category: 'night',
  background: '#0a0a1a',
  buildingMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#3d6fa8') }),
  highlightMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#ff7733') }),
  highlightOutlineColor: '#ff9955',
  highlightBeamColor: '#ff7733',
  waterMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#020912') }),
  landMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#2a3142') }),
  roadMaterial: new THREE.MeshBasicMaterial({ color: new THREE.Color('#5d6478') }),
  bridgeMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#8590a8') }),
  bridgePillarMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#5a6378') }),
  parkMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#1c2d28') }),
  clipToLand: true,
  transparentBackground: true,
  glowColor: '#5a8eff',
  stars: true,
  lights: () => (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[500, 800, 300]} intensity={1.2} castShadow={false} />
      <directionalLight position={[-300, 400, -200]} intensity={0.3} />
    </>
  ),
  postFx: null,
}

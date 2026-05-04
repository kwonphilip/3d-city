import * as THREE from 'three'

// Building base sits at y=0, land at y=3 — so a translucent land plane reads as
// a "floating map" that buildings poke through. Water + roads + bridges are
// hidden so the only ground-plane geometry left is the borough silhouettes.
// `transparent: true` with `depthWrite: false` keeps buildings from being
// culled by the land plane while still alpha-blending against the black
// background.
export default {
  id: 'floatingMap',
  label: 'Floating Map',
  description: 'Borough silhouettes in the void; buildings pop through',
  perfTier: 'light',
  category: 'outline',
  background: '#000000',
  buildingMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#e8eef8') }),
  highlightMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#4aa8ff') }),
  highlightOutlineColor: '#9bd4ff',
  highlightBeamColor: '#4aa8ff',
  waterMaterial: new THREE.MeshBasicMaterial({ visible: false }),
  landMaterial: new THREE.MeshBasicMaterial({
    color: new THREE.Color('#3a4566'),
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
  }),
  parkMaterial: new THREE.MeshBasicMaterial({
    color: new THREE.Color('#3a5a40'),
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
  }),
  roadMaterial: new THREE.MeshBasicMaterial({ visible: false }),
  bridgeMaterial: new THREE.MeshBasicMaterial({ visible: false }),
  bridgePillarMaterial: new THREE.MeshBasicMaterial({ visible: false }),
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

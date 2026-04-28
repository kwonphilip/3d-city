import * as THREE from 'three'

export default {
  id: 'lowPolyFlat',
  label: 'Low-poly flat',
  background: '#0a0a1a',
  buildingMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#3d6fa8') }),
  highlightMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#ff7733') }),
  lights: () => (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[500, 800, 300]} intensity={1.2} castShadow={false} />
      <directionalLight position={[-300, 400, -200]} intensity={0.3} />
    </>
  ),
  ground: () => (
    <mesh rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[12000, 12000]} />
      <meshLambertMaterial color="#12121e" />
    </mesh>
  ),
  postFx: null,
}

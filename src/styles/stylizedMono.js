import * as THREE from 'three'

export default {
  id: 'stylizedMono',
  label: 'Stylized mono',
  background: '#f0ede8',
  buildingMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#c8c4be') }),
  highlightMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#d44000') }),
  lights: () => (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight position={[400, 900, 200]} intensity={0.9} castShadow={false} />
    </>
  ),
  ground: () => (
    <mesh rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[12000, 12000]} />
      <meshLambertMaterial color="#ddd9d3" />
    </mesh>
  ),
  postFx: null,
}

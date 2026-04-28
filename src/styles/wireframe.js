import * as THREE from 'three'

export default {
  id: 'wireframe',
  label: 'Wireframe',
  background: '#000008',
  buildingMaterial: new THREE.MeshBasicMaterial({ color: new THREE.Color('#00ff88'), wireframe: true }),
  highlightMaterial: new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff4488'), wireframe: true }),
  lights: () => null,
  ground: () => (
    <mesh rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[12000, 12000]} />
      <meshBasicMaterial color="#050510" />
    </mesh>
  ),
  postFx: null,
}

// Shared directional-light rig for day presets (monoDay, lowPolyDay).
// Two directionl lights approximate sun + sky bounce: warm key from the
// south-east and a cool fill from the north-west to keep shadowed faces
// readable without full shadow-map overhead.
export const DayLights = () => (
  <>
    <hemisphereLight args={['#b0d8f5', '#8a7a5e', 0.55]} />
    <directionalLight position={[600, 1000, 400]} intensity={1.0} color="#fff5e0" />
    <directionalLight position={[-300, 600, -200]} intensity={0.25} color="#cfd9e8" />
  </>
)

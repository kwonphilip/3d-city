// Shared mutable refs between the in-Canvas bridge (writer, every frame) and
// the HTML minimap overlay (reader, throttled rAF). Same pattern as compassState.
export const minimapState = {
  cam: { x: 0, z: 0 },
  tgt: { x: 0, z: 0 },
  // Effective render radius from Buildings.jsx: max(baseRadius, y * 1.5).
  // Used to draw a "visible area" hint circle on the minimap.
  radius: 0,
}

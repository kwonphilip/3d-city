// Shared mutable ref between the in-Canvas bridge (writer, every frame) and the
// HTML overlay (reader, via its own rAF). Avoids re-rendering the React tree
// every frame just to rotate one element.
export const compassRef = { heading: 0 }

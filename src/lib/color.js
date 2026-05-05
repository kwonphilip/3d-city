// Reads a Three.js material's color as a CSS string (e.g. "rgb(168, 211, 235)").
export function colorString(material, fallback) {
  const c = material?.color
  if (c && typeof c.getStyle === 'function') return c.getStyle()
  return fallback
}

// Reads a Three.js material's color as a hex string (e.g. "#a8d3eb").
export function colorFromMaterial(m) {
  if (!m) return null
  if (m.color?.getHexString) return '#' + m.color.getHexString()
  return null
}

// Converts hex `#rgb`/`#rrggbb` to `rgba(r, g, b, alpha)` for canvas strokeStyle.
// Used to inject alpha into solid style colours (e.g. borough outlines on the minimap)
// without modifying the material.
export function hexToRgba(hex, alpha) {
  if (typeof hex !== 'string' || hex[0] !== '#') return hex
  let h = hex.slice(1)
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

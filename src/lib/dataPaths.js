// Resolves static-data URLs against Vite's configured base. In dev that's `/`,
// so `dataUrl('foo.json')` → `/data/manhattan/foo.json`. In a `vite build` with
// `base: '/3d-city/'` (GitHub Pages project site), the same call yields
// `/3d-city/data/manhattan/foo.json`. Centralising this avoids the trap where
// a stray hard-coded `/data/...` 404s only in the deployed build.

const ROOT = `${import.meta.env.BASE_URL}data/manhattan/`

export function dataUrl(suffix) {
  return `${ROOT}${suffix}`
}

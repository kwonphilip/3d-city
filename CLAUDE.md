# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # start dev server (Vite HMR)
npm run build     # production build
npm run lint      # ESLint
npm run preview   # preview production build locally
```

Data pipeline scripts (run once, output committed or served statically):
```bash
node scripts/build-tiles.mjs      # NYC OpenData GeoJSON → tiled .bin + manifest.json
```

## Stack

- **React 19** + **Vite 8** with React Compiler (Babel transform via `@rolldown/plugin-babel`)
- **Three.js** via **@react-three/fiber** (R3F) + **@react-three/drei** for helpers
- No TypeScript; JS/JSX only

## Architecture

Single-page interactive 3D NYC city model. The Vite landing page (`src/App.jsx`) is fully replaced.

### Directory layout

```
src/
  scene/
    CityCanvas.jsx      # <Canvas>, MapControls, scene composition
    Buildings.jsx       # streams tiles by camera proximity, renders one Mesh per tile
    Highlight.jsx       # extrudes the selected building with the style's highlightMaterial
  styles/
    index.js            # preset registry + DEFAULT_STYLE_ID
    lowPolyFlat.jsx     # default (v1)
    stylizedMono.jsx    # (v1)
    wireframe.jsx       # (v1)
    # future: night, cyberpunk, modernNoShadows, modernPbr, photoreal
  hooks/
    useCameraFlight.js  # lerp MapControls target + camera.position on selection
    useGeocode.js       # Nominatim search → lon/lat, ref-cached
  context/
    StyleContext.jsx        # zustand: current style preset
    QualityContext.jsx      # zustand: render radius, min building height
    SelectionContext.jsx    # zustand: { target: {label, x, z} | null }
  ui/
    Nav.jsx             # address search box
    QualityPanel.jsx    # sliders: render radius, height threshold
    StylePicker.jsx     # style toggle
  lib/
    projection.js       # lon/lat ↔ local meters (Manhattan-centered tangent plane)
  workers/
    geometryWorker.js   # off-thread ExtrudeGeometry merge per tile

public/
  data/
    manhattan/
      manifest.json     # tile grid metadata, served statically
      tile_x_y.json     # buildings (footprint, height, center) per 500m cell
```

State lives in zustand stores rather than React Context because R3F's `<Canvas>` mounts a separate React root, and Context does not bridge that boundary.

### Style system

Each file under `src/styles/` exports a uniform preset shape:

```js
{
  id, label,
  background,           // CSS color or skybox config
  lights: () => <></>,  // JSX fragment
  buildingMaterial,     // single Material instance shared across InstancedMesh
  highlightMaterial,    // applied to selected building instance
  ground: () => <></>,  // optional (rivers, ground plane)
  postFx: null,         // <EffectComposer>...</> or null
}
```

`src/styles/index.js` exports a `STYLE_REGISTRY` array. Style switching swaps material refs on existing meshes — **no geometry rebuild**. Adding a new style is one new file + one registry push.

> Style preset files must use the `.jsx` extension because they contain JSX (`lights`/`ground` functions). Vite v8 (Rolldown) only transforms JSX in `.jsx` files.

### Building data

- Source: OpenStreetMap building footprints via Overpass (height tags + level estimates)
- Coverage v1: Manhattan only. Tiling is borough-agnostic; add other boroughs by running the pipeline and dropping tiles into `public/data/<borough>/`.
- Tile grid: 500m cells. Each tile = one merged `BufferGeometry` (every building's `ExtrudeGeometry` concatenated). InstancedMesh isn't a fit because every NYC building has a unique footprint.
- Projection: local tangent plane from a fixed Manhattan origin (see `lib/projection.js`). Mercator distortion is negligible at city scale.
- `ExtrudeGeometry` is non-indexed — the worker generates sequential indices when merging.
- Real polygon data has validity issues (self-intersections, bad winding). The worker silently skips degenerate polygons; the pipeline pre-sanitizes.

### Worker pipeline

- Imported via Vite `?worker` syntax (`import GeometryWorker from '...?worker'`). Plain `new Worker(new URL(...))` is unreliable in dev because the browser cannot resolve bare specifiers like `import * as THREE from 'three'` without Vite's transform.
- Worker output: `{ tileId, positions, normals, indices, buildingMeta }` — all typed-array buffers transferred. `buildingMeta` is one entry per building with `{ id, footprint, height, center }`, used for highlight lookup.

### Camera

- `MapControls` from drei: drag-pan, right-drag-orbit, scroll-zoom.
- `useCameraFlight` lerps `controls.target` + `camera.position` via `useFrame` on address selection.

### Geocoding

- Search box: runtime via Nominatim, bounded to Manhattan viewbox. Results cached in a `useRef` map to avoid re-fetching. Nominatim requires a proxy or careful rate-limiting if embedded in a public site.

### Performance knobs

- `QualityPanel` exposes: render radius (which tiles mount), min building height (per-building cull).
- Default quality tier auto-detected from `navigator.hardwareConcurrency` + `devicePixelRatio` in `QualityContext.jsx`.
- Render radius is also auto-scaled with camera height so the city stays visible when zoomed out (the slider sets the floor).
- v1 styles use no post-processing. Bloom / shadows are deferred to future style presets.

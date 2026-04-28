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
node scripts/geocode-pins.mjs     # pin labels → lon/lat → data/pins.json
```

## Stack

- **React 19** + **Vite 8** with React Compiler (Babel transform via `@rolldown/plugin-babel`)
- **Three.js** via **@react-three/fiber** (R3F) + **@react-three/drei** for helpers
- No TypeScript; JS/JSX only

## Planned Architecture

The Vite landing page (`src/App.jsx`) will be fully replaced. The app is a single-page interactive 3D NYC city model.

### Directory layout (in-progress)

```
src/
  scene/
    CityCanvas.jsx      # <Canvas>, MapControls, style provider context
    Buildings.jsx       # tile loader + InstancedMesh per tile
    Highlight.jsx       # selected-building material swap + camera tween
    Pins.jsx            # fixed nav pin markers
  styles/
    index.js            # preset registry: { id, label, ...preset }
    lowPolyFlat.js      # default (v1)
    stylizedMono.js     # (v1)
    wireframe.js        # (v1)
    # future: night, cyberpunk, modernNoShadows, modernPbr, photoreal
  data/
    manhattan/
      manifest.json     # tile grid metadata
      tile_x_y.bin      # extruded building geometry per tile (generated)
    pins.json           # fixed nav pin geocodes (generated)
  hooks/
    useCameraFlight.js  # lerp MapControls target + position
    useGeocode.js       # search query → lon/lat, client-side cached
    useTileLoader.js    # mount/unmount tiles by camera position
  ui/
    Nav.jsx             # fixed links + search box
    QualityPanel.jsx    # sliders: render radius, height threshold, detail
    StylePicker.jsx     # style toggle
  lib/
    projection.js       # lon/lat ↔ local meters (Manhattan-centered tangent plane)
    tiling.js           # grid cell lookup helpers
  workers/
    geometryWorker.js   # off-thread extrusion (add only if measured startup lag)
  scripts/
    build-tiles.mjs     # offline data pipeline
    geocode-pins.mjs    # offline pin geocoding
```

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

`src/styles/index.js` exports a `STYLE_REGISTRY` array. Style switching swaps material refs on existing InstancedMeshes — **no geometry rebuild**. Adding a new style is one new file + one registry push.

### Building data

- Source: NYC OpenData Building Footprints (GeoJSON with height fields)
- Coverage v1: Manhattan only. Tiling is borough-agnostic; add other boroughs by running the pipeline on their data and dropping tiles into `data/<borough>/`.
- Tile grid: 500m cells. Each tile = one InstancedMesh.
- Projection: local tangent plane from a fixed Manhattan origin (see `lib/projection.js`). Mercator distortion is negligible at city scale.
- Real NYC polygon data has validity issues (self-intersections, bad winding). `build-tiles.mjs` must sanitize before passing to `ExtrudeGeometry`.

### Camera

- `MapControls` from drei: drag-pan, right-drag-orbit, scroll-zoom.
- `useCameraFlight` lerps `controls.target` + `camera.position` via `useFrame` on address selection.

### Geocoding

- Fixed pins: geocoded offline by `scripts/geocode-pins.mjs`, stored in `data/pins.json`.
- Search box: runtime via Nominatim or Mapbox (TBD). Results cached in a `useRef` map to avoid re-fetching. Nominatim requires a proxy or careful rate-limiting if embedded in a public site.

### Performance knobs

- `QualityPanel` exposes: render radius (which tiles mount), height threshold (instance visibility mask), geometry simplification tolerance.
- Default quality tier auto-detected from `navigator.hardwareConcurrency` + `devicePixelRatio`.
- v1 styles use no post-processing. Bloom / shadows are deferred to future style presets.

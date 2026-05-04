# 3d-city

Interactive 3D NYC city viewer in the browser. Buildings are extruded from real
OpenStreetMap footprints, streamed in 500 m tiles by camera proximity, and
rendered through a swappable style system (day/night/wireframe/etc.).

## Develop

```bash
npm run dev       # Vite dev server with HMR
npm run build     # production build
npm run lint      # ESLint
npm run preview   # preview the production build locally
```

## Data pipeline

The static tile/manifest files under `public/data/manhattan/` are produced
offline by the scripts in `scripts/`:

```bash
node scripts/build-tiles.mjs       # building footprints → tiled .json + manifest
node scripts/build-roads.mjs       # OSM ways → tiled road geometry + manifest
node scripts/build-land.mjs        # land/water polygons
node scripts/build-parks.mjs       # park polygons
node scripts/slim-manifests.mjs    # one-shot manifest size reducer
```

Architecture notes live in [CLAUDE.md](CLAUDE.md).

## Credits

**Data**

- Building footprints, road geometry, and park polygons:
  [OpenStreetMap](https://www.openstreetmap.org/) contributors, fetched via the
  [Overpass API](https://overpass-api.de/). Data is © OpenStreetMap
  contributors and licensed under
  [ODbL](https://www.openstreetmap.org/copyright).
- Address search: [Nominatim](https://nominatim.org/) (OpenStreetMap).

**Libraries**

- [Three.js](https://threejs.org/) for WebGL rendering.
- [@react-three/fiber](https://github.com/pmndrs/react-three-fiber) +
  [@react-three/drei](https://github.com/pmndrs/drei) for the React renderer
  and helpers.
- [React](https://react.dev/) (with the React Compiler) +
  [Vite](https://vitejs.dev/) for the app framework and build.
- [Zustand](https://github.com/pmndrs/zustand) for state shared across the
  R3F Canvas boundary.
- [clipper-lib](https://www.npmjs.com/package/clipper-lib) for offline polygon
  offsetting in the land pipeline.

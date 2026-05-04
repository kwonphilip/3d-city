import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'

// https://vite.dev/config/
export default defineConfig({
  // Project-page deploys at https://kwonphilip.github.io/3d-city/. Runtime
  // data fetches read this via `import.meta.env.BASE_URL` in lib/dataPaths.js,
  // so dev (`/`) and Pages (`/3d-city/`) both resolve correctly.
  base: '/3d-city/',
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] })
  ],
})

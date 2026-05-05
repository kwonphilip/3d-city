import * as THREE from 'three'
import { defineStyle } from './_base'
import { DayLights } from './_lights'

// Water, land, parks, and roads are unlit MeshBasicMaterial so they read as a
// flat 2D map. Buildings use MeshLambertMaterial so each face shades distinctly
// — without that, identical-color faces merge into a single silhouette in 3D.
export default defineStyle({
  id: 'monoDay',
  label: 'Mono Day',
  description: 'Daylight map, flat ground + shaded buildings',
  perfTier: 'light',
  category: 'day',
  background: '#dde6ec',
  buildingMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#c8c4be') }),
  highlightMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#4285f4') }),
  highlightOutlineColor: '#1f5fc4',
  highlightBeamColor: '#4285f4',
  waterMaterial: new THREE.MeshBasicMaterial({ color: new THREE.Color('#a8d3eb') }),
  landMaterial: new THREE.MeshBasicMaterial({ color: new THREE.Color('#efe9da') }),
  parkMaterial: new THREE.MeshBasicMaterial({ color: new THREE.Color('#bfdcae') }),
  roadMaterial: new THREE.MeshBasicMaterial({ color: new THREE.Color('#bcb8b0') }),
  bridgeMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#aaa6a0') }),
  bridgePillarMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#8d8a83') }),
  clipToLand: true,
  transparentBackground: true,
  noiseBackground: { color1: '#c8d8e8', color2: '#edecea' },
  cloudLayer: { color: '#f0eee8', opacity: 0.7 },
  skyClass: 'sky-day-cycle',
  lights: DayLights,
})

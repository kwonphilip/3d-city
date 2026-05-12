import * as THREE from 'three'
import { defineStyle } from './_base'
import { DayLights } from './_lights'
import { makeHeightTintMaterial } from '../lib/heightMaterial'

export default defineStyle({
  id: 'lowPolyDay',
  label: 'Low-Poly Day',
  description: 'Daylight map, soft shading',
  perfTier: 'standard',
  category: 'day',
  background: '#dde6ec',
  buildingMaterial: makeHeightTintMaterial({ baseColor: '#9aa5b4', topColor: '#b8c8d8' }),
  highlightMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#4285f4') }),
  highlightOutlineColor: '#1f5fc4',
  highlightBeamColor: '#4285f4',
  waterMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#a8d3eb'), transparent: true, opacity: 0.3 }),
  landMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#efe9da'), transparent: true, opacity: 0.3 }),
  parkMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#bfdcae'), transparent: true, opacity: 0.8 }),
  roadMaterial: new THREE.MeshBasicMaterial({ color: new THREE.Color('#bcb8b0'), transparent: true, opacity: 1.0 }),
  bridgeMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#aaa6a0'), transparent: true, opacity: 1.0 }),
  bridgePillarMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#8d8a83'), transparent: true, opacity: 1.0 }),
  clipToLand: true,
  transparentBackground: true,
  noiseBackground: { color1: '#c8d8e8', color2: '#dde6ec' },
  cloudLayer: { color: '#eef2f6', opacity: 0.65 },
  skyClass: 'sky-day-cycle',
  lights: DayLights,
})

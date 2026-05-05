import * as THREE from 'three'
import { defineStyle } from './_base'
import { DayLights } from './_lights'

export default defineStyle({
  id: 'lowPolyDay',
  label: 'Low-Poly Day',
  description: 'Daylight map, soft shading',
  perfTier: 'standard',
  category: 'day',
  background: '#dde6ec',
  buildingMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#9aa5b4') }),
  highlightMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#4285f4') }),
  highlightOutlineColor: '#1f5fc4',
  highlightBeamColor: '#4285f4',
  waterMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#a8d3eb') }),
  landMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#efe9da') }),
  parkMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#bfdcae') }),
  roadMaterial: new THREE.MeshBasicMaterial({ color: new THREE.Color('#bcb8b0') }),
  bridgeMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#aaa6a0') }),
  bridgePillarMaterial: new THREE.MeshLambertMaterial({ color: new THREE.Color('#8d8a83') }),
  clipToLand: true,
  transparentBackground: true,
  skyGradient: 'linear-gradient(to bottom, #6a8fa8 0%, #b8cdd8 50%, #dde8ee 100%)',
  lights: DayLights,
})

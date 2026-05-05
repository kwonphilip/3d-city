import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const { NormalBlending } = THREE

const vert = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 1.0, 1.0);
}
`

const frag = /* glsl */`
uniform float uTime;
uniform vec3 uColor;
uniform float uOpacity;
varying vec2 vUv;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 6; i++) {
    v += a * noise(p);
    p = p * 2.1 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 p1 = vUv * 3.5 + uTime * vec2(0.010, 0.007);
  vec2 p2 = vUv * 1.8 + uTime * vec2(0.006, 0.004);
  float n = fbm(p1) * 0.6 + fbm(p2) * 0.4;

  float cloud = smoothstep(0.52, 0.60, n);
  if (cloud < 0.01) discard;

  gl_FragColor = vec4(uColor, cloud * uOpacity);
}
`

export default function CloudLayer({ color = '#f8f6f2', opacity = 0.5 }) {
  const matRef = useRef()

  const uniforms = useRef({
    uTime: { value: 0 },
    uColor: { value: new THREE.Color(color) },
    uOpacity: { value: opacity },
  })

  useFrame((_, dt) => {
    if (matRef.current) matRef.current.uniforms.uTime.value += dt
  })

  return (
    <mesh renderOrder={-9} frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={vert}
        fragmentShader={frag}
        uniforms={uniforms.current}
        depthTest={false}
        depthWrite={false}
        blending={NormalBlending}
      />
    </mesh>
  )
}

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const vert = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 1.0, 1.0);
}
`

const frag = /* glsl */`
uniform float uTime;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uCloudColor;
uniform float uCloudOpacity;
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
  vec2 bgP = vUv * 2.5 + uTime * vec2(0.018, 0.013);
  float bgN = fbm(bgP);
  vec3 color = mix(uColor1, uColor2, bgN);

  if (uCloudOpacity > 0.0) {
    vec2 p1 = vUv * 3.5 + uTime * vec2(0.030, 0.021);
    vec2 p2 = vUv * 1.8 + uTime * vec2(0.018, 0.012);
    float cn = fbm(p1) * 0.6 + fbm(p2) * 0.4;
    float cloud = smoothstep(0.52, 0.60, cn) * uCloudOpacity;
    color = mix(color, uCloudColor, cloud);
  }

  gl_FragColor = vec4(color, 1.0);
}
`

export default function NoiseBackground({ color1, color2, cloudColor, cloudOpacity = 0 }) {
  const matRef = useRef()

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uColor1: { value: new THREE.Color(color1) },
    uColor2: { value: new THREE.Color(color2) },
    uCloudColor: { value: new THREE.Color(cloudColor ?? '#ffffff') },
    uCloudOpacity: { value: cloudColor ? cloudOpacity : 0 },
  }), []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!matRef.current) return
    matRef.current.uniforms.uColor1.value.set(color1)
    matRef.current.uniforms.uColor2.value.set(color2)
    if (cloudColor) {
      matRef.current.uniforms.uCloudColor.value.set(cloudColor)
      matRef.current.uniforms.uCloudOpacity.value = cloudOpacity
    } else {
      matRef.current.uniforms.uCloudOpacity.value = 0
    }
  }, [color1, color2, cloudColor, cloudOpacity])

  useFrame((_, dt) => {
    if (matRef.current) matRef.current.uniforms.uTime.value += dt
  })

  return (
    <mesh renderOrder={-10} frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={vert}
        fragmentShader={frag}
        uniforms={uniforms}
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  )
}

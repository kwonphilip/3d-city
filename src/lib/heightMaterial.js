import * as THREE from 'three'

// Returns a MeshLambertMaterial that blends from baseColor at ground level
// to topColor at maxHeight, using a smooth ramp. The tint is applied after
// per-vertex Lambert lighting so shading and tint compose correctly.
export function makeHeightTintMaterial({ baseColor, topColor, maxHeight = 200, blend = 0.5 }) {
  const mat = new THREE.MeshLambertMaterial({ color: new THREE.Color(baseColor) })
  const topC = new THREE.Color(topColor)

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTopColor = { value: topC }
    shader.uniforms.uMaxH = { value: maxHeight }
    shader.uniforms.uBlend = { value: blend }

    // Declare varying in vertex pars
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      '#include <common>\nvarying float vWorldY;',
    )
    // Compute world Y after all local transforms (morphtarget/skinning applied to `transformed`)
    shader.vertexShader = shader.vertexShader.replace(
      '#include <worldpos_vertex>',
      '#include <worldpos_vertex>\nvWorldY = (modelMatrix * vec4(transformed, 1.0)).y;',
    )

    // Declare uniforms + varying in fragment pars
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      '#include <common>\nuniform vec3 uTopColor;\nuniform float uMaxH;\nuniform float uBlend;\nvarying float vWorldY;',
    )
    // Apply tint after vertex-color and map fragments resolve diffuseColor
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      {
        float _t = smoothstep(0.0, uMaxH, vWorldY);
        diffuseColor.rgb = mix(diffuseColor.rgb, uTopColor, _t * uBlend);
      }`,
    )
  }

  mat.customProgramCacheKey = () => `ht|${baseColor}|${topColor}|${maxHeight}|${blend}`
  return mat
}

// The above-water band is drawn over the top of the water scene. Its lower edge is a rippling waterline: every sky-band
// fragment below a wobbling screen-space line is discarded so the underside of the surface shows through. Shared uniforms:
//   uWL  = waterline height in framebuffer pixels (from the bottom), uDpr = device pixel ratio, uTimeS = seconds.
import * as THREE from 'three';

export const SKY_CLIP = { uWL: { value: 0 }, uDpr: { value: 1 }, uTimeS: { value: 0 } };

export const SKY_CLIP_GLSL = /* glsl */`
uniform float uWL; uniform float uDpr; uniform float uTimeS;
float skyEdge(){
  float x = gl_FragCoord.x / uDpr;
  float w = 0.5 * sin(x * 0.0125 + uTimeS * 1.35) + 0.32 * sin(x * 0.031 - uTimeS * 2.1 + 1.3) + 0.2 * sin(x * 0.074 + uTimeS * 3.1) + 0.12 * sin(x * 0.17 - uTimeS * 4.3);
  return uWL + w * 2.6 * uDpr;
}
`;

/** Patch a built-in material (MeshBasicMaterial etc.) so it is clipped by the wobbling waterline. */
export function clipToWaterline(mat) {
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, SKY_CLIP);
    sh.fragmentShader = SKY_CLIP_GLSL + sh.fragmentShader.replace('void main() {', 'void main() { if (gl_FragCoord.y < skyEdge()) discard;');
  };
  mat.customProgramCacheKey = () => 'skyclip';
  return mat;
}

// Reef rock shading: dark wet stone with turf algae on the lit tops, pink coralline crust on the shaded flanks, dark
// undersides and crevices (baked AO), noise bump for pitting, a wet sheen, sand dusting at the base, and heavy fog so
// distant rocks dissolve into the water colour instead of glowing.
import * as THREE from 'three';
import { U } from './uniforms.js';
import { COMMON_FRAG } from './glsl.js';

const VERT = /* glsl */`
attribute vec4 aRk; varying vec3 vWP; varying vec3 vN; varying vec4 vRk; varying float vSeed;
void main(){
  mat4 M = modelMatrix * instanceMatrix;
  vec4 wp = M * vec4(position, 1.0);
  vWP = wp.xyz;
  // inverse-transpose for the (non-uniform) instance scale
  vec3 sc = vec3(length(M[0].xyz), length(M[1].xyz), length(M[2].xyz));
  vN = normalize(mat3(M[0].xyz / sc.x, M[1].xyz / sc.y, M[2].xyz / sc.z) * (normal / sc));
  vRk = aRk; vSeed = fract(M[3].x * 0.137 + M[3].z * 0.291);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const FRAG = /* glsl */`
${COMMON_FRAG}
uniform vec3 uSandColor; uniform vec3 uRockColor;
varying vec3 vWP; varying vec3 vN; varying vec4 vRk; varying float vSeed;
void main(){
  vec3 P = vWP * 1.7 + vSeed * 40.0;
  float big = fbm3(P * 0.45), mid = fbm3(P * 1.6), fine = vnoise3(P * 7.5);
  // bump: pitting + larger undulation, gradient by finite difference in world space
  float e = 0.06;
  float b0 = vnoise3(P * 5.0) * 0.6 + vnoise3(P * 11.0) * 0.4;
  vec3 g = vec3(vnoise3((P + vec3(e, 0, 0)) * 5.0) * 0.6 + vnoise3((P + vec3(e, 0, 0)) * 11.0) * 0.4 - b0,
                vnoise3((P + vec3(0, e, 0)) * 5.0) * 0.6 + vnoise3((P + vec3(0, e, 0)) * 11.0) * 0.4 - b0,
                vnoise3((P + vec3(0, 0, e)) * 5.0) * 0.6 + vnoise3((P + vec3(0, 0, e)) * 11.0) * 0.4 - b0) / e;
  vec3 N = normalize(vN);
  N = normalize(N - (g - N * dot(g, N)) * 0.16);
  float up = clamp(N.y, 0.0, 1.0);

  // stone: dark wet grey-brown with bands
  vec3 stone = mix(vec3(0.17, 0.155, 0.145), vec3(0.45, 0.38, 0.3), big) * (uRockColor * 2.1);
  float strata = 0.5 + 0.5 * sin(vWP.y * 5.5 + big * 9.0 + vSeed * 20.0);
  stone *= (0.72 + 0.5 * mid) * (0.82 + 0.3 * strata);
  stone = mix(stone, stone * vec3(1.25, 1.05, 0.85), smoothstep(0.55, 0.8, mid) * 0.5);
  // turf algae (olive/brown) on lit surfaces
  float turf = smoothstep(0.25, 0.62, vRk.y * 0.9 + (mid - 0.45) * 0.9) * smoothstep(0.1, 0.55, up + 0.2);
  vec3 turfC = mix(vec3(0.11, 0.1, 0.035), vec3(0.2, 0.17, 0.06), fine);
  vec3 albedo = mix(stone, turfC, turf * 0.85);
  // encrusting coralline algae: dusty pink-mauve patches, strongest on flanks and shaded faces
  float pinkMask = smoothstep(0.25, 0.6, vRk.z + (mid - 0.5) * 0.6) * (1.0 - turf * 0.7) * (0.4 + 0.6 * (1.0 - up));
  albedo = mix(albedo, vec3(0.55, 0.26, 0.33) * (0.6 + 0.7 * fine), pinkMask * 0.75);
  // pale barnacle/shell grit speckle
  float grit = smoothstep(0.86, 0.95, vnoise3(P * 18.0)) * 0.5;
  albedo += grit * vec3(0.16, 0.15, 0.13) * (0.4 + 0.6 * up);
  // crevices, undersides and the buried base are dark; the foot is dusted with sand
  float ao = vRk.x * (0.8 + 0.2 * b0);
  albedo *= 0.25 + 0.85 * ao;
  float dust = smoothstep(0.02, -0.24, vRk.w);
  albedo = mix(albedo, uSandColor * 0.42, dust * 0.65);

  vec3 V = normalize(cameraPosition - vWP);
  float wet = pow(max(dot(reflect(-uSunDir, N), V), 0.0), 18.0) * 0.18 * (0.3 + 0.7 * up);
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0) * 0.12;
  vec3 col = underwaterX(albedo, N, vWP, 0.7 * ao, rim * 0.4, 1.25, vec3(wet) * vec3(0.7, 0.9, 1.0));
  gl_FragColor = vec4(col, 1.0);
}`;

export function makeRockMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG,
    uniforms: { ...U },
  });
}

// Ship hull shading: black topsides, antifouling red below, riveted plate seams, algae and barnacle band at the
// waterline, rust streaks, and caustic light dappling the red paint.
import * as THREE from 'three';
import { U } from './uniforms.js';
import { COMMON_FRAG } from './glsl.js';

const VERT = /* glsl */`
varying vec3 vWP; varying vec3 vN; varying vec3 vLoc;
void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vWP = wp.xyz; vLoc = position; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * wp; }`;
const FRAG = /* glsl */`
${COMMON_FRAG}
varying vec3 vWP; varying vec3 vN; varying vec3 vLoc;
void main(){
  float x = vLoc.x, y = vLoc.y;
  vec3 N = normalize(vN);
  vec3 outDir = normalize(vec3(0.0, y + 1.4, vLoc.z));
  if (dot(N, outDir) < 0.0) N = -N;
  // welded plates: strakes ~1.3 high, ~3.6 long, each with its own paint tone
  vec2 pl = vec2(x / 3.6, y / 1.3);
  vec2 pid = floor(pl), f = fract(pl);
  float tone = hash21(pid + 3.0) * 0.16;
  float seam = (1.0 - smoothstep(0.0, 0.02, min(f.x, 1.0 - f.x))) * 0.8 + (1.0 - smoothstep(0.0, 0.035, min(f.y, 1.0 - f.y))) * 0.5;
  float topside = smoothstep(-0.62, -0.38, y);
  vec3 red = vec3(0.5, 0.082, 0.062) * (1.0 - tone * 1.6);
  vec3 black = vec3(0.034, 0.039, 0.045) * (1.0 + tone);
  vec3 base = mix(red, black, topside);
  float n = fbm2(vec2(x * 0.8, y * 2.4));
  // algae and barnacles hang in a band under the waterline
  float band = smoothstep(-0.42, -0.7, y) * (1.0 - smoothstep(-1.4, -0.95, y));
  base = mix(base, vec3(0.2, 0.26, 0.09) * (0.55 + n), band * smoothstep(0.45, 0.7, n) * 0.6);
  base = mix(base, vec3(0.5, 0.46, 0.38) * (0.5 + n), band * smoothstep(0.8, 0.9, vnoise(vec2(x * 7.0, y * 6.0))) * 0.55);
  float streak = vnoise(vec2(x * 2.1, y * 0.28));
  base = mix(base, base * vec3(1.35, 0.8, 0.65), smoothstep(0.68, 0.92, streak) * 0.5 * (1.0 - topside * 0.6));
  base *= 1.0 - 0.5 * seam;
  base *= 0.85 + 0.25 * fbm2(vec2(x * 1.6, y * 3.0) + 7.0);
  float down = clamp(-N.y, 0.0, 1.0);
  base *= 1.0 - 0.35 * down;
  vec3 V = normalize(cameraPosition - vWP);
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0) * 0.5;
  vec3 col = underwater(base, N, vWP, 0.55, rim, 0.9);
  gl_FragColor = vec4(col, 1.0);
}`;

export function makeHullMaterial() {
  return new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: { ...U }, side: THREE.DoubleSide });
}

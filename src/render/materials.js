// Material factory: one underwater-lit ShaderMaterial covering textured fish, vertex-coloured kelp, flat props.
import * as THREE from 'three';
import { U } from './uniforms.js';
import { COMMON_FRAG } from './glsl.js';

const VERT = /* glsl */`
uniform float uTime; uniform float uLen; uniform float uSway; uniform float uWaveK; uniform float uSwimAmp;
#ifdef SWIM
attribute vec2 aSwim;
#endif
varying vec2 vUv; varying vec3 vN; varying vec3 vWP; varying vec3 vCol; varying float vHeight;
void main(){
  vec3 p = position;
  mat4 M = modelMatrix;
  #ifdef USE_INSTANCING
    M = modelMatrix * instanceMatrix;
  #endif
  #ifdef SWIM
    float tt = clamp(0.5 - p.x / uLen, 0.0, 1.2);
    float wv = sin(aSwim.x - p.x * uWaveK / uLen) * tt * tt * aSwim.y * 0.15 * uLen;
    p.y += wv * 0.8; p.z += wv * 0.45;
  #endif
  #ifdef SWAY
    vec3 base = (M * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    float h = max(p.y, 0.0);
    float ph = uTime * 0.9 + base.x * 0.35 + (p.x + p.z) * 4.0;
    p.x += (sin(ph) + 0.5 * sin(ph * 2.3 + 1.0)) * uSway * h * h;
    p.z += cos(ph * 0.8) * uSway * 0.5 * h * h;
  #endif
  vec4 wp = M * vec4(p, 1.0);
  vWP = wp.xyz;
  vN = normalize(mat3(M) * normal);
  vUv = uv;
  vHeight = position.y;
  #ifdef USE_COLOR
    vCol = color;
  #else
    vCol = vec3(1.0);
  #endif
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const FRAG = /* glsl */`
${COMMON_FRAG}
uniform sampler2D uMap; uniform vec3 uTint; uniform float uFogMult; uniform float uCaustAmt; uniform float uRim; uniform float uAlpha; uniform float uEmissive; uniform float uSense;
varying vec2 vUv; varying vec3 vN; varying vec3 vWP; varying vec3 vCol; varying float vHeight;
void main(){
  vec3 albedo = uTint * vCol;
  #ifdef USE_MAP
    vec4 t = texture2D(uMap, vUv); albedo *= t.rgb;
  #endif
  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(cameraPosition - vWP);
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0) * uRim;
  vec3 col = underwater(albedo, N, vWP, uCaustAmt, rim, uFogMult);
  col += albedo * uEmissive;
  gl_FragColor = vec4(col, uAlpha);
}
`;

export function makeMaterial({ map = null, tint = 0xffffff, vertexColors = false, swim = false, sway = 0, len = 1, waveK = 6.3, side = THREE.FrontSide, fogMult = 1, caustic = 1, rim = 0.25, alpha = 1, emissive = 0, transparent = false } = {}) {
  const defines = {};
  if (map) defines.USE_MAP = '';
  if (swim) defines.SWIM = '';
  if (sway) defines.SWAY = '';
  const m = new THREE.ShaderMaterial({
    defines, vertexShader: VERT, fragmentShader: FRAG, vertexColors, side, transparent: transparent || alpha < 1,
    uniforms: {
      ...U,
      uMap: { value: map }, uTint: { value: new THREE.Color(tint) }, uLen: { value: len }, uSway: { value: sway }, uWaveK: { value: waveK }, uSwimAmp: { value: 1 },
      uFogMult: { value: fogMult }, uCaustAmt: { value: caustic }, uRim: { value: rim }, uAlpha: { value: alpha }, uEmissive: { value: emissive },
    },
  });
  return m;
}

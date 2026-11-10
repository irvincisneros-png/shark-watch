// Material factory: one underwater-lit ShaderMaterial covering textured fish, vertex-coloured kelp, flat props.
import * as THREE from 'three';
import { U } from './uniforms.js';
import { COMMON_FRAG } from './glsl.js';

const VERT = /* glsl */`
uniform float uTime; uniform float uLen; uniform float uSway; uniform float uWaveK; uniform float uSwimAmp;
#ifdef SWIM
attribute vec2 aSwim;
#endif
#ifdef KELP
attribute float aFlex; attribute float aSide;
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
  #ifdef KELP
    // surge: a slow swell pushes the whole bed one way and back, with a faster flutter on the free ends
    vec3 kb = (M * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    float fl = aFlex * aFlex;
    float surge = sin(uTime * 0.7 + kb.x * 0.09 - kb.z * 0.05) + 0.4 * sin(uTime * 1.15 + kb.x * 0.17 + 1.7);
    float flut = sin(uTime * 2.1 + p.x * 5.0 + p.y * 3.0 + kb.x * 0.7) + 0.6 * sin(uTime * 3.3 + p.z * 6.0 + kb.z);
    p.x += (surge * 0.2 + flut * 0.035) * uSway * 10.0 * fl;
    p.z += (cos(uTime * 0.55 + kb.x * 0.07) * 0.12 + flut * 0.025) * uSway * 10.0 * fl;
    p.y -= (0.5 + 0.5 * surge) * 0.04 * uSway * 10.0 * fl;
    // frilly, rippling edges (Ecklonia blades are crinkled): lift the two edges in opposite phase along the blade
    p += normal * sin(aFlex * 15.0 + uTime * 0.9 + kb.x * 0.3 + aSide * 1.9) * aSide * 0.03 * smoothstep(0.1, 0.5, aFlex);
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
  #ifdef USE_INSTANCING_COLOR
    vCol *= instanceColor;
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
  #ifdef KELP
    // thin blades glow where the light comes through them: back-lit amber-olive, strongest high in the water column
    float thin = max(dot(-N, uSunDir), 0.0) * 0.8 + 0.25 * pow(1.0 - abs(dot(N, V)), 2.0);
    vec3 extra = albedo * vec3(0.9, 0.8, 0.3) * thin * (0.25 + 0.5 * smoothstep(-0.2, 1.0, vHeight));
    vec3 col = underwaterX(albedo, N, vWP, uCaustAmt, rim, uFogMult, extra);
  #else
    vec3 col = underwater(albedo, N, vWP, uCaustAmt, rim, uFogMult);
  #endif
  col += albedo * uEmissive;
  gl_FragColor = vec4(col, uAlpha);
}
`;

export function makeMaterial({ map = null, tint = 0xffffff, vertexColors = false, swim = false, sway = 0, kelp = false, len = 1, waveK = 6.3, side = THREE.FrontSide, fogMult = 1, caustic = 1, rim = 0.25, alpha = 1, emissive = 0, transparent = false } = {}) {
  const defines = {};
  if (map) defines.USE_MAP = '';
  if (swim) defines.SWIM = '';
  if (sway && !kelp) defines.SWAY = '';
  if (kelp) defines.KELP = '';
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

// The hero: a juvenile great white shark, procedurally modelled and shaded.
// Anatomy: conical snout, black eye, five gill slits, tall triangular first dorsal, long falcate pectorals,
// crescent tail with near-equal lobes and a caudal keel, slate-grey back / white belly with an irregular
// demarcation line, black pectoral tips underneath, an opening jaw with teeth, and a yellow-orange dart tag.
// The swim wave is done in the vertex shader (tail leads, head barely moves).
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { U } from './uniforms.js';
import { COMMON_FRAG } from './glsl.js';

export const SHARK_L = 5.2;
const L = SHARK_L;

// ---- body profile (fractions of L), p = 0 at snout tip .. 1 at tail tip; the body itself ends at p = 0.8 --------------
const PTS = [0, 0.006, 0.02, 0.05, 0.09, 0.14, 0.20, 0.26, 0.32, 0.38, 0.44, 0.50, 0.56, 0.62, 0.68, 0.74, 0.78, 0.80];
const HH = [0, 0.006, 0.019, 0.037, 0.056, 0.072, 0.083, 0.089, 0.092, 0.091, 0.086, 0.078, 0.067, 0.055, 0.043, 0.032, 0.025, 0.022];
const HW = [0, 0.006, 0.018, 0.033, 0.049, 0.062, 0.072, 0.078, 0.080, 0.078, 0.073, 0.065, 0.055, 0.044, 0.034, 0.026, 0.021, 0.019];
const CY = [-0.014, -0.013, -0.011, -0.008, -0.005, -0.002, 0, 0.001, 0.002, 0.003, 0.004, 0.005, 0.006, 0.007, 0.007, 0.007, 0.007, 0.007];
function table(arr, p) {
  p = Math.max(0, Math.min(0.8, p));
  let i = 0; while (i < PTS.length - 2 && p > PTS[i + 1]) i++;
  const p0 = PTS[Math.max(0, i - 1)], p1 = PTS[i], p2 = PTS[i + 1], p3 = PTS[Math.min(PTS.length - 1, i + 2)];
  const y0 = arr[Math.max(0, i - 1)], y1 = arr[i], y2 = arr[i + 1], y3 = arr[Math.min(PTS.length - 1, i + 2)];
  const t = (p - p1) / (p2 - p1), t2 = t * t, t3 = t2 * t;
  const m1 = ((y2 - y1) / (p2 - p1) + (y1 - y0) / Math.max(1e-6, p1 - p0)) * 0.5 * (p2 - p1);
  const m2 = ((y3 - y2) / Math.max(1e-6, p3 - p2) + (y2 - y1) / (p2 - p1)) * 0.5 * (p2 - p1);
  return (2 * t3 - 3 * t2 + 1) * y1 + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * y2 + (t3 - t2) * m2;
}
export const sharkX = p => L * (0.5 - p);
const keelAt = p => L * 0.026 * Math.max(0, Math.min(1, (p - 0.66) / 0.1)) * (1 - Math.max(0, (p - 0.78) / 0.02));

const PART = { body: 0, dorsal: 1, pectoral: 2, caudal: 3, eye: 6, tooth: 5, tag: 7, belly: 8 };
const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function buildBody() {
  const RINGS = 72, SEG = 28;
  const pos = [], aPart = [], aJaw = [], aFlex = [], idx = [];
  const ringP = [];
  for (let i = 0; i <= RINGS; i++) { const t = i / RINGS; ringP.push(0.8 * (Math.pow(t, 0.9))); }
  for (let i = 0; i <= RINGS; i++) {
    const p = ringP[i], hh = table(HH, p) * L, hw = table(HW, p) * L, cy = table(CY, p) * L;
    for (let j = 0; j <= SEG; j++) {
      const th = (j / SEG) * Math.PI * 2;
      const c = -Math.cos(th), s = Math.sin(th); // c: +1 top, -1 belly
      let y = cy + hh * c * (c < 0 ? 0.94 : 1), z = hw * s;
      z += Math.sign(s) * keelAt(p) * Math.exp(-(c * c) / 0.05);
      pos.push(sharkX(p), y, z);
      aPart.push(PART.body); aFlex.push(0);
      const yn = (y - cy) / Math.max(1e-4, hh);
      const w = sm(-0.40, -0.58, yn) * (1 - sm(0.092, 0.118, p));
      aJaw.push(p < 0.005 ? 0 : w);
    }
  }
  const row = SEG + 1;
  for (let i = 0; i < RINGS; i++) for (let j = 0; j < SEG; j++) {
    const a = i * row + j, b = a + row;
    idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  // tail-end cap
  const lastRing = RINGS * row, centre = pos.length / 3;
  const pe = ringP[RINGS];
  pos.push(sharkX(pe), table(CY, pe) * L, 0); aPart.push(0); aJaw.push(0); aFlex.push(0);
  for (let j = 0; j < SEG; j++) idx.push(lastRing + j, lastRing + j + 1, centre);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(aPart, 1));
  g.setAttribute('aJaw', new THREE.Float32BufferAttribute(aJaw, 1));
  g.setAttribute('aFlex', new THREE.Float32BufferAttribute(aFlex, 1));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

/** Thin fin plate from a 2D outline built in (a, b) units of L. `place(a,b,t)` maps to model space. */
function finGeometry(outline, thick, part, place, flex = () => 0) {
  const shape = new THREE.Shape();
  outline(shape);
  const bev = thick * 0.55;
  const eg = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 2, curveSegments: 16 });
  eg.translate(0, 0, -thick / 2);
  const p = eg.attributes.position, n = p.count;
  const out = new Float32Array(n * 3), fx = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const [x, y, z] = place(p.getX(i), p.getY(i), p.getZ(i));
    out[i * 3] = x; out[i * 3 + 1] = y; out[i * 3 + 2] = z; fx[i] = flex(p.getX(i), p.getY(i));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(out, 3));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(new Array(n).fill(part), 1));
  g.setAttribute('aJaw', new THREE.Float32BufferAttribute(new Array(n).fill(0), 1));
  g.setAttribute('aFlex', new THREE.BufferAttribute(fx, 1));
  eg.dispose();
  const merged = mergeVertices(g, 1e-4);
  merged.computeVertexNormals();
  return merged;
}

function buildFins() {
  const geos = [];
  const topAt = p => (table(CY, p) + table(HH, p)) * L;
  // First dorsal: tall, triangular, swept, concave trailing edge with a free rear tip.
  {
    const p0 = 0.352, x0 = sharkX(p0), y0 = topAt(p0) - 0.012 * L, H = 0.158 * L;
    geos.push(finGeometry(s => {
      s.moveTo(0.012 * L, -0.03 * L);
      s.lineTo(0.004 * L, 0);
      s.bezierCurveTo(-0.012 * L, 0.05 * L, -0.045 * L, 0.115 * L, -0.082 * L, H);
      s.bezierCurveTo(-0.086 * L, 0.105 * L, -0.104 * L, 0.05 * L, -0.147 * L, 0.006 * L);
      s.lineTo(-0.128 * L, -0.03 * L);
      s.closePath();
    }, 0.0095 * L, PART.dorsal, (a, b, t) => [x0 + a, y0 + b, t], (a, b) => Math.max(0, b) / H * 0.6));
  }
  // Small second dorsal and anal fin.
  {
    const p0 = 0.665, x0 = sharkX(p0), y0 = topAt(p0) - 0.006 * L;
    geos.push(finGeometry(s => { s.moveTo(0.012 * L, -0.012 * L); s.bezierCurveTo(0, 0.02 * L, -0.015 * L, 0.04 * L, -0.03 * L, 0.044 * L); s.bezierCurveTo(-0.035 * L, 0.025 * L, -0.045 * L, 0.01 * L, -0.052 * L, 0.004 * L); s.lineTo(-0.045 * L, -0.012 * L); s.closePath(); }, 0.005 * L, PART.dorsal, (a, b, t) => [x0 + a, y0 + b, t], (a, b) => Math.max(0, b) / (0.044 * L) * 0.5));
    const p1 = 0.69, x1 = sharkX(p1), y1 = (table(CY, p1) - table(HH, p1) * 0.94) * L + 0.006 * L;
    geos.push(finGeometry(s => { s.moveTo(0.012 * L, 0.012 * L); s.bezierCurveTo(0, -0.02 * L, -0.015 * L, -0.04 * L, -0.03 * L, -0.044 * L); s.bezierCurveTo(-0.035 * L, -0.025 * L, -0.045 * L, -0.01 * L, -0.052 * L, -0.004 * L); s.lineTo(-0.045 * L, 0.012 * L); s.closePath(); }, 0.005 * L, PART.dorsal, (a, b, t) => [x1 + a, y1 + b, t], (a, b) => Math.max(0, -b) / (0.044 * L) * 0.5));
    // pelvic pair
    for (const side of [1, -1]) {
      const p2 = 0.54, x2 = sharkX(p2), y2 = (table(CY, p2) - table(HH, p2) * 0.92) * L + 0.004 * L, z2 = side * table(HW, p2) * L * 0.4;
      geos.push(finGeometry(s => { s.moveTo(0.01 * L, 0); s.bezierCurveTo(-0.005 * L, 0.03 * L, -0.025 * L, 0.05 * L, -0.045 * L, 0.058 * L); s.bezierCurveTo(-0.045 * L, 0.035 * L, -0.05 * L, 0.012 * L, -0.05 * L, 0); s.closePath(); }, 0.005 * L, PART.pectoral, (a, b, t) => [x2 + a, y2 - b * 0.55, z2 + side * (b * 0.8 + t * 0)], (a, b) => b / (0.058 * L) * 0.4));
    }
  }
  // Pectorals: long, falcate, swept back and angled down.
  for (const side of [1, -1]) {
    const p0 = 0.262, x0 = sharkX(p0), y0 = (table(CY, p0) - table(HH, p0) * 0.52) * L, z0 = side * table(HW, p0) * L * 0.78;
    const d = 0.5; // droop angle
    geos.push(finGeometry(s => {
      s.moveTo(0.02 * L, 0.005 * L);
      s.bezierCurveTo(-0.008 * L, 0.06 * L, -0.055 * L, 0.125 * L, -0.12 * L, 0.186 * L);
      s.bezierCurveTo(-0.108 * L, 0.115 * L, -0.092 * L, 0.05 * L, -0.074 * L, -0.004 * L);
      s.closePath();
    }, 0.0075 * L, PART.pectoral, (a, b, t) => [x0 + a, y0 - b * Math.sin(d), z0 + side * (b * Math.cos(d)) + side * t * 0.4], (a, b) => Math.max(0, b) / (0.186 * L)));
  }
  // Crescent tail: near-symmetric lobes, slight upper dominance.
  {
    const p0 = 0.795, x0 = sharkX(p0), y0 = table(CY, p0) * L;
    geos.push(finGeometry(s => {
      s.moveTo(0.012 * L, 0.02 * L);
      s.bezierCurveTo(-0.025 * L, 0.052 * L, -0.105 * L, 0.095 * L, -0.205 * L, 0.152 * L);
      s.bezierCurveTo(-0.178 * L, 0.098 * L, -0.15 * L, 0.04 * L, -0.134 * L, 0.002 * L);
      s.bezierCurveTo(-0.158 * L, -0.035 * L, -0.176 * L, -0.07 * L, -0.19 * L, -0.126 * L);
      s.bezierCurveTo(-0.12 * L, -0.085 * L, -0.045 * L, -0.052 * L, 0.012 * L, -0.02 * L);
      s.closePath();
    }, 0.0085 * L, PART.caudal, (a, b, t) => [x0 + a, y0 + b, t], (a, b) => Math.min(1, Math.abs(a) / (0.2 * L))));
  }
  return geos;
}

function buildTeeth(upper) {
  // Teeth around the arch of the mouth; the lower row is rotated with the jaw by the caller.
  const cone = new THREE.ConeGeometry(0.0125 * L, 0.034 * L, 4, 1);
  if (upper) cone.rotateZ(Math.PI); // tips point down
  const pts = [];
  const n = 16;
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    const p = 0.022 + u * 0.092;
    const hw = table(HW, p) * L, hh = table(HH, p) * L, cy = table(CY, p) * L;
    const yMouth = cy - 0.45 * hh;
    const z = Math.min(hw * 0.78, hw * (0.2 + 0.7 * u));
    for (const sd of u < 0.05 ? [0] : [1, -1]) pts.push([sharkX(p), yMouth + (upper ? -0.002 : 0.004) * L, sd * z, (upper ? 1 : 0.88)]);
  }
  const m = new THREE.InstancedMesh(cone, null, pts.length);
  const M = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
  pts.forEach((p, i) => { sc.setScalar(p[3]); M.compose(new THREE.Vector3(p[0], p[1], p[2]), q, sc); m.setMatrixAt(i, M); });
  const cg = cone.clone();
  cg.setAttribute('aPart', new THREE.Float32BufferAttribute(new Array(cg.attributes.position.count).fill(PART.tooth), 1));
  cg.setAttribute('aJaw', new THREE.Float32BufferAttribute(new Array(cg.attributes.position.count).fill(0), 1));
  cg.setAttribute('aFlex', new THREE.Float32BufferAttribute(new Array(cg.attributes.position.count).fill(0), 1));
  m.geometry = cg;
  m.frustumCulled = false;
  return m;
}

const VERT = /* glsl */`
uniform float uL; uniform float uPhase; uniform float uAmp; uniform float uOpen; uniform float uTime; uniform float uFlap;
attribute float aPart; attribute float aJaw; attribute float aFlex;
varying vec3 vN; varying vec3 vLP; varying vec3 vWP; varying float vPart; varying float vJ; varying float vFlex;
void main(){
  vec3 p = position;
  vec3 n = normal;
  vLP = position; vPart = aPart; vJ = aJaw; vFlex = aFlex;
  if (uOpen > 0.001 && aJaw > 0.0) {
    vec3 h = vec3(uL * (0.5 - 0.118), -0.03 * uL, 0.0);
    float a = uOpen * 0.62 * aJaw;
    vec3 d = p - h;
    p = h + vec3(cos(a) * d.x + sin(a) * d.y, -sin(a) * d.x + cos(a) * d.y, d.z);
    n = vec3(cos(a) * n.x + sin(a) * n.y, -sin(a) * n.x + cos(a) * n.y, n.z);
  }
  float pp = 0.5 - position.x / uL;
  float env = pow(clamp(pp, 0.0, 1.0), 2.15);
  float w = sin(uPhase - pp * 5.4) * env * uAmp * 0.115 * uL;
  p += vec3(0.0, 0.84, 0.54) * w;
  // pectoral and fin-tip flex
  p.y += aFlex * sin(uPhase * 0.5 + 1.2) * 0.016 * uL * uFlap;
  mat4 M = modelMatrix;
  #ifdef USE_INSTANCING
    M = modelMatrix * instanceMatrix;
  #endif
  vec4 wp = M * vec4(p, 1.0);
  vWP = wp.xyz;
  vN = normalize(mat3(M) * n);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const FRAG = /* glsl */`
${COMMON_FRAG}
uniform float uL; uniform float uHurt; uniform float uTagGlow; uniform float uSense;
varying vec3 vN; varying vec3 vLP; varying vec3 vWP; varying float vPart; varying float vJ; varying float vFlex;
void main(){
  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(cameraPosition - vWP);
  float pp = 0.5 - vLP.x / uL;            // 0 snout .. 1 tail tip
  float ny = N.y;                          // model-space-ish: the shark barely rolls, so world normal is fine
  vec3 slate = vec3(0.285, 0.335, 0.375);
  vec3 slateLight = vec3(0.43, 0.48, 0.52);
  vec3 belly = vec3(0.90, 0.915, 0.89);
  vec3 albedo = slate;
  float spec = 0.0;
  float emissive = 0.0;
  float causticAmt = 0.55;
  if (vPart < 0.5 || vPart > 7.5) {
    // Countershading with an irregular, sharp demarcation line (rises towards the tail, curls up over the snout)
    float n1 = vnoise(vec2(pp * 26.0, vLP.z * 3.0)) - 0.5;
    float n2 = vnoise(vec2(pp * 70.0 + 3.0, ny * 6.0)) - 0.5;
    float scallop = 0.10 * smoothstep(0.20, 0.27, pp) * (1.0 - smoothstep(0.27, 0.36, pp));   // white lobe pushes up behind the gills
    float line = mix(-0.42, -0.10, smoothstep(0.08, 0.58, pp)) + 0.06 * smoothstep(0.55, 0.8, pp) + scallop + n1 * 0.16 + n2 * 0.045;
    line += 0.4 * (1.0 - smoothstep(0.0, 0.07, pp));
    float t = smoothstep(line - 0.014, line + 0.014, ny + 0.04 * n2);
    vec3 back = mix(slateLight, slate, smoothstep(-0.2, 0.9, ny));
    back += (vnoise(vLP.xy * 90.0) - 0.5) * 0.05;
    albedo = mix(belly, back, t);
    // five gill slits, just behind the eye
    float gdark = 0.0;
    for (int i = 0; i < 5; i++) {
      float gp = 0.198 + float(i) * 0.0165 + 0.0035 * (1.0 - ny * ny);
      float d = abs(pp - gp);
      float slit = (1.0 - smoothstep(0.0011, 0.0024, d)) * smoothstep(0.62, 0.35, abs(ny + 0.05)) * smoothstep(0.2, 0.45, abs(N.z));
      gdark = max(gdark, slit);
    }
    albedo = mix(albedo, vec3(0.045, 0.035, 0.04), gdark * 0.92);
    // mouth line, nostrils, lateral line hint
    float mouthY = -0.020 - 0.16 * (pp - 0.02) / 1.0;
    float my = vLP.y / uL;
    float mline = (1.0 - smoothstep(0.0012, 0.0028, abs(my - mouthY))) * step(0.016, pp) * (1.0 - smoothstep(0.108, 0.12, pp)) * smoothstep(0.1, 0.35, abs(N.z) + 0.2);
    albedo = mix(albedo, vec3(0.08, 0.05, 0.05), mline * 0.85 * (1.0 - smoothstep(0.02, 0.2, vJ)));
    // inside of the open mouth (stretched triangles between the jaws)
    float gape = smoothstep(0.06, 0.25, vJ) * (1.0 - smoothstep(0.72, 0.95, vJ));
    albedo = mix(albedo, vec3(0.34, 0.035, 0.05), gape * smoothstep(0.02, 0.2, uHurt + 0.2));
    causticAmt = 0.5;
  } else if (vPart < 1.5) {          // dorsal and small fins: slate, pale trailing edge
    albedo = mix(slate * 0.95, slate * 0.55, smoothstep(0.5, 1.0, vFlex));
    albedo = mix(albedo, belly * 0.8, step(vLP.y, 0.0) * 0.8);   // anal fin is pale
  } else if (vPart < 2.5) {          // pectorals: grey above, white below with black tips underneath
    float below = smoothstep(0.1, -0.35, N.y);
    albedo = mix(slate * 1.05, belly, below);
    float tip = smoothstep(0.62, 0.9, vFlex);
    albedo = mix(albedo, vec3(0.03, 0.03, 0.035), tip * below);
  } else if (vPart < 3.5) {          // caudal: slate, darker rear edge
    albedo = mix(slate * 0.98, slate * 0.5, smoothstep(0.35, 1.0, vFlex));
  } else if (vPart < 5.5) {          // teeth
    albedo = vec3(0.96, 0.95, 0.9); emissive = 0.15;
  } else if (vPart < 6.5) {          // eye: glossy black
    albedo = vec3(0.012, 0.012, 0.016);
    vec3 H = normalize(V + normalize(uSunDir));
    spec = pow(max(dot(N, H), 0.0), 55.0) * 0.9;
  } else {                           // dart tag
    albedo = vec3(1.0, 0.55, 0.06); emissive = 0.28 + uTagGlow * 0.9;
  }
  float rim = pow(1.0 - max(dot(N, V), 0.0), 2.6) * 0.8;
  vec3 col = underwater(albedo, N, vWP, causticAmt, rim * 0.5, 0.55);
  // soft sub-surface sheen on the belly
  col += belly * 0.04 * smoothstep(0.0, -0.8, N.y);
  col += albedo * emissive + vec3(spec);
  col = mix(col, vec3(0.9, 0.12, 0.08), uHurt * 0.45);
  gl_FragColor = vec4(col, 1.0);
}
`;

export class HeroShark {
  constructor() {
    this.group = new THREE.Group();   // position/pitch/yaw here
    this.root = new THREE.Group();    // model offsets
    this.group.add(this.root);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide,
      uniforms: { ...U, uL: { value: L }, uPhase: { value: 0 }, uAmp: { value: 1 }, uOpen: { value: 0 }, uHurt: { value: 0 }, uFlap: { value: 1 }, uTagGlow: { value: 0 } },
    });
    const body = new THREE.Mesh(buildBody(), this.mat);
    this.root.add(body);
    for (const g of buildFins()) this.root.add(new THREE.Mesh(g, this.mat));
    // eyes
    const eyeGeo = new THREE.SphereGeometry(0.0165 * L, 14, 10);
    for (const sd of [1, -1]) {
      const p = 0.088, e = new THREE.Mesh(eyeGeo.clone(), this.mat);
      const g = e.geometry, n = g.attributes.position.count;
      g.setAttribute('aPart', new THREE.Float32BufferAttribute(new Array(n).fill(PART.eye), 1));
      g.setAttribute('aJaw', new THREE.Float32BufferAttribute(new Array(n).fill(0), 1));
      g.setAttribute('aFlex', new THREE.Float32BufferAttribute(new Array(n).fill(0), 1));
      e.position.set(sharkX(p), table(CY, p) * L + 0.004 * L, sd * table(HW, p) * L * 0.9);
      e.scale.set(1.05, 1, 0.65);
      this.root.add(e);
    }
    // teeth (upper static, lower with the jaw)
    this.teethUp = buildTeeth(true); this.teethUp.material = this.mat;
    this.teethLo = buildTeeth(false); this.teethLo.material = this.mat;
    this.jawPivot = new THREE.Group();
    this.jawPivot.position.set(sharkX(0.118), -0.03 * L, 0);
    this.teethLo.position.set(-sharkX(0.118), 0.03 * L, 0);
    this.jawPivot.add(this.teethLo);
    this.root.add(this.teethUp, this.jawPivot);
    this.teethUp.visible = this.teethLo.visible = false;
    // dart tag at the dorsal base, with a short tether
    this.tag = this.buildTag();
    this.root.add(this.tag);
    this.tagPivot = this.tag;
    this.tag.visible = false;
    this.phase = 0; this.open = 0; this.hurt = 0;
  }

  buildTag() {
    const g = new THREE.Group();
    const part = (geo, p) => { const n = geo.attributes.position.count; geo.setAttribute('aPart', new THREE.Float32BufferAttribute(new Array(n).fill(p), 1)); geo.setAttribute('aJaw', new THREE.Float32BufferAttribute(new Array(n).fill(0), 1)); geo.setAttribute('aFlex', new THREE.Float32BufferAttribute(new Array(n).fill(0), 1)); return geo; };
    // capsule body: yellow-orange sleeve, trailing backwards
    const cap = part(new THREE.CapsuleGeometry(0.012 * L, 0.06 * L, 4, 10), PART.tag);
    cap.rotateZ(Math.PI / 2);
    const m = new THREE.Mesh(cap, this.mat); m.position.set(-0.04 * L, 0, 0);
    // anchor disc where the dart enters the skin
    const disc = part(new THREE.CylinderGeometry(0.014 * L, 0.014 * L, 0.004 * L, 12), PART.tag); disc.rotateX(Math.PI / 2);
    const d = new THREE.Mesh(disc, this.mat); d.position.set(0.004 * L, 0, -0.002 * L);
    // black tether
    const th = part(new THREE.CylinderGeometry(0.0035 * L, 0.0035 * L, 0.03 * L, 6), PART.eye); th.rotateZ(Math.PI / 2);
    const t = new THREE.Mesh(th, this.mat); t.position.set(-0.002 * L, 0, 0);
    g.add(m, d, t);
    const p = 0.396;
    g.position.set(sharkX(p), (table(CY, p) + table(HH, p) * 0.62) * L, table(HW, p) * L * 0.9 + 0.012 * L);
    g.rotation.z = -0.35;
    g.userData.base = g.rotation.z;
    return g;
  }

  /** state: { t, speed, vy, pitch, bite (0..1 open), hurt, tagOn, boosting, resting } */
  update(dt, st) {
    const speedK = Math.min(1.8, st.speed / 9);
    this.phase += dt * (3.6 + speedK * 3.4) * (st.resting ? 0.15 : 1);
    this.open += (st.mouth - this.open) * Math.min(1, dt * 16);
    this.hurt += ((st.hurt ?? 0) - this.hurt) * Math.min(1, dt * 10);
    const u = this.mat.uniforms;
    u.uPhase.value = this.phase;
    u.uAmp.value = st.resting ? 0.25 : 0.8 + Math.min(0.5, speedK * 0.3);
    u.uOpen.value = this.open;
    u.uHurt.value = this.hurt;
    u.uTagGlow.value = st.tagGlow ?? 0;
    const on = this.open > 0.06;
    this.teethUp.visible = this.teethLo.visible = on;
    this.jawPivot.rotation.z = -this.open * 0.62;
    const sc = Math.min(1, this.open * 3);
    this.teethUp.scale.setScalar(sc); this.teethLo.scale.setScalar(sc);
    this.tag.visible = !!st.tagOn;
    this.tag.rotation.z = this.tag.userData.base + Math.sin(this.phase * 1.3) * 0.07 - st.vy * 0.01;
    this.group.rotation.set(0, st.yaw ?? -0.2, st.pitch);
    this.group.rotation.order = 'YZX';
  }
}

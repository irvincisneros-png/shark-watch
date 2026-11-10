// The above-water strip: a sky gradient with soft clouds and sun glow, hazy layered landmark silhouettes for each station
// (Bondi Icebergs, Cronulla/Kurnell, Sea Cliff Bridge + escarpment, Port Kembla stacks, Five Islands, Kiama lighthouse)
// and the lane-depth things that sit on the waterline (buoy masts, surfers, the container ship, the blowhole spout).
// It is rendered over the water scene with a rippling waterline (see skyclip.js).
import * as THREE from 'three';
import { U } from './uniforms.js';
import { COMMON_FRAG } from './glsl.js';
import { SKY_CLIP, SKY_CLIP_GLSL, clipToWaterline } from './skyclip.js';
import { stationX } from '../logic/route.js';
import { fbm1, hash1 } from '../logic/rng.js';

const PAR = 0.42; // landmark parallax
const NOISE_ONLY = COMMON_FRAG.split('// Moving web')[0];
const HAZE = [0.46, 0.28, 0.14, 0.04];   // far -> near

// accent colours (lit materials: lighthouses, walls, sand, rust)
const ACC = { WHITE: 0xf4f5f1, SAND: 0xe0cf9f, SANDSTONE: 0xc09a6c, AQUA: 0x58c4d6, CONC: 0xcfd1cc, RUST: 0xa24f33, RED: 0xcf4430, DARK: 0x2c3a40, ROOF: 0xb5503a, GRASS: 0x5f8a4a, STACK: 0xdedad2 };

function silhouetteMaterial(haze, acc) {
  const m = new THREE.ShaderMaterial({
    uniforms: {
      uLand: { value: new THREE.Color(0x56717a) }, uHor: { value: new THREE.Color(0xd0e4ec) }, uHaze: { value: haze },
      uAcc: { value: new THREE.Color(acc ?? 0xffffff) }, uAccMix: { value: acc == null ? 0 : 1 }, ...SKY_CLIP,
    },
    vertexShader: `attribute float aT; varying float vT; varying vec2 vP; void main(){ vT = aT; vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `${NOISE_ONLY}${SKY_CLIP_GLSL}
      uniform vec3 uLand; uniform vec3 uHor; uniform float uHaze; uniform vec3 uAcc; uniform float uAccMix; varying float vT; varying vec2 vP;
      void main(){
        if (gl_FragCoord.y < skyEdge()) discard;
        float tex = fbm2(vP * vec2(5.5, 7.0) + 3.0);
        float speck = vnoise(vP * vec2(38.0, 30.0));
        vec3 land = uLand * (0.58 + 0.5 * vT) * (0.84 + 0.34 * tex) * (0.94 + 0.12 * speck);
        land = mix(land, land * vec3(1.15, 1.0, 0.8), smoothstep(0.6, 0.9, tex) * 0.5);       // sunlit scrub / sandstone patches
        vec3 acc = uAcc * (0.78 + 0.26 * vT) * (0.97 + 0.06 * speck);
        vec3 c = mix(land, acc, uAccMix);
        // aerial perspective: distance haze, plus sea mist thickening towards the base
        c = mix(c, uHor, uHaze + 0.3 * (1.0 - vT) * (1.0 - uHaze));
        gl_FragColor = vec4(c, 1.0);
      }`,
    side: THREE.DoubleSide,
  });
  return m;
}

/** Accumulates polygons and merges them into one mesh per material (so the whole coast is a handful of draw calls). */
class Collector {
  constructor() { this.by = new Map(); }
  add(mat, pts, z, h, x = 0, y = 0) {
    let e = this.by.get(mat); if (!e) { e = { pos: [], aT: [], idx: [], n: 0 }; this.by.set(mat, e); }
    const contour = pts.map(p => new THREE.Vector2(p[0], p[1]));
    const tri = THREE.ShapeUtils.triangulateShape(contour, []);
    for (const p of pts) { e.pos.push(p[0] + x, p[1] + y, z); e.aT.push(Math.max(0, Math.min(1, p[1] / h))); }
    for (const t of tri) e.idx.push(e.n + t[0], e.n + t[1], e.n + t[2]);
    e.n += pts.length;
  }
  build(parent) {
    for (const [mat, e] of this.by) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(e.pos, 3));
      g.setAttribute('aT', new THREE.Float32BufferAttribute(e.aT, 1));
      g.setIndex(e.idx);
      const m = new THREE.Mesh(g, mat); m.frustumCulled = false; parent.add(m);
    }
  }
}

/** Ridge polygon: x0..x1, height fn(x) >= 0. */
function ridge(x0, x1, hfn, step = 1) {
  const pts = [[x0, -0.5]];
  for (let x = x0; x <= x1 + 1e-6; x += step) pts.push([x, hfn(x)]);
  pts.push([x1, -0.5]);
  return pts;
}
const tri = (cx, base, w, h) => [[cx - w / 2, base], [cx, base + h], [cx + w / 2, base]];
const rect = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
function blob(cx, cy, rx, ry, n = 9, seed = 0) {
  const p = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * 6.283, r = 0.78 + 0.3 * hash1(seed * 7 + i * 3.1); p.push([cx + Math.cos(a) * rx * r, cy + Math.sin(a) * ry * r * (Math.sin(a) < 0 ? 0.3 : 1)]); }
  return p;
}
/** Norfolk pine: slim trunk, tiers of upswept branches. */
const pine = (cx, base, h) => { const w = h * 0.33; return [[cx - 0.02, base], [cx - 0.02, base + h * 0.28], [cx - w * 0.9, base + h * 0.4], [cx - w * 0.3, base + h * 0.42], [cx - w * 0.75, base + h * 0.62], [cx - w * 0.2, base + h * 0.64], [cx - w * 0.5, base + h * 0.85], [cx, base + h], [cx + w * 0.5, base + h * 0.85], [cx + w * 0.2, base + h * 0.64], [cx + w * 0.75, base + h * 0.62], [cx + w * 0.3, base + h * 0.42], [cx + w * 0.9, base + h * 0.4], [cx + 0.02, base + h * 0.28], [cx + 0.02, base]]; };

export class SkyBand {
  constructor(tier) {
    this.scene = new THREE.Scene();
    this.cam = new THREE.OrthographicCamera(-15, 15, 3.4, -0.3, -50, 50);
    this.cam.position.z = 10;
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      uniforms: { uTop: { value: new THREE.Color(0x4f9fdc) }, uHor: { value: new THREE.Color(0xdcf1fa) }, uTime: U.uTime, uCamX: U.uCamX, ...SKY_CLIP },
      depthTest: false, depthWrite: false,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.999, 1.0); }`,
      fragmentShader: `${NOISE_ONLY}${SKY_CLIP_GLSL}
        uniform vec3 uTop; uniform vec3 uHor; uniform float uCamX; varying vec2 vUv;
        void main(){
          if (gl_FragCoord.y < skyEdge()) discard;
          float y = vUv.y;
          vec3 c = mix(uHor, uTop, pow(clamp(y * 1.05, 0.0, 1.0), 0.72));
          c = mix(c, uHor * vec3(1.0, 0.99, 0.95), exp(-y * 9.0) * 0.55);            // bright, slightly warm horizon haze
          // sun glow
          float s = exp(-pow(length((vUv - vec2(0.82, 0.55)) * vec2(1.5, 1.0)) * 4.0, 2.0));
          c += vec3(1.0, 0.95, 0.8) * s * 0.3;
          // soft clouds: two stretched layers, lit from above (compare the noise with a copy shifted downwards)
          vec2 cp = vec2(vUv.x * 2.2 + uCamX * 0.0036 + uTime * 0.007, y * 5.0);
          float a = fbm2(cp * vec2(1.0, 1.7)), b = fbm2(cp * vec2(1.0, 1.7) + vec2(0.0, 0.22));
          float cov = smoothstep(0.5, 0.72, a * 0.8 + fbm2(cp * vec2(2.3, 3.4) + 9.0) * 0.3);
          float lit = clamp((b - a) * 5.0 + 0.62, 0.0, 1.0);
          vec3 cloud = mix(uHor * vec3(0.78, 0.84, 0.92), vec3(1.0, 0.99, 0.97), lit);
          float vis = smoothstep(0.05, 0.28, y) * (1.0 - smoothstep(0.82, 1.0, y) * 0.5);
          c = mix(c, cloud, cov * 0.85 * vis);
          float cir = smoothstep(0.58, 0.8, fbm2(vec2(vUv.x * 5.5 + uCamX * 0.002, y * 22.0 + 3.0)));   // faint high streaks
          c = mix(c, vec3(1.0), cir * 0.18 * smoothstep(0.4, 0.8, y));
          gl_FragColor = vec4(c, 1.0);
        }`,
    }));
    sky.frustumCulled = false; sky.renderOrder = -10;
    this.scene.add(sky); this.sky = sky;
    this.mats = HAZE.map(h => silhouetteMaterial(h, null));
    this.accMats = {};
    this.layer = new THREE.Group(); this.scene.add(this.layer);   // parallax landmarks
    this.live = new THREE.Group(); this.scene.add(this.live);     // lane-depth things: buoy masts, surfers, ship
    this.buildLandmarks();
    this.buildLane();
    this.buildWaterline();
  }

  at(k, off) { return stationX(k) * PAR + off; }
  acc(haze, name) { const key = haze + name; return this.accMats[key] ??= silhouetteMaterial(HAZE[haze], ACC[name]); }

  buildLandmarks() {
    const C = new Collector();
    const A = (k, off) => this.at(k, off);
    const land = (haze, pts, z, h, x = 0, y = 0) => C.add(this.mats[haze], pts, z, h, x, y);
    const accent = (name, haze, pts, z, h, x = 0, y = 0) => C.add(this.acc(haze, name), pts, z, h, x, y);
    // a block of coastal apartments: varied heights, stepped tops, balcony bands
    const block = (x, w, h, haze, z, y = 0, name = 'CONC') => {
      accent(name, haze, h > 1.3 && w > 0.9 ? [[0, 0], [w, 0], [w, h * 0.85], [w * 0.7, h * 0.85], [w * 0.7, h], [w * 0.2, h], [w * 0.2, h * 0.9], [0, h * 0.9]] : rect(0, 0, w, h), z, h, x, y);
      for (let b = 1; b < Math.floor(h / 0.28); b++) land(haze, rect(0.05, b * 0.28, w - 0.1, 0.05), z + 0.02, 1, x, y);
    };
    const roofHouse = (x, w, h, haze, z, y = 0) => { accent('WHITE', haze, rect(0, 0, w, h), z, h, x, y); accent('ROOF', haze, [[-0.06, h], [w / 2, h + w * 0.28], [w + 0.06, h]], z + 0.01, h + w * 0.3, x, y); };
    const treeLine = (x0, x1, baseFn, n, haze, z, size = 0.34) => { for (let i = 0; i < n; i++) { const tx = x0 + hash1(i * 3.3 + x0) * (x1 - x0); land(haze, blob(0, 0, size * (0.8 + hash1(i * 5) * 0.8), size * (0.9 + hash1(i * 9) * 0.7), 8, i + x0), z, size * 2, tx, baseFn(tx) + 0.05); } };
    // ---- distant land: two hazy ridges the whole way, so the strip never reads as a flat grey band
    for (let i = -1; i < 6; i++) {
      const x0 = this.at(i, -60), x1 = this.at(i + 1, 60), seed = i * 17.3;
      const env = x => 0.5 + 0.5 * Math.sin((x - x0) / (x1 - x0) * 3.14);
      land(0, ridge(x0, x1, x => 0.45 + 1.25 * fbm1(x * 0.055 + seed, 3) * (0.55 + 0.6 * env(x)), 1), -9, 3);
      land(1, ridge(x0, x1, x => 0.3 + 0.85 * fbm1(x * 0.09 + seed + 40, 3) * (0.5 + 0.7 * env(x)), 1), -7, 3);
    }
    // ---- Bondi: beach-front apartments, sandstone headland and the Icebergs pool complex
    {
      const x = A(0, 0);
      land(2, ridge(x - 30, x + 22, p => 0.5 + 1.25 * Math.exp(-Math.pow((p - x - 9) / 9, 2)) + 0.18 * fbm1(p * 0.4, 2), 1), -5, 3);
      accent('SANDSTONE', 2, ridge(x + 2, x + 20, p => 0.1 + 0.95 * Math.exp(-Math.pow((p - x - 11) / 6, 2)) + 0.1 * fbm1(p * 1.2, 2), 0.5), -4.6, 1.2);
      treeLine(x + 4, x + 18, p => 0.95 * Math.exp(-Math.pow((p - x - 11) / 6, 2)) + 0.06, 6, 2, -4.3, 0.22);
      let hx = x - 25;
      for (let i = 0; i < 20; i++) { const w = 0.8 + hash1(i) * 0.8, h = 0.7 + hash1(i + 9) * 1.1; block(hx, w, h, 2, -4.2 + (i % 3) * 0.1, 0, i % 4 === 0 ? 'WHITE' : 'CONC'); hx += w + 0.12; }
      accent('SAND', 3, ridge(x - 30, x + 14, p => 0.07 + 0.03 * fbm1(p, 2), 1), -3.2, 0.2);   // beach
      // Icebergs: white clubhouse stepped into the rock, aqua ocean pool in front, flagpole
      const ix = x + 3.2;
      accent('WHITE', 3, [[0, 0.1], [4.8, 0.1], [4.8, 0.75], [4.2, 0.75], [4.2, 1.05], [3.1, 1.05], [3.1, 0.85], [2.2, 0.85], [2.2, 1.25], [0.9, 1.25], [0.9, 0.9], [0, 0.9]], -2.4, 1.3, ix, 0);
      land(3, rect(1.1, 0.95, 1.0, 0.22), -2.35, 1, ix, 0);        // dark glazing
      land(3, rect(3.3, 0.78, 0.8, 0.18), -2.35, 1, ix, 0);
      accent('AQUA', 3, rect(0.1, 0.0, 4.5, 0.14), -2.2, 0.2, ix, 0);   // the ocean pool
      accent('WHITE', 3, rect(0.1, 0.12, 4.5, 0.03), -2.19, 0.2, ix, 0);
      accent('DARK', 3, rect(0, 0, 0.04, 1.0), -2.3, 1, ix + 4.9, 1.1);
      accent('RED', 3, [[0.04, 0.75], [0.62, 0.65], [0.04, 0.55]], -2.29, 1, ix + 4.9, 1.1);
    }
    // ---- Cronulla: pale dunes, Kurnell tanks and stack, houses
    {
      const x = A(1, 0);
      accent('SAND', 2, ridge(x - 40, x - 6, p => 0.25 + 0.75 * Math.sin((p - x + 40) / 34 * 3.14) * (0.7 + 0.5 * fbm1(p * 0.2, 2)), 0.8), -4, 1.2);
      treeLine(x - 36, x - 8, p => 0.2 + 0.7 * Math.sin((p - x + 40) / 34 * 3.14), 8, 2, -3.8, 0.16);
      land(2, ridge(x - 6, x + 36, p => 0.25 + 0.5 * fbm1(p * 0.12, 2) + 0.6 * Math.exp(-Math.pow((p - x - 20) / 6, 2)), 0.8), -3, 2);
      let hx = x + 2; for (let i = 0; i < 8; i++) { const w = 0.6 + hash1(i + 4) * 0.5; roofHouse(hx, w, 0.45 + hash1(i + 15) * 0.4, 3, -2.5 + (i % 2) * 0.05, 0.1); hx += w + 0.18; }
      // Kurnell: silver oil tanks with a flare stack
      for (let i = 0; i < 3; i++) { const tx = x - 34 + i * 2.2; accent('CONC', 1, [[0, 0], [1.8, 0], [1.8, 0.65], [1.5, 0.82], [0.3, 0.82], [0, 0.65]], -4.2, 1, tx, 0); land(1, rect(0.1, 0.55, 1.6, 0.05), -4.15, 1, tx, 0); }
      accent('CONC', 1, [[0, 0], [0.07, 0], [0.05, 1.5], [0.02, 1.5]], -4.3, 1.6, x - 28.5, 0);
      accent('RED', 1, [[0, 0], [0.08, 0], [0.08, 0.1], [0, 0.1]], -4.25, 1.6, x - 28.52, 1.5);
    }
    // ---- Royal National Park sea cliffs and banksia scrub (Cronulla -> Stanwell Park)
    {
      const x0 = A(1, 60), x1 = A(2, -20);
      const hf = p => 0.7 + 1.0 * fbm1(p * 0.045, 3) + 0.35 * Math.sin((p - x0) * 0.2);
      land(2, ridge(x0, x1, hf, 0.8), -4, 3);
      accent('SANDSTONE', 2, ridge(x0, x1, p => 0.08 + 0.16 * fbm1(p * 0.6, 2), 1), -3.8, 0.4);     // pale cliff band at the base
      treeLine(x0, x1, hf, 30, 2, -3.5, 0.22);
    }
    // ---- Stanwell Park: forested escarpment, Bald Hill, and the Sea Cliff Bridge curving along the cliff face
    {
      const x = A(2, 0);
      const esc = p => 1.15 + 1.75 * fbm1(p * 0.03 + 4, 3) + 0.55 * Math.exp(-Math.pow((p - x + 10) / 9, 2));
      land(1, ridge(x - 60, x + 85, esc, 1), -6, 3.4);
      land(2, ridge(x - 60, x + 85, p => esc(p) * 0.72, 1), -5.4, 3.4);
      treeLine(x - 55, x + 80, p => esc(p) * 0.72, 40, 2, -5.2, 0.3);
      land(2, ridge(x - 45, x + 70, p => 0.3 + 0.55 * fbm1(p * 0.08, 3), 1), -3.6, 1.6);
      const bx = x + 30;
      // viaduct: curved deck on slim piers whose height follows the cliff toe
      const deckY = q => 0.62 + 0.1 * Math.sin(q * 0.55) + q * 0.004;
      const pts = []; for (let i = 0; i <= 28; i++) pts.push([i * 0.42, deckY(i * 0.42)]);
      const poly = pts.map(p => [p[0], p[1] + 0.07]).concat(pts.slice().reverse().map(p => [p[0], p[1] - 0.025]));
      accent('CONC', 2, poly, -2.3, 1, bx, 0);
      for (let i = 0; i <= 10; i++) { const px = i * 1.15; accent('CONC', 2, rect(-0.04, 0, 0.1, deckY(px) - 0.02), -2.25, 1, bx + px, 0); }
      land(2, [[0, 0], [12.5, 0], [12.5, 0.38], [8, 0.52], [3, 0.42], [0, 0.55]], -2.5, 1, bx - 0.4, 0);   // cliff toe rocks
    }
    // ---- Wollongong: escarpment, harbour breakwater lighthouse, city blocks, Port Kembla stacks and cranes
    {
      const x = A(3, 0);
      const esc = p => 1.4 + 1.3 * fbm1(p * 0.025 + 11, 3);
      land(1, ridge(x - 75, x + 60, esc, 1), -6, 3.4);
      land(2, ridge(x - 75, x + 60, p => esc(p) * 0.7, 1), -5.2, 3.4);
      land(2, ridge(x - 30, x + 10, p => 0.3 + 0.12 * fbm1(p, 2), 1), -3, 1);
      let hx = x - 29; for (let i = 0; i < 14; i++) { const w = 0.7 + hash1(i + 20) * 0.7; block(hx, w, 0.7 + hash1(i + 30) * 1.1, 2, -3.2 + (i % 3) * 0.1, 0.1, i % 3 === 0 ? 'WHITE' : 'CONC'); hx += w + 0.12; }
      // Breakwater lighthouse
      const lx = x - 1;
      accent('CONC', 3, rect(-2.4, 0, 4.8, 0.26), -2.1, 1, lx, 0);
      accent('WHITE', 3, [[-0.3, 0], [0.3, 0], [0.2, 1.25], [-0.2, 1.25]], -2, 1.3, lx + 1.2, 0.26);
      accent('RED', 3, rect(-0.26, 0.55, 0.52, 0.18), -1.98, 1, lx + 1.2, 0.26);
      accent('DARK', 3, [[-0.3, 0], [0.3, 0], [0.22, 0.26], [0, 0.4], [-0.22, 0.26]], -1.95, 0.5, lx + 1.2, 1.51);
      // Port Kembla: tall copper-smelter stack and twin stacks with plume, sheds, ship cranes
      const sx = x + 36;
      accent('CONC', 1, [[0, 0], [6.6, 0], [6.6, 0.55], [5, 0.7], [5, 0.9], [3.6, 0.9], [3.6, 0.55], [0, 0.55]], -4.2, 1, sx - 5.4, 0);
      for (const [dx, hgt, wd, red] of [[0, 3.1, 0.3, 1], [2.3, 2.5, 0.26, 0], [4.6, 2.1, 0.24, 0]]) {
        accent('STACK', 1, [[-wd / 2, 0], [wd / 2, 0], [wd * 0.34, hgt], [-wd * 0.34, hgt]], -4, 3.2, sx + dx, 0.4);
        if (red) for (let b = 0; b < 4; b++) accent('RED', 1, [[-wd / 2 + 0.01 + b * 0.0, 0.6 + b * 0.62], [wd / 2 - 0.01 - b * 0.0, 0.6 + b * 0.62], [wd * 0.45 - 0.01, 0.88 + b * 0.62], [-wd * 0.45 + 0.01, 0.88 + b * 0.62]].map(p => [p[0] * (1 - p[1] * 0.07), p[1]]), -3.95, 3.2, sx + dx, 0.4);
        accent('DARK', 1, rect(-wd * 0.36, hgt - 0.12, wd * 0.72, 0.12), -3.9, 3.2, sx + dx, 0.4);
      }
      land(1, [[0, 0], [1.2, 0], [1.2, 0.55], [0.6, 0.78], [0, 0.55]], -3.9, 1, sx + 6.4, 0.3);
      for (let i = 0; i < 4; i++) accent('CONC', 2, [[0, 0], [2.2, 0], [2.2, 0.5], [1.1, 0.8], [0, 0.5]], -3.4, 1, sx + 8 + i * 2.5, 0);
      // ship-to-shore gantry cranes (A-frame legs, boom, cab)
      for (let i = 0; i < 3; i++) { const cx = sx + 20 + i * 4.4; land(2, [[0, 0], [0.07, 0], [0.38, 0.95], [0.9, 0.95], [1.2, 0], [1.28, 0], [0.98, 1.0], [0.98, 1.12], [2.7, 1.2], [2.7, 1.24], [-1.6, 1.24], [-1.6, 1.2], [0.28, 1.12], [0.28, 1.0]], -2.8, 1.3, cx, 0.05); land(2, rect(0.2, 0.85, 0.7, 0.15), -2.75, 1, cx, 0.05); }
      // plume from the tall stack
      accent('WHITE', 0, blob(0, 0, 1.0, 0.5, 9, 1), -3.9, 1, sx + 0.8, 3.6);
      accent('WHITE', 0, blob(0, 0, 1.5, 0.45, 9, 2), -3.9, 1, sx + 2.2, 3.55);
    }
    // ---- Five Islands + Windang (between Wollongong and Shellharbour)
    {
      const x = A(4, -70);
      for (let i = 0; i < 5; i++) {
        const w = 5 + hash1(i * 4) * 6, h = 0.5 + hash1(i * 7) * 0.6;
        const f = p => h * Math.pow(Math.sin(p / w * 3.14), 0.65) + 0.05 * fbm1(p * 1.4 + i, 2);
        land(1, ridge(0, w, f, 0.4), -4.6 + i * 0.1, 1.2, x + i * 16 + hash1(i) * 6, 0);
        accent('SANDSTONE', 2, ridge(0, w, p => 0.08 + 0.12 * Math.sin(p / w * 3.14), 0.5), -4.5 + i * 0.1, 0.4, x + i * 16 + hash1(i) * 6, 0);   // pale rocky foot
        accent('GRASS', 1, ridge(w * 0.1, w * 0.9, p => f(p) * 0.99, 0.4).map(q => [q[0], q[1] === -0.5 ? f(q[0]) * 0.55 : q[1]]), -4.55 + i * 0.1, 1.2, x + i * 16 + hash1(i) * 6, 0);
      }
      land(2, ridge(0, 32, p => 0.12 + 0.3 * fbm1(p * 0.2, 2), 1), -3, 1, A(4, -10), 0);
    }
    // ---- Shellharbour: Bass Point headland with scrub
    {
      const x = A(4, 40);
      const hf = p => 0.4 + 1.3 * Math.exp(-Math.pow((p - x - 30) / 11, 2)) + 0.3 * fbm1(p * 0.15, 2);
      land(2, ridge(x, x + 55, hf, 0.8), -3.8, 2.2);
      accent('SANDSTONE', 2, ridge(x + 12, x + 48, p => 0.06 + 0.4 * Math.exp(-Math.pow((p - x - 30) / 9, 2)), 0.8), -3.7, 0.6);
      treeLine(x + 8, x + 48, hf, 14, 2, -3.5, 0.22);
    }
    // ---- Kiama: headland, white lighthouse, Norfolk pines, cottages
    {
      const x = A(5, 0);
      land(1, ridge(x - 50, x + 60, p => 0.7 + 0.8 * fbm1(p * 0.05 + 33, 3) + 0.75 * Math.exp(-Math.pow((p - x + 2) / 12, 2)), 0.8), -4, 2.5);
      const hf = p => 0.26 + 0.2 * fbm1(p * 0.3, 2) + 0.55 * Math.exp(-Math.pow((p - x) / 7, 2));
      land(2, ridge(x - 25, x + 22, hf, 0.5), -2.6, 1.4);
      accent('GRASS', 2, ridge(x - 18, x + 16, p => hf(p) * 0.98, 0.5).map(q => [q[0], q[1] === -0.5 ? hf(q[0]) * 0.7 : q[1]]), -2.55, 1.4);
      accent('SANDSTONE', 3, ridge(x - 25, x + 22, p => 0.05 + 0.1 * fbm1(p * 0.8, 2), 0.5), -2.4, 0.3);
      const lx = x - 1.5, ly = hf(lx) - 0.05;
      accent('WHITE', 3, [[-0.34, 0], [0.34, 0], [0.24, 1.15], [-0.24, 1.15]], -2, 1.3, lx, ly);
      accent('DARK', 3, rect(-0.36, 1.15, 0.72, 0.07), -1.95, 1.3, lx, ly);
      accent('DARK', 3, [[-0.2, 0], [0.2, 0], [0.2, 0.3], [0, 0.5], [-0.2, 0.3]], -1.9, 0.6, lx, ly + 1.2);
      accent('WHITE', 3, rect(-0.14, 0.05, 0.28, 0.2), -1.95, 0.4, lx, ly + 1.22);
      for (let i = 0; i < 7; i++) land(3, pine(0, 0, 0.9 + hash1(i + 3) * 0.35), -2.2, 1.3, x + 6 + i * 2.3, hf(x + 6 + i * 2.3) - 0.02);
      for (let i = 0; i < 5; i++) roofHouse(x + 7 + i * 2.7 + hash1(i) * 0.6, 0.55 + hash1(i + 2) * 0.3, 0.3 + hash1(i) * 0.2, 3, -2.1, hf(x + 7 + i * 2.7) - 0.05);
      this.blowholeX = x + 7;
    }
    C.build(this.layer);
    // distant gulls
    this.gulls = [];
    const gullGeo = new THREE.ShapeGeometry(new THREE.Shape([[-0.28, 0], [-0.1, 0.1], [0, 0.03], [0.1, 0.1], [0.28, 0], [0.1, 0.05], [0, -0.03], [-0.1, 0.05]].map(p => new THREE.Vector2(...p))));
    gullGeo.setAttribute('aT', new THREE.BufferAttribute(new Float32Array(gullGeo.attributes.position.count), 1));
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(gullGeo, this.mats[3]);
      m.userData = { x: this.at(i, 20 + hash1(i) * 60), y: 1.7 + hash1(i * 3) * 1.1, s: 0.4 + hash1(i * 5) * 0.4, ph: hash1(i * 9) * 6 };
      this.layer.add(m); this.gulls.push(m);
    }
  }

  buildLane() {
    const basic = c => clipToWaterline(new THREE.MeshBasicMaterial({ color: c }));
    this.darkMat = basic(0x1b2a33);
    this.masts = [];
    for (let k = 0; k < 6; k++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.28, 0.62, 12), basic(0xf1b01c));
      body.position.y = 0.0;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.255, 0.265, 0.1, 12), basic(0x1b2a33)); band.position.y = 0.04;
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.9, 6), this.darkMat); mast.position.y = 0.7;
      const light = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe9a0 })); light.position.y = 1.18;
      g.add(body, band, mast, light); g.position.set(stationX(k), 0.06, 0.5);
      g.userData.light = light;
      this.live.add(g); this.masts.push(g);
    }
    // surfers pool
    this.surfers = [];
    const sk = basic(0x172229);
    for (let i = 0; i < 10; i++) {
      const g = new THREE.Group();
      const board = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 1.5, 3, 8), basic([0xf2f2ee, 0xf2b01c, 0x2a8fd0, 0xe84a3a][i % 4])); board.rotation.z = Math.PI / 2; board.position.y = 0.04;
      const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.34, 3, 8), sk); torso.position.set(-0.06, 0.34, 0);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.095, 10, 8), sk); head.position.set(0.0, 0.7, 0);
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.34, 3, 6), sk); arm.position.set(0.18, 0.4, 0); arm.rotation.z = -1.1;
      g.add(board, torso, head, arm); g.visible = false;
      this.live.add(g); this.surfers.push(g);
    }
    this.ship = this.buildShipAbove();
    this.ship.visible = false;
    this.live.add(this.ship);
    // Kiama blowhole spout: stack of fading blobs
    this.spout = [];
    const bm = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthTest: false });
    for (let i = 0; i < 9; i++) { const m = new THREE.Mesh(new THREE.CircleGeometry(0.2, 10), bm.clone()); m.renderOrder = 5; this.live.add(m); this.spout.push(m); }
  }

  /** Container ship above the waterline: black topsides with sheer and flare, bulwark, stacked containers, white bridge, funnel, mast. One draw call. */
  buildShipAbove() {
    const pos = [], col = [], idx = [];
    let n = 0;
    const poly = (pts, c0, c1 = c0, z = 0) => {
      const ys = pts.map(p => p[1]), lo = Math.min(...ys), hi = Math.max(...ys);
      const tri = THREE.ShapeUtils.triangulateShape(pts.map(p => new THREE.Vector2(p[0], p[1])), []);
      for (const p of pts) { const t = hi > lo ? (p[1] - lo) / (hi - lo) : 0; pos.push(p[0], p[1], z); col.push(c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t); }
      for (const t of tri) idx.push(n + t[0], n + t[1], n + t[2]);
      n += pts.length;
    };
    const rc = (x, y, w, h, c0, c1, z) => poly(rect(x, y, w, h), c0, c1, z);
    const L = 38, S = (r, g, b) => [r, g, b];
    // hull topsides: raked bow, sheer rising forward, flat transom
    poly([[-L / 2 - 0.9, 0], [-L / 2 + 0.2, 0.0], [L / 2 + 0.1, 0], [L / 2 + 0.1, 0.78], [4, 0.66], [-8, 0.62], [-L / 2 + 3, 0.78], [-L / 2 + 0.6, 0.98], [-L / 2 - 0.9, 1.02], [-L / 2 - 0.55, 0.45]], S(0.035, 0.04, 0.05), S(0.11, 0.12, 0.14), 0);
    rc(-L / 2 + 1.5, 0.0, L - 1.4, 0.07, S(0.42, 0.08, 0.06), S(0.46, 0.09, 0.07), 0.01);        // boot-topping band at the waterline
    rc(-L / 2 - 0.5, 0.98, L + 0.4, 0.05, S(0.5, 0.52, 0.5), S(0.55, 0.57, 0.55), 0.02);         // rail
    // containers: bays of 40 ft boxes, ragged stack heights, real-world box colours
    const palette = [S(0.1, 0.27, 0.5), S(0.7, 0.18, 0.1), S(0.16, 0.42, 0.28), S(0.62, 0.62, 0.6), S(0.82, 0.58, 0.12), S(0.35, 0.18, 0.38), S(0.78, 0.78, 0.76), S(0.45, 0.25, 0.14), S(0.12, 0.2, 0.36)];
    for (let c = 0; c < 14; c++) {
      const bx = -15.6 + c * 1.76;
      const tiers = c % 5 === 3 ? 1 : 2;
      for (let t = 0; t < tiers; t++) {
        const k = palette[Math.floor(hash1(c * 13 + t * 5.7) * palette.length)];
        const y = 0.66 + t * 0.34;
        rc(bx, y, 1.7, 0.32, [k[0] * 0.8, k[1] * 0.8, k[2] * 0.8], [k[0] * 1.08, k[1] * 1.08, k[2] * 1.08], 0.05 + t * 0.001);
        for (let r = 0; r < 6; r++) rc(bx + 0.22 + r * 0.25, y + 0.02, 0.025, 0.28, [k[0] * 0.55, k[1] * 0.55, k[2] * 0.55], [k[0] * 0.7, k[1] * 0.7, k[2] * 0.7], 0.06);   // corrugation ribs
        rc(bx, y + 0.3, 1.7, 0.02, [k[0] * 0.5, k[1] * 0.5, k[2] * 0.5], [k[0] * 0.5, k[1] * 0.5, k[2] * 0.5], 0.065);
      }
    }
    // deckhouse: layered white accommodation block, bridge wings, dark window bands, mast and radar
    const W = S(0.92, 0.93, 0.91), Wd = S(0.74, 0.76, 0.76);
    rc(10.8, 0.66, 4.3, 0.34, Wd, W, 0.08);
    rc(11.4, 1.0, 3.6, 0.3, Wd, W, 0.085);
    rc(11.8, 1.3, 3.2, 0.32, Wd, W, 0.09);
    rc(11.4, 1.62, 3.9, 0.24, Wd, W, 0.095);                                       // bridge deck with wings
    rc(11.6, 1.67, 3.5, 0.14, S(0.05, 0.1, 0.14), S(0.1, 0.18, 0.24), 0.1);        // bridge windows
    for (let w = 0; w < 3; w++) rc(11.9, 1.06 + w * 0.3, 2.9, 0.1, S(0.06, 0.1, 0.14), S(0.1, 0.16, 0.2), 0.1);
    rc(13.2, 1.86, 0.05, 0.3, S(0.2, 0.22, 0.24), S(0.28, 0.3, 0.32), 0.1);       // mast
    rc(12.95, 2.1, 0.55, 0.05, S(0.2, 0.22, 0.24), S(0.28, 0.3, 0.32), 0.1);      // radar
    // funnel with company colour band
    poly([[15.5, 0.66], [17.2, 0.66], [16.9, 1.6], [15.8, 1.6]], S(0.55, 0.12, 0.08), S(0.7, 0.18, 0.1), 0.07);
    rc(15.62, 1.28, 1.46, 0.22, S(0.9, 0.9, 0.86), S(0.95, 0.95, 0.9), 0.075);
    rc(15.8, 1.55, 1.1, 0.08, S(0.08, 0.08, 0.08), S(0.1, 0.1, 0.1), 0.075);
    // forecastle: mooring winch and bow rail
    rc(-17.2, 0.98, 1.0, 0.2, S(0.45, 0.46, 0.44), S(0.55, 0.56, 0.54), 0.05);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, clipToWaterline(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })));
    m.frustumCulled = false;
    const grp = new THREE.Group(); grp.add(m);
    return grp;
  }

  /** Waterline: a bright, rippling meniscus right at the cut, drawn over everything in the strip. */
  buildWaterline() {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      uniforms: { uTop: { value: new THREE.Color(0x9cecee) }, ...SKY_CLIP, uTime: U.uTime },
      transparent: true, depthTest: false, depthWrite: false,
      vertexShader: `void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: `${NOISE_ONLY}${SKY_CLIP_GLSL}
        uniform vec3 uTop;
        void main(){
          float d = (gl_FragCoord.y - skyEdge()) / uDpr;               // css px above the rippling line
          float x = gl_FragCoord.x / uDpr;
          float n = vnoise(vec2(x * 0.05 + uTime * 0.6, d * 0.1));
          // foam crest just above the line, bright glow just below it (light entering the surface)
          float crest = smoothstep(-0.6, 0.6, d) * (1.0 - smoothstep(0.6, 3.6 + n * 2.5, d)) * (0.5 + 0.6 * n);
          float glow = (1.0 - smoothstep(-9.0, 0.0, d)) * smoothstep(-12.0, -0.5, d) * (0.38 + 0.25 * sin(x * 0.045 + uTime * 1.7) * sin(x * 0.013 - uTime));
          vec3 col = mix(uTop * 1.4 + vec3(0.25), vec3(1.0), 0.6);
          float a = clamp(crest * 0.85 + glow, 0.0, 0.9);
          gl_FragColor = vec4(col, a);
        }`,
    }));
    m.frustumCulled = false; m.renderOrder = 100;
    this.scene.add(m); this.meniscus = m;
  }

  /** Sync with game/palette each frame. bandW, bandH: band size in world units (padUnits extra below the waterline). */
  update(camX, bandW, bandH, pal, padUnits = 0.3) {
    const cam = this.cam;
    cam.left = -bandW / 2; cam.right = bandW / 2; cam.top = bandH; cam.bottom = -padUnits; cam.updateProjectionMatrix();
    this.layer.position.x = -camX * PAR;
    this.live.position.x = -camX;
    this.sky.material.uniforms.uTop.value.copy(pal.skyTop);
    this.sky.material.uniforms.uHor.value.copy(pal.skyHor);
    this.meniscus.material.uniforms.uTop.value.copy(pal.top);
    const green = new THREE.Color(0.1, 0.25, 0.17);
    const all = [...this.mats, ...Object.values(this.accMats)];
    for (const m of all) { m.uniforms.uHor.value.copy(pal.skyHor); }
    for (const m of this.mats) m.uniforms.uLand.value.copy(pal.land).lerp(green, 0.7).multiplyScalar(0.8);
    const t = U.uTime.value;
    for (const g of this.gulls) { const u = g.userData; g.position.set(u.x + Math.sin(t * 0.2 + u.ph) * 2, u.y + Math.sin(t * 0.9 + u.ph) * 0.12, -1); g.scale.set(u.s, u.s * (0.6 + 0.4 * Math.sin(t * 3 + u.ph)), 1); }
    // blowhole spout, only near Kiama
    const near = Math.abs(camX * PAR - this.blowholeX) < 20;
    this.spout.forEach((m, i) => {
      m.visible = near;
      if (!near) return;
      const ph = ((t * 0.5 + i * 0.11) % 1);
      const burst = Math.max(0, Math.sin(t * 0.45) * 1.3 - 0.2);
      m.position.set(this.blowholeX - camX * PAR + Math.sin(i * 2.1 + t) * 0.12 * ph * 2 + camX, 0.6 + ph * (1.4 * burst + 0.2), -1.5);
      m.scale.setScalar(0.5 + ph * 1.2); m.material.opacity = 0.55 * (1 - ph) * Math.min(1, burst * 2);
    });
  }
}

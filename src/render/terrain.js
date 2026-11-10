// Seabed terrain chunks plus instanced kelp and rocks. One chunk = 220 world units; only nearby chunks are visible.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { floorY, rockiness, FIRST_STATION_X, LEG_LEN, END_X } from '../logic/route.js';
import { fbm1, hash1, smooth, clamp } from '../logic/rng.js';
import { kelp, seagrass, shell } from '../art/kelp.js';
import { reefRock } from '../art/reefRock.js';
import { makeMaterial } from './materials.js';
import { makeRockMaterial } from './rockMaterial.js';
import { U } from './uniforms.js';
import { COMMON_FRAG } from './glsl.js';

export const CHUNK = 220;
const Z_ROWS = [20, 13, 8.5, 5.5, 3.2, 1.5, 0, -1.5, -3.2, -5.5, -8, -11, -15, -19.5, -25, -31, -38, -46, -55, -66, -79, -94, -112, -134, -160];

/** Seabed height anywhere in the world (z > 0 is towards the camera). Matches floorY at the play lane. */
export function terrainY(x, z) {
  const base = floorY(x);
  if (z >= 0) return base - Math.min(z, 24) * 0.085;
  const d = -z, rock = rockiness(x);
  const far = smooth(0, 38, d);
  const hills = (fbm1(x * 0.021 + d * 0.027 + 7.3, 3) - 0.45) * (3.4 + rock * 9.5) * far;
  const mounds = Math.max(0, fbm1(x * 0.06 + d * 0.05 + 21, 2) - 0.55) * 8 * rock * smooth(3, 20, d);
  return base + d * 0.058 + hills + mounds;
}
/** How much hard reef the seabed shows at x (0 sand .. 1 reef). Leg 1 (Bondi-Cronulla) is rippled sand: reef is saved for later legs. */
export function reefAt(x) {
  const leg = (x - FIRST_STATION_X) / LEG_LEN;
  return rockiness(x) * (0.07 + 0.93 * smooth(0.75, 1.9, leg));
}
const rockAt = (x, z) => clamp(reefAt(x) * 0.8 + (z < 0 ? Math.min(0.25, -z * 0.006) * (0.2 + reefAt(x)) : 0), 0, 1);

const TVERT = /* glsl */`
attribute float aRock; varying vec3 vWP; varying vec3 vN; varying float vRock;
void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vWP = wp.xyz; vN = normalize(mat3(modelMatrix) * normal); vRock = aRock; gl_Position = projectionMatrix * viewMatrix * wp; }`;
const TFRAG = /* glsl */`
${COMMON_FRAG}
uniform vec3 uSandColor; uniform vec3 uRockColor; uniform vec3 uKelpColor;
varying vec3 vWP; varying vec3 vN; varying float vRock;
void main(){
  vec2 q = vWP.xz;
  float n = fbm2(q * 0.32), n2 = fbm2(q * 1.7 + 9.0), n3 = vnoise(q * 7.0);
  float mask = smoothstep(0.40, 0.56, vRock * 0.95 + (n - 0.5) * 0.75);
  // wave-formed ripples: long crests that wander, with a second harmonic so they are not a perfect sine
  float warp = fbm2(q * vec2(0.22, 0.45) + 3.0) * 7.0;
  float ph = q.x * 2.3 + warp + sin(q.y * 0.33 + n * 3.0) * 1.6;
  float rip = sin(ph), rip2 = sin(ph * 2.07 + 1.3 + n2 * 3.0);
  float ripH = rip * 0.65 + rip2 * 0.35;
  vec3 sand = uSandColor * 1.12 * (0.78 + 0.26 * (ripH * 0.5 + 0.5)) * (0.88 + 0.22 * n2);
  sand = mix(sand, sand * vec3(0.8, 0.8, 0.82), smoothstep(0.1, -0.9, ripH) * 0.45);      // damp, finer, greyer troughs
  sand *= 0.95 + 0.1 * n3;
  float fleck = vnoise(q * 46.0);                                                            // shell grit and dark mineral grains
  sand += vec3(0.08, 0.075, 0.06) * smoothstep(0.84, 0.95, fleck) - vec3(0.05) * smoothstep(0.8, 0.9, vnoise(q * 38.0 + 7.0)) * 0.6;
  sand = mix(sand, sand * vec3(0.78, 0.74, 0.66), smoothstep(0.55, 0.8, n) * 0.35);        // darker patches
  vec3 rock = uRockColor * (0.55 + 0.55 * n2) * (0.88 + 0.24 * sin(vWP.y * 4.0 + n * 6.0));
  rock = mix(rock, uKelpColor * 0.3, smoothstep(0.55, 0.8, n) * 0.5);
  rock = mix(rock, vec3(0.34, 0.2, 0.22) * (0.7 + 0.5 * n2), smoothstep(0.7, 0.85, n2) * 0.25); // coralline pink
  vec3 albedo = mix(sand, rock, mask);
  vec3 N = normalize(vN);
  N = normalize(N + vec3(cos(ph) * 0.2 + cos(ph * 2.07 + 1.3) * 0.12, 0.0, sin(q.y * 0.33) * 0.03) * (1.0 - mask) + (vec3(n2, 0.0, n3) - 0.5) * 0.25 * mask);
  vec3 col = underwater(albedo, N, vWP, mix(1.1, 0.7, mask), 0.0, 1.0);
  gl_FragColor = vec4(col, 1.0);
}`;

function buildTerrainChunk(x0, qualityRes) {
  const nx = qualityRes, nz = Z_ROWS.length;
  const pos = new Float32Array(nx * nz * 3), rock = new Float32Array(nx * nz), idx = [];
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = x0 + (i / (nx - 1)) * CHUNK, z = Z_ROWS[j], k = j * nx + i;
    pos[k * 3] = x; pos[k * 3 + 1] = terrainY(x, z); pos[k * 3 + 2] = z; rock[k] = rockAt(x, z);
  }
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aRock', new THREE.BufferAttribute(rock, 1));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

const SHELL_COLS = [[0.95, 0.9, 0.8], [0.92, 0.62, 0.56], [0.9, 0.55, 0.32], [0.62, 0.56, 0.68], [1, 1, 0.97], [0.85, 0.78, 0.6]].map(c => new THREE.Color(...c));
const KELP_TINT = new THREE.Color(1, 1, 1), KELP_DARK = new THREE.Color(0.5, 0.52, 0.48);

export class Terrain {
  constructor(scene, tier) {
    this.scene = scene; this.tier = tier;
    this.chunks = [];
    const res = tier.terrainRes;
    const detail = tier.name !== 'low';
    this.rocks = [1, 2, 5, 9].map(seed => reefRock(seed, tier.rockDetail, detail));
    this.rocksFar = [1, 2, 5, 9].map(seed => reefRock(seed, Math.max(1, tier.rockDetail - 1), false));
    this.kelpGeos = [kelp(3), kelp(8), kelp(21)];
    this.grassGeos = [seagrass(4), seagrass(11)];
    this.shellGeo = shell(7);
    this.matTerrain = new THREE.ShaderMaterial({
      vertexShader: TVERT, fragmentShader: TFRAG, side: THREE.DoubleSide,
      uniforms: { ...U },
    });
    this.matRock = makeRockMaterial();
    this.matDetail = makeMaterial({ vertexColors: true, caustic: 0.5, rim: 0.1, fogMult: 1.2 });
    this.matKelp = makeMaterial({ vertexColors: true, tint: 0xffffff, sway: 0.1, kelp: true, side: THREE.DoubleSide, caustic: 0.35, rim: 0.2, fogMult: 1.0 });
    this.matGrass = makeMaterial({ vertexColors: true, tint: 0xffffff, sway: 0.07, kelp: true, side: THREE.DoubleSide, caustic: 0.5, rim: 0.15 });
    this.matShell = makeMaterial({ vertexColors: true, tint: 0xffffff, caustic: 0.8, rim: 0.2, fogMult: 1.0 });
    const nChunks = Math.ceil((END_X + 400) / CHUNK) + 1;
    for (let c = -1; c < nChunks; c++) this.chunks.push(this.buildChunk(c, res));
    this.update(0);
  }

  buildChunk(c, res) {
    const x0 = c * CHUNK;
    const group = new THREE.Group();
    const terrain = new THREE.Mesh(buildTerrainChunk(x0, res), this.matTerrain);
    terrain.frustumCulled = false;
    group.add(terrain);
    const rnd = i => hash1(c * 1000 + i);
    const kMul = this.tier.kelpMul, rMul = this.tier.rockMul;
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), pv = new THREE.Vector3(), eu = new THREE.Euler();
    const addInst = (geo, mat, arr, colors) => {
      if (!arr.length) return null;
      const im = new THREE.InstancedMesh(geo, mat, arr.length);
      arr.forEach((m, i) => im.setMatrixAt(i, m));
      if (colors) { colors.forEach((col, i) => im.setColorAt(i, col)); }
      im.frustumCulled = false; group.add(im); return im;
    };
    // ---- rocks: outcrops with satellites; sparse and small on the sandy first leg, big ledged reef later
    const rocksNear = [[], [], [], []], rocksFar = [[], [], [], []], onRock = [];
    const nRocks = Math.round(115 * rMul);
    for (let i = 0; i < nRocks; i++) {
      const x = x0 + rnd(i * 7) * CHUNK;
      const reef = reefAt(x);
      const patch = 0.35 + 1.15 * fbm1(x * 0.028 + 70, 2);
      if (rnd(i * 7 + 1) > (0.05 + reef * 0.95) * patch * 0.62 + (reef < 0.15 ? 0.045 : 0)) continue;   // sandy leg: just a few low rocks
      const zb = rnd(i * 7 + 2);
      const zFront = rnd(i * 7 + 8) < 0.05 && reef > 0.35;
      const z = zFront ? 4 + rnd(i * 7 + 3) * 10 : zb < 0.5 ? -(2.5 + rnd(i * 7 + 3) * 11) : zb < 0.85 ? -(13 + rnd(i * 7 + 3) * 32) : -(44 + rnd(i * 7 + 3) * 38);
      const big = rnd(i * 7 + 9) < 0.14 && reef > 0.35;
      const scaleBy = 0.4 + 0.85 * reef;                            // sand: pebbles and low flat rocks; reef: boulders
      const size = (0.7 + Math.pow(rnd(i * 7 + 4), 1.4) * 2.2) * scaleBy * (big ? 1.7 : 1) * (1 + (z < -15 ? -z * 0.028 : 0)) * (zFront ? 1.15 : 1);
      const stretch = 1 + rnd(i * 7 + 6) * (big ? 1.2 : 0.7);
      const sy = (0.7 + rnd(i) * 0.6) * (reef < 0.25 ? 0.7 : 1);
      const k = i % 4;
      const y = terrainY(x, z) + size * sy * 0.1;
      eu.set((rnd(i * 7 + 10) - 0.5) * 0.18, rnd(i * 7 + 5) * 6.28, (rnd(i * 7 + 11) - 0.5) * 0.18);
      q.setFromEuler(eu);
      s.set(size * stretch, size * sy, size);
      M.compose(pv.set(x, y, z), q, s);
      (z > -18 && size * stretch < 3.4 && this.tier.name !== 'low' ? rocksNear : rocksFar)[k].push(M.clone());
      if (size > 1.5 && reef > 0.45 && z < -1 && z > -48) onRock.push({ x, z, top: y + this.rocks[k].topY * size * sy, w: size * stretch });
    }
    rocksNear.forEach((arr, k) => {
      addInst(this.rocks[k].geo, this.matRock, arr);
      if (this.rocks[k].details) addInst(this.rocks[k].details, this.matDetail, arr);
    });
    rocksFar.forEach((arr, k) => addInst(this.rocksFar[k].geo, this.matRock, arr));
    // ---- kelp: dense beds on the reef legs (patches with clearings), a few on top of the big rocks, a few dark ones in front
    const kelpBy = [[], [], []], kelpCol = [[], [], []];
    const pushKelp = (i, x, y, z, sc, dark) => {
      eu.set((rnd(i * 13 + 120) - 0.5) * 0.2, rnd(i * 13 + 105) * 6.28, 0); q.setFromEuler(eu);
      M.compose(pv.set(x, y, z), q, s.set(sc * (0.9 + rnd(i * 13 + 121) * 0.2), sc * (0.85 + rnd(i * 13 + 122) * 0.35), sc));
      const k = i % 3; kelpBy[k].push(M.clone()); kelpCol[k].push(dark ? KELP_DARK : KELP_TINT);
    };
    const nKelp = Math.round(260 * kMul);
    for (let i = 0; i < nKelp; i++) {
      const x = x0 + rnd(i * 11 + 100) * CHUNK;
      const leg = (x - FIRST_STATION_X) / LEG_LEN;
      const dens = clamp(0.1 + 0.25 * smooth(0.6, 1.2, leg) + 0.7 * smooth(1.4, 1.9, leg) - 0.8 * smooth(2.7, 3.2, leg) + 0.85 * smooth(3.55, 4.0, leg) - 0.3 * smooth(4.7, 5.1, leg), 0, 1) * smooth(0.45, 1.1, leg);
      const front = rnd(i * 11 + 102) < 0.07 && dens > 0.45;
      const zr = rnd(i * 11 + 103);
      const z = front ? 5 + zr * 8 : -(0.6 + Math.pow(zr, 1.15) * 40);
      const bed = smooth(0.36, 0.6, fbm1(x * 0.021 + z * 0.012 + 55, 3));
      if (rnd(i * 11 + 101) > dens * (front ? 1 : bed) * (0.3 + reefAt(x) * 0.9)) continue;
      const sc = (front ? 2.6 + rnd(i * 11 + 104) * 1.0 : 1.6 + rnd(i * 11 + 104) * 1.0) * (z < -22 ? 1.2 : 1);
      pushKelp(i, x, terrainY(x, z) - 0.05, z, sc, front);
    }
    onRock.slice(0, Math.round(26 * kMul)).forEach((r, j) => { for (let m = 0; m < 2; m++) pushKelp(5000 + j * 3 + m, r.x + (rnd(j * 9 + m) - 0.5) * r.w * 0.5, r.top - 0.15, r.z + (rnd(j * 9 + m + 4) - 0.5) * r.w * 0.4, 1.35 + rnd(j * 5 + m) * 0.8, false); });
    kelpBy.forEach((arr, k) => addInst(this.kelpGeos[k], this.matKelp, arr, kelpCol[k]));
    // ---- seagrass patches on the sandy legs, and shells scattered over the sand
    const grass = [[], []];
    const nGrass = Math.round(200 * Math.min(1, kMul * 1.4));
    for (let i = 0; i < nGrass; i++) {
      const x = x0 + rnd(i * 17 + 300) * CHUNK;
      const leg = (x - FIRST_STATION_X) / LEG_LEN;
      const g = (1 - smooth(0.8, 1.6, leg)) + 0.25 * smooth(3.0, 3.4, leg) * (1 - smooth(3.9, 4.2, leg));
      const patch = smooth(0.5, 0.64, fbm1(x * 0.034 + 123, 2));
      if (rnd(i * 17 + 301) > patch * g * (1 - reefAt(x) * 1.6) * 0.9) continue;
      const z = rnd(i * 17 + 302) < 0.1 ? 3 + rnd(i * 17 + 303) * 8 : -(0.7 + Math.pow(rnd(i * 17 + 303), 1.3) * 26);
      eu.set(0, rnd(i * 17 + 304) * 6.28, 0); q.setFromEuler(eu);
      const sc = 1.25 + rnd(i * 17 + 305) * 0.9;
      M.compose(pv.set(x, terrainY(x, z) - 0.03, z), q, s.set(sc, sc * (0.8 + rnd(i * 17 + 306) * 0.5), sc));
      grass[i % 2].push(M.clone());
    }
    grass.forEach((arr, k) => addInst(this.grassGeos[k], this.matGrass, arr));
    const shells = [], shellCols = [];
    const nShell = Math.round(300 * Math.max(0.35, Math.min(1, kMul + 0.25)));
    for (let i = 0; i < nShell; i++) {
      const x = x0 + rnd(i * 19 + 500) * CHUNK;
      if (rnd(i * 19 + 501) > 0.08 + (1 - reefAt(x) * 1.4) * 0.55) continue;
      const z = rnd(i * 19 + 502) < 0.2 ? 1 + rnd(i * 19 + 503) * 10 : -(0.3 + Math.pow(rnd(i * 19 + 503), 1.4) * 24);
      eu.set((rnd(i * 19 + 506) - 0.5) * 0.5, rnd(i * 19 + 504) * 6.28, (rnd(i * 19 + 507) - 0.5) * 0.5); q.setFromEuler(eu);
      const sz = 0.16 + Math.pow(rnd(i * 19 + 505), 2) * 0.3;
      M.compose(pv.set(x, terrainY(x, z) + 0.01, z), q, s.setScalar(sz));
      shells.push(M.clone()); shellCols.push(SHELL_COLS[Math.floor(rnd(i * 19 + 508) * SHELL_COLS.length)]);
    }
    addInst(this.shellGeo, this.matShell, shells, shellCols);
    group.visible = false;
    group.userData.cx = x0 + CHUNK / 2;
    this.scene.add(group);
    return group;
  }

  update(camX) {
    for (const g of this.chunks) g.visible = Math.abs(g.userData.cx - camX) < CHUNK / 2 + 140;
  }
}

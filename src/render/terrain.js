// Seabed terrain chunks plus instanced kelp and rocks. One chunk = 220 world units; only nearby chunks are visible.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { floorY, rockiness, FIRST_STATION_X, LEG_LEN, END_X } from '../logic/route.js';
import { fbm1, hash1, smooth, clamp } from '../logic/rng.js';
import { kelp, crayweed } from '../art/kelp.js';
import { makeMaterial } from './materials.js';
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
const rockAt = (x, z) => clamp(rockiness(x) * 0.75 + (z < 0 ? Math.min(0.25, -z * 0.006) : 0), 0, 1);

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
  float rip = sin(q.x * 2.4 + n * 7.0 + q.y * 0.55) * 0.5 + 0.5;
  vec3 sand = uSandColor * 1.15 * (0.86 + 0.18 * rip) * (0.9 + 0.2 * n2);
  sand *= 0.96 + 0.08 * n3;
  vec3 rock = uRockColor * (0.8 + 0.7 * n2) * (0.88 + 0.24 * sin(vWP.y * 4.0 + n * 6.0));
  rock = mix(rock, uKelpColor * 0.5, smoothstep(0.55, 0.8, n) * 0.45);
  rock = mix(rock, vec3(0.62, 0.38, 0.4) * (0.7 + 0.5 * n2), smoothstep(0.7, 0.85, n2) * 0.25); // coralline pink
  vec3 albedo = mix(sand, rock, mask);
  vec3 N = normalize(vN);
  N = normalize(N + vec3(cos(q.x * 2.4 + n * 7.0) * 0.07 * (1.0 - mask), 0.0, 0.0) + (vec3(n2, 0.0, n3) - 0.5) * 0.25 * mask);
  vec3 col = underwater(albedo, N, vWP, mix(1.0, 0.7, mask), 0.0, 1.0);
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

function rockGeometry(seed, detail) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position, col = new Float32Array(p.count * 3), v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const d = v.clone().normalize();
    const n = fbm1(d.x * 2.1 + seed * 3.7 + d.y * 1.3 + d.z * 2.9, 3);
    const n2 = fbm1(d.x * 6 + d.z * 6 + seed, 2);
    const r = 0.7 + 0.55 * n + 0.08 * n2;
    v.copy(d).multiplyScalar(r);
    v.y *= 0.72;
    if (v.y < -0.3) v.y = -0.3 + (v.y + 0.3) * 0.2; // flat-ish bottom buried in the sand
    p.setXYZ(i, v.x, v.y, v.z);
    const shade = 0.42 + 0.42 * n2 + 0.1 * d.y;
    const alg = Math.max(0, fbm1(d.x * 3.3 + d.y * 2 + seed * 9, 2) - 0.55) * 2.2;
    col[i * 3] = shade * (0.88 + 0.5 * alg * 0.6); col[i * 3 + 1] = shade * (0.9 + 0.35 * alg); col[i * 3 + 2] = shade * (0.9 - 0.3 * alg);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  return g;
}

export class Terrain {
  constructor(scene, tier) {
    this.scene = scene; this.tier = tier;
    this.chunks = [];
    const res = tier.terrainRes;
    // shared geometry
    this.rockGeos = [rockGeometry(1, tier.rockDetail), rockGeometry(2, tier.rockDetail), rockGeometry(5, tier.rockDetail)];
    this.kelpGeos = [kelp(3), kelp(8), kelp(21)];
    this.crayGeo = crayweed(5);
    this.matTerrain = new THREE.ShaderMaterial({
      vertexShader: TVERT, fragmentShader: TFRAG, side: THREE.DoubleSide,
      uniforms: { ...U },
    });
    this.matRock = makeMaterial({ vertexColors: true, tint: 0xd6cdbd, caustic: 0.4, rim: 0.1 });
    this.matKelp = makeMaterial({ vertexColors: true, tint: 0xffffff, sway: 0.075, side: THREE.DoubleSide, caustic: 0.5, rim: 0.3 });
    this.matKelpFront = makeMaterial({ vertexColors: true, tint: 0x6d7a63, sway: 0.09, side: THREE.DoubleSide, caustic: 0.1, rim: 0.2, fogMult: 0.5 });
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
    // rocks: clusters, more on reef
    const rocksBy = [[], [], []];
    const nRocks = Math.round(70 * rMul);
    for (let i = 0; i < nRocks; i++) {
      const x = x0 + rnd(i * 7) * CHUNK;
      if (rnd(i * 7 + 1) > 0.18 + rockiness(x) * 0.95) continue;
      const zFront = rnd(i * 7 + 2) < 0.07;
      const z = zFront ? 4 + rnd(i * 7 + 3) * 10 : -(2.5 + Math.pow(rnd(i * 7 + 3), 1.4) * 70);
      const size = (0.7 + rnd(i * 7 + 4) * 2.4) * (1 + (z < -15 ? -z * 0.03 : 0)) * (zFront ? 1.2 : 1);
      const y = terrainY(x, z) + size * 0.12;
      eu.set(0, rnd(i * 7 + 5) * 6.28, 0);
      q.setFromEuler(eu);
      s.set(size * (1 + rnd(i * 7 + 6) * 0.8), size * (0.8 + rnd(i) * 0.7), size);
      M.compose(pv.set(x, y, z), q, s);
      rocksBy[i % 3].push(M.clone());
    }
    rocksBy.forEach((arr, k) => {
      if (!arr.length) return;
      const im = new THREE.InstancedMesh(this.rockGeos[k], this.matRock, arr.length);
      arr.forEach((m, i) => im.setMatrixAt(i, m));
      im.frustumCulled = false; group.add(im);
    });
    // kelp: mid-ground behind the lane plus a few dark foreground plants in front of it
    const kelpBy = [[], [], []], kelpFront = [[], [], []];
    const nKelp = Math.round(150 * kMul);
    for (let i = 0; i < nKelp; i++) {
      const x = x0 + rnd(i * 11 + 100) * CHUNK;
      const leg = (x - FIRST_STATION_X) / LEG_LEN;
      const dens = clamp(0.1 + 0.2 * smooth(0.6, 1.2, leg) + 0.65 * smooth(1.4, 1.9, leg) - 0.75 * smooth(2.7, 3.2, leg) + 0.8 * smooth(3.55, 4.0, leg) - 0.35 * smooth(4.7, 5.1, leg), 0, 1);
      if (rnd(i * 11 + 101) > dens * (0.35 + rockiness(x) * 0.8)) continue;
      const front = rnd(i * 11 + 102) < 0.11 && dens > 0.45;
      const z = front ? 5 + rnd(i * 11 + 103) * 9 : -(0.8 + Math.pow(rnd(i * 11 + 103), 1.2) * 38);
      const sc = (front ? 3.0 + rnd(i * 11 + 104) * 2.2 : 2.1 + rnd(i * 11 + 104) * 2.4) * (1 + (z < -20 ? 0.5 : 0));
      eu.set(0, rnd(i * 11 + 105) * 6.28, 0); q.setFromEuler(eu);
      M.compose(pv.set(x, terrainY(x, z) - 0.05, z), q, s.setScalar(sc));
      (front ? kelpFront : kelpBy)[i % 3].push(M.clone());
    }
    const addKelp = (lists, mat) => lists.forEach((arr, k) => {
      if (!arr.length) return;
      const im = new THREE.InstancedMesh(this.kelpGeos[k], mat, arr.length);
      arr.forEach((m, i) => im.setMatrixAt(i, m));
      im.frustumCulled = false; group.add(im);
    });
    addKelp(kelpBy, this.matKelp); addKelp(kelpFront, this.matKelpFront);
    group.visible = false;
    group.userData.cx = x0 + CHUNK / 2;
    this.scene.add(group);
    return group;
  }

  update(camX) {
    for (const g of this.chunks) g.visible = Math.abs(g.userData.cx - camX) < CHUNK / 2 + 170;
  }
}

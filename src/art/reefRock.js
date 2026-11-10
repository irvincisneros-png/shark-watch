// Procedural reef rock: smooth, noise-displaced boulders with ledges, overhangs and fissures, plus a separate small-detail
// mesh (sea urchins, sponges) that shares the rock's instance matrices. Authored geometry only, no images.
// Rock vertex attributes: aRk = (ambient occlusion, turf-algae mask, coralline-pink mask, local height), smooth normals.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../logic/rng.js';

function h3(x, y, z) { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); }
function n3(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), fx = x - ix, fy = y - iy, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const L = (a, b, t) => a + (b - a) * t;
  return L(L(L(h3(ix, iy, iz), h3(ix + 1, iy, iz), u), L(h3(ix, iy + 1, iz), h3(ix + 1, iy + 1, iz), u), v),
           L(L(h3(ix, iy, iz + 1), h3(ix + 1, iy, iz + 1), u), L(h3(ix, iy + 1, iz + 1), h3(ix + 1, iy + 1, iz + 1), u), v), w);
}
function f3(x, y, z, oct = 3) { let s = 0, a = 0.5; for (let i = 0; i < oct; i++) { s += a * n3(x, y, z); x = x * 2.03 + 5.1; y = y * 2.03 + 1.7; z = z * 2.03 + 9.3; a *= 0.5; } return s / 0.875; }
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Radius field of the rock along unit direction d. Returns { r, ao }. */
function field(d, seed, lobes) {
  const sx = seed * 3.7, sy = seed * 1.9, sz = seed * 5.3;
  const body = f3(d.x * 1.25 + sx, d.y * 1.25 + sy, d.z * 1.25 + sz, 3);              // big irregular mass
  let r = 0.62 + 0.62 * body;
  for (const L of lobes) { const dd = d.x * L.x + d.y * L.y + d.z * L.z; r += L.a * Math.exp((dd - 1) * L.k); } // knobs and shelves
  // ledges: stepped horizontal bands that read as bedding planes / terraces
  const hh = d.y * 2.6 + f3(d.x * 1.7 + sx, 0.3, d.z * 1.7 + sz, 2) * 1.6;
  const f = hh - Math.floor(hh);
  r += 0.15 * (sstep(0.0, 0.2, f) - sstep(0.8, 1.0, f)) * (d.y < 0.92 ? 1 : 0.3);
  // undercut: the band under the lip is cut back so tops overhang
  r *= 1 - 0.26 * Math.exp(-Math.pow((d.y + 0.3) / 0.2, 2)) * (0.5 + 0.5 * f3(d.x * 2 + sx, 0, d.z * 2 + sz, 2));
  // fissures: ridged noise carves narrow cracks
  const cr = 1 - Math.abs(2 * f3(d.x * 3.2 + sz, d.y * 3.2 + sx, d.z * 3.2 + sy, 2) - 1);
  const crack = Math.pow(cr, 6);
  r -= 0.3 * crack;
  // fine roughness
  r += 0.07 * (f3(d.x * 7 + sy, d.y * 7 + sz, d.z * 7 + sx, 2) - 0.5);
  const ao = 1 - 1.3 * crack - 0.35 * Math.exp(-Math.pow((d.y + 0.3) / 0.22, 2));
  return { r, ao, f };
}

function lobesFor(rnd) {
  const out = [];
  const n = 3 + Math.floor(rnd() * 3);
  for (let i = 0; i < n; i++) {
    const a = rnd() * 6.283, y = (rnd() - 0.3) * 1.3;
    const l = Math.hypot(1, y), d = new THREE.Vector3(Math.cos(a), y, Math.sin(a)).normalize();
    out.push({ x: d.x, y: d.y, z: d.z, a: 0.25 + rnd() * 0.3, k: 4 + rnd() * 6 });
  }
  return out;
}

/** One rock variant. detail = icosphere subdivision (2 low, 3 medium, 4 high). Returns { geo, details, topY }. */
export function reefRock(seed, detail, withDetail = true) {
  const rnd = mulberry32(seed * 977);
  const lobes = lobesFor(rnd);
  let g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  g = mergeVertices(g, 1e-4);
  const p = g.attributes.position, rk = new Float32Array(p.count * 4), v = new THREE.Vector3();
  let topY = -9;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const { r, ao, f } = field(v, seed, lobes);
    const q = v.clone().multiplyScalar(Math.max(0.25, r));
    q.y *= 0.62;                                                     // reef rock is broad and low
    if (q.y < -0.28) q.y = -0.28 + (q.y + 0.28) * 0.12;                // buried flat base
    p.setXYZ(i, q.x, q.y, q.z);
    const alg = sstep(0.42, 0.7, f3(v.x * 2.6 + seed, v.y * 2.6, v.z * 2.6, 2)) * sstep(-0.2, 0.5, v.y);
    const pink = sstep(0.52, 0.78, f3(v.x * 3.4 + seed * 2, v.y * 3.4 + 4, v.z * 3.4, 2));
    rk[i * 4] = Math.min(1, Math.max(0.12, ao * (0.55 + 0.45 * sstep(-0.9, 0.35, v.y))));
    rk[i * 4 + 1] = alg; rk[i * 4 + 2] = pink; rk[i * 4 + 3] = q.y;
    if (Math.hypot(q.x, q.z) < 0.3 && q.y > topY) topY = q.y;
  }
  g.setAttribute('aRk', new THREE.BufferAttribute(rk, 4));
  g.computeVertexNormals();
  const out = { geo: g, details: null, topY };
  if (withDetail) out.details = rockDetails(seed, lobes, rnd);
  return out;
}

function surfacePoint(d, seed, lobes) {
  const { r } = field(d, seed, lobes);
  const q = d.clone().multiplyScalar(Math.max(0.25, r)); q.y *= 0.62;
  return q;
}

function spiky(radius, rnd, color) {
  const g = new THREE.IcosahedronGeometry(radius, 1);
  g.deleteAttribute('uv');
  const p = g.attributes.position, v = new THREE.Vector3(), col = new Float32Array(p.count * 3);
  // every vertex of an icosphere face pushes out: alternate spike lengths so the silhouette bristles
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const key = Math.floor(Math.abs(Math.sin(v.x * 913 + v.y * 421 + v.z * 177) * 1000)) % 3;
    v.multiplyScalar(key === 0 ? 1.75 : 1.0);
    p.setXYZ(i, v.x, v.y, v.z);
    const tip = key === 0 ? 1 : 0.55;
    col[i * 3] = color[0] * tip; col[i * 3 + 1] = color[1] * tip; col[i * 3 + 2] = color[2] * tip;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}
function sponge(radius, h, rnd, color) {
  const pts = [];
  const N = 3;
  for (let i = 0; i <= N; i++) { const t = i / N; pts.push(new THREE.Vector2(radius * (0.7 + 0.45 * Math.sin(t * 2.2) - (t > 0.85 ? (t - 0.85) * 2.2 : 0)), t * h)); }
  pts.push(new THREE.Vector2(radius * 0.45, h * 0.92)); pts.push(new THREE.Vector2(0.001, h * 0.8));      // hollow cup
  const g = new THREE.LatheGeometry(pts, 6);
  g.deleteAttribute('uv');
  const p = g.attributes.position, col = new Float32Array(p.count * 3), v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const k = 0.85 + 0.3 * h3(v.x * 40, v.y * 40, v.z * 40);
    col[i * 3] = color[0] * k; col[i * 3 + 1] = color[1] * k; col[i * 3 + 2] = color[2] * k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/** Urchins and sponges sitting on the rock surface, in the rock's local space. */
function rockDetails(seed, lobes, rnd) {
  const parts = [];
  const place = (g, d, sink) => {
    const s = surfacePoint(d, seed, lobes);
    const n = d.clone().normalize();
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(n.x, Math.max(0.3, n.y), n.z).normalize()));
    g.translate(s.x * (1 - sink), s.y - sink * 0.08, s.z * (1 - sink));
    parts.push(g);
  };
  const urchinCols = [[0.12, 0.05, 0.14], [0.2, 0.07, 0.1], [0.1, 0.1, 0.16]];
  const nu = 2 + Math.floor(rnd() * 2);
  const cx = rnd() * 6.28;
  for (let i = 0; i < nu; i++) {                                   // urchins gather in a cluster on the shaded side
    const a = cx + (rnd() - 0.5) * 0.9, y = -0.1 + rnd() * 0.55;
    const d = new THREE.Vector3(Math.cos(a), y, Math.sin(a)).normalize();
    place(spiky(0.06 + rnd() * 0.04, rnd, urchinCols[Math.floor(rnd() * 3)]), d, 0.1);
  }
  const sc = [[0.9, 0.45, 0.12], [0.85, 0.7, 0.2], [0.5, 0.28, 0.42]];
  const ns = 1 + Math.floor(rnd() * 2);
  for (let i = 0; i < ns; i++) {
    const a = rnd() * 6.28, y = 0.1 + rnd() * 0.6;
    const d = new THREE.Vector3(Math.cos(a), y, Math.sin(a)).normalize();
    place(sponge(0.05 + rnd() * 0.05, 0.1 + rnd() * 0.14, rnd, sc[Math.floor(rnd() * 3)]), d, 0.12);
  }
  for (const g of parts) { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k); }
  const flat = parts.map(g => (g.index ? g.toNonIndexed() : g));
  return mergeGeometries(flat);
}

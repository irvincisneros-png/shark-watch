// Procedural golden kelp (Ecklonia radiata) and crayweed: vertex-coloured geometry, base at y = 0.
// Copied from DeepSwell src/world/flora.js and trimmed to the two builders Shark Watch uses.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../logic/rng.js';

const LOD = { k: 1 };
export const setKelpDetail = k => { LOD.k = k; };
const seg = (n, min = 3) => Math.max(min, Math.round(n * LOD.k));
const UP = new THREE.Vector3(0, 1, 0);
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function colorize(geo, fn) {
  const p = geo.attributes.position, col = new Float32Array(p.count * 3), v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const c = fn(v, i); col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2]; }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}
function strip(geo) {
  for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'color'].includes(k)) geo.deleteAttribute(k);
  return geo.index ? geo.toNonIndexed() : geo;
}
function tube(a, b, r0, r1, radial, colA, colB) {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r1, r0, len, seg(radial), 1, true);
  g.translate(0, len / 2, 0);
  const dir = new THREE.Vector3().subVectors(b, a).normalize();
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir));
  g.translate(a.x, a.y, a.z);
  colorize(g, v => lerp3(colA, colB, Math.min(1, Math.max(0, new THREE.Vector3().subVectors(v, a).dot(dir) / len))));
  return strip(g);
}
/** A flat ribbon following a curve: points[] centre-line, widths[] per point, facing normal. */
function ribbon(points, widths, side, colFn) {
  const pos = [], col = [], idx = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i], w = widths[i];
    const t = i / (points.length - 1);
    const a = p.clone().addScaledVector(side, -w / 2), b = p.clone().addScaledVector(side, w / 2);
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
    const c = colFn(t); col.push(...c, ...c);
    if (i) { const k = (i - 1) * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return strip(g);
}

/**
 * A leafy blade along a curve, several vertices across so it can have a raised midrib and ruffled edges.
 * opts: across (verts across, odd), rib (midrib height, m), ruffle (edge wave amplitude, m), freq (edge waves per blade).
 */
function blade(points, widths, side, colFn, { across = 5, rib = 0.01, ruffle = 0.015, freq = 9, phase = 0 } = {}) {
  across = seg(across, 2);
  const pos = [], col = [], idx = [], n = new THREE.Vector3(), tan = new THREE.Vector3();
  for (let i = 0; i < points.length; i++) {
    const p = points[i], w = widths[i], t = i / (points.length - 1);
    tan.subVectors(points[Math.min(i + 1, points.length - 1)], points[Math.max(i - 1, 0)]).normalize();
    n.crossVectors(side, tan).normalize();
    const c = colFn(t);
    for (let j = 0; j < across; j++) {
      const s = (j / (across - 1)) * 2 - 1; // -1..1 across the blade
      const lift = rib * (1 - Math.abs(s)) * (1 - t) + ruffle * s * s * Math.sin(t * freq * Math.PI + phase + s * 1.7) * Math.min(1, t * 4);
      const q = p.clone().addScaledVector(side, s * w / 2).addScaledVector(n, lift);
      pos.push(q.x, q.y, q.z);
      const edge = 0.82 + 0.18 * (1 - Math.abs(s)); // edges slightly darker, midrib lighter
      col.push(c[0] * edge, c[1] * edge, c[2] * edge);
      if (i && j) { const a = (i - 1) * across + j - 1, b = a + across; idx.push(a, a + 1, b, a + 1, b + 1, b); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return strip(g);
}

/** Golden kelp (Ecklonia radiata): stipe topped by a strap-like frond with lateral blades. */
export function kelp(seed) {
  const rnd = mulberry32(seed);
  const parts = [];
  const H = 0.45 + rnd() * 0.4;
  const stipeTop = new THREE.Vector3((rnd() - 0.5) * 0.1, H, (rnd() - 0.5) * 0.1);
  parts.push(tube(new THREE.Vector3(), stipeTop, 0.022, 0.016, 5, [0.32, 0.22, 0.1], [0.45, 0.32, 0.12]));
  // Holdfast
  const hf = new THREE.SphereGeometry(0.07, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2); hf.scale(1.4, 0.6, 1.4);
  colorize(hf, () => [0.3, 0.22, 0.12]); parts.push(strip(hf));
  // Ecklonia is golden- to olive-brown (fucoxanthin), darker and leathery toward the base of each blade.
  const gold = [0.64, 0.45, 0.13], dark = [0.36, 0.24, 0.07];
  // Primary frond: blades fanning out from the stipe top, drooping.
  const blades = 11 + Math.floor(rnd() * 5);
  for (let b = 0; b < blades; b++) {
    const ang = rnd() * Math.PI * 2, len = 0.55 + rnd() * 0.45, rise = 0.15 + rnd() * 0.35;
    const dir = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang));
    const pts = [], ws = [];
    const N = seg(12, 4);
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      pts.push(stipeTop.clone().addScaledVector(dir, t * len).add(new THREE.Vector3(0, Math.sin(t * Math.PI * 0.8) * rise * len - t * t * 0.15, 0)));
      ws.push(0.12 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.05 + 0.08)), 0.7) + 0.012);
    }
    const side = new THREE.Vector3().crossVectors(dir, UP).normalize();
    // Twist the blade so it isn't perfectly flat
    side.applyAxisAngle(dir, (rnd() - 0.5) * 0.8);
    const tone = 0.85 + rnd() * 0.3;
    parts.push(blade(pts, ws, side, t => lerp3(dark, gold, Math.min(1, 0.2 + t * 1.1)).map(c => c * tone * (0.92 + 0.12 * Math.sin(t * 23 + b))),
      { rib: 0.012, ruffle: 0.012 + rnd() * 0.01, freq: 7 + rnd() * 5, phase: rnd() * 6 }));
  }
  return mergeGeometries(parts);
}

export function crayweed(seed) {
  const rnd = mulberry32(seed);
  const parts = [];
  const strands = 4 + Math.floor(rnd() * 3);
  for (let s = 0; s < strands; s++) {
    const ang = rnd() * Math.PI * 2, H = 1.0 + rnd() * 0.8;
    const lean = new THREE.Vector3(Math.cos(ang) * 0.25, 1, Math.sin(ang) * 0.25).normalize();
    const pts = [], ws = [];
    for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(lean.clone().multiplyScalar(t * H).add(new THREE.Vector3(Math.sin(t * 5 + s) * 0.05, 0, Math.cos(t * 4 + s) * 0.05))); ws.push(0.03); }
    const side = new THREE.Vector3(-Math.sin(ang), 0, Math.cos(ang));
    parts.push(ribbon(pts, ws, side, t => lerp3([0.25, 0.2, 0.08], [0.45, 0.38, 0.12], t)));
    for (let i = 1; i < 12; i++) {
      const p = pts[i];
      const d = new THREE.Vector3(rnd() - 0.5, 0.3, rnd() - 0.5).normalize();
      parts.push(ribbon([p, p.clone().addScaledVector(d, 0.09)], [0.025, 0.006], new THREE.Vector3(-d.z, 0, d.x).normalize(), () => [0.5, 0.42, 0.14]));
    }
  }
  return mergeGeometries(parts);
}

/** Seagrass clump (Zostera): curved ribbon blades. */

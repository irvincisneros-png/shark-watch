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
  for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'color', 'aFlex', 'aSide'].includes(k)) geo.deleteAttribute(k);
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (!g.attributes.aFlex) g.setAttribute('aFlex', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count), 1));
  if (!g.attributes.aSide) g.setAttribute('aSide', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count), 1));
  return g;
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
  const pos = [], col = [], idx = [], flex = [], sides = [], n = new THREE.Vector3(), tan = new THREE.Vector3();
  for (let i = 0; i < points.length; i++) {
    const p = points[i], w = widths[i], t = i / (points.length - 1);
    tan.subVectors(points[Math.min(i + 1, points.length - 1)], points[Math.max(i - 1, 0)]).normalize();
    n.crossVectors(side, tan).normalize();
    const c = colFn(t);
    for (let j = 0; j < across; j++) {
      const s = (j / (across - 1)) * 2 - 1; // -1..1 across the blade
      const lift = rib * (1 - Math.abs(s)) * (1 - t) + ruffle * s * s * Math.sin(t * freq * Math.PI + phase + s * 1.7) * Math.min(1, t * 4);
      const q = p.clone().addScaledVector(side, s * w / 2).addScaledVector(n, lift);
      pos.push(q.x, q.y, q.z); flex.push(t); sides.push(s);
      const edge = 0.82 + 0.18 * (1 - Math.abs(s)); // edges slightly darker, midrib lighter
      col.push(c[0] * edge, c[1] * edge, c[2] * edge);
      if (i && j) { const a = (i - 1) * across + j - 1, b = a + across; idx.push(a, a + 1, b, a + 1, b + 1, b); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aFlex', new THREE.Float32BufferAttribute(flex, 1));
  g.setIndex(idx); g.computeVertexNormals();
  return strip(g);
}

/**
 * Ecklonia radiata (NSW common kelp): a short, stiff, thick stipe on a holdfast, topped by a dense mop of long strap-like
 * fronds that rise a little and then droop and sway with the surge. Olive-brown, darker and leathery at the base.
 * Base at y = 0, about 1 unit tall in model space (instances scale it up).
 */
export function kelp(seed) {
  const rnd = mulberry32(seed);
  const parts = [];
  const H = 0.13 + rnd() * 0.08;
  const lean = new THREE.Vector3((rnd() - 0.5) * 0.05, H, (rnd() - 0.5) * 0.05);
  parts.push(tube(new THREE.Vector3(), lean, 0.03, 0.022, 5, [0.17, 0.12, 0.06], [0.24, 0.17, 0.07]));
  // holdfast: a low knot of root-like haptera
  const hf = new THREE.SphereGeometry(0.075, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2); hf.scale(1.5, 0.55, 1.5);
  colorize(hf, () => [0.14, 0.1, 0.06]); parts.push(strip(hf));
  const top = [[0.13, 0.095, 0.04], [0.25, 0.19, 0.065], [0.4, 0.32, 0.1]];       // base -> mid -> tip (olive-brown, golden tips)
  const blades = 22 + Math.floor(rnd() * 5);
  for (let b = 0; b < blades; b++) {
    const ang = rnd() * Math.PI * 2;
    const elev = 0.1 + rnd() * 1.0;                                // fronds fan up and out, then droop under their own weight
    const len = 1.0 + rnd() * 0.9;
    let dir = new THREE.Vector3(Math.cos(ang) * Math.cos(elev), Math.sin(elev), Math.sin(ang) * Math.cos(elev));
    const N = seg(7, 3);
    const pts = [], ws = [];
    const p = lean.clone().add(new THREE.Vector3((rnd() - 0.5) * 0.03, 0, (rnd() - 0.5) * 0.03));
    const stepL = len / N;
    const wide = 0.13 + rnd() * 0.08;
    pts.push(p.clone()); ws.push(wide * 0.45);
    for (let i = 1; i <= N; i++) {
      const t = i / N;
      dir = dir.clone(); dir.y -= (0.4 + 2.4 * t * t) * (0.7 + 0.5 * rnd()) * 0.36; dir.x += (rnd() - 0.5) * 0.12; dir.z += (rnd() - 0.5) * 0.12; dir.normalize();
      p.addScaledVector(dir, stepL); pts.push(p.clone());
      ws.push(wide * (t < 0.2 ? 0.45 + t * 2.5 : 1.0 - Math.pow((t - 0.2) / 0.8, 2.2) * 0.65));
    }
    const side0 = new THREE.Vector3(-Math.sin(ang), 0, Math.cos(ang));
    side0.applyAxisAngle(dir, (rnd() - 0.5) * 1.2);                // twist so the straps catch the light differently
    const tone = 0.82 + rnd() * 0.36;
    parts.push(blade(pts, ws, side0, t => {
      const c = t < 0.45 ? lerp3(top[0], top[1], t / 0.45) : lerp3(top[1], top[2], (t - 0.45) / 0.55);
      const m = tone * (0.93 + 0.1 * Math.sin(t * 17 + b * 2.1));
      return [c[0] * m, c[1] * m, c[2] * m];
    }, { across: 2, rib: 0, ruffle: 0 }));
  }
  return mergeGeometries(parts);
}

/** Seagrass clump (Zostera/Posidonia): upright narrow ribbon blades with a slight lean. Base at y = 0, ~1 tall. */
export function seagrass(seed) {
  const rnd = mulberry32(seed);
  const parts = [];
  const n = 18 + Math.floor(rnd() * 6);
  for (let b = 0; b < n; b++) {
    const ang = rnd() * Math.PI * 2, lean = 0.1 + rnd() * 0.5, H = 0.55 + rnd() * 0.5;
    const dir = new THREE.Vector3(Math.cos(ang) * lean, 1, Math.sin(ang) * lean).normalize();
    const pts = [], ws = [];
    const o = new THREE.Vector3((rnd() - 0.5) * 0.16, 0, (rnd() - 0.5) * 0.16);
    const N = seg(4, 3);
    for (let i = 0; i <= N; i++) { const t = i / N; pts.push(o.clone().addScaledVector(dir, t * H).add(new THREE.Vector3(0, -t * t * 0.08, 0)).add(new THREE.Vector3(Math.cos(ang) * t * t * 0.14, 0, Math.sin(ang) * t * t * 0.14))); ws.push(0.085 * (1 - t * 0.5)); }
    const side = new THREE.Vector3(-Math.sin(ang), 0, Math.cos(ang));
    const g1 = 0.7 + rnd() * 0.4;
    parts.push(blade(pts, ws, side, t => [0.09 * g1 + t * 0.1, 0.22 * g1 + t * 0.13, 0.08 * g1 + t * 0.04], { across: 2, rib: 0, ruffle: 0 }));
  }
  return mergeGeometries(parts);
}

/** A scallop-like shell lying on the sand (about 1 unit wide, flat). Pale, ribbed; tinted per instance. */
export function shell(seed) {
  const rnd = mulberry32(seed);
  const g = new THREE.SphereGeometry(0.5, 12, 4, 0, Math.PI * 2, 0, Math.PI / 2);
  const p = g.attributes.position, col = new Float32Array(p.count * 3), v = new THREE.Vector3();
  const ribs = 7 + Math.floor(rnd() * 4);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const a = Math.atan2(v.z, v.x), r = Math.hypot(v.x, v.z);
    const rib = 0.5 + 0.5 * Math.cos(a * ribs);
    v.y = v.y * 0.32 + 0.025 * rib * (r / 0.5);
    v.x *= 1.0; v.z *= 0.9 + 0.1 * Math.cos(a * 2);
    p.setXYZ(i, v.x, v.y, v.z);
    const sh = 0.78 + 0.22 * rib;
    col[i * 3] = sh; col[i * 3 + 1] = sh * 0.97; col[i * 3 + 2] = sh * 0.92;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return strip(g);
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

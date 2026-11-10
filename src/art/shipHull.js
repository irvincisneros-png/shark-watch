// Container-ship hull seen from below the waterline: a lofted hull (entry, parallel midbody, tapered stern), bulbous bow,
// propeller boss, a rudder and a five-bladed skewed propeller. Authored geometry; colours come from a hull shader.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function clean(g) {
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal'].includes(k)) g.deleteAttribute(k);
  return g.index ? g.toNonIndexed() : g;
}

/** Hull plus bulb and boss, in ship space: bow at -L/2, stern at +L/2, waterline y = 0, keel at y = -draft. */
export function hullGeometry(L, B, draft) {
  const NX = 44, NJ = 10, TOP = 0.45, EXP = 2 / 4.6;
  const rows = [];
  for (let i = 0; i <= NX; i++) {
    const s = i / NX;
    const x = -L / 2 + s * L;
    let b = B / 2;
    if (s < 0.2) b *= Math.pow(Math.sin(s / 0.2 * Math.PI / 2), 0.85);
    else if (s > 0.86) b *= 1 - 0.36 * sstep(0.86, 1, s);
    let D = draft;
    D *= 1 - 0.8 * Math.pow(1 - sstep(0, 0.2, s), 2);             // forefoot rises towards the stem
    D *= 1 - 0.2 * sstep(0.84, 1, s);                               // stern keel rises a little
    const half = [];
    for (let j = 0; j <= NJ; j++) {
      const th = (j / NJ) * Math.PI / 2;
      const z = b * Math.pow(Math.cos(th), EXP);
      const y = TOP - (TOP + D) * Math.pow(Math.sin(th), EXP);
      half.push([x, y, z]);
    }
    const row = half.slice(); for (let j = NJ - 1; j >= 0; j--) row.push([half[j][0], half[j][1], -half[j][2]]);
    rows.push(row);
  }
  const W = rows[0].length, pos = [], idx = [];
  for (const r of rows) for (const p of r) pos.push(p[0], p[1], p[2]);
  for (let i = 0; i < NX; i++) for (let j = 0; j < W - 1; j++) { const a = i * W + j, b = a + 1, c = a + W, d = c + 1; idx.push(a, c, b, b, c, d); }
  const hull = new THREE.BufferGeometry();
  hull.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  hull.setIndex(idx); hull.computeVertexNormals();
  const parts = [clean(hull)];
  // bulbous bow
  const bulb = new THREE.SphereGeometry(1, 16, 10); bulb.scale(2.5, 0.85, 1.05); bulb.translate(-L / 2 + 0.8, -draft * 0.5, 0);
  parts.push(clean(bulb));
  // propeller boss / skeg under the counter
  const boss = new THREE.CylinderGeometry(0.2, 0.62, 3.4, 10, 1); boss.rotateZ(Math.PI / 2); boss.translate(L / 2 - 1.0 - 0.5, -draft * 0.72, 0);
  parts.push(clean(boss));
  return mergeGeometries(parts);
}

/** Rudder: thin streamlined blade, leading edge at x = 0, trailing edge at x = chord. */
export function rudderGeometry(chord = 1.9, height = 3.4) {
  const s = new THREE.Shape();
  s.moveTo(0.18, 0); s.lineTo(chord, 0.05); s.lineTo(chord * 0.96, height); s.lineTo(0.3, height); s.quadraticCurveTo(0, height * 0.55, 0.18, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.28, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.1, bevelSegments: 2, curveSegments: 6 });
  g.translate(0, -height, -0.14);
  return clean(g);
}

/** Five-bladed skewed propeller spinning around the x axis. Brass, with vertex colours. */
export function propellerGeometry(R = 1.75) {
  const parts = [];
  const NB = 5, NR = 7, NC = 3;
  for (let b = 0; b < NB; b++) {
    const pos = [], col = [], idx = [];
    for (let i = 0; i <= NR; i++) {
      const r = 0.34 + (R - 0.34) * (i / NR);
      const u = i / NR;
      const chord = 0.2 + 0.78 * Math.sin(Math.PI * Math.min(1, u * 0.95 + 0.08)) * (1 - u * 0.35);
      const pitch = (0.62 - 0.34 * u);                             // blade face angle, steeper at the root
      const skew = 0.45 * u * u;                                   // sweeps back towards the tip
      for (let c = 0; c <= NC; c++) {
        const k = c / NC - 0.5;
        const zc = k * chord + skew;
        const x = k * chord * Math.sin(pitch) * 0.9 + (c === 0 || c === NC ? 0.0 : 0.035 * (1 - Math.abs(k * 2)));
        pos.push(x, r, zc);
        const sh = 0.82 + 0.3 * (1 - Math.abs(k * 2)) - 0.1 * u;
        col.push(0.78 * sh, 0.58 * sh, 0.24 * sh);
      }
    }
    for (let i = 0; i < NR; i++) for (let c = 0; c < NC; c++) { const a = i * (NC + 1) + c, d = a + NC + 1; idx.push(a, d, a + 1, a + 1, d, d + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx); g.computeVertexNormals();
    g.rotateX((b / NB) * Math.PI * 2);
    parts.push(g.toNonIndexed());
  }
  const hub = new THREE.SphereGeometry(0.42, 10, 8); hub.scale(1.5, 1, 1);
  const hc = new Float32Array(hub.attributes.position.count * 3); for (let i = 0; i < hc.length; i += 3) { hc[i] = 0.7; hc[i + 1] = 0.5; hc[i + 2] = 0.2; }
  hub.setAttribute('color', new THREE.BufferAttribute(hc, 3)); hub.deleteAttribute('uv');
  parts.push(hub.toNonIndexed());
  return mergeGeometries(parts);
}

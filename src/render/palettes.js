// Per-habitat colour keyframes along the route. The renderer blends between them by the player's x.
import { stationX } from '../logic/route.js';
import * as THREE from 'three';

const C = h => new THREE.Color(h);
// fog = mid-water colour, deep = bottom-of-view colour, top = just under the surface, sand/rock = seabed colours.
const P = {
  bondi:     { fog: C(0x37b4d3), deep: C(0x0d6a92), top: C(0x9cecee), sand: C(0xe3d2a4), rock: C(0x8d8777), kelp: C(0xb99a45), density: 0.017, rays: 1.0, caustic: 1.0, skyTop: C(0x4f9fdc), skyHor: C(0xdcf1fa), land: C(0x66808f), absorb: 0.030 },
  cronulla:  { fog: C(0x2c9fba), deep: C(0x0a5f84), top: C(0x82d6d8), sand: C(0xd2bf93), rock: C(0x797a6e), kelp: C(0xa88b3c), density: 0.019, rays: 0.95, caustic: 0.95, skyTop: C(0x5aa5d8), skyHor: C(0xd7ecf6), land: C(0x6c8793), absorb: 0.034 },
  stanwell:  { fog: C(0x1f8a97), deep: C(0x07485f), top: C(0x59bdb0), sand: C(0xb9a97f), rock: C(0x5f6a5f), kelp: C(0xa08235), density: 0.023, rays: 1.1, caustic: 0.85, skyTop: C(0x6aa6cf), skyHor: C(0xcfe4ea), land: C(0x56717a), absorb: 0.040 },
  wollo:     { fog: C(0x2f7d7a), deep: C(0x0f3f48), top: C(0x7fb59e), sand: C(0xa39b76), rock: C(0x58594f), kelp: C(0x8f7a36), density: 0.029, rays: 0.7, caustic: 0.65, skyTop: C(0x8aa9bb), skyHor: C(0xc7d3d3), land: C(0x56666b), absorb: 0.050 },
  harbour:   { fog: C(0x4a7c6e), deep: C(0x1b3a3e), top: C(0x9bb591), sand: C(0x8f8a6b), rock: C(0x4d4f47), kelp: C(0x7f6e33), density: 0.036, rays: 0.45, caustic: 0.45, skyTop: C(0x9aa9b0), skyHor: C(0xc3c8c2), land: C(0x5a6266), absorb: 0.060 },
  islands:   { fog: C(0x2a93a0), deep: C(0x08506a), top: C(0x73cfc0), sand: C(0xc5b788), rock: C(0x657066), kelp: C(0xae9038), density: 0.021, rays: 1.05, caustic: 0.95, skyTop: C(0x5eaedd), skyHor: C(0xd3ebf2), land: C(0x5f7e86), absorb: 0.036 },
  kiama:     { fog: C(0x1b79a3), deep: C(0x052f56), top: C(0x62c4dc), sand: C(0xb4a780), rock: C(0x555f66), kelp: C(0x9b8236), density: 0.022, rays: 1.15, caustic: 0.9, skyTop: C(0x4f93d6), skyHor: C(0xcfe6f4), land: C(0x4f6f84), absorb: 0.042 },
};
export const PALETTES = P;
const kf = (x, p) => ({ x, p });
export const KEYFRAMES = [
  kf(-100, P.bondi), kf(stationX(0) + 260, P.bondi), kf(stationX(1), P.cronulla), kf(stationX(2), P.stanwell),
  kf(stationX(3) - 190, P.wollo), kf(stationX(3) + 20, P.harbour), kf(stationX(3) + 190, P.harbour), kf(stationX(4) - 30, P.islands),
  kf(stationX(4) + 200, P.islands), kf(stationX(5) - 20, P.kiama), kf(stationX(5) + 400, P.kiama),
];

const KEYS = ['fog', 'deep', 'top', 'sand', 'rock', 'kelp', 'skyTop', 'skyHor', 'land'];
const NUM = ['density', 'rays', 'caustic', 'absorb'];

/** Blend palette at world x into `out` (same shape as a palette). */
export function paletteAt(x, out) {
  let i = 0;
  while (i < KEYFRAMES.length - 2 && x > KEYFRAMES[i + 1].x) i++;
  const a = KEYFRAMES[i], b = KEYFRAMES[i + 1];
  let t = Math.min(1, Math.max(0, (x - a.x) / (b.x - a.x))); t = t * t * (3 - 2 * t);
  for (const k of KEYS) out[k].copy(a.p[k]).lerp(b.p[k], t);
  for (const k of NUM) out[k] = a.p[k] + (b.p[k] - a.p[k]) * t;
  return out;
}
export const makePalette = () => { const o = {}; for (const k of KEYS) o[k] = new THREE.Color(); for (const k of NUM) o[k] = 0; return o; };

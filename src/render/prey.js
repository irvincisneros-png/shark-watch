// Instanced prey fish, plus a few ambient schools for atmosphere.
import * as THREE from 'three';
import { buildFish, buildRay } from '../art/fishModel.js';
import { PREY_LOOKS } from '../art/preyLooks.js';
import { makeMaterial } from './materials.js';
import { hash1 } from '../logic/rng.js';

const MAX = { salmon: 120, tailor: 40 };

export class PreyView {
  constructor(scene, tier) {
    this.scene = scene; this.kinds = {};
    for (const sp of ['salmon', 'tailor']) {
      const look = PREY_LOOKS[sp];
      const built = buildFish(look);
      const tex = built.texture; tex.anisotropy = 4;
      const mat = makeMaterial({ map: tex, swim: true, len: built.length, waveK: 6.3, side: THREE.DoubleSide, rim: 0.35, caustic: 0.7 });
      const geo = built.geometry;
      const swim = new Float32Array(MAX[sp] * 2);
      geo.setAttribute('aSwim', new THREE.InstancedBufferAttribute(swim, 2).setUsage(THREE.DynamicDrawUsage));
      const im = new THREE.InstancedMesh(geo, mat, MAX[sp]);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false; im.count = 0;
      scene.add(im);
      this.kinds[sp] = { im, swim, look, prev: new Map() };
    }
    // ambient, non-interactive schools (background depth)
    this.amb = [];
    const n = tier.ambientFish;
    if (n) {
      const built = buildFish({ ...PREY_LOOKS.salmon, lod: 1 }), tex = built.texture;
      const mat = makeMaterial({ map: tex, swim: true, len: built.length, side: THREE.DoubleSide, rim: 0.2, caustic: 0.2, fogMult: 1.2 });
      const geo = built.geometry;
      this.ambSwim = new Float32Array(n * 2);
      geo.setAttribute('aSwim', new THREE.InstancedBufferAttribute(this.ambSwim, 2).setUsage(THREE.DynamicDrawUsage));
      this.ambMesh = new THREE.InstancedMesh(geo, mat, n);
      this.ambMesh.frustumCulled = false; scene.add(this.ambMesh);
      for (let i = 0; i < n; i++) this.amb.push({ s: Math.floor(i / 14), ox: (hash1(i * 3) - 0.5) * 7, oy: (hash1(i * 5) - 0.5) * 3, z: -9 - hash1(Math.floor(i / 14) * 9) * 28, ph: hash1(i) * 6, sp: 0.8 + hash1(Math.floor(i / 14) * 2) * 1.4 });
    }
    this.M = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.sv = new THREE.Vector3(); this.pv = new THREE.Vector3(); this.eu = new THREE.Euler();
  }

  update(sim, dt, t, camX) {
    const counts = { salmon: 0, tailor: 0 };
    for (const e of sim.entities) {
      if (e.kind !== 'fish' || !e.alive) continue;
      const K = this.kinds[e.species]; const i = counts[e.species]++;
      if (i >= MAX[e.species]) continue;
      let pr = K.prev.get(e.id);
      if (!pr) { pr = { x: e.x, y: e.y, a: 0 }; K.prev.set(e.id, pr); }
      const dx = e.x - pr.x, dy = e.y - pr.y;
      const targetA = Math.atan2(dy, Math.max(0.0001, dx + 0.02));
      pr.a += (Math.max(-0.7, Math.min(0.7, targetA)) - pr.a) * Math.min(1, dt * 6);
      pr.x = e.x; pr.y = e.y;
      const z = (hash1(e.id * 1.7) - 0.5) * 2.6;
      this.eu.set(0, (hash1(e.id) - 0.5) * 0.25, pr.a); this.q.setFromEuler(this.eu);
      this.M.compose(this.pv.set(e.x, e.y, z), this.q, this.sv.setScalar(1));
      K.im.setMatrixAt(i, this.M);
      K.swim[i * 2] = e.phase; K.swim[i * 2 + 1] = 0.9;
    }
    for (const sp of ['salmon', 'tailor']) {
      const K = this.kinds[sp]; K.im.count = Math.min(counts[sp], MAX[sp]);
      K.im.instanceMatrix.needsUpdate = true; K.im.geometry.attributes.aSwim.needsUpdate = true;
      if (K.prev.size > 400) K.prev.clear();
    }
    if (this.ambMesh) {
      for (let i = 0; i < this.amb.length; i++) {
        const a = this.amb[i];
        const base = ((a.s * 61 + t * a.sp * 1.1 + 400) % 300) - 150 + camX * 0.9;
        const x = base + a.ox + Math.sin(t * 0.6 + a.ph) * 0.6, y = -4.5 - hash1(a.s * 3.3) * 6 + a.oy + Math.sin(t * 0.4 + a.ph) * 0.4;
        this.eu.set(0, 0, Math.sin(t * 0.7 + a.ph) * 0.1); this.q.setFromEuler(this.eu);
        this.M.compose(this.pv.set(x, y, a.z), this.q, this.sv.setScalar(0.85));
        this.ambMesh.setMatrixAt(i, this.M);
        this.ambSwim[i * 2] = t * 7 + a.ph; this.ambSwim[i * 2 + 1] = 0.8;
      }
      this.ambMesh.instanceMatrix.needsUpdate = true; this.ambMesh.geometry.attributes.aSwim.needsUpdate = true;
    }
  }
}

export function buildRayMesh(tier) {
  const built = buildRay(PREY_LOOKS.ray);
  const mat = makeMaterial({ tint: 0xb89a68, side: THREE.DoubleSide, transparent: true, alpha: 0, rim: 0.2, emissive: 0.08 });
  const m = new THREE.Mesh(built.geometry, mat);
  return m;
}

// Small CPU particle systems: bubbles, sand puffs, sparks and drifting marine snow. Copied from DeepSwell and adapted.
import * as THREE from 'three';
import { U } from './uniforms.js';

function softSprite() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.45, 'rgba(255,255,255,0.55)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
function bubbleSprite() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 4; g.beginPath(); g.arc(32, 32, 26, 0, 7); g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.arc(32, 32, 26, 0, 7); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.arc(22, 22, 6, 0, 7); g.fill();
  return new THREE.CanvasTexture(c);
}

class Pool {
  constructor(scene, max, tex, { blending = THREE.NormalBlending, depthWrite = false } = {}) {
    this.max = max;
    this.p = new Float32Array(max * 3); this.v = new Float32Array(max * 3);
    this.age = new Float32Array(max).fill(1e9); this.life = new Float32Array(max).fill(1);
    this.size = new Float32Array(max); this.col = new Float32Array(max * 4);
    this.kind = new Uint8Array(max);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.p, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aCol', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: tex }, uScale: { value: 600 } },
      vertexShader: `attribute float aSize; attribute vec4 aCol; varying vec4 vCol; uniform float uScale;
        void main(){ vCol = aCol; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = aSize * uScale / max(0.5, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D uTex; varying vec4 vCol; void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vCol.rgb, vCol.a * t.a); if (gl_FragColor.a < 0.01) discard; }`,
      transparent: true, depthWrite, blending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.next = 0;
  }
  spawn(x, y, z, vx, vy, vz, life, size, r, g, b, a, kind = 0) {
    const i = this.next; this.next = (this.next + 1) % this.max;
    this.p[i * 3] = x; this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = z;
    this.v[i * 3] = vx; this.v[i * 3 + 1] = vy; this.v[i * 3 + 2] = vz;
    this.age[i] = 0; this.life[i] = life; this.size[i] = size; this.kind[i] = kind;
    this.col[i * 4] = r; this.col[i * 4 + 1] = g; this.col[i * 4 + 2] = b; this.col[i * 4 + 3] = a;
  }
}

export class Particles {
  constructor(scene, quality) {
    this.bubbles = new Pool(scene, 500, bubbleSprite());
    this.dust = new Pool(scene, 700, softSprite());
    this.spray = new Pool(scene, 900, softSprite());
    this.glow = new Pool(scene, 400, softSprite(), { blending: THREE.AdditiveBlending });
    this.baseA = new Float32Array(900);
    // Marine snow: persistent motes wrapped around the camera.
    const n = quality.snow;
    this.snowN = n;
    const geo = new THREE.BufferGeometry();
    this.snowP = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { this.snowP[i * 3] = (Math.random() - 0.5) * 60; this.snowP[i * 3 + 1] = -7 + (Math.random() - 0.5) * 22; this.snowP[i * 3 + 2] = (Math.random() - 0.5) * 70; }
    geo.setAttribute('position', new THREE.BufferAttribute(this.snowP, 3));
    // Cosy look: motes catch the light a little more, so the water feels full of life.
    const cosy = false;
    this.snow = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.11, map: softSprite(), transparent: true, depthWrite: false, opacity: 0.6, color: cosy ? 0xf2fff8 : 0xcfe8e0, sizeAttenuation: true, blending: cosy ? THREE.AdditiveBlending : THREE.NormalBlending }));
    this.snow.frustumCulled = false;
    scene.add(this.snow);
    this.snowOrigin = new THREE.Vector3();
  }
  setScale(px) { for (const p of [this.bubbles, this.dust, this.spray, this.glow]) p.points.material.uniforms.uScale.value = px; }
  bubbleBurst(pos, n = 20, spread = 0.3, size = 0.05) {
    for (let i = 0; i < n; i++) this.bubbles.spawn(pos.x + (Math.random() - 0.5) * spread, pos.y + (Math.random() - 0.5) * spread, pos.z + (Math.random() - 0.5) * spread,
      (Math.random() - 0.5) * 0.3, 0.6 + Math.random() * 0.8, (Math.random() - 0.5) * 0.3, 4, size * (0.4 + Math.random()), 0.9, 0.97, 1, 0.75, 1);
  }
  sandPuff(pos, n = 18, color = [0.9, 0.86, 0.74]) {
    for (let i = 0; i < n; i++) this.dust.spawn(pos.x, pos.y, pos.z, (Math.random() - 0.5) * 0.5, Math.random() * 0.25, (Math.random() - 0.5) * 0.5, 3 + Math.random() * 2, 0.12 + Math.random() * 0.25, color[0], color[1], color[2], 0.5, 2);
  }
  /** Small splash on the water (a float landing, a hooked fish thrashing). */
  splash(pos, n = 8) {
    for (let i = 0; i < n; i++) this.spray.spawn(pos.x + (Math.random() - 0.5) * 0.3, pos.y, pos.z + (Math.random() - 0.5) * 0.3,
      (Math.random() - 0.5) * 1.2, 1 + Math.random() * 1.6, (Math.random() - 0.5) * 1.2, 0.6 + Math.random() * 0.4, 0.12 + Math.random() * 0.15, 1, 1, 1, 0.8, 3);
  }
  /** Coloured soft sparks (eating, pickups, pings): kind 2 pool (drag + fade) with custom colour. */
  sparks(pos, n, color, speed = 2.5, size = 0.25, life = 0.9) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, s = speed * (0.4 + Math.random());
      this.glow.spawn(pos.x, pos.y, pos.z, Math.cos(a) * s, Math.sin(a) * s, (Math.random() - 0.5) * 0.5, life * (0.6 + Math.random() * 0.6), size * (0.6 + Math.random() * 0.8), color[0], color[1], color[2], 0.9, 4);
    }
  }
  /** Blood-free "bite" cloud: pale fish scales and bubbles. */
  scales(pos, n = 14) {
    for (let i = 0; i < n; i++) this.dust.spawn(pos.x, pos.y, pos.z, (Math.random() - 0.3) * 2.2, (Math.random() - 0.5) * 2.2, (Math.random() - 0.5), 0.8 + Math.random() * 0.8, 0.1 + Math.random() * 0.12, 0.88, 0.93, 0.95, 0.8, 5);
  }
  sprayBurst(pos, dir, n = 30, power = 4) {
    for (let i = 0; i < n; i++) this.spray.spawn(pos.x + (Math.random() - 0.5) * 2, pos.y, pos.z + (Math.random() - 0.5) * 0.6,
      dir.x * power * Math.random() + (Math.random() - 0.5) * 2, 2 + Math.random() * power, dir.z * power * Math.random() + (Math.random() - 0.5) * 1.5,
      0.9 + Math.random() * 0.8, 0.25 + Math.random() * 0.5, 1, 1, 1, 0.75, 3);
  }
  update(dt, camera, waterLevel = 0) {
    const t = U.uTime.value;
    for (const pool of [this.bubbles, this.dust, this.spray, this.glow]) {
      const { p, v, age, life, col, size } = pool;
      for (let i = 0; i < pool.max; i++) {
        if (age[i] > life[i]) { col[i * 4 + 3] = 0; continue; }
        age[i] += dt;
        const k = pool.kind[i];
        if (k === 1) { // bubble: rise, wobble, pop at surface, grow as pressure drops
          v[i * 3 + 1] = Math.min(v[i * 3 + 1] + dt * 0.8, 1.6);
          p[i * 3] += Math.sin(t * 9 + i) * 0.004;
          size[i] *= 1 + dt * 0.03;
          if (p[i * 3 + 1] > waterLevel - 0.05) age[i] = 1e9;
        } else if (k === 2) { // sand: drag, slow settle, fade
          v[i * 3] *= 1 - dt * 1.2; v[i * 3 + 1] = v[i * 3 + 1] * (1 - dt * 1.2) - dt * 0.03; v[i * 3 + 2] *= 1 - dt * 1.2;
          size[i] += dt * 0.12;
          col[i * 4 + 3] = 0.45 * (1 - age[i] / life[i]);
        } else if (k === 4) { // glow spark: drag, fade
          v[i * 3] *= 1 - dt * 1.6; v[i * 3 + 1] *= 1 - dt * 1.6; v[i * 3 + 2] *= 1 - dt * 1.6;
          col[i * 4 + 3] = 0.9 * (1 - age[i] / life[i]);
        } else if (k === 5) { // scales: drift, fade
          v[i * 3] *= 1 - dt * 1.4; v[i * 3 + 1] = v[i * 3 + 1] * (1 - dt * 1.4) - dt * 0.15;
          col[i * 4 + 3] = 0.8 * (1 - age[i] / life[i]);
        } else if (k === 3) { // spray: ballistic in air
          v[i * 3 + 1] -= 9.8 * dt;
          col[i * 4 + 3] = 0.7 * (1 - age[i] / life[i]);
          size[i] += dt * 0.4;
        }
        p[i * 3] += v[i * 3] * dt; p[i * 3 + 1] += v[i * 3 + 1] * dt; p[i * 3 + 2] += v[i * 3 + 2] * dt;
      }
      const g = pool.points.geometry;
      g.attributes.position.needsUpdate = true; g.attributes.aCol.needsUpdate = true; g.attributes.aSize.needsUpdate = true;
    }
    // Marine snow: wrap in a box (60 x 22 x 70) centred on the lane so it fills the whole depth of the view.
    const cx = camera.position.x, sp = this.snowP, B = [60, 22, 70], C = [cx, -7, 0];
    for (let i = 0; i < this.snowN; i++) {
      for (let a = 0; a < 3; a++) {
        let d = sp[i * 3 + a] - C[a];
        if (d > B[a] / 2) sp[i * 3 + a] -= B[a]; else if (d < -B[a] / 2) sp[i * 3 + a] += B[a];
      }
      sp[i * 3 + 1] += Math.sin(t * 0.3 + i) * 0.0025 - 0.0016;
      sp[i * 3] += 0.006;
    }
    this.snow.geometry.attributes.position.needsUpdate = true;
    this.snow.visible = true;
  }
}

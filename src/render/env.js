// Water-column atmosphere: backdrop gradient, god rays, the underside of the surface, and the above-water sky band
// with authored landmark silhouettes (separate scene, rendered into the strip above the waterline).
import * as THREE from 'three';
import { U } from './uniforms.js';
import { COMMON_FRAG } from './glsl.js';
import { stationX, FIRST_STATION_X, LEG_LEN } from '../logic/route.js';
import { fbm1, hash1 } from '../logic/rng.js';

// ---- backdrop -----------------------------------------------------------------------------------------------------
export class Backdrop {
  constructor(scene) {
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...U },
      depthTest: false, depthWrite: false,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }`,
      fragmentShader: `${COMMON_FRAG}
        varying vec2 vUv;
        void main(){
          float y = vUv.y;
          vec3 c = mix(uDeepColor, uFogColor, smoothstep(0.0, 0.58, y));
          c = mix(c, uTopColor, smoothstep(0.55, 1.0, y) * 0.8);
          float n = fbm2(vec2(vUv.x * 3.0 + uTime * 0.02, y * 2.0 - uTime * 0.01));
          c += uTopColor * (n - 0.45) * 0.10 * smoothstep(0.2, 0.9, y);
          // a soft sunlit glow high in the water column
          float g = exp(-pow((vUv.x - 0.62) * 1.5, 2.0) * 3.0) * smoothstep(0.35, 1.0, y);
          c += uTopColor * g * 0.16;
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = -100;
    scene.add(this.mesh);
  }
}

// ---- god rays -------------------------------------------------------------------------------------------------------
export class GodRays {
  constructor(scene, count) {
    this.group = new THREE.Group();
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...U, uIntensity: { value: 1 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: `varying vec2 vUv; varying vec3 vWP; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vWP = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `${COMMON_FRAG}
        uniform float uIntensity; varying vec2 vUv; varying vec3 vWP;
        void main(){
          float edge = smoothstep(0.0, 0.5, vUv.x) * smoothstep(1.0, 0.5, vUv.x);
          float streak = 0.55 + 0.45 * vnoise(vec2(vUv.x * 7.0 + vWP.x * 0.02, uTime * 0.12 + vWP.z * 0.1));
          float fade = smoothstep(0.0, 0.9, vUv.y);
          float a = edge * edge * streak * fade * 0.42 * uIntensity;
          gl_FragColor = vec4(mix(uTopColor, vec3(1.0, 0.98, 0.88), 0.55) * a, a);
        }`,
    });
    this.mat = mat;
    this.items = [];
    for (let i = 0; i < count; i++) {
      const w = 5 + hash1(i * 3.1) * 10, z = -6 - hash1(i * 5.3) * 30;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 46), mat);
      m.position.set(0, -10, z);
      m.rotation.z = -0.24 + (hash1(i * 7.7) - 0.5) * 0.12;
      m.renderOrder = -50;
      m.frustumCulled = false;
      this.group.add(m);
      this.items.push({ m, off: (i / count) * 130 - 40 + hash1(i) * 20, par: 0.5 + hash1(i * 2.2) * 0.4, w });
    }
    scene.add(this.group);
  }
  update(camX, intensity) {
    this.mat.uniforms.uIntensity.value = intensity;
    for (const it of this.items) {
      const period = 150;
      const lx = ((it.off - camX * it.par) % period + period * 1.5) % period - period * 0.5;
      it.m.position.x = camX + lx - 12;
    }
  }
}

// ---- underside of the surface -------------------------------------------------------------------------------------
export class Surface {
  constructor(scene) {
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...U },
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: `varying vec3 vWP; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vWP = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `${COMMON_FRAG}
        varying vec3 vWP;
        void main(){
          vec3 V = normalize(cameraPosition - vWP);
          float cosT = abs(V.y);
          vec2 q = vWP.xz * vec2(0.55, 1.5);
          float w1 = fbm2(q + vec2(uTime * 0.18, uTime * 0.09));
          float w2 = fbm2(q * 2.1 - vec2(uTime * 0.15, -uTime * 0.07) + 5.0);
          float h = w1 * 0.65 + w2 * 0.35;
          float crest = smoothstep(0.58, 0.8, h);
          // total internal reflection: at shallow angles the underside mirrors the water below
          vec3 mirror = mix(uFogColor * 0.9, uTopColor, 0.35);
          vec3 window = uTopColor * 1.35 + vec3(0.18);
          vec3 col = mix(mirror, window, smoothstep(0.0, 0.6, cosT));
          col += (vec3(0.8, 0.95, 1.0) * crest * 0.55 + (h - 0.5) * 0.12) * (0.4 + 0.6 * cosT);
          // shimmering brightness band right at the waterline
          float rim = smoothstep(-1.2, 0.0, vWP.z);
          col += vec3(0.9, 1.0, 1.0) * rim * (0.35 + 0.35 * sin(vWP.x * 2.6 + uTime * 2.0) * sin(vWP.x * 0.7 - uTime));
          float dist = length(vWP - cameraPosition);
          float f = 1.0 - exp(-max(0.0, dist - 40.0) * uFogDensity * 0.22);
          col = mix(col, mix(uFogColor, uTopColor, 0.45), f * 0.85);
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(700, 170), mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.set(0, 0.0, -85);
    this.mesh.renderOrder = -20; this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }
  update(camX) { this.mesh.position.x = camX; }
}

// ---- above-water sky band ---------------------------------------------------------------------------------------------
const PAR = 0.42; // landmark parallax

function silhouetteMaterial(haze) {
  return new THREE.ShaderMaterial({
    uniforms: { uLand: { value: new THREE.Color(0x56717a) }, uHor: { value: new THREE.Color(0xd0e4ec) }, uHaze: { value: haze } },
    vertexShader: `attribute float aT; varying float vT; void main(){ vT = aT; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 uLand; uniform vec3 uHor; uniform float uHaze; varying float vT;
      void main(){ vec3 c = uLand * (0.62 + 0.55 * vT); c = mix(c, uHor, uHaze + 0.28 * (1.0 - vT) * (1.0 - uHaze)); gl_FragColor = vec4(c, 1.0); }`,
    side: THREE.DoubleSide,
  });
}
function polyMesh(points, mat, z, h = 1) {
  const sh = new THREE.Shape(points.map(p => new THREE.Vector2(p[0], p[1])));
  const g = new THREE.ShapeGeometry(sh);
  const p = g.attributes.position, aT = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) aT[i] = Math.max(0, Math.min(1, p.getY(i) / h));
  g.setAttribute('aT', new THREE.BufferAttribute(aT, 1));
  const m = new THREE.Mesh(g, mat); m.position.z = z; return m;
}
/** Ridge polygon: x0..x1, height fn(x) >= 0. */
function ridge(x0, x1, hfn, step = 1) {
  const pts = [[x0, -0.2]];
  for (let x = x0; x <= x1 + 1e-6; x += step) pts.push([x, hfn(x)]);
  pts.push([x1, -0.2]);
  return pts;
}
const tri = (cx, base, w, h) => [[cx - w / 2, base], [cx, base + h], [cx + w / 2, base]];

export class SkyBand {
  constructor(tier) {
    this.scene = new THREE.Scene();
    this.cam = new THREE.OrthographicCamera(-15, 15, 3.4, 0, -50, 50);
    this.cam.position.z = 10;
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      uniforms: { uTop: { value: new THREE.Color(0x4f9fdc) }, uHor: { value: new THREE.Color(0xdcf1fa) }, uTime: U.uTime, uCamX: U.uCamX },
      depthTest: false, depthWrite: false,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.999, 1.0); }`,
      fragmentShader: `${COMMON_FRAG.split('// Moving web')[0]}
        uniform vec3 uTop; uniform vec3 uHor; uniform float uCamX; varying vec2 vUv;
        void main(){
          float y = vUv.y;
          vec3 c = mix(uHor, uTop, pow(y, 0.75));
          float cl = fbm2(vec2(vUv.x * 3.2 + uCamX * 0.004 + uTime * 0.01, y * 5.0));
          c = mix(c, vec3(1.0), smoothstep(0.56, 0.78, cl) * 0.5 * smoothstep(0.1, 0.6, y));
          float s = exp(-pow(length((vUv - vec2(0.8, 0.6)) * vec2(1.5, 1.0)) * 5.0, 2.0));
          c += vec3(1.0, 0.95, 0.8) * s * 0.35;
          gl_FragColor = vec4(c, 1.0);
        }`,
    }));
    sky.frustumCulled = false; sky.renderOrder = -10;
    this.scene.add(sky); this.sky = sky;
    this.mats = [silhouetteMaterial(0.5), silhouetteMaterial(0.28), silhouetteMaterial(0.05)];
    this.layer = new THREE.Group(); this.scene.add(this.layer);   // parallax landmarks
    this.live = new THREE.Group(); this.scene.add(this.live);     // lane-depth things: buoy masts, surfers, ship
    this.buildLandmarks();
    this.buildLane();
  }

  at(k, off) { return stationX(k) * PAR + off; }

  add(points, haze, z, h, x = 0, y = 0) {
    const m = polyMesh(points, this.mats[haze], z, h);
    m.position.x = x; m.position.y = y;
    this.layer.add(m); return m;
  }

  buildLandmarks() {
    const A = (k, off) => this.at(k, off);
    const house = (x, w, h, haze, z, off = 0) => this.add([[0, 0], [w, 0], [w, h], [0, h]], haze, z, 3, x, off);
    // ---- far land: long low coastline with headlands, every leg
    for (let i = -1; i < 6; i++) {
      const x0 = this.at(i, -60), x1 = this.at(i + 1, 60);
      const seed = i * 17.3;
      this.add(ridge(x0, x1, x => 0.35 + 1.5 * fbm1(x * 0.07 + seed, 3) * (0.5 + 0.8 * Math.sin((x - x0) / (x1 - x0) * 3.14)), 1.2), 0, -8, 3);
    }
    // ---- Bondi: beach-front apartment blocks, headland and the Icebergs pool
    {
      const x = A(0, 0);
      this.add(ridge(x - 26, x + 20, p => 0.5 + 1.5 * Math.exp(-Math.pow((p - x - 8) / 10, 2)) + 0.2 * fbm1(p * 0.4, 2), 1), 1, -5, 3);
      let hx = x - 22;
      for (let i = 0; i < 18; i++) { const w = 0.9 + hash1(i) * 0.8, h = 0.8 + hash1(i + 9) * 1.4; house(hx, w, h, 1, -4.5); hx += w + 0.15; }
      // Icebergs: low pool building with a flat roof and ocean pool step lines
      const ib = this.add([[0, 0], [5.2, 0], [5.2, 0.85], [4.4, 0.85], [4.4, 1.15], [3.4, 1.15], [3.4, 0.85], [1.2, 0.85], [1.2, 1.2], [0, 1.2]], 2, -2, 1.3, x - 3.5, 0);
      const flag = this.add([[0, 0], [0.04, 0], [0.04, 1.2], [0, 1.2]], 2, -1.9, 1.2, x - 2.3, 1.2);
      this.add([[0.04, 1.2], [0.7, 1.05], [0.04, 0.9]], 2, -1.9, 1.2, x - 2.3, 0.3);
    }
    // ---- Cronulla dunes + Kurnell headland + towers
    {
      const x = A(1, 0);
      this.add(ridge(x - 40, x - 8, p => 0.4 + 1.0 * Math.sin((p - x + 40) / 32 * 3.14) * (0.7 + 0.5 * fbm1(p * 0.2, 2)), 0.8), 1, -4, 2, 0, 0);
      this.add(ridge(x - 8, x + 34, p => 0.25 + 0.55 * fbm1(p * 0.12, 2) + 0.7 * Math.exp(-Math.pow((p - x - 20) / 6, 2)), 0.8), 2, -3, 2);
      let hx = x + 4; for (let i = 0; i < 6; i++) { const w = 0.7 + hash1(i + 4) * 0.5, h = 1.0 + hash1(i + 15) * 1.3; house(hx, w, h, 2, -2.5); hx += w + 0.2; }
      // Kurnell oil tanks
      for (let i = 0; i < 3; i++) this.add([[0, 0], [1.7, 0], [1.7, 0.7], [1.4, 0.85], [0.3, 0.85], [0, 0.7]], 1, -4.2, 1, x - 30 + i * 2.1, 0);
    }
    // ---- Royal National Park cliffs and Bald Hill (Cronulla -> Stanwell Park)
    {
      const x0 = A(1, 60), x1 = A(2, -20);
      this.add(ridge(x0, x1, p => 0.8 + 1.1 * fbm1(p * 0.045, 3) + 0.4 * Math.sin((p - x0) * 0.2), 0.9), 2, -4, 3);
      for (let i = 0; i < 26; i++) { const tx = x0 + hash1(i * 3.3) * (x1 - x0); this.add(tri(0, 0, 0.5, 0.9 + hash1(i) * 0.6), 2, -3.5, 1.4, tx, 1.1 + 0.6 * fbm1(tx * 0.045, 3)); }
    }
    // ---- Stanwell Park: escarpment, Sea Cliff Bridge
    {
      const x = A(2, 0);
      this.add(ridge(x - 55, x + 80, p => 1.2 + 1.9 * fbm1(p * 0.03 + 4, 3) + 0.5 * Math.exp(-Math.pow((p - x + 10) / 10, 2)), 1.2), 2, -6, 3.4);
      this.add(ridge(x - 45, x + 70, p => 0.5 + 0.6 * fbm1(p * 0.08, 3), 1), 1, -3.6, 1.6);
      // Sea Cliff Bridge: a curved viaduct on piers along the cliff face
      const bx = x + 36;
      this.add([[0, 0.78], [11, 0.78], [11, 0.9], [0, 0.9]], 2, -2.4, 1, bx, 0);
      for (let i = 0; i <= 8; i++) this.add([[0, 0], [0.12, 0], [0.12, 0.8], [0, 0.8]], 2, -2.3, 1, bx + i * 1.4, 0);
    }
    // ---- Wollongong: escarpment, breakwater lighthouse, city blocks, Port Kembla stacks
    {
      const x = A(3, 0);
      this.add(ridge(x - 70, x + 60, p => 1.6 + 1.4 * fbm1(p * 0.025 + 11, 3), 1.2), 2, -6, 3.4);
      this.add(ridge(x - 30, x + 10, p => 0.35 + 0.15 * fbm1(p, 2), 1), 2, -3, 1);
      let hx = x - 28; for (let i = 0; i < 12; i++) { const w = 0.8 + hash1(i + 20) * 0.7, h = 0.9 + hash1(i + 30) * 1.6; house(hx, w, h, 2, -3.2); hx += w + 0.15; }
      // Breakwater lighthouse: small striped tower on a wall
      const lx = x - 1;
      this.add([[-2.2, 0], [2.2, 0], [2.2, 0.28], [-2.2, 0.28]], 2, -2.1, 1, lx, 0);
      this.add([[-0.3, 0], [0.3, 0], [0.22, 1.25], [-0.22, 1.25]], 2, -2, 1.3, lx + 1.2, 0.28);
      this.add([[-0.34, 0], [0.34, 0], [0.22, 0.28], [0, 0.46], [-0.22, 0.28]], 2, -1.95, 0.5, lx + 1.2, 1.53);
      // Port Kembla: stacks with plume, buildings
      const sx = x + 38;
      this.add([[0, 0], [6, 0], [6, 0.8], [4.2, 1.0], [4.2, 0.8], [0, 0.8]], 1, -4.2, 1, sx - 5, 0);
      for (const [dx, hgt, wd] of [[0, 3.0, 0.3], [2.3, 2.5, 0.26], [4.6, 2.1, 0.24]]) {
        this.add([[-wd / 2, 0], [wd / 2, 0], [wd * 0.32, hgt], [-wd * 0.32, hgt]], 1, -4, 3, sx + dx, 0.4);
        this.add([[-wd * 0.34, hgt - 0.12], [wd * 0.34, hgt - 0.12], [wd * 0.34, hgt], [-wd * 0.34, hgt]], 1, -3.9, 3, sx + dx, 0.4);
      }
      // steelworks sheds
      for (let i = 0; i < 4; i++) this.add([[0, 0], [2.2, 0], [2.2, 0.6], [1.1, 0.9], [0, 0.6]], 1, -3.4, 1, sx + 7 + i * 2.5, 0);
    }
    // ---- Five Islands + Windang (between Wollongong and Shellharbour)
    {
      const x = A(4, -70);
      for (let i = 0; i < 5; i++) {
        const w = 5 + hash1(i * 4) * 6, h = 0.5 + hash1(i * 7) * 0.7;
        this.add(ridge(0, w, p => h * Math.pow(Math.sin(p / w * 3.14), 0.7) + 0.06 * fbm1(p * 1.4 + i, 2), 0.5), 1, -4.6 + i * 0.1, 1.2, x + i * 16 + hash1(i) * 6, 0);
      }
      this.add(ridge(0, 32, p => 0.1 + 0.35 * fbm1(p * 0.2, 2), 1), 2, -3, 1, A(4, -10), 0);
    }
    // ---- Shellharbour: Bass Point headland
    {
      const x = A(4, 40);
      this.add(ridge(x, x + 55, p => 0.4 + 1.4 * Math.exp(-Math.pow((p - x - 30) / 11, 2)) + 0.35 * fbm1(p * 0.15, 2), 0.8), 2, -3.8, 2.2);
      for (let i = 0; i < 14; i++) { const tx = x + 8 + hash1(i * 2.7) * 40; this.add(tri(0, 0, 0.45, 0.8), 2, -3.6, 1.2, tx, 0.9 + 0.8 * Math.exp(-Math.pow((tx - x - 30) / 11, 2))); }
    }
    // ---- Kiama: headland, lighthouse, blowhole
    {
      const x = A(5, 0);
      this.add(ridge(x - 50, x + 60, p => 0.7 + 0.9 * fbm1(p * 0.05 + 33, 3) + 0.8 * Math.exp(-Math.pow((p - x + 2) / 12, 2)), 0.8), 1, -4, 2.5);
      this.add(ridge(x - 25, x + 22, p => 0.28 + 0.25 * fbm1(p * 0.3, 2) + 0.5 * Math.exp(-Math.pow((p - x) / 7, 2)), 0.8), 2, -2.6, 1.4);
      // Kiama lighthouse: white tower, balcony, lantern
      const lx = x - 1.5, ly = 0.95;
      this.add([[-0.34, 0], [0.34, 0], [0.24, 1.15], [-0.24, 1.15]], 2, -2, 1.3, lx, ly);
      this.add([[-0.36, 0], [0.36, 0], [0.36, 0.06], [-0.36, 0.06]], 2, -1.95, 0.3, lx, ly + 1.15);
      this.add([[-0.2, 0], [0.2, 0], [0.2, 0.3], [0, 0.5], [-0.2, 0.3]], 2, -1.9, 0.6, lx, ly + 1.21);
      // Norfolk-pine style trees on the headland
      for (let i = 0; i < 7; i++) this.add([[-0.04, 0], [0.04, 0], [0.04, 0.55], [0.26, 0.4], [0.0, 1.05], [-0.26, 0.4], [-0.04, 0.55]], 2, -2.2, 1.1, x + 6 + i * 2.3, 0.9 + 0.2 * fbm1(i * 3, 2));
      this.blowholeX = x + 7;
    }
    // distant gulls
    this.gulls = [];
    for (let i = 0; i < 6; i++) {
      const m = polyMesh([[-0.28, 0], [-0.1, 0.1], [0, 0.03], [0.1, 0.1], [0.28, 0], [0.1, 0.05], [0, -0.03], [-0.1, 0.05]], this.mats[2], -1, 0.1);
      m.userData = { x: this.at(i, 20 + hash1(i) * 60), y: 1.7 + hash1(i * 3) * 1.1, s: 0.4 + hash1(i * 5) * 0.4, ph: hash1(i * 9) * 6 };
      this.layer.add(m); this.gulls.push(m);
    }
  }

  buildLane() {
    // Lane-depth silhouettes: station buoy masts (set via setStations), surfers (setSurfers), ship (setShip).
    this.mastMat = new THREE.MeshBasicMaterial({ color: 0xe8741a });
    this.darkMat = new THREE.MeshBasicMaterial({ color: 0x1b2a33 });
    this.masts = [];
    for (let k = 0; k < 6; k++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.28, 0.62, 12), new THREE.MeshBasicMaterial({ color: 0xf1b01c }));
      body.position.y = 0.0;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.255, 0.265, 0.1, 12), new THREE.MeshBasicMaterial({ color: 0x1b2a33 })); band.position.y = 0.04;
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.9, 6), this.darkMat); mast.position.y = 0.7;
      const light = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe9a0 })); light.position.y = 1.18;
      g.add(body, band, mast, light); g.position.set(stationX(k), 0.06, 0.5);
      g.userData.light = light;
      this.live.add(g); this.masts.push(g);
    }
    // surfers pool
    this.surfers = [];
    const sk = new THREE.MeshBasicMaterial({ color: 0x172229 });
    for (let i = 0; i < 10; i++) {
      const g = new THREE.Group();
      const board = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 1.5, 3, 8), new THREE.MeshBasicMaterial({ color: [0xf2f2ee, 0xf2b01c, 0x2a8fd0, 0xe84a3a][i % 4] })); board.rotation.z = Math.PI / 2; board.position.y = 0.04;
      const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.34, 3, 8), sk); torso.position.set(-0.06, 0.34, 0);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.095, 10, 8), sk); head.position.set(0.0, 0.7, 0);
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.34, 3, 6), sk); arm.position.set(0.18, 0.4, 0); arm.rotation.z = -1.1;
      g.add(board, torso, head, arm); g.visible = false;
      this.live.add(g); this.surfers.push(g);
    }
    // ship above water: hull side, containers, bridge, funnel (positioned at ship x)
    this.ship = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.PlaneGeometry(38, 0.4), new THREE.MeshBasicMaterial({ color: 0x1c2328 }));
    hull.position.set(0, 0.2, 0);
    this.ship.add(hull);
    const cols = [0xb23a2a, 0x2f6fa3, 0xd9a421, 0x3b8f5a, 0xc9c9c4, 0x8a3b6c];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 17; c++) {
      if (r > 0 && c < 3) continue;
      const w = 1.9, b = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.94, 0.52), new THREE.MeshBasicMaterial({ color: cols[Math.floor(hash1(c * 7 + r * 13) * cols.length)] }));
      b.position.set(-17.5 + c * w, 0.4 + 0.27 + r * 0.55, 0.05);
      this.ship.add(b);
    }
    const bridge = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.2), new THREE.MeshBasicMaterial({ color: 0xe4e4e0 })); bridge.position.set(16.2, 1.4, 0.06);
    const windows = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 0.3), new THREE.MeshBasicMaterial({ color: 0x23323a })); windows.position.set(16.2, 1.95, 0.07);
    const funnel = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.2), new THREE.MeshBasicMaterial({ color: 0x2f6fa3 })); funnel.position.set(14.2, 1.9, 0.05);
    const bow = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.5), new THREE.MeshBasicMaterial({ color: 0x1c2328 })); bow.position.set(-18.5, 0.45, 0.02);
    this.ship.add(bridge, windows, funnel, bow);
    this.ship.visible = false;
    this.live.add(this.ship);
    // waterline foam strip
    const foam = new THREE.Mesh(new THREE.PlaneGeometry(400, 0.14), new THREE.ShaderMaterial({
      uniforms: { uTime: U.uTime, uCamX: U.uCamX },
      transparent: true, depthTest: false,
      vertexShader: `varying vec2 vUv; varying float vX; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vX = w.x; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform float uTime; varying vec2 vUv; varying float vX; void main(){ float w = 0.5 + 0.5 * sin(vX * 3.1 + uTime * 1.3) * sin(vX * 0.9 - uTime * 0.7); float a = smoothstep(0.0, 0.4, vUv.y) * (0.6 + 0.4 * w); gl_FragColor = vec4(vec3(0.92, 0.99, 1.0), a); }`,
    }));
    foam.position.set(0, 0.04, 2); foam.renderOrder = 10; foam.frustumCulled = false;
    this.foam = foam; this.live.add(foam);
    // Kiama blowhole spout: stack of fading blobs
    this.spout = [];
    const bm = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthTest: false });
    for (let i = 0; i < 9; i++) { const m = new THREE.Mesh(new THREE.CircleGeometry(0.2, 10), bm.clone()); m.renderOrder = 5; this.live.add(m); this.spout.push(m); }
  }

  /** Sync with game/palette each frame. W,H: band size in world units, camX: camera x. */
  update(camX, bandW, bandH, pal, frame) {
    const cam = this.cam;
    cam.left = -bandW / 2; cam.right = bandW / 2; cam.top = bandH; cam.bottom = 0; cam.updateProjectionMatrix();
    this.layer.position.x = -camX * PAR + camX * 0; // layer coords: world x * PAR, camera centred below
    this.layer.position.x = -camX * PAR;
    this.live.position.x = -camX;
    this.sky.material.uniforms.uTop.value.copy(pal.skyTop);
    this.sky.material.uniforms.uHor.value.copy(pal.skyHor);
    for (const m of this.mats) { m.uniforms.uLand.value.copy(pal.land).multiplyScalar(0.65); m.uniforms.uHor.value.copy(pal.skyHor); }
    const t = U.uTime.value;
    for (const g of this.gulls) { const u = g.userData; g.position.set(u.x + Math.sin(t * 0.2 + u.ph) * 2, u.y + Math.sin(t * 0.9 + u.ph) * 0.12, -1); g.scale.set(u.s, u.s * (0.6 + 0.4 * Math.sin(t * 3 + u.ph)), 1); }
    this.foam.position.x = camX;
    // blowhole spout, only near Kiama
    const bx = this.blowholeX / PAR; // world x of the blowhole in layer space
    const near = Math.abs(camX * PAR - this.blowholeX) < 20;
    this.spout.forEach((m, i) => {
      m.visible = near;
      if (!near) return;
      const ph = ((t * 0.5 + i * 0.11) % 1);
      const burst = Math.max(0, Math.sin(t * 0.45) * 1.3 - 0.2);
      m.position.set(this.blowholeX - camX * PAR + Math.sin(i * 2.1 + t) * 0.12 * ph * 2, 0.6 + ph * (1.4 * burst + 0.2), -1.5);
      m.scale.setScalar(0.5 + ph * 1.2); m.material.opacity = 0.55 * (1 - ph) * Math.min(1, burst * 2);
      m.parent.updateMatrixWorld;
    });
    // spout meshes live in 'live' group: convert since live shifts by -camX
    this.spout.forEach(m => { m.position.x += camX; });
  }
}

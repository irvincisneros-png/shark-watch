// Views for everything in the lane that isn't the hero or the prey: listening stations and domes, nets, fishing line,
// drumlines, the ship and its prop wash, current ribbons, pick-ups, plastic bags, buried rays, surfers.
import * as THREE from 'three';
import { U } from './uniforms.js';
import { COMMON_FRAG } from './glsl.js';
import { makeMaterial } from './materials.js';
import { buildFish } from '../art/fishModel.js';
import { PREY_LOOKS } from '../art/preyLooks.js';
import { buildRayMesh } from './prey.js';
import { stationList, floorY } from '../logic/route.js';
import { domeOf, DOME } from '../logic/dome.js';
import { SHIP_DIMS } from '../logic/sim.js';
import { hash1 } from '../logic/rng.js';
import { makeHullMaterial } from './hullMaterial.js';
import { hullGeometry, propellerGeometry, rudderGeometry } from '../art/shipHull.js';

export function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.25, 'rgba(255,255,255,0.45)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function labelTexture(name, sub) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.font = '700 54px "Trebuchet MS", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = 'rgba(8,40,60,0.55)';
  const w = Math.max(g.measureText(name.toUpperCase()).width + 56, 200);
  const r = 22, x0 = 256 - w / 2, y0 = 18, h = 60;
  g.beginPath(); g.roundRect(x0, y0, w, h + 32, r); g.fill();
  g.fillStyle = '#fff'; g.fillText(name.toUpperCase(), 256, 50);
  g.font = '600 28px "Trebuchet MS", system-ui, sans-serif'; g.fillStyle = 'rgba(190,240,250,0.95)';
  g.fillText(sub, 256, 96);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

const DOME_FRAG = /* glsl */`
${COMMON_FRAG}
uniform float uPulse; uniform float uPing; uniform float uInside; uniform vec3 uCentre; varying vec3 vWP; varying vec3 vN;
void main(){
  vec3 V = normalize(cameraPosition - vWP);
  float fr = pow(1.0 - abs(dot(normalize(vN), V)), 3.0);
  float rings = smoothstep(0.82, 1.0, sin(vWP.y * 3.2 - uTime * 1.2) * 0.5 + 0.5) * 0.2;
  float lat = smoothstep(0.88, 1.0, sin(atan(vWP.x - uCentre.x, vWP.z) * 9.0) * 0.5 + 0.5) * 0.08;
  float sweep = smoothstep(0.0, 1.0, 1.0 - abs(fract(uTime * 0.18) - 0.5) * 2.0);
  float a = 0.03 + fr * (0.22 + 0.3 * uInside) + rings * 0.5 + lat * 0.5 + uPing * 0.3 + uInside * 0.05;
  vec3 col = mix(vec3(0.25, 0.95, 0.85), vec3(1.0, 0.95, 0.45), uPing);
  gl_FragColor = vec4(col, clamp(a, 0.0, 0.85));
}`;

const NET_FRAG = /* glsl */`
uniform float uCut; uniform float uHoleY; uniform float uTime; uniform float uAlpha; varying vec2 vUv; varying vec2 vSize;
void main(){
  vec2 p = vUv * vSize;
  // diamond mesh
  vec2 d = vec2(p.x + p.y, p.x - p.y) * 1.9;
  vec2 f = abs(fract(d) - 0.5);
  float line = 1.0 - smoothstep(0.02, 0.07, min(f.x, f.y));
  float hole = 0.0;
  if (uCut > 0.5) { vec2 q = (vUv - vec2(0.5, uHoleY)) * vec2(1.4, 1.0); hole = 1.0 - smoothstep(0.1, 0.3, length(q * vec2(vSize.x, vSize.y) / 3.0)); }
  float a = (line * 0.8 + 0.06) * (1.0 - hole) * uAlpha;
  float edge = smoothstep(0.0, 0.03, vUv.y) * smoothstep(1.0, 0.97, vUv.y);
  gl_FragColor = vec4(vec3(0.66, 0.74, 0.62), a * edge + 0.0);
}`;

export class WorldObjects {
  constructor(scene, sky, particles, tier) {
    this.scene = scene; this.sky = sky; this.fx = particles; this.tier = tier;
    this.views = new Map();
    this.glowTex = glowTexture();
    this.stations = [];
    this.buildStations();
    this.shipViewGroup = null;
    // shared geometry/materials
    this.matBuoy = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.matLine = new THREE.MeshBasicMaterial({ color: 0xd9e6df, transparent: true, opacity: 0.85 });
    this.baitFish = buildFish({ ...PREY_LOOKS.salmon, length: 0.5 });
    this.baitMat = makeMaterial({ map: this.baitFish.texture, side: THREE.DoubleSide, rim: 0.3 });
    this.rayProto = buildRayMesh(tier);
    this.plasticGeo = new THREE.SphereGeometry(0.62, 18, 14);
    this.plasticMat = new THREE.ShaderMaterial({
      uniforms: { ...U, uPh: { value: 0 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: `uniform float uTime; varying vec3 vN; varying vec3 vWP; void main(){ vec3 p = position; float w = sin(uTime * 2.3 + p.y * 5.0 + modelMatrix[3].x) * 0.1 + sin(uTime * 3.1 + p.x * 7.0) * 0.05; p += normal * w; p.y *= 1.0 + 0.15 * sin(uTime * 1.6 + modelMatrix[3].x); vec4 w4 = modelMatrix * vec4(p, 1.0); vWP = w4.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w4; }`,
      fragmentShader: `${COMMON_FRAG} varying vec3 vN; varying vec3 vWP; void main(){ vec3 V = normalize(cameraPosition - vWP); float fr = pow(1.0 - abs(dot(normalize(vN), V)), 1.8); vec3 base = underwater(vec3(0.9, 0.93, 0.96), normalize(vN), vWP, 0.4, fr * 0.4, 1.0); float crinkle = vnoise(vWP.xy * 5.0 + uTime * 0.1); gl_FragColor = vec4(base + fr * 0.2, 0.42 + fr * 0.4 + crinkle * 0.1); }`,
    });
    this.hullMat = makeHullMaterial();
    this.propGeo = propellerGeometry(1.5); this.rudderGeo = rudderGeometry(1.25, 2.5);
    this.propMat = makeMaterial({ vertexColors: true, side: THREE.DoubleSide, caustic: 0.9, rim: 0.5, fogMult: 0.9 });
    this.mkNetGeoCache = new Map();
  }

  // ---- stations ---------------------------------------------------------------------------------------------------
  buildStations() {
    for (const st of stationList) {
      const g = new THREE.Group(); g.position.set(st.x, 0, 0);
      const d = domeOf(st.index);
      // ellipsoid dome
      const mat = new THREE.ShaderMaterial({
        uniforms: { ...U, uPulse: { value: 0 }, uPing: { value: 0 }, uInside: { value: 0 }, uCentre: { value: new THREE.Vector3(st.x, d.y, 0) } },
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        vertexShader: `varying vec3 vWP; varying vec3 vN; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vWP = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
        fragmentShader: DOME_FRAG,
      });
      const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 24), mat);
      dome.scale.set(d.rx, d.ry, d.ry * 1.25); dome.position.y = d.y; dome.renderOrder = 5;
      // mooring line, anchor and receiver
      const fy = floorY(st.x);
      const lineLen = -fy;
      const line = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, lineLen, 6), new THREE.MeshBasicMaterial({ color: 0x1b2a33, transparent: true, opacity: 0.8 }));
      line.position.set(0, fy / 2, 0);
      const anchor = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 0.4, 14), makeMaterial({ tint: 0x4a4f52, caustic: 0.6 }));
      anchor.position.set(0, fy + 0.2, 0);
      const rx = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.0, 12), makeMaterial({ tint: 0xe8741a, caustic: 0.8, emissive: 0.1 }));
      rx.position.set(0, fy + 0.9, 0);
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: 0x66ffcc })); led.position.set(0, fy + 1.45, 0.1);
      // buoy (underwater half) with floats
      const buoy = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.9, 1.1, 16), makeMaterial({ tint: 0xf1b01c, caustic: 0.8, emissive: 0.12 }));
      buoy.position.set(0, -0.3, 0.5);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.83, 0.86, 0.22, 16), makeMaterial({ tint: 0x1b2a33, caustic: 0.2 })); band.position.set(0, -0.58, 0.5);
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(st.name, `${st.index + 1} of 6 stations`), transparent: true, depthWrite: false, depthTest: false }));
      label.scale.set(5.6, 1.4, 1); label.position.set(0, -2.1, 1.2); label.renderOrder = 30;
      g.add(dome, line, anchor, rx, led, buoy, band, label);
      this.scene.add(g);
      this.stations.push({ g, mat, led, label, state: 0, ping: 0 });
    }
  }

  updateStations(sim, t, dt) {
    const pings = sim.log.detected;
    for (const s of this.stations) s.ping = Math.max(0, s.ping - dt * 0.7);
    for (let i = 0; i < this.stations.length; i++) {
      const s = this.stations[i], d = domeOf(i);
      const inside = Math.abs(sim.x - d.x) < DOME.rx * 1.05 && Math.abs(sim.y - d.y) < DOME.ry * 1.1 && ((sim.x - d.x) / d.rx) ** 2 + ((sim.y - d.y) / d.ry) ** 2 < 1 ? 1 : 0;
      const near = Math.abs(sim.x - d.x) < 150;
      s.g.visible = Math.abs(sim.x - d.x) < 230;
      s.mat.uniforms.uInside.value += (inside - s.mat.uniforms.uInside.value) * 0.2;
      s.mat.uniforms.uPing.value = s.ping;
      s.label.material.opacity = near ? 1 : 0;
      s.led.material.color.setHex(Math.sin(t * 5 + i) > 0.2 ? 0x66ffcc : 0x1b6a58);
      s.label.visible = near;
    }
  }
  pingStation(i) { this.stations[i].ping = 1; }

  // ---- entity views ---------------------------------------------------------------------------------------------------
  makeView(e) {
    const g = new THREE.Group(); g.position.set(e.x, e.y, 0);
    const v = { g, e, kind: e.kind, extra: {} };
    switch (e.kind) {
      case 'plastic': {
        const bag = new THREE.Mesh(this.plasticGeo, this.plasticMat);
        const h1 = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.025, 6, 14), this.plasticMat); h1.position.set(0, 0.62, 0); h1.scale.set(1, 1.5, 1);
        g.add(bag, h1); g.rotation.z = (hash1(e.id) - 0.5) * 0.8; v.extra.bag = bag;
        break;
      }
      case 'line': {
        const len = 0.5 - e.yb;
        const ln = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, len, 5), this.matLine.clone());
        ln.position.set(0, len / 2 + e.yb - e.y, 0); g.position.set(e.x, 0, 0); ln.position.y = e.yb + len / 2;
        const bob = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshBasicMaterial({ color: 0xe84a3a })); bob.position.set(0, 0.05, 0);
        const hookMat = new THREE.MeshBasicMaterial({ color: 0xcdd3d6 });
        const hooks = [];
        for (const dy of [0, 0.9]) {
          const h = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.03, 6, 14, Math.PI * 1.5), hookMat); h.position.set(0.06, e.yb + 0.05 + dy, 0); h.rotation.z = -0.4;
          const lure = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.22, 3, 8), new THREE.MeshBasicMaterial({ color: dy ? 0xff8a3a : 0x6fd0ff })); lure.position.set(-0.04, e.yb + 0.28 + dy, 0);
          g.add(h, lure); hooks.push(h, lure);
        }
        const sinker = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0x444a50 })); sinker.position.set(0, e.yb - 0.1, 0);
        g.add(ln, bob, sinker); v.extra.ln = ln; v.extra.parts = [ln, bob, sinker, ...hooks]; v.extra.bob = bob;
        break;
      }
      case 'net': {
        const w = 4.8, h = e.ytop - e.ybot;
        const mat = new THREE.ShaderMaterial({
          uniforms: { uCut: { value: 0 }, uHoleY: { value: 0.5 }, uTime: U.uTime, uAlpha: { value: 0.9 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide,
          vertexShader: `uniform float uTime; varying vec2 vUv; varying vec2 vSize; void main(){ vUv = uv; vSize = vec2(${w.toFixed(2)}, ${h.toFixed(2)}); vec3 p = position; p.x += sin(uTime * 0.9 + position.y * 0.6) * 0.07 * (1.0 - uv.y * 0.0); gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
          fragmentShader: NET_FRAG,
        });
        const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, h, 6, 8), mat); panel.position.set(0, (e.ytop + e.ybot) / 2, 0.05);
        // floats along the head rope, weights along the foot rope, anchor lines to the seabed
        const floatMat = new THREE.MeshBasicMaterial({ color: 0xff7a1a });
        const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, w, 6), new THREE.MeshBasicMaterial({ color: 0x2c3a2e })); rope.rotation.z = Math.PI / 2; rope.position.set(0, e.ytop, 0.05);
        const foot = rope.clone(); foot.position.y = e.ybot;
        g.add(panel, rope, foot);
        for (let i = 0; i < 7; i++) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), floatMat); f.position.set(-w / 2 + 0.3 + i * (w - 0.6) / 6, e.ytop + 0.12, 0.1); g.add(f); }
        const fy = floorY(e.x);
        for (const sx of [-1, 1]) {
          const len = Math.hypot(w * 0.5, e.ybot - fy);
          const a = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, len, 5), new THREE.MeshBasicMaterial({ color: 0x2c3a2e, transparent: true, opacity: 0.8 }));
          a.position.set(sx * w * 0.75, (e.ybot + fy) / 2, 0.05); a.rotation.z = -sx * Math.atan2(w * 0.5, e.ybot - fy) * -1; g.add(a);
        }
        g.position.set(e.x, 0, 0); v.extra.mat = mat;
        break;
      }
      case 'drumline': {
        const fy = e.baitY;
        const line = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, -fy, 5), new THREE.MeshBasicMaterial({ color: 0xcfd8d4 })); line.position.set(0, fy / 2, 0);
        const buoy = new THREE.Mesh(new THREE.SphereGeometry(0.62, 16, 12), makeMaterial({ tint: 0xe8741a, emissive: 0.12 })); buoy.position.set(0, -0.12, 0.2);
        const buoy2 = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 10), makeMaterial({ tint: 0xf2f2ee, emissive: 0.1 })); buoy2.position.set(1.3, -0.1, 0.1);
        const hook = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.06, 8, 20, Math.PI * 1.45), new THREE.MeshBasicMaterial({ color: 0xc6ccd0 })); hook.position.set(0, fy - 0.3, 0); hook.rotation.z = -0.9;
        const bait = new THREE.Mesh(this.baitFish.geometry, this.baitMat); bait.scale.setScalar(1.7); bait.position.set(0.1, fy - 0.1, 0); bait.rotation.z = -0.4;
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0xffd9a0, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false })); glow.scale.set(2.8, 2.8, 1); glow.position.set(0, fy, 0.2);
        g.add(line, buoy, buoy2, hook, bait, glow); g.position.set(e.x, 0, 0); v.extra.bait = bait; v.extra.glow = glow;
        break;
      }
      case 'ship': this.buildShip(v, e); break;
      case 'eac': {
        const mat = new THREE.ShaderMaterial({
          uniforms: { ...U, uLen: { value: e.len }, uH: { value: e.h } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
          vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
          fragmentShader: `${COMMON_FRAG} uniform float uLen; uniform float uH; varying vec2 vUv;
            void main(){
              float ex = smoothstep(0.0, 0.1, vUv.x) * smoothstep(1.0, 0.9, vUv.x);
              float ey = 1.0 - pow(abs(vUv.y - 0.5) * 2.0, 2.0);
              vec2 p = vec2(vUv.x * uLen * 0.25 - uTime * 2.2, vUv.y * uH * 0.9);
              float s = vnoise(vec2(p.x * 0.9, p.y * 3.0 + sin(p.x * 0.8) * 1.6));
              float streak = smoothstep(0.52, 0.82, s);
              float a = ex * ey * (0.06 + streak * 0.55);
              vec3 col = mix(vec3(1.0, 0.72, 0.28), vec3(1.0, 0.95, 0.7), streak);
              gl_FragColor = vec4(col * a, a);
            }`,
        });
        const m = new THREE.Mesh(new THREE.PlaneGeometry(e.len, e.h), mat); m.position.set(e.len / 2, 0, -1.2); m.renderOrder = 4;
        g.add(m); g.position.set(e.x, e.y, 0);
        break;
      }
      case 'pickup': this.buildPickup(v, e); break;
      case 'ray': {
        const m = this.rayProto.clone(); m.material = this.rayProto.material.clone(); m.scale.setScalar(1);
        m.rotation.y = hash1(e.id) > 0.5 ? 0 : Math.PI;
        g.add(m); v.extra.mesh = m;
        const ring = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0xb7a0ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })); ring.scale.set(5.5, 3.2, 1); ring.position.set(0, 0.3, 0.6);
        g.add(ring); v.extra.ring = ring;
        break;
      }
      case 'surfer': v.extra.slot = null; break;
      default: break;
    }
    this.scene.add(g);
    return v;
  }

  buildShip(v, e) {
    const L = e.len, B = 7.2, d = -SHIP_DIMS.draft;
    const hull = new THREE.Mesh(hullGeometry(L, B, d), this.hullMat);
    hull.frustumCulled = false;
    v.g.add(hull);
    // propeller (spins round the ship's x axis), boss-mounted behind the keel line, with the rudder behind it
    const prop = new THREE.Group(); prop.position.set(L / 2 + 0.2, -d * 0.72, 0);
    prop.add(new THREE.Mesh(this.propGeo, this.propMat));
    v.extra.prop = prop;
    const rudder = new THREE.Mesh(this.rudderGeo, this.hullMat); rudder.position.set(L / 2 + 0.85, -0.75, 0);
    v.g.add(prop, rudder);
    // prop wash plane (matches the sim's danger ellipse)
    const rx = SHIP_DIMS.propRx, ry = SHIP_DIMS.propRy;
    const washMat = new THREE.ShaderMaterial({
      uniforms: { ...U }, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `${COMMON_FRAG} varying vec2 vUv;
        void main(){
          vec2 c = (vUv - 0.5) * 2.0; float r = length(c);
          float ell = 1.0 - smoothstep(0.55, 1.0, r);
          float ang = atan(c.y, c.x);
          vec2 p = vec2(c.x * 5.0 - uTime * 1.2, c.y * 5.0 + sin(uTime + c.x * 3.0));
          float n = fbm2(p + vec2(sin(ang * 3.0 + uTime * 2.0) * 0.4, 0.0));
          float st = smoothstep(0.45, 0.8, n);
          float a = ell * (0.12 + st * 0.5);
          gl_FragColor = vec4(vec3(0.85, 0.97, 1.0), a);
        }`,
    });
    const wash = new THREE.Mesh(new THREE.PlaneGeometry(rx * 2, ry * 2), washMat);
    wash.position.set(L / 2 - SHIP_DIMS.propFromEnd, SHIP_DIMS.propY, 0.6); wash.renderOrder = 6;
    v.g.add(wash); v.extra.wash = wash;
    v.g.position.set(e.x, 0, 0);
    v.extra.above = this.sky.ship;
  }

  buildPickup(v, e) {
    const g = v.g; g.position.set(e.x, e.y, 0.2);
    const colors = { electro: 0x6fd8ff, bait: 0xffe08a, scent: 0xb5ff7a, battery: 0xffc233 };
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: colors[e.type], transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.set(3.6, 3.6, 1); glow.position.z = -0.2; g.add(glow); v.extra.glow = glow;
    const em = c => new THREE.MeshBasicMaterial({ color: c });
    switch (e.type) {
      case 'electro': {
        const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 1), em(0xbff0ff));
        const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(0.78, 1), new THREE.MeshBasicMaterial({ color: 0x4fc3ff, wireframe: true, transparent: true, opacity: 0.8 }));
        g.add(core, shell); v.extra.spin = [shell];
        // lightning arc ring
        const pts = []; for (let i = 0; i <= 24; i++) { const a = (i / 24) * 6.283, r = 1.0 + (i % 2) * 0.22; pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0)); }
        const arc = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xcaf4ff, transparent: true, opacity: 0.9 })); g.add(arc); v.extra.arc = arc;
        break;
      }
      case 'bait': {
        v.extra.fish = [];
        for (let i = 0; i < 12; i++) {
          const f = new THREE.Mesh(this.baitFish.geometry, this.baitMat); f.scale.setScalar(0.8); g.add(f);
          v.extra.fish.push({ f, a: (i / 12) * 6.283, r: 0.55 + (i % 3) * 0.28, s: 0.9 + hash1(i) * 0.8, z: (hash1(i * 3) - 0.5) * 1.2 });
        }
        break;
      }
      case 'scent': {
        const orb = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 10), em(0xd6ff9a));
        g.add(orb);
        v.extra.rings = [0, 1].map(i => { const r = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.66, 32), new THREE.MeshBasicMaterial({ color: 0xb5ff7a, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false })); g.add(r); return r; });
        break;
      }
      case 'battery': {
        const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.9, 6, 12), new THREE.MeshBasicMaterial({ color: 0xffb81c }));
        body.rotation.z = Math.PI / 2;
        const band = new THREE.Mesh(new THREE.CylinderGeometry(0.355, 0.355, 0.18, 16), em(0x1b2a33)); band.rotation.z = Math.PI / 2; band.position.x = 0.25;
        const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.25, 8), em(0xdde4e6)); tip.rotation.z = Math.PI / 2; tip.position.x = 0.95;
        const bolt = new THREE.Shape(); bolt.moveTo(0.05, 0.28); bolt.lineTo(-0.12, -0.02); bolt.lineTo(0, -0.02); bolt.lineTo(-0.06, -0.3); bolt.lineTo(0.14, 0.04); bolt.lineTo(0.02, 0.04); bolt.closePath();
        const bm = new THREE.Mesh(new THREE.ShapeGeometry(bolt), em(0x1b2a33)); bm.position.set(-0.28, 0, 0.36); bm.scale.setScalar(1.2);
        g.add(body, band, tip, bm); v.extra.tilt = true;
        break;
      }
    }
  }

  // ---- per-frame sync --------------------------------------------------------------------------------------------------
  update(sim, dt, t, camX) {
    this.updateStations(sim, t, dt);
    const seen = new Set();
    let surferSlot = 0;
    const sky = this.sky;
    sky.ship.visible = false;
    for (const s of sky.surfers) s.visible = false;
    for (const e of sim.entities) {
      if (e.kind === 'fish' || !e.alive || e.taken) continue;
      let v = this.views.get(e.id);
      if (!v) { v = this.makeView(e); this.views.set(e.id, v); }
      seen.add(e.id);
      switch (e.kind) {
        case 'plastic': v.g.position.set(e.x, e.y, 0); v.g.rotation.z += dt * 0.2; break;
        case 'line': {
          const reveal = e.hidden ? (sim.senseActive ? 0.95 : 0.1) : 0.85;
          for (const p of v.extra.parts) { if (p.material.opacity !== undefined) { p.material.transparent = true; p.material.opacity = reveal; } }
          v.extra.bob.position.y = 0.05 + Math.sin(t * 1.4 + e.id) * 0.06;
          v.extra.ln.material.color.setHex(e.hidden && sim.senseActive ? 0xd6a8ff : 0xd9e6df);
          break;
        }
        case 'net': {
          const m = v.extra.mat.uniforms;
          if (e.cut && m.uCut.value < 0.5) { m.uCut.value = 1; m.uHoleY.value = Math.max(0.2, Math.min(0.8, (sim.y - e.ybot) / (e.ytop - e.ybot))); }
          break;
        }
        case 'drumline': v.extra.glow.material.opacity = 0.4 + 0.2 * Math.sin(t * 4); v.extra.bait.rotation.z = -0.4 + Math.sin(t * 1.4) * 0.12; v.g.visible = !e.used || true; break;
        case 'ship': this.updateShip(v, e, t, camX); break;
        case 'eac': v.g.position.set(e.x, e.y, 0); break;
        case 'pickup': this.updatePickup(v, e, t); break;
        case 'ray': {
          const target = sim.senseActive ? 1 : 0;
          const m = v.extra.mesh, a = m.material.opacity ?? 0;
          m.material.uniforms.uAlpha.value += (target - m.material.uniforms.uAlpha.value) * Math.min(1, dt * 6);
          m.visible = m.material.uniforms.uAlpha.value > 0.02;
          v.extra.ring.material.opacity = m.material.uniforms.uAlpha.value * (0.5 + 0.3 * Math.sin(t * 4 + e.id));
          v.g.position.set(e.x, e.y, 0);
          break;
        }
        case 'surfer': {
          const s = sky.surfers[surferSlot++ % sky.surfers.length];
          s.visible = true; s.position.set(e.x, 0.06 + Math.sin(t * 1.1 + e.id) * 0.04, 0.2);
          if (!v.extra.legs) {
            const legMat = new THREE.MeshBasicMaterial({ color: 0x141e24, transparent: true, opacity: 0.8 });
            const board = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 1.5, 3, 8), new THREE.MeshBasicMaterial({ color: 0x1a2a30 })); board.rotation.z = Math.PI / 2; board.position.set(0, -0.06, 0);
            const l1 = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.75, 3, 6), legMat); l1.position.set(-0.1, -0.5, 0.1); l1.rotation.z = 0.15;
            const l2 = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.7, 3, 6), legMat); l2.position.set(0.1, -0.48, -0.05); l2.rotation.z = -0.1;
            v.g.add(board, l1, l2); v.extra.legs = [l1, l2];
          }
          v.g.position.set(e.x, 0, 0.2);
          v.extra.legs[0].rotation.z = 0.15 + Math.sin(t * 1.6 + e.id) * 0.12; v.extra.legs[1].rotation.z = -0.1 + Math.cos(t * 1.4 + e.id) * 0.12;
          break;
        }
      }
    }
    for (const [id, v] of this.views) if (!seen.has(id)) { this.scene.remove(v.g); this.views.delete(id); }
  }

  updateShip(v, e, t, camX) {
    v.g.position.set(e.x, 0, 0);
    v.extra.prop.rotation.x = t * 14;
    this.sky.ship.visible = true; this.sky.ship.position.set(e.x, 0, -0.5);
    // churning wash: bubbles spiral off the propeller disc and stream astern
    const px = e.x + e.len / 2 + 0.6;
    for (let k = 0; k < 3; k++) { const a = Math.random() * 6.283, r = 1.0 + Math.random() * 1.1; this.fx.bubbles.spawn(px + Math.random() * 1.2, -2.45 + Math.sin(a) * r, Math.cos(a) * r * 0.7, 1.5 + Math.random() * 2.2, Math.sin(a) * 0.5, Math.cos(a) * 0.4, 3.2, 0.1 + Math.random() * 0.2, 0.92, 0.98, 1, 0.8, 1); }
  }

  updatePickup(v, e, t) {
    const bob = Math.sin(t * 2 + e.id) * 0.25;
    v.g.position.set(e.x, e.y + bob, 0.2);
    v.extra.glow.material.opacity = 0.6 + 0.25 * Math.sin(t * 3 + e.id);
    switch (e.type) {
      case 'electro': v.extra.spin[0].rotation.y = t * 1.5; v.extra.spin[0].rotation.x = t * 1.1; v.extra.arc.rotation.z = t * 2.4; v.extra.arc.scale.setScalar(0.9 + 0.12 * Math.sin(t * 17)); break;
      case 'bait': for (const f of v.extra.fish) { f.a += 0.02 * f.s * 3; const r = f.r + Math.sin(t * 2 + f.a) * 0.1; f.f.position.set(Math.cos(f.a) * r * 1.4, Math.sin(f.a) * r, f.z); f.f.rotation.z = f.a + Math.PI / 2; } break;
      case 'scent': v.extra.rings.forEach((r, i) => { const k = (t * 0.7 + i * 0.5) % 1; r.scale.setScalar(1 + k * 1.8); r.material.opacity = 0.6 * (1 - k); }); break;
      case 'battery': v.g.rotation.z = Math.sin(t * 1.5) * 0.25; break;
    }
  }
}

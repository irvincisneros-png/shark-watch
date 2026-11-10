// Tagged! Bondi to Kiama. Boots the renderer, wires the pure simulation to the 3D views, HUD, audio and screens.
import * as THREE from 'three';
import { Sim } from './logic/sim.js';
import { GameFSM } from './logic/fsm.js';
import { botInput } from './logic/bot.js';
import { stationList, LEGS, START_X, END_X } from './logic/route.js';
import { INTRO_CAPTIONS, HINTS, LINES, FACTS } from './logic/content.js';
import { loadBest } from './logic/score.js';
import { U } from './render/uniforms.js';
import { makePalette, paletteAt } from './render/palettes.js';
import { Backdrop, GodRays, Surface, SkyBand } from './render/env.js';
import { Terrain } from './render/terrain.js';
import { PreyView } from './render/prey.js';
import { WorldObjects } from './render/objects.js';
import { HeroShark, SHARK_L } from './render/shark.js';
import { Particles } from './render/particles.js';
import { Boat } from './render/boat.js';
import { setKelpDetail } from './art/kelp.js';
import { GameAudio } from './audio/index.js';
import { Input, detectTouch } from './ui/input.js';
import { Hud } from './ui/hud.js';
import { Ending, creditsHtml } from './ui/ending.js';

// Custom shaders output linear colour; encode to the display colour space once, at the end of every ShaderMaterial.
THREE.Material.prototype.onBeforeCompile = function (shader) {
  if (!this.isShaderMaterial || shader.fragmentShader.includes('mainImpl')) return;
  shader.fragmentShader = shader.fragmentShader.replace(/void\s+main\s*\(\s*\)/, 'void mainImpl()') + '\nvoid main(){ mainImpl(); gl_FragColor = linearToOutputTexel(gl_FragColor); }';
};

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const TIERS = {
  low: { name: 'low', terrainRes: 30, rockDetail: 1, kelpMul: 0.35, rockMul: 0.5, ambientFish: 0, snow: 200, rays: 3, dpr: 1, kelpDetail: 0.5 },
  medium: { name: 'medium', terrainRes: 44, rockDetail: 2, kelpMul: 0.7, rockMul: 0.8, ambientFish: 28, snow: 350, rays: 5, dpr: 1.5, kelpDetail: 0.8 },
  high: { name: 'high', terrainRes: 60, rockDetail: 2, kelpMul: 1, rockMul: 1, ambientFish: 56, snow: 600, rays: 8, dpr: 2, kelpDetail: 1 },
};
function pickTier() {
  const q = params.get('q'); if (TIERS[q]) return TIERS[q];
  const mobile = detectTouch(), mem = navigator.deviceMemory ?? 8, cores = navigator.hardwareConcurrency ?? 8;
  if (mem <= 2 || cores <= 2) return TIERS.low;
  if (mobile || cores <= 4 || mem <= 4) return TIERS.medium;
  return TIERS.high;
}
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { /* blocked */ } } };

const FOV = 30, CAM_Z = 34, CAM_Y0 = -5.8;
const tier = pickTier();
setKelpDetail(tier.kelpDetail);

class Game {
  constructor() {
    this.tier = tier; this.params = params;
    this.fsm = new GameFSM(); this.sim = new Sim(); this.audio = new GameAudio(); this.hud = new Hud();
    this.input = new Input(this); this.touch = this.input.touch;
    this.reduced = store.get('sw.reduce') === '1' || matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.autoplay = params.get('autoplay') === '1'; this.miss = (params.get('miss') ?? '').split(',').filter(Boolean).map(Number);
    this.freeze = false; this.shake = 0; this.introT = 0; this.t = 0; this.realT = 0; this.fpsAvg = 60; this.fpsAcc = 0; this.fpsN = 0; this.dprNow = Math.min(devicePixelRatio, tier.dpr);
    this.pal = makePalette(); this.camX = 0; this.camY = CAM_Y0; this.tagOn = false; this.muted = false;
    this.initGL();
    this.ending = new Ending(() => this.toTitleOrReplay(), () => this.openCredits());
    this.bindUI();
    this.fsm.on((to, from, ev) => this.onState(to, from, ev));
    this.resize(); addEventListener('resize', () => this.resize());
    $('loading').classList.add('hidden');
    this.refreshTitle();
    if (this.autoplay) { this.audioOff(); this.startGame(true); }
    requestAnimationFrame(t => { this.last = t; this.loop(t); });
  }

  audioOff() { this.audio.setMuted(true); }

  initGL() {
    const canvas = $('gl');
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
    r.autoClear = false; r.setClearColor(0x06324a, 1); r.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 1, 400);
    this.camera.position.set(0, CAM_Y0, CAM_Z);
    this.backdrop = new Backdrop(this.scene);
    this.rays = new GodRays(this.scene, tier.rays);
    this.surface = new Surface(this.scene);
    this.sky = new SkyBand(tier);
    this.terrain = new Terrain(this.scene, tier);
    this.prey = new PreyView(this.scene, tier);
    this.fx = new Particles(this.scene, { snow: tier.snow });
    this.objects = new WorldObjects(this.scene, this.sky, this.fx, tier);
    this.hero = new HeroShark(); this.scene.add(this.hero.group);
    this.boat = new Boat(this.scene, this.sky);
    this.buildStrands();
    this.buildPlume();
    this.ring = [];
    U.uQuality.value = tier.name === 'low' ? 0 : 1;
  }

  buildStrands() {
    this.strands = new THREE.Group();
    const m = new THREE.MeshBasicMaterial({ color: 0xcfd8cc });
    for (let i = 0; i < 4; i++) { const c = new THREE.Mesh(new THREE.TorusGeometry(0.62 - i * 0.04, 0.03, 5, 20), m); c.position.set(0.9 - i * 0.55, 0.02, 0); c.rotation.y = Math.PI / 2 + (i - 1.5) * 0.16; this.strands.add(c); }
    const up = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 8, 5), m); up.position.set(0.6, 4, 0); up.rotation.z = -0.15; this.strands.add(up);
    this.strands.visible = false; this.hero.group.add(this.strands);
  }
  buildPlume() {
    const n = 18, pos = new Float32Array(n * 3);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.plume = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.5, map: this.objects.glowTex, color: 0xd6ff8a, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.plume.frustumCulled = false; this.plume.visible = false; this.scene.add(this.plume); this.plumePos = pos;
  }

  resize() {
    const W = innerWidth, H = innerHeight;
    this.W = W; this.H = H;
    this.renderer.setPixelRatio(this.dprNow);
    this.renderer.setSize(W, H, false);
    this.camera.aspect = W / H; this.camera.updateProjectionMatrix();
    this.ppu = H / (2 * CAM_Z * Math.tan(FOV * Math.PI / 360));
    this.fx.setScale(H * this.dprNow / (2 * Math.tan(FOV * Math.PI / 360)) / this.dprNow * 0.5);
    this.checkOrientation();
  }
  checkOrientation() {
    const portrait = innerHeight > innerWidth && this.touch;
    $('rotate').classList.toggle('hidden', !portrait);
    if (portrait && this.fsm.simRunning) this.fsm.send('pause');
  }

  bindUI() {
    $('btn-start').onclick = () => { this.audio.start(); this.startGame(); };
    $('btn-how').onclick = () => { const h = $('howto'); h.classList.toggle('hidden'); h.innerHTML = `<b>Goal:</b> swim south and get detected at all 6 stations.<br><b>Steer:</b> ${this.touch ? HINTS.touch : HINTS.desktop}<br><b>Eat</b> salmon and tailor to refill energy. <b>Keep moving</b>: white sharks breathe by swimming. Dodge hazards, grab power-ups.`; };
    $('intro-skip').onclick = () => this.fsm.send('skip');
    $('btn-pause').onclick = () => this.togglePause();
    $('btn-mute').onclick = () => { this.muted = !this.muted; this.audio.setMuted(this.muted); $('btn-mute').innerHTML = this.muted ? '&#128263;' : '&#128266;'; };
    $('p-resume').onclick = () => this.fsm.send('resume');
    $('p-quit').onclick = () => { this.hud.clearFacts(); this.fsm.send('quit'); };
    $('link-credits').onclick = e => { e.preventDefault(); this.openCredits(true); };
    for (const id of ['opt-reduce', 'opt-reduce2']) { const el = $(id); el.checked = this.reduced; el.onchange = () => { this.reduced = el.checked; store.set('sw.reduce', this.reduced ? '1' : '0'); $('opt-reduce').checked = $('opt-reduce2').checked = this.reduced; }; }
    $('factcard').onclick = () => { this.dismissFact = true; };
    $('btn-sense').addEventListener('click', () => {});
  }
  refreshTitle() { const b = loadBest(); $('best').textContent = b ? `Best on this device: ${b.toLocaleString('en-AU')}` : ''; }

  togglePause() { if (this.fsm.simRunning || this.fsm.state === 'paused') this.fsm.send(this.fsm.state === 'paused' ? 'resume' : 'pause'); }

  startGame(skipIntro = false) {
    this.sim.fullReset(); this.hud.clearFacts(); this.tagOn = false; this.fsm.state = 'title';
    this.sim.x = START_X; this.sim.y = -4.6;
    this.fsm.send('start');
    if (skipIntro) { this.tagOn = true; this.fsm.send('skip'); }
  }
  toTitleOrReplay() { this.ending.close(); this.fsm.send('title'); this.refreshTitle(); }
  openCredits(fromTitle = false) {
    $('credits-body').innerHTML = creditsHtml(); $('credits').classList.remove('hidden');
    $('cr-back').onclick = () => { $('credits').classList.add('hidden'); if (!fromTitle) { this.fsm.send('back'); this.ending.open(this.sim); this.ending.page = 2; this.ending.render(); } };
    if (!fromTitle) this.fsm.send('next');
  }

  onState(to, from, ev) {
    const show = (id, v) => $(id).classList.toggle('hidden', !v);
    show('title', to === 'title'); show('intro', to === 'intro'); show('pause', to === 'paused');
    show('rest', to === 'resting'); show('caught', to === 'caught');
    const playing = ['playing', 'fact', 'resting', 'caught', 'paused'].includes(to);
    this.hud.show(playing);
    document.body.classList.toggle('playing', ['playing', 'fact'].includes(to));
    if (to === 'intro') { this.introT = 0; this.tagOn = false; this.sim.x = START_X; this.sim.y = -4.6; }
    if (to === 'playing' && from === 'intro') { this.tagOn = true; this.hud.banner(LEGS[0].title, LEGS[0].habitat); }
    if (to === 'playing' && from === 'resting') { this.hud.banner('Try again', 'Back from the last station'); }
    if (to === 'ending') { this.hud.show(false); this.ending.open(this.sim); }
    if (to === 'title') { this.ending.close(); $('credits').classList.add('hidden'); this.refreshTitle(); }
    if (to === 'resting') { $('rest-title').textContent = this.sim.restReason === 'oxygen' ? 'Out of oxygen' : 'Out of energy'; $('rest-text').textContent = this.sim.restReason === 'oxygen' ? LINES.faint : LINES.bottom; }
  }

  // ---- events from the sim --------------------------------------------------------------------------------------------
  handle(events) {
    const sim = this.sim, A = this.audio;
    for (const e of events) {
      switch (e.type) {
        case 'fact': this.hud.queueFact(e.id); break;
        case 'ping': {
          A.play('ping'); this.objects.pingStation(e.station);
          setTimeout(() => A.play('notify'), 380);
          this.hud.notify(stationList[e.station].name, e.row.time, e.value > 1);
          this.sonarRing(); this.sparks(sim.x + 2, sim.y, [1, 0.9, 0.4], 26, 4);
          break;
        }
        case 'missed': this.hud.whisper(`Missed ${stationList[e.station].name}. That leaves a gap in your data.`, 4200); break;
        case 'eat': A.play('bite'); this.fx.scales({ x: e.x, y: e.y, z: 0.5 }, 16); this.fx.bubbleBurst({ x: e.x, y: e.y, z: 0.5 }, 8, 0.6, 0.08); if (e.kind === 'ray') this.sparks(e.x, e.y, [0.7, 0.55, 1], 18, 3); break;
        case 'pickup': A.play('pickup'); this.sparks(e.x, e.y, { electro: [0.4, 0.85, 1], bait: [1, 0.85, 0.4], scent: [0.7, 1, 0.45], battery: [1, 0.76, 0.2] }[e.pickup], 24, 3.5); break;
        case 'plasticEaten': A.play('hurt'); this.hurtFx(0.5); this.hud.whisper('Plastic! That was a bag, not food.', 2600); break;
        case 'tangle': A.play('hurt'); this.hurtFx(e.kind === 'net' ? 1 : 0.7); this.hud.whisper(e.kind === 'net' ? 'Caught in a shark net!' : 'Tangled in fishing line!', 2600); break;
        case 'wash': A.play('hurt'); this.hurtFx(0.8); this.hud.whisper('Propeller wash! Swim below the ship.', 2800); break;
        case 'freed': this.hud.whisper(e.forced ? 'You break free, tired and sore.' : 'Free!', 1800); break;
        case 'sense': A.play('sense'); break;
        case 'leg': this.hud.banner(LEGS[e.leg].title, LEGS[e.leg].habitat); break;
        case 'surferBump': this.hud.whisper(LINES.person, 4200); break;
        case 'collapse': this.hud.clearFacts(); this.fsm.send('collapse'); break;
        case 'restDone': sim.endRest(); this.fsm.send('retry'); break;
        case 'caught': this.hud.clearFacts(); A.play('thunk'); this.fsm.send('caught'); this.caughtT = 0; break;
        case 'released': this.fsm.send('released'); this.hud.whisper('Released. The scientists read your tag.', 3200); break;
        case 'finish': this.hud.clearFacts(); this.fsm.send('finish'); break;
      }
    }
  }
  hurtFx(k) { if (!this.reduced) this.shake = Math.max(this.shake, k); const el = $('hurt-flash'); el.classList.add('on'); setTimeout(() => el.classList.remove('on'), 120); }
  sparks(x, y, c, n, sp) { this.fx.sparks({ x, y, z: 0.6 }, n, c, sp, 0.3, 1.0); }
  sonarRing() { const s = this.sim; for (let i = 0; i < 36; i++) { const a = (i / 36) * 6.283; this.fx.glow.spawn(s.x + 2, s.y, 0.5, Math.cos(a) * 7, Math.sin(a) * 7, 0, 1.1, 0.5, 0.6, 1, 0.95, 0.9, 4); } }

  // ---- frame loop ----------------------------------------------------------------------------------------------------------
  loop(now) {
    const rawDt = Math.min(0.05, (now - this.last) / 1000); this.last = now; this.realT += rawDt;
    this.frame(rawDt);
    requestAnimationFrame(t => this.loop(t));
  }

  frame(rawDt) {
    const sim = this.sim, fsm = this.fsm, state = fsm.state;
    this.t += rawDt; U.uTime.value = this.t;
    // fps / adaptive resolution
    this.fpsAcc += rawDt; this.fpsN++;
    if (this.fpsAcc > 2.5) { this.fpsAvg = this.fpsN / this.fpsAcc; this.fpsAcc = 0; this.fpsN = 0; this.adapt(); }
    if (this.input.popPause() && (fsm.simRunning || state === 'paused')) this.togglePause();
    const enter = this.input.popEnter();
    const worldY = py => this.camY + (this.H / 2 - py) / this.ppu;
    let dt = rawDt * fsm.timeScale;
    if (state === 'intro') this.introFrame(rawDt, enter);
    if (fsm.simRunning && !this.freeze) {
      const inp = this.autoplay ? botInput(sim, { miss: this.miss }) : this.input.read(sim, worldY);
      sim.update(dt, inp);
      this.handle(sim.drain());
      if (!this.autoplay || true) this.hud.tick(rawDt, this.realT, state === 'playing', enter || this.dismissFact, () => fsm.send('fact'), () => { if (fsm.state === 'fact') fsm.send('dismiss'); });
      this.dismissFact = false;
      this.audio.update(sim.speed / 9);
      if (sim.boosting && (this.boostSoundT = (this.boostSoundT ?? 0) - rawDt) < 0) { this.boostSoundT = 0.5; this.audio.play('boost'); }
    } else if (state === 'resting' || state === 'caught') {
      if (!this.freeze) { sim.update(rawDt, {}); this.handle(sim.drain()); }
      if (state === 'caught') this.caughtT = (this.caughtT ?? 0) + rawDt;
    } else this.input.read(sim, worldY); // keep edges flushing
    if (state === 'ending' || state === 'credits') this.input.popEnter();
    this.updateView(rawDt, state);
    this.renderFrame();
  }

  adapt() {
    if (this.fpsAvg < 42 && this.dprNow > 1) { this.dprNow = Math.max(1, this.dprNow - 0.25); this.resize(); }
    else if (this.fpsAvg < 34 && !this.degraded) { this.degraded = true; this.rays.group.visible = false; if (this.prey.ambMesh) this.prey.ambMesh.visible = false; U.uQuality.value = 0; }
  }

  introFrame(rawDt, enter) {
    this.introT += rawDt;
    const T = this.introT, caps = INTRO_CAPTIONS;
    const cap = T < 3.4 ? caps[0] : T < 7.4 ? caps[1] : caps[2];
    const el = $('intro-cap'); if (el.textContent !== cap) el.textContent = cap;
    if (T > 4.4 && T < 5.1 && !this.dartDone) { /* dart in flight */ }
    if (T >= 5.1 && !this.tagOn) { this.tagOn = true; this.audio.play('thunk'); this.sparks(this.sim.x + 0.2, this.sim.y + 0.5, [1, 0.7, 0.2], 22, 2.4); this.audio.play('fact'); }
    if (T > 11 || enter) { this.fsm.send('done'); }
  }

  // ---- placing everything in the scene ------------------------------------------------------------------------------------
  updateView(dt, state) {
    const sim = this.sim, cam = this.camera;
    const playing = state !== 'title';
    const intro = state === 'intro';
    // camera
    const targetX = sim.x + 6.2 + Math.min(3, (sim.speed - 9) * 0.35) * (state === 'caught' ? 0 : 1);
    this.camX += (targetX - this.camX) * Math.min(1, dt * 4);
    if (state === 'title' || Math.abs(targetX - this.camX) > 40) this.camX = targetX;
    this.camY += ((CAM_Y0 + (sim.y + 6) * 0.1) - this.camY) * Math.min(1, dt * 2);
    this.shake = Math.max(0, this.shake - dt * 2.4);
    const sx = this.shake * (Math.sin(this.t * 61) * 0.18), sy = this.shake * (Math.cos(this.t * 53) * 0.14);
    cam.position.set(this.camX + sx, this.camY + sy, CAM_Z); cam.lookAt(this.camX + sx, this.camY + sy, 0);
    cam.updateMatrixWorld();
    // palette
    paletteAt(sim.x, this.pal);
    const P = this.pal;
    U.uFogColor.value.copy(P.fog); U.uDeepColor.value.copy(P.deep); U.uTopColor.value.copy(P.top); U.uFogDensity.value = P.density; U.uAbsorb.value = P.absorb; U.uCaustic.value = P.caustic;
    U.uSandColor.value.copy(P.sand); U.uRockColor.value.copy(P.rock); U.uKelpColor.value.copy(P.kelp);
    U.uCamX.value = this.camX;
    this.surface.update(this.camX); this.rays.update(this.camX, P.rays);
    this.terrain.update(this.camX);
    // hero
    let drawY = sim.y, mouth = 0;
    if (state === 'caught') { const c = this.caughtT ?? 0; const up = Math.min(1, c / 1.2) * (c > 2.4 ? Math.max(0, 1 - (c - 2.4) / 1) : 1); drawY = sim.y + (-1.9 - sim.y) * up; }
    const near = sim.entities.some(e => e.kind === 'fish' && e.alive && e.x - sim.x > 1.5 && e.x - sim.x < 4.2 && Math.abs(e.y - sim.y) < 1.8);
    mouth = sim.bite > 0 ? 1 : near ? 0.55 : 0;
    const resting = sim.phase === 'rest';
    const st = { speed: intro ? 2.5 : sim.speed, vy: sim.vy, pitch: intro ? 0.05 : sim.pitch, mouth, hurt: sim.hit > 0 ? 1 : 0, tagOn: this.tagOn, tagGlow: this.tagOn && intro && this.introT < 6.2 ? 1 : 0, resting, yaw: -0.2 };
    const hx = sim.x, hy = intro ? -4.6 + Math.sin(this.t * 0.8) * 0.15 : drawY;
    this.hero.group.position.set(hx, hy, 0); this.hero.group.scale.setScalar(1.18);
    this.hero.update(dt, st);
    this.hero.root.rotation.x += ((resting ? 1.2 : state === 'caught' ? 0.2 : 0) - this.hero.root.rotation.x) * Math.min(1, dt * 3);
    this.strands.visible = sim.tangled; if (sim.tangled) this.strands.rotation.x = Math.sin(this.t * 14) * 0.08;
    // intro boat, dart
    const boatOn = intro || state === 'caught';
    this.boat.place(intro ? sim.x + 2.5 : (sim.caught?.ent?.x ?? sim.x) + 0.5, boatOn, this.t);
    if (intro) {
      const T = this.introT, d = this.boat.dart;
      d.visible = T > 4.3 && T < 5.1;
      if (d.visible) { const k = (T - 4.3) / 0.8; d.position.set(sim.x + 3.2 - 3.0 * k, 0.9 - (0.9 + 0.2 - (-4.6 + 1.5)) * 0 - k * 6.1, 0.4); d.rotation.z = 0.5; }
    } else this.boat.dart.visible = false;
    // sky + objects
    this.prey.update(sim, dt, this.t, this.camX);
    this.objects.update(sim, dt, this.t, this.camX);
    // boost bubbles, scent plume, sense tint
    if (sim.boosting && Math.random() < 0.7) this.fx.bubbleBurst({ x: sim.x - 2.4, y: sim.y, z: 0.4 }, 2, 0.4, 0.08);
    if (sim.phase === 'swim' && Math.random() < 0.05) this.fx.bubbleBurst({ x: sim.x + 2.2, y: sim.y - 0.1, z: 0.4 }, 1, 0.2, 0.05);
    this.plume.visible = sim.scent > 0 && !!sim.scentTarget;
    if (this.plume.visible) {
      const m = { x: sim.x + 2.4, y: sim.y }, t = sim.scentTarget;
      for (let i = 0; i < 18; i++) { const k = ((i / 18) + this.t * 0.35) % 1; this.plumePos[i * 3] = m.x + (t.x - m.x) * k; this.plumePos[i * 3 + 1] = m.y + (t.y - m.y) * k + Math.sin(k * 9 + this.t * 3) * 0.35 * k; this.plumePos[i * 3 + 2] = 0.8; }
      this.plume.geometry.attributes.position.needsUpdate = true;
    }
    document.getElementById('sense-tint').classList.toggle('on', sim.senseActive);
    U.uSense.value = sim.senseActive ? 1 : 0;
    this.fx.update(dt, cam, 0);
    if (playing && state !== 'title') this.hud.update(sim);
  }

  renderFrame() {
    const r = this.renderer, W = this.W, H = this.H, cam = this.camera;
    const v = new THREE.Vector3(this.camX, 0, 0).project(cam);
    const wl = Math.max(0, Math.min(H, Math.round((1 - v.y) / 2 * H)));
    const bandUnits = Math.max(0.5, wl / this.ppu), bandW = W / this.ppu;
    this.sky.update(this.camX, bandW, bandUnits, this.pal, 0);
    r.setScissorTest(true);
    if (wl > 0) { r.setViewport(0, H - wl, W, wl); r.setScissor(0, H - wl, W, wl); r.clear(true, true, true); r.render(this.sky.scene, this.sky.cam); }
    r.setViewport(0, 0, W, H);
    r.setScissor(0, 0, W, Math.max(1, H - wl)); r.clear(true, true, true); r.render(this.scene, cam);
    r.setScissorTest(false);
  }
}

const game = new Game();
window.__game = {
  game, sim: game.sim, fsm: game.fsm, hud: game.hud,
  get state() { return game.fsm.state; },
  start(skip = true) { game.audio.setMuted(true); game.startGame(skip); },
  /** Put the shark at world x with full vitals (for screenshots). */
  teleport(x, y = -6.5) { const s = game.sim; s.x = x; s.y = y; s.vy = 0; s.entities = []; s.spawnFrom(x - 12); s.vitals.reset(100); s.tangle = null; game.camX = x + 6.2; for (let i = 0; i < 6; i++) { s.update(0.016, {}); } s.drain(); },
  freeze(v = true) { game.freeze = v; },
  tier: tier.name, fps: () => game.fpsAvg,
  stepSim(sec, inp = {}) { for (let t = 0; t < sec; t += 1 / 30) { game.sim.update(1 / 30, inp); game.handle(game.sim.drain()); } },
  fact(id) { game.hud.queueFact(id); },
  skipIntro() { game.fsm.send('skip'); },
  /** Play the whole run with the autopilot (sim only, fast), then show the ending. */
  autorun(miss = []) { const g = game, s = g.sim; g.hud.clearFacts(); let n = 0; if (g.fsm.state !== 'playing') { g.fsm.state = 'playing'; } while (!s.finished && n++ < 20000) { s.update(1 / 30, botInput(s, { miss })); g.handle(s.drain()); if (g.fsm.state === 'resting') { s.endRest(); g.fsm.send('retry'); } } return s.summary(); },
  finish() { game.sim.finished = true; game.sim.events.push({ type: 'finish' }); },
  stats() { return { x: game.sim.x, y: game.sim.y, energy: game.sim.energy, oxygen: game.sim.oxygen, pings: game.sim.log.pingCount, score: game.sim.score, state: game.fsm.state, tris: game.renderer.info.render.triangles, calls: game.renderer.info.render.calls }; },
};

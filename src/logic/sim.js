// The game simulation, with no rendering: movement, vitals, prey, pickups, hazards, domes, scoring.
// The renderer reads sim state each frame and consumes sim.events.
import { CRUISE, BOOST_MULT, PLAYER_TOP, PLAYER_SIDE_BOTTOM, START_X, END_X, floorY, stationX, stationList, lastStationPassed, legAt, NUM_STATIONS } from './route.js';
import { clamp, mulberry32 } from './rng.js';
import { Vitals, SLOW_RATIO } from './vitals.js';
import { DataLog } from './datalog.js';
import { DomeTracker, domeCentreY } from './dome.js';
import { buildLevel, SPAWN_AHEAD, DESPAWN_BEHIND } from './level.js';
import { preyPoints, finalScore, tagRating, PING_POINTS } from './score.js';
import { simClock } from './route.js';

export const PLAYER_LEN = 5.2;
export const MOUTH_DX = 2.35;
export const BODY_BACK = 2.3, BODY_FRONT = 2.5, BODY_HALF_H = 0.55;
const SENSE_TIME = 8, SCENT_TIME = 10, FRENZY_TIME = 12;
const ENERGY = { salmon: 6, tailor: 10, ray: 34 };
const SHIP = { len: 38, draft: -3.4, speed: -4.2, propFromEnd: 4, propRx: 6.5, propRy: 4.4, propY: -3.6 };
export const SHIP_DIMS = SHIP;
const NEED_WIGGLES = 9;
export const NET_HALF = 2.4; // matches the drawn panel (4.8 wide)

const FACT_ON_SIGHT = { salmon: 'salmon', tailor: 'tailor', plastic: 'plastic', line: 'line', net: 'net', drumline: 'drumline', ship: 'ship', eac: 'eac' };
const FACT_ON_PICKUP = { electro: 'electro', bait: 'bait', scent: 'scent', battery: 'battery' };

export class Sim {
  constructor({ seed = 11 } = {}) {
    this.defs = buildLevel(seed);
    this.rnd = mulberry32(seed + 77);
    this.vitals = new Vitals();
    this.log = new DataLog();
    this.domes = new DomeTracker();
    this.seenFacts = new Set();
    this.events = [];
    this.fullReset();
  }

  fullReset() {
    this.time = 0; this.x = START_X; this.y = -7; this.vy = 0; this.speed = CRUISE; this.pitch = 0;
    this.vitals.reset(100); this.log.clear(); this.domes = new DomeTracker();
    this.phase = 'swim'; // swim | rest | caught
    this.phaseT = 0;
    this.sense = 0; this.charges = 0; this.scent = 0; this.frenzy = 0; this.battery = false;
    this.inEac = false; this.inWash = false; this.tangle = null; this.boosting = false; this.slowFor = 0;
    this.preyTotal = 0; this.eaten = { salmon: 0, tailor: 0, ray: 0 }; this.plasticEaten = 0; this.tangles = 0; this.drumCaught = 0; this.retries = 0;
    this.finished = false; this._eacSeen = false; this.restPending = false; this.restartX = START_X; this.leg = 0; this.lastStation = -1;
    this.bite = 0; this.mouthOpen = 0; this.surferBump = 0; this.pings = 0;
    this.entities = []; this.nextDef = 0; this.nextId = 1; this.lastSteerSign = 0; this.hit = 0;
    this.spawnFrom(START_X - 20);
    this.seenFacts.clear();
  }

  /** Reposition and respawn from a station after resting. */
  retry() {
    const k = this.lastStation;
    const rx = k < 0 ? START_X : stationX(k) - 24;
    this.x = rx; this.restartX = rx; this.y = -7; this.vy = 0; this.speed = CRUISE;
    this.vitals.reset(60); this.phase = 'swim'; this.tangle = null; this.inWash = false;
    this.sense = 0; this.scent = 0; this.frenzy = 0;
    this.log.truncateFrom(k + 1); // stations after the restart point will be re-detected
    this.domes.reset(Math.max(0, k)); // stations from here on can ping again (a station already logged keeps its row)
    for (let j = 0; j <= k; j++) if (this.log.detected.has(j)) { this.domes.pinged[j] = true; this.domes.missedFlag[j] = false; }
    this.retries++;
    this.entities = []; this.spawnFrom(rx - 20);
    this.events.push({ type: 'retry', station: k });
  }

  spawnFrom(x) {
    this.nextDef = this.defs.findIndex(d => d.x >= x);
    if (this.nextDef < 0) this.nextDef = this.defs.length;
  }

  drain() { const e = this.events; this.events = []; return e; }

  fact(id) {
    if (this.seenFacts.has(id)) return;
    this.seenFacts.add(id);
    this.events.push({ type: 'fact', id });
  }

  get clock() { return simClock(this.time); }
  get energy() { return this.vitals.energy; }
  get oxygen() { return this.vitals.oxygen; }
  get tangled() { return !!this.tangle; }
  get senseActive() { return this.sense > 0; }
  get frenzyActive() { return this.frenzy > 0; }
  get dataPoints() { return this.log.dataPoints; }
  get score() { return finalScore({ dataPoints: this.log.dataPoints, preyTotal: this.preyTotal, energy: this.vitals.energy }); }
  get stars() { return tagRating({ stationsDetected: this.log.detected.size, score: this.score }); }
  mouth() { return { x: this.x + MOUTH_DX, y: this.y - 0.12 }; }
  speedRatio() { return this.speed / CRUISE; }
  ship() { return this.entities.find(e => e.kind === 'ship') ?? null; }

  // ---- entity creation --------------------------------------------------------------------
  spawnDef(d) {
    const base = { defId: d.id, id: this.nextId++, kind: d.kind, x: d.x, y: d.y ?? 0, alive: true, age: 0 };
    switch (d.kind) {
      case 'school': {
        const sch = { cx: d.x, cy: d.y, vx: d.species === 'tailor' ? 5.6 : 2.4, phase: this.rnd() * 6, species: d.species };
        for (let i = 0; i < d.count; i++) {
          const a = this.rnd() * Math.PI * 2, rr = Math.sqrt(this.rnd());
          const e = { ...base, id: this.nextId++, kind: 'fish', species: d.species, school: sch, ox: Math.cos(a) * rr * (d.species === 'tailor' ? 2.2 : 3.4), oy: Math.sin(a) * rr * 1.7, x: d.x, y: d.y, vx: sch.vx, vy: 0, r: d.species === 'tailor' ? 0.55 : 0.7, phase: this.rnd() * 6, flee: 0 };
          e.x = d.x + e.ox; e.y = d.y + e.oy;
          this.entities.push(e);
        }
        return;
      }
      case 'ray': this.entities.push({ ...base, r: 1.2, hidden: true }); return;
      case 'plastic': this.entities.push({ ...base, r: 0.8, baseY: d.y, vx: -0.8 }); return;
      case 'line': this.entities.push({ ...base, yb: d.yb, hidden: !!d.hidden, r: 0.45 }); return;
      case 'net': this.entities.push({ ...base, ytop: d.ytop, ybot: d.ybot, cut: false }); return;
      case 'drumline': this.entities.push({ ...base, baitY: d.y, r: 1.5 }); return;
      case 'ship': this.entities.push({ ...base, x: this.x + SPAWN_AHEAD + 20, len: SHIP.len, vx: SHIP.speed }); return;
      case 'eac': this.entities.push({ ...base, len: d.len, h: d.h }); return;
      case 'pickup': this.entities.push({ ...base, type: d.type, r: 1.4 }); return;
      case 'surfer': this.entities.push({ ...base, y: 0.1 }); return;
    }
  }

  // ---- main step ---------------------------------------------------------------------------
  /** input: { steer -1..1 (+ up), boost, sense (edge), taps (count) } */
  update(dt, input = {}) {
    if (this.finished) return;
    if (this.phase === 'rest') { this.updateRest(dt); return; }
    if (this.phase === 'caught') { this.updateCaught(dt); return; }
    this.time += dt; this.frame = (this.frame ?? 0) + 1;
    const prevX = this.x;
    // timers
    this.sense = Math.max(0, this.sense - dt); this.scent = Math.max(0, this.scent - dt); this.frenzy = Math.max(0, this.frenzy - dt);
    this.bite = Math.max(0, this.bite - dt); this.hit = Math.max(0, this.hit - dt);
    if (input.sense && this.charges > 0 && this.sense <= 0) { this.charges--; this.sense = SENSE_TIME; this.events.push({ type: 'sense' }); }

    // spawn ahead
    while (this.nextDef < this.defs.length && this.defs[this.nextDef].x < this.x + SPAWN_AHEAD) this.spawnDef(this.defs[this.nextDef++]);

    // tangling: wiggle to escape
    const steer = clamp(input.steer ?? 0, -1, 1);
    if (this.tangle) {
      const sign = Math.abs(steer) > 0.5 ? Math.sign(steer) : 0;
      if (sign && sign !== this.lastSteerSign) this.tangle.wiggles++;
      if (sign) this.lastSteerSign = sign;
      this.tangle.wiggles += input.taps ?? 0;
      this.tangle.t += dt;
      if (this.tangle.wiggles >= NEED_WIGGLES) this.freeFromTangle(false);
      else if (this.tangle.t > 12) { this.vitals.hurt(12); this.freeFromTangle(true); }
    } else this.lastSteerSign = Math.abs(steer) > 0.5 ? Math.sign(steer) : 0;

    // boost and speed
    this.boosting = !!input.boost && this.vitals.canBoost && !this.tangle;
    const eacMult = this.inEac ? 1.45 : 1;
    const target = CRUISE * (this.boosting ? BOOST_MULT : 1) * eacMult * (this.tangle ? 0.2 : 1);
    this.speed += (target - this.speed) * Math.min(1, dt * (this.tangle ? 6 : 3.2));
    this.x += this.speed * dt;

    // depth
    const desiredVy = steer * 7.4 - (this.inWash ? 11 : 0);
    this.vy += (desiredVy - this.vy) * Math.min(1, dt * 6.5);
    if (this.tangle) this.vy *= 0.8;
    this.y += this.vy * dt;
    const ship = this.ship();
    let top = PLAYER_TOP;
    if (ship && this.x > ship.x - ship.len / 2 - 2 && this.x < ship.x + ship.len / 2 + 2) top = SHIP.draft - 0.7;
    if (top === PLAYER_TOP) { if (this.y > top) { this.y = top; if (this.vy > 0) this.vy = 0; } } else if (this.y > top) this.y += (top - this.y) * Math.min(1, dt * 9);
    const bottom = floorY(this.x) + PLAYER_SIDE_BOTTOM;
    if (this.y < bottom) { this.y = bottom; if (this.vy < 0) this.vy = 0; }
    const targetPitch = clamp(this.vy / Math.max(4, this.speed), -0.7, 0.7);
    this.pitch += (targetPitch - this.pitch) * Math.min(1, dt * 7);

    // vitals
    const reason = this.vitals.update(dt, { speedRatio: this.speedRatio(), boosting: this.boosting, tangled: !!this.tangle });
    if (this.vitals.oxygen < 72 && this.speedRatio() < SLOW_RATIO + 0.1) this.fact('ventilate');
    if (reason) { this.beginRest(reason); return; }

    this.updateEntities(dt);
    if (this.phase !== 'swim') return;
    this.updateDomes(dt);

    // leg / station bookkeeping
    const ls = lastStationPassed(this.x);
    if (ls !== this.lastStation) { this.lastStation = ls; if (ls >= 0) this.events.push({ type: 'station', station: ls }); }
    const leg = legAt(this.x);
    if (leg !== this.leg) { this.leg = leg; this.events.push({ type: 'leg', leg }); }
    if (this.x >= END_X) { this.finished = true; this.events.push({ type: 'finish' }); }
    this.dxFrame = this.x - prevX;
  }

  freeFromTangle(forced) {
    const t = this.tangle; if (!t) return;
    if (t.ent.kind === 'line') t.ent.alive = false; else t.ent.cut = true;
    this.tangle = null; this.events.push({ type: 'freed', forced });
  }

  startTangle(ent, loss, label) {
    if (this.tangle) return;
    this.tangle = { ent, wiggles: 0, t: 0, kind: ent.kind };
    this.tangles++; this.vitals.hurt(loss); this.hit = 0.5;
    this.events.push({ type: 'tangle', kind: ent.kind, label });
  }

  beginRest(reason) {
    this.phase = 'rest'; this.phaseT = 0; this.restReason = reason; this.tangle = null;
    this.events.push({ type: 'collapse', reason });
  }
  updateRest(dt) {
    this.phaseT += dt;
    const fl = floorY(this.x) + 0.7;
    this.y += (fl - this.y) * Math.min(1, dt * 2); this.speed *= 0.9; this.vy = 0; this.pitch *= 0.9;
    if (this.phaseT > 3.4 && !this.restPending) { this.restPending = true; this.events.push({ type: 'restDone' }); }
  }
  endRest() { this.restPending = false; this.retry(); }

  updateCaught(dt) {
    this.phaseT += dt;
    const d = this.caught;
    this.speed = 0; this.vy = 0;
    if (this.phaseT > 3.4) {
      this.phase = 'swim'; this.x += 26; this.y = -8; this.speed = CRUISE; this.caught = null;
      this.events.push({ type: 'released' });
    }
  }
  beginCaught(ent) {
    this.phase = 'caught'; this.phaseT = 0; this.caught = { ent }; this.drumCaught++; ent.used = true;
    const st = clamp(lastStationPassed(this.x) + 1, 0, NUM_STATIONS - 1);
    this.log.addPing({ station: st, gameT: this.time, value: 1, bonus: true });
    this.events.push({ type: 'caught', station: st });
    this.vitals.hurt(4);
  }

  // ---- entities ---------------------------------------------------------------------------
  updateEntities(dt) {
    const px = this.x, py = this.y, mouth = this.mouth();
    let nearest = null, nd = 1e9;
    this.inEac = false; this.inWash = false;
    for (const e of this.entities) {
      if (!e.alive) continue;
      e.age += dt;
      const ahead = e.x - px;
      const fk = e.kind === 'fish' ? e.species : e.kind;
      if (FACT_ON_SIGHT[fk] && ahead < 30 && ahead > -4) this.fact(FACT_ON_SIGHT[fk]);
      switch (e.kind) {
        case 'fish': this.updateFish(e, dt, mouth); if (e.alive && e.x > px + 2 && e.x - px < nd) { nd = e.x - px; nearest = e; } break;
        case 'plastic':
          e.x += e.vx * dt; e.y = e.baseY + Math.sin(e.age * 0.9 + e.id) * 0.6;
          if (this.hitMouth(e, mouth, 0.9)) { e.alive = false; this.plasticEaten++; this.vitals.hurt(14); this.hit = 0.6; this.events.push({ type: 'plasticEaten', x: e.x, y: e.y }); }
          break;
        case 'ray':
          if (this.sense > 0 && Math.hypot(e.x - mouth.x, e.y - mouth.y) < 1.7) this.eatEntity(e, 'ray', ENERGY.ray);
          if (this.sense > 0) this.fact('ray');
          break;
        case 'line':
          if (!this.tangle && !e.freed && px - BODY_BACK < e.x && px + BODY_FRONT > e.x && py + BODY_HALF_H > e.yb && py < 0.5) this.startTangle(e, 4, 'Fishing line');
          break;
        case 'net':
          if (!this.tangle && !e.cut && px - BODY_BACK < e.x + NET_HALF && px + BODY_FRONT > e.x - NET_HALF && py - BODY_HALF_H < e.ytop && py + BODY_HALF_H > e.ybot) this.startTangle(e, 26, 'Shark net');
          break;
        case 'drumline':
          if (!e.used && Math.hypot(e.x - mouth.x, e.baitY - mouth.y) < e.r + 0.3) this.beginCaught(e);
          break;
        case 'ship': {
          e.x += e.vx * dt;
          const sx = e.x + e.len / 2 - SHIP.propFromEnd, dx = (px - sx) / SHIP.propRx, dy = (py - SHIP.propY) / SHIP.propRy;
          if (dx * dx + dy * dy < 1) { this.inWash = true; this.vitals.hurt(15 * dt); if (!e.washed) { e.washed = true; this.events.push({ type: 'wash' }); } this.hit = 0.1; }
          break;
        }
        case 'eac':
          if (px > e.x && px < e.x + e.len && Math.abs(py - e.y) < e.h / 2) this.inEac = true;
          break;
        case 'pickup':
          if (!e.taken && Math.hypot(e.x - px - 1.4, e.y - py) < e.r + 1.4) this.takePickup(e);
          break;
        case 'surfer':
          if (!e.bumped && py > -2.5 && Math.abs(e.x - px) < 3) { e.bumped = true; this.fact('person'); this.events.push({ type: 'surferBump' }); }
          break;
      }
    }
    if (this.inEac && !this._eacSeen) { this._eacSeen = true; this.fact('eac'); }
    this.scentTarget = nearest ? { x: nearest.x, y: nearest.y } : null;
    // cleanup
    const behind = px - DESPAWN_BEHIND;
    this.entities = this.entities.filter(e => e.alive && !e.taken && e.x + (e.len ?? 0) > behind - 10 && !(e.kind === 'fish' && e.x < behind));
  }

  hitMouth(e, m, extra = 0) { return Math.hypot(e.x - m.x, e.y - m.y) < e.r + 1.15 + extra * 0.3; }

  updateFish(e, dt, mouth) {
    const s = e.school;
    e.phase += dt * (e.species === 'tailor' ? 9 : 6);
    // school centre drifts; fish ease toward their slot and scatter when the shark closes in
    if (s.frame !== this.frame) { s.frame = this.frame; s.cx += s.vx * dt; s.phase += dt; }
    const tx = s.cx + e.ox + Math.sin(e.phase * 0.3) * 0.4, ty = s.cy + e.oy + Math.sin(s.phase * 0.7 + e.ox) * 0.7;
    const dxs = e.x - this.x, dys = e.y - this.y;
    const dist = Math.hypot(dxs - 1.5, dys);
    let fx = 0, fy = 0;
    if (dist < 8 && dxs > -2) { const k = (1 - dist / 8) * (e.species === 'tailor' ? 5.5 : 3); fy += Math.sign(dys || (e.ox > 0 ? 1 : -1)) * k; fx += (e.species === 'tailor' ? 3 : 1.2) * (1 - dist / 8); }
    e.x += ((tx - e.x) * 2.2 + fx) * dt; e.y += ((ty - e.y) * 2.2 + fy) * dt;
    e.y = clamp(e.y, floorY(e.x) + 0.6, -1.0);
    s.cy = clamp(s.cy, -10.6, -2.4);
    if (Math.hypot(e.x - mouth.x, e.y - mouth.y) < e.r + 1.15) this.eatEntity(e, e.species, ENERGY[e.species]);
  }

  eatEntity(e, kind, energy) {
    e.alive = false;
    this.vitals.eat(energy);
    const pts = preyPoints(kind, this.frenzy > 0 ? 2 : 1);
    this.preyTotal += pts; this.eaten[kind]++;
    this.bite = 0.35;
    this.events.push({ type: 'eat', kind, x: e.x, y: e.y, points: pts, frenzy: this.frenzy > 0 });
    if (kind === 'ray') this.fact('ray');
  }

  takePickup(e) {
    e.taken = true;
    switch (e.type) {
      case 'electro': this.charges = Math.min(2, this.charges + 1); break;
      case 'bait': this.frenzy = FRENZY_TIME; break;
      case 'scent': this.scent = SCENT_TIME; break;
      case 'battery': this.battery = true; break;
    }
    this.fact(FACT_ON_PICKUP[e.type]);
    this.events.push({ type: 'pickup', pickup: e.type, x: e.x, y: e.y });
  }

  // ---- stations -----------------------------------------------------------------------------
  updateDomes(dt) {
    for (const ev of this.domes.update(dt, this.x, this.y)) {
      if (ev.type === 'ping') {
        const value = this.battery ? 2 : 1; this.battery = false;
        const row = this.log.addPing({ station: ev.station, gameT: this.time, value });
        this.pings++;
        this.events.push({ type: 'ping', station: ev.station, row, value });
        this.fact('ping');
      } else if (ev.type === 'missed') {
        this.events.push({ type: 'missed', station: ev.station });
        this.fact('gap');
      } else this.events.push({ type: 'domeEnter', station: ev.station });
    }
  }

  /** Summary used by the ending screen. */
  summary() {
    return {
      score: this.score, stars: this.stars, pings: this.log.pingCount, dataPoints: this.log.dataPoints, preyTotal: this.preyTotal,
      energy: Math.round(this.vitals.energy), stationsDetected: this.log.detected.size, seconds: this.time, retries: this.retries,
      eaten: { ...this.eaten }, plastic: this.plasticEaten, tangles: this.tangles, drum: this.drumCaught,
    };
  }
}
export { PING_POINTS, domeCentreY, stationList };

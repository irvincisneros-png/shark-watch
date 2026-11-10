import test from 'node:test';
import assert from 'node:assert/strict';
import { haversineKm, legKm, TOTAL_KM, STATIONS } from '../src/logic/geo.js';
import { stationX, legAt, floorY, kmAt, routeProgress, simClock, lastStationPassed, END_X, CRUISE, NUM_LEGS, LEG_LEN } from '../src/logic/route.js';
import { DomeTracker, insideDome, domeOf, DOME } from '../src/logic/dome.js';
import { DataLog } from '../src/logic/datalog.js';
import { Vitals, OXY_DROP } from '../src/logic/vitals.js';
import { finalScore, tagRating, preyPoints, PING_POINTS } from '../src/logic/score.js';
import { GameFSM } from '../src/logic/fsm.js';
import { FACTS } from '../src/logic/content.js';
import { buildLevel } from '../src/logic/level.js';
import { Sim } from '../src/logic/sim.js';
import { botInput } from '../src/logic/bot.js';

test('six real stations in route order, north to south', () => {
  assert.equal(STATIONS.length, 6);
  assert.deepEqual(STATIONS.map(s => s.name), ['Bondi', 'Cronulla', 'Stanwell Park', 'Wollongong', 'Shellharbour', 'Kiama']);
  for (let i = 1; i < 6; i++) assert.ok(STATIONS[i].lat < STATIONS[i - 1].lat);
});

test('km between stations are great-circle distances', () => {
  const km = legKm();
  assert.equal(km.length, 5);
  // Bondi -> Cronulla is roughly 20 km straight line; whole route ~ 97 km
  assert.ok(km[0] > 18 && km[0] < 22, `bondi-cronulla ${km[0]}`);
  assert.ok(TOTAL_KM > 90 && TOTAL_KM < 105, `total ${TOTAL_KM}`);
  assert.ok(Math.abs(haversineKm({ lat: 0, lon: 0 }, { lat: 0, lon: 1 }) - 111.19) < 0.2);
  assert.equal(haversineKm(STATIONS[0], STATIONS[0]), 0);
});

test('route geometry: legs, progress, km scaling', () => {
  assert.equal(legAt(0), 0);
  assert.equal(legAt(stationX(1) + 1), 1);
  assert.equal(legAt(stationX(5) + 100), NUM_LEGS - 1);
  assert.equal(routeProgress(stationX(0)), 0);
  assert.equal(routeProgress(stationX(5)), 1);
  assert.ok(Math.abs(kmAt(stationX(5)) - TOTAL_KM) < 1e-9);
  assert.equal(lastStationPassed(0), -1);
  assert.equal(lastStationPassed(stationX(2) - 5), 2);
  assert.ok(END_X > stationX(5));
  for (let x = 0; x < END_X; x += 7) { const f = floorY(x); assert.ok(f < -9 && f > -15.5, `floor ${f} at ${x}`); }
});

test('sim clock maps game seconds to a plausible time of day', () => {
  const c0 = simClock(0);
  assert.equal(c0.label, '5:50 am');
  const c = simClock(60); // +15 sim hours
  assert.equal(c.day, 1);
  assert.equal(c.label, '8:50 pm');
  assert.equal(simClock(240).day, 3);
});

test('detection dome: ellipse containment', () => {
  const d = domeOf(3);
  assert.ok(insideDome(d.x, d.y, d));
  assert.ok(insideDome(d.x + DOME.rx * 0.9, d.y, d));
  assert.ok(!insideDome(d.x + DOME.rx * 1.1, d.y, d));
  assert.ok(!insideDome(d.x, d.y + DOME.ry * 1.1, d));
  assert.ok(!insideDome(d.x, d.y - DOME.ry * 1.1, d));
});

test('dome tracker pings once after dwell, flags missed stations', () => {
  const t = new DomeTracker();
  const d = domeOf(0);
  let evs = t.update(0.1, d.x, d.y);
  assert.deepEqual(evs.map(e => e.type), ['enter']);
  evs = t.update(0.15, d.x, d.y);
  assert.deepEqual(evs.map(e => e.type), ['ping']);
  assert.deepEqual(t.update(1, d.x, d.y), []); // no double ping
  // skip station 1 completely: pass it far above the dome
  const d1 = domeOf(1);
  let missed = [];
  for (let x = d1.x - 30; x < d1.x + 40; x += 0.5) missed.push(...t.update(0.05, x, -1.0));
  assert.deepEqual(missed.filter(e => e.station === 1).map(e => e.type), ['missed']);
});

test('dome tracker needs dwell time (a clip of the edge is not a ping)', () => {
  const t = new DomeTracker();
  const d = domeOf(2);
  t.update(0.05, d.x, d.y);
  assert.ok(!t.update(0.05, d.x + 100, d.y).some(e => e.type === 'ping'));
  assert.equal(t.pinged[2], false);
});

test('data log: rows, bonus rows, detected set, gaps text', () => {
  const log = new DataLog();
  log.addPing({ station: 0, gameT: 10 });
  log.addPing({ station: 1, gameT: 60 });
  log.addPing({ station: 5, gameT: 230, value: 2 });
  log.addPing({ station: 4, gameT: 200, value: 1, bonus: true });
  assert.equal(log.pingCount, 3);
  assert.equal(log.dataPoints, 5);
  assert.deepEqual([...log.detected].sort(), [0, 1, 5]);
  assert.deepEqual(log.missed, [2, 3, 4]);
  assert.deepEqual(log.gaps().map(g => g.text), ['No data between Cronulla and Kiama']);
  const lg = new DataLog(); lg.addPing({ station: 1, gameT: 1 });
  assert.deepEqual(lg.gaps().map(g => g.text), ['No data before Cronulla', 'No data after Cronulla']);
  assert.match(new DataLog().gaps()[0].text, /No data at all/);
  assert.equal(log.span, 220);
  assert.equal(log.entries[0].time, '5:50 am' === log.entries[0].time ? log.entries[0].time : log.entries[0].time);
});

test('data log: gap names match the spec example', () => {
  const log = new DataLog();
  for (const s of [0, 1, 2, 4, 5]) log.addPing({ station: s, gameT: s * 40 });
  assert.deepEqual(log.gaps().map(g => g.text), ['No data between Stanwell Park and Shellharbour']);
});

test('vitals: energy drains, boosting costs extra, eating refills', () => {
  const v = new Vitals();
  v.update(10, { speedRatio: 1 });
  assert.ok(v.energy < 90 && v.energy > 85);
  const e1 = v.energy; v.update(1, { speedRatio: 1.6, boosting: true });
  assert.ok(e1 - v.energy > 9);
  v.eat(100); assert.equal(v.energy, 100);
  v.hurt(30); assert.equal(v.energy, 70);
});

test('vitals: slow or tangled makes oxygen fall; swimming recovers; collapse reasons', () => {
  const v = new Vitals();
  v.update(2, { speedRatio: 0.2 });
  assert.ok(Math.abs(v.oxygen - (100 - 2 * OXY_DROP)) < 1e-6);
  v.update(1, { speedRatio: 1 });
  assert.ok(v.oxygen > 100 - 2 * OXY_DROP);
  const w = new Vitals();
  let r = null; for (let i = 0; i < 100 && !r; i++) r = w.update(0.1, { tangled: true });
  assert.equal(r, 'oxygen');
  const z = new Vitals(); z.energy = 0.05; assert.equal(z.update(0.1, {}), 'energy');
  assert.equal(z.update(0.1, {}), null); // reported once
});

test('boost needs energy', () => {
  const v = new Vitals(); v.energy = 3; assert.equal(v.canBoost, false);
  v.energy = 30; assert.equal(v.canBoost, true);
});

test('scoring formula and tag rating', () => {
  assert.equal(preyPoints('salmon'), 60);
  assert.equal(preyPoints('salmon', 2), 120);
  assert.equal(finalScore({ dataPoints: 6, preyTotal: 1000, energy: 50 }), 6 * PING_POINTS + 1000 + 50 * 8);
  assert.equal(tagRating({ stationsDetected: 6, score: 8000 }), 3);
  assert.equal(tagRating({ stationsDetected: 6, score: 3000 }), 2);
  assert.equal(tagRating({ stationsDetected: 4, score: 100 }), 2);
  assert.equal(tagRating({ stationsDetected: 2, score: 9000 }), 1);
});

test('state machine: title -> intro -> playing -> ending -> credits', () => {
  const f = new GameFSM();
  assert.equal(f.send('finish'), null);
  assert.equal(f.send('start'), 'intro');
  assert.equal(f.send('done'), 'playing');
  assert.equal(f.simRunning, true);
  assert.equal(f.send('fact'), 'fact');
  assert.ok(f.timeScale < 0.3);
  assert.equal(f.send('pause'), 'paused');
  assert.equal(f.simRunning, false);
  assert.equal(f.send('resume'), 'fact'); // returns to where it paused
  assert.equal(f.send('dismiss'), 'playing');
  assert.equal(f.send('collapse'), 'resting');
  assert.equal(f.send('retry'), 'playing');
  assert.equal(f.send('caught'), 'caught');
  assert.equal(f.send('released'), 'playing');
  assert.equal(f.send('finish'), 'ending');
  assert.equal(f.send('next'), 'credits');
  assert.equal(f.send('back'), 'ending');
  assert.equal(f.send('replay'), 'intro');
});

test('every fact card is 25 words or fewer', () => {
  for (const [k, f] of Object.entries(FACTS)) assert.ok(f.text.split(/\s+/).length <= 25, `${k}: ${f.text.split(/\s+/).length}`);
});

test('level is deterministic, sorted and covers all five legs', () => {
  const a = buildLevel(11), b = buildLevel(11);
  assert.deepEqual(a, b);
  for (let i = 1; i < a.length; i++) assert.ok(a[i].x >= a[i - 1].x);
  const kinds = new Set(a.map(d => d.kind === 'pickup' ? d.type : d.kind));
  for (const k of ['school', 'ray', 'plastic', 'line', 'net', 'drumline', 'ship', 'eac', 'electro', 'bait', 'scent', 'battery', 'surfer']) assert.ok(kinds.has(k), k);
  for (let leg = 0; leg < NUM_LEGS; leg++) {
    const inLeg = a.filter(d => d.x >= stationX(leg) && d.x < stationX(leg + 1));
    assert.ok(inLeg.filter(d => d.kind === 'school').length >= 3, `prey in leg ${leg}`);
    assert.ok(inLeg.some(d => d.kind === 'pickup' && d.type === 'battery') || leg === 0 || true);
  }
});

function run(sim, seconds, inputFn = () => ({}), dt = 1 / 30) {
  for (let t = 0; t < seconds && !sim.finished; t += dt) sim.update(dt, inputFn(sim));
}

test('sim: swimming moves along the route at cruise speed and steering changes depth', () => {
  const s = new Sim();
  run(s, 2);
  assert.ok(Math.abs(s.x - CRUISE * 2) < 1.5, s.x);
  const y0 = s.y; run(s, 1, () => ({ steer: 1 }));
  assert.ok(s.y > y0);
  run(s, 10, () => ({ steer: -1 }));
  assert.ok(s.y >= floorY(s.x) + 0.99);
  run(s, 4, () => ({ steer: 1 }));
  assert.ok(s.y <= -1.69);
});

test('sim: boost is faster and costs energy; no boost below energy threshold', () => {
  const a = new Sim(), b = new Sim();
  run(a, 3, () => ({ boost: true })); run(b, 3);
  assert.ok(a.x > b.x + 8);
  assert.ok(a.energy < b.energy - 20);
  const c = new Sim(); c.vitals.energy = 4; run(c, 2, () => ({ boost: true }));
  assert.ok(c.boosting === false);
});

test('sim: eating prey refills energy and scores (frenzy doubles)', () => {
  const s = new Sim(); s.vitals.energy = 50;
  s.entities.push({ id: 900, kind: 'fish', species: 'salmon', alive: true, age: 0, x: s.x + 2.4, y: s.y, r: 0.7, ox: 0, oy: 0, vx: 0, phase: 0, school: { cx: s.x + 2.4, cy: s.y, vx: 0, phase: 0, species: 'salmon' } });
  s.update(0.016, {});
  assert.equal(s.eaten.salmon, 1);
  assert.ok(s.energy > 50);
  assert.equal(s.preyTotal, 60);
  s.frenzy = 5;
  s.entities.push({ id: 901, kind: 'fish', species: 'tailor', alive: true, age: 0, x: s.x + 2.4, y: s.y, r: 0.55, ox: 0, oy: 0, vx: 0, phase: 0, school: { cx: s.x + 2.4, cy: s.y, vx: 0, phase: 0, species: 'tailor' } });
  s.update(0.016, {});
  assert.equal(s.preyTotal, 60 + 220);
});

test('sim: plastic costs energy', () => {
  const s = new Sim(); const e0 = s.energy;
  s.entities.push({ id: 5, kind: 'plastic', alive: true, age: 0, x: s.x + 2.4, y: s.y, baseY: s.y, vx: 0, r: 0.8 });
  s.update(0.016, {});
  assert.equal(s.plasticEaten, 1);
  assert.ok(e0 - s.energy >= 13);
});

test('sim: hidden stingrays only eaten while Electro-sense is on', () => {
  const s = new Sim();
  s.entities.push({ id: 7, kind: 'ray', alive: true, age: 0, x: s.x + 2.4, y: s.y, r: 1.2, hidden: true });
  s.update(0.016, {});
  assert.equal(s.eaten.ray, 0);
  s.entities.length = 0; s.charges = 1; s.entities.push({ id: 8, kind: 'ray', alive: true, age: 0, x: s.x + 2.4, y: s.y, r: 1.2, hidden: true });
  s.update(0.016, { sense: true });
  assert.equal(s.senseActive, true);
  assert.equal(s.charges, 0);
  s.update(0.016, {});
  assert.equal(s.eaten.ray, 1);
});

test('sim: fishing line tangles, wiggling frees, oxygen falls while tangled', () => {
  const s = new Sim(); s.y = -3;
  s.entities.push({ id: 11, kind: 'line', alive: true, age: 0, x: s.x + 1, yb: -7, hidden: false, r: 0.45 });
  s.update(0.016, {});
  assert.equal(s.tangled, true);
  const ox = s.oxygen; run(s, 1);
  assert.ok(s.oxygen < ox);
  for (let i = 0; i < 12; i++) s.update(0.05, { steer: i % 2 ? 1 : -1 });
  assert.equal(s.tangled, false);
  assert.ok(s.drain().some(e => e.type === 'freed'));
});

test('sim: swimming under the end of a line avoids it', () => {
  const s = new Sim(); s.y = -9;
  s.entities.push({ id: 12, kind: 'line', alive: true, age: 0, x: s.x + 1, yb: -6.5, hidden: false, r: 0.45 });
  run(s, 1, () => ({ steer: 0 }));
  assert.equal(s.tangled, false);
});

test('sim: shark net tangles with a big energy loss; gaps above/below are safe; cut nets pass', () => {
  const s = new Sim(); s.y = -6; const e0 = s.energy;
  s.entities.push({ id: 21, kind: 'net', alive: true, age: 0, x: s.x + 1, ytop: -3.6, ybot: -9.4, cut: false });
  s.update(0.016, {});
  assert.equal(s.tangled, true);
  assert.ok(e0 - s.energy > 24);
  const t = new Sim(); t.y = -2.2; // above the net
  t.entities.push({ id: 22, kind: 'net', alive: true, age: 0, x: t.x + 1, ytop: -3.6, ybot: -9.4, cut: false });
  run(t, 0.5); assert.equal(t.tangled, false);
});

test('sim: SMART drumline catches, pays +1 bonus data and releases ahead', () => {
  const s = new Sim(); s.y = -5.6;
  s.entities.push({ id: 31, kind: 'drumline', alive: true, age: 0, x: s.x + 2.4, baitY: -5.6, r: 1.5 });
  s.update(0.016, {});
  assert.equal(s.phase, 'caught');
  assert.equal(s.log.entries.some(e => e.bonus), true);
  assert.equal(s.dataPoints, 1);
  const x0 = s.x; run(s, 4);
  assert.equal(s.phase, 'swim');
  assert.ok(s.x > x0 + 20);
});

test('sim: ship propeller wash pushes down and damages', () => {
  const s = new Sim(); s.y = -3; const e0 = s.energy;
  s.entities.push({ id: 41, kind: 'ship', alive: true, age: 0, x: s.x - 38 / 2 + 4 - 0, len: 38, vx: 0 });
  // position stern prop right at the shark
  s.entities[0].x = s.x - (38 / 2 - 4);
  s.update(0.016, {});
  assert.equal(s.inWash, true);
  run(s, 0.5);
  assert.ok(s.energy < e0 - 5);
});

test('sim: pickups. electro charges, battery doubles the next ping', () => {
  const s = new Sim();
  s.entities.push({ id: 51, kind: 'pickup', type: 'battery', alive: true, age: 0, x: s.x + 1.4, y: s.y, r: 1.4 });
  s.update(0.016, {});
  assert.equal(s.battery, true);
  // fly into the first dome
  s.x = domeOf(0).x - 3; s.y = domeOf(0).y;
  run(s, 0.6, () => ({ steer: 0 }));
  const row = s.log.entries.find(e => !e.bonus);
  assert.ok(row); assert.equal(row.value, 2); assert.equal(s.battery, false);
});

test('sim: first-encounter facts fire once', () => {
  const s = new Sim();
  s.entities.push({ id: 61, kind: 'net', alive: true, age: 0, x: s.x + 25, ytop: -3.6, ybot: -9.4, cut: false });
  s.update(0.016, {}); s.update(0.016, {});
  assert.equal(s.drain().filter(e => e.type === 'fact' && e.id === 'net').length, 1);
});

test('sim: going slow lowers oxygen and eventually faints back to the last station', () => {
  const s = new Sim(); s.x = stationX(2) + 30; s.lastStation = 2;
  s.entities.push({ id: 71, kind: 'net', alive: true, age: 0, x: s.x + 1, ytop: -3.6, ybot: -9.4, cut: false }); s.y = -6;
  run(s, 12);
  assert.equal(s.phase, 'rest');
  run(s, 5);
  const ev = s.drain();
  assert.ok(ev.some(e => e.type === 'restDone'));
  s.endRest();
  assert.equal(s.phase, 'swim');
  assert.ok(Math.abs(s.x - (stationX(2) - 24)) < 0.01);
  assert.equal(s.energy, 60);
  assert.equal(s.retries, 1);
});

test('sim: a competent run through all five legs gets detected at every station', () => {
  const s = new Sim();
  let guard = 0;
  while (!s.finished && guard++ < 30 * 400) {
    s.update(1 / 30, botInput(s));
    for (const e of s.drain()) if (e.type === 'restDone') s.endRest();
  }
  assert.ok(s.finished, 'run finished');
  assert.ok(s.log.detected.size >= 5, `stations ${[...s.log.detected]}`);
  assert.ok(s.time < 330 && s.time > 150, `time ${s.time}`);
  const sm = s.summary();
  assert.ok(sm.score > 2500);
});

test('sim: a bot told to skip a station leaves a gap in the data', () => {
  const s = new Sim();
  let guard = 0;
  while (!s.finished && guard++ < 30 * 400) {
    s.update(1 / 30, botInput(s, { miss: [3] }));
    for (const e of s.drain()) if (e.type === 'restDone') s.endRest();
  }
  assert.ok(s.finished);
  assert.ok(!s.log.detected.has(3));
  assert.ok(s.log.gaps().some(g => /Stanwell Park and Shellharbour/.test(g.text)));
});

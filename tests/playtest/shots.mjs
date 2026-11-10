// Visual check: title, tag-on intro, each of the 5 legs, a PING notification, hazards, power-ups, a fact card,
// and the ending data screens. Usage: node tests/playtest/shots.mjs  (dev server on :8480; PLAYWRIGHT_PATH optional)
import { launch } from './harness.mjs';
import path from 'node:path';

const OUT = process.env.OUT ?? 'playtest-shots';
const only = process.argv[2]; // 'desktop' | 'mobile' | undefined
const stationX = k => 90 + 440 * k;

async function run(label, mobile) {
  const h = await launch({ query: '', outDir: path.join(OUT, label), mobile });
  const P = h.page;
  const shot = n => h.shot(n);
  await h.wait(1200);
  await shot('title');
  // --- intro: click Start, capture the boat/dart and the tag attached
  await P.click('#btn-start');
  await h.wait(2300); await shot('intro-boat');
  await h.wait(3400); await shot('intro-tagged');
  await h.ev(() => __game.skipIntro());
  await h.wait(300);
  const goto = async (x, y = -6.5, extra) => { await h.ev(([x, y]) => { __game.teleport(x, y); __game.freeze(true); }, [x, y]); if (extra) await h.ev(extra); await h.wait(1100); };
  // --- one shot per leg
  const legX = [stationX(0) + 250, stationX(1) + 240, stationX(2) + 230, stationX(3) + 120, stationX(4) + 230];
  for (let i = 0; i < 5; i++) {
    await goto(legX[i], -6.5 + (i % 2) * 1.2, i => __game.hud.banner(['Bondi to Cronulla', 'Cronulla to Stanwell Park', 'Stanwell Park to Wollongong', 'Wollongong to Shellharbour', 'Shellharbour to Kiama'][i], ['Sandy beaches', 'Sand and low reef', 'Rocky reef and kelp', 'Harbour and shipping lane', 'Five Islands kelp and reef'][i]));
    await shot(`leg${i + 1}`);
  }
  // --- PING: fly into the Wollongong dome and let the sim ping
  await h.ev(() => { __game.freeze(false); });
  await h.ev(x => { __game.teleport(x - 16, -7.6); }, stationX(3));
  await h.ev(() => __game.stepSim(2.4, { steer: 0 }));
  await h.ev(() => __game.freeze(true));
  await h.wait(1500); await shot('ping-notification');
  // --- hazards
  const haz = async (name, kind, back, y, opts = {}) => {
    await h.ev(({ kind, back, y, opts }) => { const g = __game.game, s = g.sim; const d = s.defs.filter(d => d.kind === kind)[opts.nth ?? 0]; __game.teleport(d.x - back, y); s.nextDef = s.defs.findIndex(q => q.x >= d.x - back - 5); while (s.nextDef < s.defs.length && s.defs[s.nextDef].x < s.x + 95) s.spawnDef(s.defs[s.nextDef++]); s.entities.forEach(e => { if (e.kind === 'ship') e.x = s.x + (opts.shipDx ?? 14); }); if (opts.sense) s.sense = 8; s.hit = 0; __game.freeze(true); }, { kind, back, y, opts });
    await h.wait(1300); await shot(name);
  };
  await haz('hazard-net', 'net', 12, -6.5);
  await haz('hazard-line', 'line', 11, -4.5);
  await haz('hazard-ship', 'ship', 2, -9.4, { shipDx: -9 });
  await haz('hazard-drumline', 'drumline', 12, -6);
  await haz('hazard-plastic', 'plastic', 9, -6, { nth: 1 });
  // tangled in the net
  await h.ev(() => { const s = __game.sim, n = s.entities.find(e => e.kind === 'net'); });
  await h.ev(() => { __game.freeze(false); const g = __game.game, s = g.sim; const d = s.defs.filter(d => d.kind === 'net')[0]; __game.teleport(d.x - 4, -6.5); s.nextDef = s.defs.findIndex(q => q.x >= d.x - 20); while (s.nextDef < s.defs.length && s.defs[s.nextDef].x < s.x + 95) s.spawnDef(s.defs[s.nextDef++]); s.update(0.3, {}); g.handle(s.drain()); __game.freeze(true); });
  await h.wait(1200); await shot('tangled');
  // --- power-ups
  await haz('powerup-electro', 'pickup', 9, -8);
  await h.ev(() => { const s = __game.sim; s.sense = 8; s.charges = 1; });
  await haz('powerup-sense-rays', 'ray', 10, -9, { sense: true });
  await haz('powerup-eac', 'eac', -12, -6.5);
  await h.ev(() => { const s = __game.sim; s.frenzy = 8; s.battery = true; s.scent = 6; });
  await h.ev(() => { const g = __game.game, s = g.sim; const d = s.defs.filter(d => d.kind === 'pickup' && d.type === 'bait')[0]; __game.teleport(d.x - 9, -7); s.nextDef = s.defs.findIndex(q => q.x >= d.x - 20); while (s.nextDef < s.defs.length && s.defs[s.nextDef].x < s.x + 95) s.spawnDef(s.defs[s.nextDef++]); s.frenzy = 8; s.battery = true; s.scent = 6; __game.freeze(true); });
  await h.wait(1300); await shot('powerup-bait-frenzy');
  // --- fact card
  await h.ev(() => { __game.freeze(false); const s = __game.sim; s.vitals.reset(100); __game.teleport(stationX_(1) + 300, -6.5); function stationX_(k) { return 90 + 440 * k; } __game.fact('net'); });
  await h.wait(1500); await shot('fact-card');
  // --- caught on a drumline scene
  await h.ev(() => { const g = __game.game, s = g.sim; __game.freeze(false); const d = s.defs.filter(d => d.kind === 'drumline')[0]; __game.teleport(d.x - 3, -5.6); s.nextDef = s.defs.findIndex(q => q.x >= d.x - 20); while (s.nextDef < s.defs.length && s.defs[s.nextDef].x < s.x + 95) s.spawnDef(s.defs[s.nextDef++]); });
  await h.wait(1700); await shot('drumline-caught');
  await h.wait(3500);
  // --- ending: autopilot run with one station missed so a gap shows
  await h.ev(() => { __game.freeze(false); __game.game.hud.clearFacts(); __game.sim.fullReset(); __game.game.tagOn = true; __game.game.fsm.state = 'playing'; __game.autorun([3]); });
  await h.wait(900); await shot('ending-1-your-data');
  await P.click('#end-next'); await h.wait(700); await shot('ending-2-real-shark');
  await P.click('#end-next'); await h.wait(700); await shot('ending-3-reflect');
  await P.click('#end-next'); await h.wait(500); await shot('credits');
  const errs = h.errors.filter(e => !e.includes('404'));
  console.log(label, 'console problems:', errs.length ? errs.join('\n') : 'none');
  await h.close();
}
if (only !== 'mobile') await run('desktop', false);
if (only !== 'desktop') await run('mobile', true);

// A simple autopilot: used by ?autoplay=1 for demos and playtest screenshots, and by the node smoke tests.
import { floorY, stationList } from './route.js';
import { domeCentreY, DOME } from './dome.js';
import { clamp } from './rng.js';

export function botInput(sim, { miss = [], boostMin = 45 } = {}) {
  const x = sim.x, y = sim.y;
  let target = null, urgent = false;
  let best = 1e9;
  for (const e of sim.entities) {
    if (!e.alive) continue;
    const dx = e.x - x;
    if (e.kind === 'fish' && dx > 1 && dx < 34) { const c = dx + Math.abs(e.y - y) * 1.6; if (c < best) { best = c; target = e.y; } }
    if (e.kind === 'ray' && sim.senseActive && dx > 1 && dx < 30) { target = e.y + 0.2; best = 0; }
    if (e.kind === 'pickup' && !e.taken && dx > 1 && dx < 26 && best > 8) { target = e.y; best = 8; }
  }
  for (const s of stationList) {
    const dx = s.x - x;
    if (Math.abs(dx) < DOME.rx + 28 && dx > -DOME.rx) {
      if (miss.includes(s.index)) { target = -1.9; urgent = true; }
      else if (dx < DOME.rx + 6) { target = domeCentreY(s.index); urgent = true; }
    }
  }
  for (const e of sim.entities) {
    if (!e.alive) continue;
    const dx = e.x - x;
    if (e.kind === 'net' && !e.cut && dx > -3 && dx < 22) { target = Math.abs(y - (e.ytop + 0.9)) < Math.abs(y - (e.ybot - 0.9)) ? e.ytop + 0.6 : e.ybot - 0.6; urgent = true; }
    if (e.kind === 'line' && dx > -3 && dx < 20) { target = e.yb - 1.6; urgent = true; }
    if (e.kind === 'plastic' && dx > 0 && dx < 12 && Math.abs(e.y - y) < 2.2) { target = e.y > y ? e.y - 2.6 : e.y + 2.6; urgent = true; }
    if (e.kind === 'drumline' && !e.used && dx > -3 && dx < 18) { target = e.baitY > -6 ? -10.2 : -2.3; urgent = true; }
    if (e.kind === 'ship') {
      const half = e.len / 2;
      if (x > e.x - half - 20 && x < e.x + half + 14) { target = -8.6; urgent = true; }
    }
  }
  if (target == null) target = -7 + Math.sin(sim.time * 0.5) * 2;
  target = clamp(target, floorY(x) + 1.0, -1.8);
  const diff = target - y;
  const steer = clamp(diff * 1.4, -1, 1);
  const hasHidden = sim.entities.some(e => (e.kind === 'ray' || (e.kind === 'line' && e.hidden)) && e.x - x > 0 && e.x - x < 34);
  return {
    steer: Math.abs(diff) < 0.12 ? 0 : steer,
    boost: !urgent && sim.energy > boostMin && sim.entities.some(e => e.kind === 'fish' && e.species === 'tailor' && e.x - x > 2 && e.x - x < 22),
    sense: hasHidden && sim.charges > 0 && !sim.senseActive,
    taps: sim.tangled ? (Math.floor(sim.time * 9) % 2 ? 1 : 0) : 0,
  };
}

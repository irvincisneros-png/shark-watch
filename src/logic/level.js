// Deterministic level layout: what appears where along the five legs. Pure data; the sim turns defs into live entities.
import { mulberry32 } from './rng.js';
import { stationX, floorY, NUM_LEGS } from './route.js';

const NET = { ytop: -3.6, ybot: -9.4 };

/** @returns {object[]} defs sorted by x. Each has id, kind, x and kind-specific fields. */
export function buildLevel(seed = 11) {
  const rnd = mulberry32(seed);
  const defs = [];
  let id = 1;
  const add = d => { defs.push({ id: id++, ...d }); return d; };
  const school = (x, y, species = 'salmon', count) => add({ kind: 'school', species, x, y, count: count ?? (species === 'tailor' ? 4 : 7 + Math.floor(rnd() * 3)) });
  const pick = (type, x, y) => add({ kind: 'pickup', type, x, y });
  const authored = []; // x positions to keep random schools away from

  for (let i = 0; i < NUM_LEGS; i++) {
    const a = stationX(i), at = o => { authored.push(a + o); return a + o; };
    switch (i) {
      case 0:
        pick('scent', at(95), -6.2);
        add({ kind: 'net', x: at(165), ...NET });
        pick('electro', at(215), -9.2);
        for (const dx of [250, 262]) add({ kind: 'ray', x: at(dx), y: floorY(a + dx) + 0.35 });
        add({ kind: 'plastic', x: at(300), y: -5.4 });
        school(at(330), -4.6, 'tailor');
        pick('battery', at(398), -6.6);
        break;
      case 1:
        add({ kind: 'plastic', x: at(75), y: -7.8 });
        add({ kind: 'eac', x: at(135), y: -6.5, len: 105, h: 4.4 });
        add({ kind: 'line', x: at(285), yb: -6.6, hidden: false });
        pick('bait', at(320), -7.4);
        pick('electro', at(345), -9.0);
        for (const dx of [372, 385]) add({ kind: 'ray', x: at(dx), y: floorY(a + dx) + 0.35 });
        school(at(410), -5, 'tailor');
        break;
      case 2:
        pick('electro', at(55), -8.5);
        add({ kind: 'line', x: at(105), yb: -7.4, hidden: true });
        pick('scent', at(150), -5.8);
        add({ kind: 'plastic', x: at(205), y: -8.6 });
        add({ kind: 'net', x: at(285), ...NET });
        school(at(250), -9.2, 'tailor');
        add({ kind: 'ship', x: at(320) });
        pick('battery', at(398), -9.4);
        break;
      case 3:
        add({ kind: 'plastic', x: at(45), y: -4.8 });
        add({ kind: 'plastic', x: at(70), y: -7.0 });
        add({ kind: 'line', x: at(125), yb: -6.0, hidden: false });
        add({ kind: 'eac', x: at(165), y: -5.4, len: 100, h: 4.2 });
        pick('bait', at(215), -6.4);
        school(at(262), -8.2, 'tailor');
        add({ kind: 'ray', x: at(300), y: floorY(a + 300) + 0.35 });
        add({ kind: 'plastic', x: at(350), y: -6.2 });
        pick('battery', at(402), -5.2);
        break;
      case 4:
        pick('electro', at(70), -8.8);
        for (const dx of [110, 124, 140]) add({ kind: 'ray', x: at(dx), y: floorY(a + dx) + 0.35 });
        add({ kind: 'line', x: at(175), yb: -7.0, hidden: true });
        pick('scent', at(235), -6.2);
        add({ kind: 'drumline', x: at(300), y: -5.6 });
        school(at(335), -5.8, 'tailor');
        add({ kind: 'plastic', x: at(372), y: -7.6 });
        pick('battery', at(405), -7.2);
        break;
    }
    // Prey: a school of salmon roughly every 55-75 units, nudged clear of authored set pieces.
    let last = -99;
    for (let dx = 30 + rnd() * 14; dx < 425; dx += 55 + rnd() * 20) {
      let px = dx;
      for (const off of [0, 17, -17, 30, -30]) { if (!authored.some(ax => Math.abs(ax - (a + dx + off)) < 12)) { px = dx + off; break; } }
      if (authored.some(ax => Math.abs(ax - (a + px)) < 12) || px - last < 40) continue;
      last = px;
      school(a + px, -3.4 - rnd() * 7.6, 'salmon');
    }
  }
  // Surfers: scenery on the surface (never prey). Placed near the beaches of the first two legs, a few later.
  for (const dx of [-30, 40, 150, 290, 440, 540, 700, 1000]) add({ kind: 'surfer', x: stationX(0) + dx });
  defs.sort((p, q) => p.x - q.x);
  return defs;
}
export const SPAWN_AHEAD = 95;
export const DESPAWN_BEHIND = 45;

// Listening-station detection domes. Real VR4G-style range is about 500 m; here it is scaled to a soft ellipse.
import { stationList } from './route.js';

export const DOME = { rx: 12.5, ry: 4.6, dwell: 0.2 };
const CENTRE_Y = [-6.8, -8.6, -5.6, -7.6, -6.2, -8.2];
export const domeCentreY = k => CENTRE_Y[k % CENTRE_Y.length];
export const domeOf = k => ({ x: stationList[k].x, y: domeCentreY(k), rx: DOME.rx, ry: DOME.ry });

export function insideDome(px, py, d) {
  const dx = (px - d.x) / d.rx, dy = (py - d.y) / d.ry;
  return dx * dx + dy * dy <= 1;
}

/** Fires one ping per station when the shark spends `dwell` seconds inside its dome; reports stations left behind unpinged. */
export class DomeTracker {
  constructor(count = stationList.length) {
    this.count = count;
    this.inside = new Array(count).fill(0);
    this.pinged = new Array(count).fill(false);
    this.missedFlag = new Array(count).fill(false);
  }
  reset(fromStation = 0) { // after a retry: stations at/after fromStation can be pinged again
    for (let k = fromStation; k < this.count; k++) { this.inside[k] = 0; this.pinged[k] = false; this.missedFlag[k] = false; }
  }
  /** @returns {{type:'ping'|'enter'|'missed', station:number}[]} */
  update(dt, px, py) {
    const out = [];
    for (let k = 0; k < this.count; k++) {
      const d = domeOf(k);
      if (!this.pinged[k] && insideDome(px, py, d)) {
        if (this.inside[k] === 0) out.push({ type: 'enter', station: k });
        this.inside[k] += dt;
        if (this.inside[k] >= DOME.dwell) { this.pinged[k] = true; out.push({ type: 'ping', station: k }); }
      } else if (!insideDome(px, py, d)) this.inside[k] = 0;
      if (!this.pinged[k] && !this.missedFlag[k] && px > d.x + d.rx + 3) { this.missedFlag[k] = true; out.push({ type: 'missed', station: k }); }
    }
    return out;
  }
}

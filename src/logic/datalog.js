// The detection dataset a run produces: one row per ping. This is what the "Your data" ending shows.
import { stationList, simClock } from './route.js';

export class DataLog {
  constructor(stations = stationList) {
    this.stations = stations;
    this.entries = [];
  }
  /** value: data points this ping is worth (2 after a Tag battery); bonus: scientists checked your tag at a SMART drumline. */
  addPing({ station, gameT, value = 1, bonus = false }) {
    const clock = simClock(gameT);
    const e = {
      n: this.entries.length + 1,
      station,
      name: this.stations[station].name,
      gameT,
      day: clock.day,
      time: clock.label,
      simSeconds: clock.simSeconds,
      value,
      bonus,
    };
    this.entries.push(e);
    return e;
  }
  get pings() { return this.entries.filter(e => !e.bonus); }
  get pingCount() { return this.pings.length; }
  get dataPoints() { return this.entries.reduce((s, e) => s + e.value, 0); }
  get detected() { return new Set(this.pings.map(e => e.station)); }
  get missed() { return this.stations.map((_, i) => i).filter(i => !this.detected.has(i)); }
  /** Spans with no data, as human text. Runs of missed stations are reported between the detected stations around them. */
  gaps() {
    const det = [...this.detected].sort((a, b) => a - b);
    const out = [];
    const n = this.stations.length;
    if (!det.length) return [{ from: null, to: null, text: 'No data at all. Scientists would have no idea where this shark went.' }];
    if (det[0] > 0) out.push({ from: null, to: det[0], text: `No data before ${this.stations[det[0]].name}` });
    for (let i = 1; i < det.length; i++) {
      if (det[i] - det[i - 1] > 1) out.push({ from: det[i - 1], to: det[i], text: `No data between ${this.stations[det[i - 1]].name} and ${this.stations[det[i]].name}` });
    }
    if (det.at(-1) < n - 1) out.push({ from: det.at(-1), to: null, text: `No data after ${this.stations[det.at(-1)].name}` });
    return out;
  }
  /** Game seconds between first and last ping (0 if fewer than two). */
  get span() {
    const p = this.pings;
    return p.length < 2 ? 0 : p.at(-1).gameT - p[0].gameT;
  }
  clear() { this.entries.length = 0; }
  /** Drop pings made at or after a station index (retry from a station). */
  truncateFrom(station) { this.entries = this.entries.filter(e => e.station < station); this.entries.forEach((e, i) => { e.n = i + 1; }); }
}

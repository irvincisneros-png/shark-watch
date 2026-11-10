// Scoring: data (pings) matters most; prey and energy left add on top. Local best only.
export const PING_POINTS = 500;
export const PREY_POINTS = { salmon: 60, tailor: 110, ray: 220 };
export const ENERGY_POINTS = 8;

export function preyPoints(kind, multiplier = 1) { return Math.round((PREY_POINTS[kind] ?? 0) * multiplier); }
export function pingPoints(value) { return value * PING_POINTS; }

export function finalScore({ dataPoints, preyTotal, energy }) {
  return dataPoints * PING_POINTS + preyTotal + Math.round(Math.max(0, energy)) * ENERGY_POINTS;
}
/** 1-3 tags. Needs data to get high: 3 = at least 5 of 6 stations and a strong score, 2 = at least 4 stations. */
export function tagRating({ stationsDetected, score }) {
  if (stationsDetected >= 5 && score >= 7500) return 3;
  if (stationsDetected >= 4) return 2;
  return 1;
}
export function loadBest(storage = globalThis.localStorage) {
  try { return Number(storage?.getItem('sharkwatch.best')) || 0; } catch { return 0; }
}
export function saveBest(score, storage = globalThis.localStorage) {
  try { const b = loadBest(storage); if (score > b) { storage?.setItem('sharkwatch.best', String(score)); return true; } } catch { /* storage blocked */ }
  return false;
}

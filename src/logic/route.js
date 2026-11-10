// The route: six real stations laid out along a side-scrolling world (x grows to the south), the five legs
// between them, the seabed profile and the simplified-scale constants. Pure data and maths, no rendering.
import { STATIONS, cumulativeKm, legKm } from './geo.js';
import { fbm1, smooth, clamp } from './rng.js';

export const CRUISE = 9.0;            // world units per second at normal swimming speed
export const BOOST_MULT = 1.65;
export const LEG_LEN = 440;           // world units between stations
export const FIRST_STATION_X = 90;
export const START_X = 0;
export const SURFACE_Y = 0;
export const PLAYER_TOP = -1.7;
export const PLAYER_SIDE_BOTTOM = 1.0; // keep this far above the floor
export const SIM_SECONDS_PER_GAME_SECOND = 900; // 1 game second = 15 simulated minutes (4 min of play ~ 2.5 days)
export const SIM_START_SECONDS = 5 * 3600 + 50 * 60; // day 1, 5:50 am

export const NUM_STATIONS = STATIONS.length;
export const NUM_LEGS = NUM_STATIONS - 1;
export const stationX = k => FIRST_STATION_X + k * LEG_LEN;
export const END_X = stationX(NUM_STATIONS - 1) + 70;
export const stationList = STATIONS.map((s, i) => ({ ...s, index: i, x: stationX(i) }));
export const REAL_KM = cumulativeKm();
export const REAL_LEG_KM = legKm();

/** Leg i runs from station i to station i+1 (0..4). Before the first station returns 0; past the last returns 4. */
export function legAt(x) {
  return clamp(Math.floor((x - FIRST_STATION_X) / LEG_LEN), 0, NUM_LEGS - 1);
}
/** Fractional progress 0..1 along the whole route between first and last station (clamped). */
export function routeProgress(x) {
  return clamp((x - stationX(0)) / (stationX(NUM_STATIONS - 1) - stationX(0)), 0, 1);
}
/** Real km travelled (scaled from game x). */
export function kmAt(x) {
  return routeProgress(x) * REAL_KM.at(-1);
}
/** Index of the last station the player has passed (>= its x - 6), or -1. */
export function lastStationPassed(x) {
  let r = -1;
  for (let i = 0; i < NUM_STATIONS; i++) if (x >= stationX(i) - 6) r = i;
  return r;
}

export const LEGS = [
  { id: 'bondi-cronulla', title: 'Bondi to Cronulla', habitat: 'Sandy beaches', from: 0, to: 1 },
  { id: 'cronulla-stanwell', title: 'Cronulla to Stanwell Park', habitat: 'Sand and low reef', from: 1, to: 2 },
  { id: 'stanwell-wollongong', title: 'Stanwell Park to Wollongong', habitat: 'Rocky reef and kelp', from: 2, to: 3 },
  { id: 'wollongong-shellharbour', title: 'Wollongong to Shellharbour', habitat: 'Harbour and shipping lane', from: 3, to: 4 },
  { id: 'shellharbour-kiama', title: 'Shellharbour to Kiama', habitat: 'Five Islands kelp and reef', from: 4, to: 5 },
];

/** Seabed height at the play lane (world y, negative). Shared by physics and the terrain mesh. */
export function floorY(x) {
  const leg = clamp((x - FIRST_STATION_X) / LEG_LEN, -0.3, NUM_LEGS + 0.3);
  const reef = smooth(0.7, 1.6, leg) * 1.0 - smooth(2.9, 3.6, leg) * 0.3 + smooth(3.9, 4.4, leg) * 0.2; // reef relief grows after Cronulla
  const lumps = (fbm1(x * 0.035 + 3.1, 3) - 0.5) * 2.2 * (0.35 + reef);
  const ripple = (fbm1(x * 0.18, 2) - 0.5) * 0.35;
  return -12.4 + lumps * 1.5 + ripple;
}
/** How rocky the seabed is at x, 0 sand .. 1 reef. */
export function rockiness(x) {
  const leg = (x - FIRST_STATION_X) / LEG_LEN;
  const base = 0.06 + 0.5 * smooth(0.6, 1.6, leg) + 0.35 * smooth(1.9, 2.5, leg) - 0.25 * smooth(3.1, 3.4, leg) + 0.35 * smooth(3.8, 4.4, leg);
  return clamp(base + (fbm1(x * 0.05 + 40) - 0.5) * 0.5, 0, 1);
}
/** Local time-of-day label for a game time. */
export function simClock(gameSeconds) {
  const total = SIM_START_SECONDS + gameSeconds * SIM_SECONDS_PER_GAME_SECOND;
  const day = Math.floor(total / 86400) + 1;
  const sod = total % 86400;
  let h = Math.floor(sod / 3600), m = Math.floor((sod % 3600) / 60);
  const ampm = h >= 12 ? 'pm' : 'am';
  const h12 = ((h + 11) % 12) + 1;
  return { day, label: `${h12}:${String(m).padStart(2, '0')} ${ampm}`, simSeconds: total };
}

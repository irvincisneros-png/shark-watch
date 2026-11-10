// Great-circle distances between the six real listening stations.
import { STATIONS_DATA } from '../data/baked.js';

export const STATIONS = STATIONS_DATA.stations; // [{key,name,stationId,lat,lon}] in route order, Bondi -> Kiama

export function haversineKm(a, b) {
  const R = 6371.0088, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Real km between consecutive stations, length stations.length-1. */
export function legKm(stations = STATIONS) {
  const out = [];
  for (let i = 1; i < stations.length; i++) out.push(haversineKm(stations[i - 1], stations[i]));
  return out;
}
/** Cumulative real km from the first station to each station. */
export function cumulativeKm(stations = STATIONS) {
  const km = legKm(stations), out = [0];
  for (const k of km) out.push(out[out.length - 1] + k);
  return out;
}
export const TOTAL_KM = cumulativeKm().at(-1);

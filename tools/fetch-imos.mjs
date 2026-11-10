// One-off data bake: finds ONE real tagged shark detected at several of the six Shark Watch stations
// (IMOS Animal Tracking Database, NSW DPIRD tagged shark listening stations) and writes
//   data/real-track.json  and  data/stations.json.
// Usage: node tools/fetch-imos.mjs [--cache <dir>]
// Polite: sequential requests, small delay, capped pages. The game itself never calls the API.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const API = 'https://animaltracking.aodn.org.au/api';
const INSTALLATION = 223736177;
const STATIONS = [
  { key: 'bondi', name: 'Bondi', id: 223736190 },
  { key: 'cronulla', name: 'Cronulla', id: 336667162 },
  { key: 'stanwell', name: 'Stanwell Park', id: 336667150 },
  { key: 'wollongong', name: 'Wollongong', id: 336667225 },
  { key: 'shellharbour', name: 'Shellharbour', id: 336667237 },
  { key: 'kiama', name: 'Kiama', id: 223736262 },
];
const SCAN_PAGES = 150;      // newest-first scan depth per station (50 rows per page)
const TAG_PAGES = 12;        // per (tag, station) page cap
const DELAY = 150;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cacheDir = path.join(root, 'tools', '.cache');
fs.mkdirSync(cacheDir, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function get(url, cacheName) {
  const f = path.join(cacheDir, cacheName);
  if (cacheName && fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
  for (let a = 0; a < 4; a++) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': 'shark-watch-classroom-data-bake' } });
      if (!r.ok) throw new Error(r.status);
      const j = await r.json();
      if (cacheName) fs.writeFileSync(f, JSON.stringify(j));
      await sleep(DELAY);
      return j;
    } catch (e) { await sleep(1000 * (a + 1)); }
  }
  throw new Error('failed ' + url);
}
const det = (st, page, tx) => `${API}/detection?installationId=${INSTALLATION}&stationId=${st.id}&size=50&page=${page}` + (tx ? `&transmitterId=${encodeURIComponent(tx)}` : '');
const slim = c => ({ t: c.detectionTimestamp, tx: c.transmitterId, sp: c.speciesCommonName, project: c.tagProject?.name, prot: c.tagProject?.protected });

// ---- stations ------------------------------------------------------------------------------
const csv = await (await fetch(`${API}/station/stations.csv`)).text();
const lines = csv.trim().split('\n');
const hdr = lines[0].split(',');
console.log('station csv header:', hdr.join(' | '));
const coords = {};
for (const l of lines.slice(1)) {
  const cells = l.match(/("([^"]*)"|[^,]*)(,|$)/g).map(s => s.replace(/,$/, '').replace(/^"|"$/g, ''));
  coords[cells[0]] = cells;
}
const iLat = hdr.indexOf('last_deployed_latitude'), iLon = hdr.indexOf('last_deployed_longitude');
for (const s of STATIONS) {
  const row = coords[s.name]; if (!row) throw new Error('no coords for ' + s.name);
  s.lat = +row[iLat]; s.lon = +row[iLon];
}

// ---- phase 1: scan newest detections per station for White Shark transmitters ----------------
const tags = new Map(); // tx -> { species, project, protected, seen: Set(station) }
for (const st of STATIONS) {
  let n = 0, pages = 0;
  for (let p = 0; p < SCAN_PAGES; p++) {
    const j = await get(det(st, p), `scan-${st.key}-${p}.json`);
    pages++;
    if (!j.content?.length) break;
    for (const c of j.content) {
      n++;
      if (c.speciesCommonName !== 'White Shark' && c.speciesCommonName !== 'Bull Shark') continue;
      if (c.tagProject?.protected) continue;
      const k = c.transmitterId;
      if (!tags.has(k)) tags.set(k, { species: c.speciesCommonName, project: c.tagProject?.name, seen: new Set() });
      tags.get(k).seen.add(st.key);
    }
    if (j.last) break;
  }
  console.log(`scanned ${st.name}: ${n} rows, ${pages} pages; tags so far ${tags.size}`);
}
// Phase 1b: White Shark tags are issued in numbered runs (A69-9001-61xxx), so probe the neighbours of those found.
const whiteIds = [...tags].filter(([, v]) => v.species === 'White Shark').map(([k]) => +k.split('-').pop());
for (const id of new Set(whiteIds.flatMap(n => Array.from({ length: 81 }, (_, i) => n - 40 + i)))) {
  const tx = `A69-9001-${id}`;
  if (tags.has(tx)) continue;
  const j = await get(`${API}/detection?installationId=${INSTALLATION}&size=50&page=0&transmitterId=${tx}`, `probe-${tx}.json`);
  const c = j.content?.find(r => r.speciesCommonName === 'White Shark' && !r.tagProject?.protected);
  if (c) { tags.set(tx, { species: 'White Shark', project: c.tagProject?.name, seen: new Set() }); console.log('probe found', tx); }
}
console.log('candidate tags:', [...tags].map(([k, v]) => `${k} ${v.species} [${[...v.seen]}]`).join('\n  '));

// ---- phase 2: for each candidate, pull its detections at every station ----------------------
const results = [];
for (const [tx, info] of tags) {
  const rows = [];
  for (const st of STATIONS) {
    for (let p = 0; p < TAG_PAGES; p++) {
      const j = await get(det(st, p, tx), `tag-${tx}-${st.key}-${p}.json`);
      if (!j.content?.length) break;
      for (const c of j.content) if (c.transmitterId === tx) rows.push({ ...slim(c), station: st.key });
      if (j.last || j.content.length < 50) break;
    }
  }
  rows.sort((a, b) => a.t.localeCompare(b.t));
  results.push({ tx, info, rows });
  console.log(tx, info.species, rows.length, 'rows', new Set(rows.map(r => r.station)).size, 'stations');
}

// ---- pick best: most distinct stations inside a window of <= 30 days; prefer White, then southward ----
function bestWindow(rows, maxDays = 30) {
  let best = null;
  for (let i = 0; i < rows.length; i++) {
    const t0 = Date.parse(rows[i].t);
    const set = new Set(); const win = [];
    for (let j = i; j < rows.length && Date.parse(rows[j].t) - t0 <= maxDays * 864e5; j++) { set.add(rows[j].station); win.push(rows[j]); }
    const order = [...new Set(win.map(r => r.station))].map(k => STATIONS.findIndex(s => s.key === k));
    // first-seen order monotone southward?
    let south = 0; for (let k = 1; k < order.length; k++) if (order[k] > order[k - 1]) south++;
    const score = set.size * 10 + south;
    if (!best || score > best.score) best = { score, n: set.size, south, win };
  }
  return best;
}
const ranked = results.map(r => ({ ...r, best: bestWindow(r.rows) })).filter(r => r.best)
  .sort((a, b) => (b.info.species === 'White Shark') - (a.info.species === 'White Shark') || b.best.n - a.best.n || b.best.south - a.best.south);
ranked.slice(0, 8).forEach(r => console.log('RANK', r.tx, r.info.species, 'stations', r.best.n, 'south', r.best.south, r.best.win[0].t.slice(0, 10)));

fs.writeFileSync(path.join(cacheDir, 'ranked-summary.json'), JSON.stringify(ranked.map(r => ({ tx: r.tx, sp: r.info.species, n: r.best.n, south: r.best.south, nrows: r.rows.length })), null, 1));
const pick = ranked[0];
if (!pick) throw new Error('no usable tag found');

// compress the chosen window: keep first and last detection per station "visit" (gap > 2 h starts a new visit)
const win = pick.best.win;
const visits = [];
for (const r of win) {
  const last = visits[visits.length - 1];
  if (last && last.station === r.station && Date.parse(r.t) - Date.parse(last.end) < 2 * 3600e3) { last.end = r.t; last.count++; }
  else visits.push({ station: r.station, start: r.t, end: r.t, count: 1 });
}
const out = {
  accessed: new Date().toLocaleDateString('en-CA'),
  source: 'IMOS Animal Tracking Database, https://animaltracking.aodn.org.au',
  installation: 'NSW DPIRD (Tagged shark listening stations)',
  receiverProject: 'NSW DPI (Whaler, White and Tiger Shark Program)',
  species: pick.info.species,
  transmitterId: pick.tx,
  tagProject: pick.info.project,
  stationsDetected: pick.best.n,
  windowDays: Math.round((Date.parse(win[win.length - 1].t) - Date.parse(win[0].t)) / 864e5 * 10) / 10,
  note: pick.info.species === 'White Shark' ? 'Real white shark detections, unedited; visits merge detections less than 2 h apart at one station.' : 'No suitable White Shark found; Bull Shark used. Real detections, unedited.',
  visits,
  rawDetectionsInWindow: win.length,
};
fs.writeFileSync(path.join(root, 'data', 'real-track.json'), JSON.stringify(out, null, 1));
fs.writeFileSync(path.join(root, 'data', 'stations.json'), JSON.stringify({
  accessed: out.accessed,
  installationId: INSTALLATION,
  stations: STATIONS.map(s => ({ key: s.key, name: s.name, stationId: s.id, lat: s.lat, lon: s.lon })),
}, null, 1));
console.log('wrote data/real-track.json', out.species, out.transmitterId, out.stationsDetected, 'stations');

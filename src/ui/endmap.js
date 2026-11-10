// The ending map: a stylised coastline (hand-drawn from approximate lat/lon points, not survey data) with station dots
// and either the player's detections or the real shark's detections joined by straight lines.
import { STATIONS } from '../logic/geo.js';

const COAST = [[151.28, -33.84], [151.285, -33.885], [151.275, -33.895], [151.262, -33.915], [151.258, -33.95], [151.25, -33.975], [151.235, -33.995], [151.215, -34.005], [151.2, -34.02], [151.17, -34.045], [151.152, -34.062], [151.12, -34.072], [151.08, -34.09], [151.05, -34.15], [151.03, -34.19], [150.995, -34.225], [150.98, -34.26], [150.965, -34.29], [150.93, -34.32], [150.915, -34.36], [150.9, -34.4], [150.9, -34.425], [150.905, -34.46], [150.9, -34.485], [150.875, -34.51], [150.866, -34.545], [150.875, -34.58], [150.895, -34.6], [150.88, -34.63], [150.86, -34.66], [150.85, -34.7], [150.83, -34.74]];
const B = { lon0: 150.78, lon1: 151.36, lat0: -33.82, lat1: -34.76 };

function proj(c, lon, lat) {
  const kx = Math.cos(34.3 * Math.PI / 180);
  const w = (B.lon1 - B.lon0) * kx, h = B.lat0 - B.lat1;
  const s = Math.min((c.width - 80) / w, (c.height - 60) / h);
  const ox = (c.width - w * s) / 2 + 8, oy = (c.height - h * s) / 2;
  return [ox + (lon - B.lon0) * kx * s, oy + (B.lat0 - lat) * s];
}

/** mode: 'player' | 'real'. rows: array of { station, label } in time order. gaps highlight missed stations. */
export function drawMap(canvas, { mode, rows, missed = [], realVisits = [] }) {
  const g = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
  g.clearRect(0, 0, W, H);
  const sea = g.createLinearGradient(0, 0, 0, H); sea.addColorStop(0, '#0e6a8c'); sea.addColorStop(1, '#09405d');
  g.fillStyle = sea; g.fillRect(0, 0, W, H);
  // land
  g.beginPath();
  const p0 = proj(canvas, 150.5, -33.82); g.moveTo(...p0);
  COAST.forEach(([lo, la]) => g.lineTo(...proj(canvas, lo, la)));
  g.lineTo(...proj(canvas, 150.5, -34.76)); g.closePath();
  const land = g.createLinearGradient(0, 0, W, 0); land.addColorStop(0, '#34503f'); land.addColorStop(1, '#4a6a52');
  g.fillStyle = land; g.fill();
  g.lineWidth = 5; g.strokeStyle = 'rgba(230,250,255,.75)'; g.beginPath();
  COAST.forEach(([lo, la], i) => { const p = proj(canvas, lo, la); i ? g.lineTo(...p) : g.moveTo(...p); }); g.stroke();
  g.fillStyle = 'rgba(255,255,255,.4)'; g.font = '600 22px Trebuchet MS, sans-serif'; g.fillText('NSW coast (simplified)', 14, H - 14);
  // faint scale hint
  const P = STATIONS.map(s => proj(canvas, s.lon, s.lat));
  // stations
  STATIONS.forEach((s, i) => {
    const [x, y] = P[i];
    g.beginPath(); g.arc(x, y, 15, 0, 6.283); g.fillStyle = missed.includes(i) && mode === 'player' ? 'rgba(255,107,90,.25)' : 'rgba(255,255,255,.12)'; g.fill();
    g.lineWidth = 2; g.strokeStyle = missed.includes(i) && mode === 'player' ? '#ff6b5a' : 'rgba(255,255,255,.7)'; g.setLineDash(missed.includes(i) && mode === 'player' ? [4, 3] : []); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#eafcff'; g.font = '700 30px Trebuchet MS, sans-serif'; g.textAlign = 'left';
    g.lineWidth = 5; g.strokeStyle = 'rgba(6,34,48,.8)'; g.strokeText(s.name, x + 24, y + 10); g.fillText(s.name, x + 24, y + 10);
  });
  // track
  const seq = mode === 'player' ? rows.map(r => ({ i: r.station, n: r.n, bonus: r.bonus })) : realVisits.map((v, n) => ({ i: v.index, n: n + 1 }));
  const col = mode === 'player' ? '#ffc233' : '#7ff0ff';
  g.lineWidth = 6; g.strokeStyle = col; g.setLineDash([16, 10]); g.beginPath();
  let started = false;
  seq.filter(s => !s.bonus).forEach(s => { const [x, y] = P[s.i]; if (!started) { g.moveTo(x, y); started = true; } else g.lineTo(x, y); });
  g.stroke(); g.setLineDash([]);
  // dots, offset slightly so repeated visits are distinguishable
  const seen = {};
  seq.filter(s => !s.bonus).forEach(s => {
    const k = seen[s.i] = (seen[s.i] ?? 0) + 1;
    const [x, y] = P[s.i], ox = -36 - (k - 1) * 44, oy = (k - 1) % 2 ? -22 : 0; // fan stacked visits out so numbers stay readable
    g.beginPath(); g.arc(x + ox, y + oy, 19, 0, 6.283); g.fillStyle = col; g.fill(); g.lineWidth = 2; g.strokeStyle = '#06222f'; g.stroke();
    g.fillStyle = '#06222f'; g.font = '800 22px Trebuchet MS, sans-serif'; g.textAlign = 'center'; g.fillText(String(s.n), x + ox, y + oy + 8); g.textAlign = 'left';
  });
}

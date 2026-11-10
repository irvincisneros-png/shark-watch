// "Your data" ending: your pings, the real shark's pings, then reflection and score.
import { REAL_TRACK } from '../data/baked.js';
import { STATIONS, TOTAL_KM } from '../logic/geo.js';
import { REFLECTION, CREDITS } from '../logic/content.js';
import { drawMap } from './endmap.js';
import { loadBest, saveBest } from '../logic/score.js';

const $ = id => document.getElementById(id);
const idx = key => STATIONS.findIndex(s => s.key === key);
const fmt = (iso, opts) => new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', ...opts }).format(new Date(iso));
export const realVisits = REAL_TRACK.visits.map(v => ({ ...v, index: idx(v.station), name: STATIONS[idx(v.station)].name }));

export function monthYear() { const a = new Date(REAL_TRACK.visits[0].start), b = new Date(REAL_TRACK.visits.at(-1).start); const f = d => fmt(d, { month: 'long', year: 'numeric' }); return f(a) === f(b) ? f(a) : `${fmt(a, { month: 'long' })} to ${f(b)}`; }
export function realLabel() { return `Real white shark, NSW DPI tag, ${monthYear()}`; }

export class Ending {
  constructor(onPlayAgain, onCredits) {
    this.page = 0; this.onPlayAgain = onPlayAgain; this.onCredits = onCredits;
    $('end-next').onclick = () => this.go(1); $('end-back').onclick = () => this.go(-1);
  }
  open(sim) {
    this.sim = sim; this.sum = sim.summary(); this.page = 0;
    this.newBest = saveBest(this.sum.score); this.best = loadBest();
    $('ending').classList.remove('hidden'); $('ending').scrollTop = 0; this.render();
  }
  close() { $('ending').classList.add('hidden'); }
  go(d) {
    if (this.page === 2 && d > 0) { this.close(); this.onCredits(); return; }
    if (this.page === 0 && d < 0) return;
    this.page += d; this.render();
  }
  render() {
    const sim = this.sim, log = sim.log, p = this.page;
    $('end-steps').innerHTML = [0, 1, 2].map(i => `<i class="${i <= p ? 'on' : ''}"></i>`).join('');
    $('end-back').style.visibility = p === 0 ? 'hidden' : 'visible';
    $('end-next').textContent = p === 2 ? 'Credits' : 'Next';
    const side = $('end-side'), canvas = $('endmap');
    if (p === 0) {
      $('end-title').textContent = 'Your data';
      drawMap(canvas, { mode: 'player', rows: log.entries, missed: log.missed });
      $('end-legend').innerHTML = `<span style="--c:#ffc233">Your pings, joined in order</span><span style="--c:#ff6b5a">Missed station</span>`;
      const rows = log.entries.map(e => `<tr><td>${e.n}</td><td>${e.bonus ? 'Drumline check near ' + e.name : e.name}</td><td>Day ${e.day} &middot; ${e.time}</td><td>${e.value > 1 ? '+' + e.value : e.value}</td></tr>`).join('');
      const gaps = log.gaps();
      side.innerHTML = `<table><tr><th>Ping #</th><th>Station</th><th>Time</th><th>Data</th></tr>${rows || '<tr><td colspan="4">No pings recorded.</td></tr>'}</table>
        ${gaps.length ? gaps.map(g => `<div class="gap">${g.text}</div>`).join('') : '<div>Every station detected you. No gaps!</div>'}
        <div class="cap">This is ALL the scientists see. Between pings they have to work out where you went.</div>`;
    } else if (p === 1) {
      $('end-title').textContent = 'A real shark, same stations';
      drawMap(canvas, { mode: 'real', rows: [], realVisits, missed: [] });
      $('end-legend').innerHTML = `<span style="--c:#7ff0ff">${realLabel()}</span>`;
      const rows = realVisits.map((v, n) => `<tr><td>${n + 1}</td><td>${v.name}</td><td>${fmt(v.start, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}</td><td>${v.count}</td></tr>`).join('');
      const first = realVisits[0], second = realVisits[1];
      const days = ((Date.parse(second.start) - Date.parse(first.start)) / 864e5).toFixed(1);
      const you = log.pings.find(e => e.station === first.index), you2 = log.pings.find(e => e.station === second.index);
      const yourT = you && you2 ? `${Math.max(1, Math.round((you2.gameT - you.gameT)))} seconds` : `${Math.round(sim.time)} seconds for the whole trip`;
      const skipped = STATIONS.filter((_, i) => !realVisits.some(v => v.index === i)).map(s => s.name);
      side.innerHTML = `<table><tr><th>Visit</th><th>Station</th><th>Time (Sydney)</th><th>Detections</th></tr>${rows}</table>
        <div class="cap">The real shark took about <b>${days} days</b> to get from ${first.name} to ${second.name}. You took <b>${yourT}</b>.</div>
        <p>Which stations did it skip? <b>${skipped.join(', ')}.</b> Does that mean it was never near them? Scientists only know where a tagged shark was <i>detected</i>.</p>
        <div class="kv"><span>Species: <b>${REAL_TRACK.species}</b></span><span>Tag ID: <b>${REAL_TRACK.transmitterId}</b></span><span>Tag project: <b>${REAL_TRACK.tagProject}</b></span></div>
        <p style="font-size:14px;color:#a8d8e2">${REAL_TRACK.rawDetectionsInWindow} real detections in this ${Math.round(REAL_TRACK.windowDays)}-day window, grouped into ${realVisits.length} visits. It was not tracked heading south the whole way: after Stanwell Park it was next detected back at Bondi. Data from IMOS (accessed ${REAL_TRACK.accessed}).</p>`;
    } else {
      $('end-title').textContent = 'What does it mean?';
      drawMap(canvas, { mode: 'player', rows: log.entries, missed: log.missed });
      $('end-legend').innerHTML = `<span style="--c:#ffc233">Your run</span>`;
      const s = this.sum, stars = [1, 2, 3].map(i => `<span class="${i <= s.stars ? '' : 'off'}">&#9670;</span>`).join('');
      side.innerHTML = `<div class="big">${s.score.toLocaleString('en-AU')} <span class="stars" aria-label="${s.stars} of 3 tags">${stars}</span></div>
        <div class="kv"><span>Pings: <b>${s.pings}</b> (${s.dataPoints} data points)</span><span>Stations detected: <b>${s.stationsDetected}/6</b></span><span>Prey: <b>${s.preyTotal}</b></span><span>Energy left: <b>${s.energy}</b></span><span>Best on this device: <b>${this.best.toLocaleString('en-AU')}</b>${this.newBest ? ' (new!)' : ''}</span></div>
        ${REFLECTION.map(r => `<div class="q"><b>${r.key}.</b> ${r.q}</div>`).join('')}
        <button class="ghost" id="end-again" style="pointer-events:auto">Play again</button>`;
      $('end-again').onclick = () => { this.close(); this.onPlayAgain(); };
    }
  }
}

export function creditsHtml() {
  const cite = `IMOS ${new Date(REAL_TRACK.accessed).getFullYear()}. Animal Tracking Database. https://animaltracking.aodn.org.au. Accessed: ${fmt(REAL_TRACK.accessed, { day: 'numeric', month: 'long', year: 'numeric' })}.`;
  return `<h2>Credits</h2>
  <p>${CREDITS.imos}</p>
  <p><b>Citation:</b> ${cite}</p>
  <p><b>Receiver network:</b> ${CREDITS.receiver} (installation: ${REAL_TRACK.installation}).</p>
  <p><b>Real shark shown at the end:</b> ${REAL_TRACK.species}, tag ${REAL_TRACK.transmitterId}, tag project &ldquo;${REAL_TRACK.tagProject}&rdquo;. Detections are real and unedited; nearby detections at one station are grouped into visits. Data accessed ${REAL_TRACK.accessed}.</p>
  <p><b>Game simplification:</b> distances and swim speeds are scaled. Station positions and the route distances (about ${TOTAL_KM.toFixed(0)} km in a straight line) are real. The coastline map, landmarks and animals are simplified drawings made for this game.</p>
  <p><b>Built with:</b> three.js (MIT licence). All art is drawn in code; no AI-generated images are used.</p>
  <div class="row"><button class="primary" id="cr-back">Back</button></div>`;
}

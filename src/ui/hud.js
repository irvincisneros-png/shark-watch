// DOM HUD: meters, progress strip with real km, notifications, fact cards, banners.
import { stationList, REAL_KM, REAL_LEG_KM, routeProgress, stationX } from '../logic/route.js';
import { FACTS } from '../logic/content.js';
import { icon } from './icons.js';

const $ = id => document.getElementById(id);

export class Hud {
  constructor() {
    this.el = { hud: $('hud'), energy: $('m-energy'), oxy: $('m-oxy'), pings: $('c-pings'), sense: $('c-sense'), frenzy: $('c-frenzy'), battery: $('c-battery'), scent: $('c-scent'), score: $('score'), strip: $('strip'), notif: $('notif'), tangle: $('tangle'), banner: $('legbanner'), whisper: $('whisper'), fact: $('factcard') };
    this.buildStrip();
    this.factQueue = []; this.factTimer = 0; this.factOpen = null; this.lastFactEnd = -9;
  }
  show(v) { this.el.hud.classList.toggle('hidden', !v); }

  buildStrip() {
    const W = 520, pad = 26, y = 20;
    const total = REAL_KM.at(-1);
    let s = `<svg viewBox="0 0 ${W} 46" role="img" aria-label="Progress along the route with real distances">`;
    s += `<line x1="${pad}" y1="${y}" x2="${W - pad}" y2="${y}" stroke="rgba(255,255,255,.28)" stroke-width="4" stroke-linecap="round"/><line id="prog" x1="${pad}" y1="${y}" x2="${pad}" y2="${y}" stroke="#ffc233" stroke-width="4" stroke-linecap="round"/>`;
    stationList.forEach((st, i) => {
      const x = pad + (REAL_KM[i] / total) * (W - 2 * pad);
      s += `<g id="st${i}"><circle cx="${x}" cy="${y}" r="7" fill="#06222f" stroke="#eafcff" stroke-width="2.5"/><text x="${x}" y="${y - 12}" text-anchor="middle" font-size="12" font-weight="700" fill="#eafcff">${st.name.replace(' Park', '')}</text></g>`;
      if (i > 0) { const xm = pad + ((REAL_KM[i] + REAL_KM[i - 1]) / 2 / total) * (W - 2 * pad); s += `<text x="${xm}" y="${y + 20}" text-anchor="middle" font-size="11" fill="#a8d8e2">${REAL_LEG_KM[i - 1].toFixed(0)} km</text>`; }
    });
    s += `<path id="fin" d="M-8 0 0 -9 8 0 0 9z" fill="#ffc233" stroke="#06222f" stroke-width="2" transform="translate(${pad},${y})"/></svg>`;
    this.el.strip.innerHTML = s;
    this.W = W; this.pad = pad; this.y = y; this.total = total;
  }

  update(sim) {
    const e = this.el;
    const set = (m, v) => { m.querySelector('i').style.width = `${v}%`; m.querySelector('b').textContent = Math.round(v); m.classList.toggle('low', v < 22); };
    set(e.energy, sim.energy); set(e.oxy, sim.oxygen);
    e.pings.querySelector('b').textContent = sim.log.pingCount;
    e.score.textContent = Math.round(sim.score).toLocaleString('en-AU');
    const tog = (el, on, txt) => { el.classList.toggle('hidden', !on); if (txt != null && on) el.innerHTML = txt; };
    tog(e.sense, sim.charges > 0 || sim.senseActive, sim.senseActive ? `Sensing <b>${Math.ceil(sim.sense)}s</b>` : `Sense (E) <b>${sim.charges}</b>`);
    tog(e.frenzy, sim.frenzyActive); tog(e.battery, sim.battery); tog(e.scent, sim.scent > 0);
    // progress strip
    const p = routeProgress(sim.x), x = this.pad + p * (this.W - 2 * this.pad);
    this.el.strip.querySelector('#prog').setAttribute('x2', x);
    this.el.strip.querySelector('#fin').setAttribute('transform', `translate(${x},${this.y})`);
    stationList.forEach((st, i) => {
      const g = this.el.strip.querySelector('#st' + i), c = g.querySelector('circle');
      const hit = sim.log.detected.has(i), missed = sim.domes.missedFlag[i] && !hit;
      c.setAttribute('fill', hit ? '#ffc233' : missed ? '#ff6b5a' : '#06222f');
    });
    // tangle bar
    const t = sim.tangle;
    e.tangle.classList.toggle('hidden', !t);
    if (t) e.tangle.querySelector('i').style.width = `${Math.min(100, (t.wiggles / 9) * 100)}%`;
  }

  banner(title, sub) {
    const b = this.el.banner; b.innerHTML = `${title}<small>${sub}</small>`; b.classList.add('on');
    clearTimeout(this._bt); this._bt = setTimeout(() => b.classList.remove('on'), 3200);
  }
  whisper(text, ms = 3200) {
    const w = this.el.whisper; w.textContent = text; w.classList.add('on');
    clearTimeout(this._wt); this._wt = setTimeout(() => w.classList.remove('on'), ms);
  }
  notify(station, time, bonus) {
    const d = document.createElement('div'); d.className = 'nt';
    d.innerHTML = `<div class="badge"><svg viewBox="0 0 24 24"><path d="M3 18c3-1 5-4 6-9l3 4c1-3 3-5 6-6-1 4-1 7-3 10z" fill="#fff"/></svg></div><div><div class="app">SharkSmart &middot; now</div>Tagged White Shark detected at <b>${station}</b> &middot; ${time}${bonus ? '<small>Data bonus x2 (tag battery)</small>' : ''}</div>`;
    this.el.notif.prepend(d);
    requestAnimationFrame(() => requestAnimationFrame(() => d.classList.add('in')));
    setTimeout(() => { d.classList.remove('in'); setTimeout(() => d.remove(), 600); }, 5200);
    while (this.el.notif.children.length > 3) this.el.notif.lastChild.remove();
  }

  /** Queue a fact card. Returns when it should be shown (handled by tick). */
  queueFact(id) { if (FACTS[id]) this.factQueue.push(id); }
  get factShowing() { return !!this.factOpen; }
  tick(realDt, now, canShow, dismissRequested, onShow, onHide) {
    const c = this.el.fact;
    if (this.factOpen) {
      this.factTimer -= realDt;
      c.querySelector('.timer i').style.width = `${Math.max(0, this.factTimer / this.factDur) * 100}%`;
      if (this.factTimer <= 0 || (dismissRequested && this.factDur - this.factTimer > 0.9)) {
        this.factOpen = null; c.classList.remove('in'); setTimeout(() => c.classList.add('hidden'), 360); this.lastFactEnd = now; onHide();
      }
    } else if (this.factQueue.length && canShow && now - this.lastFactEnd > 1.6) {
      const id = this.factQueue.shift(), f = FACTS[id];
      this.factOpen = id; this.factDur = this.factTimer = 6.5 + (f.text.split(' ').length > 20 ? 1 : 0);
      c.innerHTML = `<div class="fi">${icon(f.icon)}</div><div><h3>${f.title}</h3><p>${f.text}</p><span class="go">Tap or press Space to continue</span></div><div class="timer"><i></i></div>`;
      c.classList.remove('hidden'); requestAnimationFrame(() => requestAnimationFrame(() => c.classList.add('in')));
      onShow(id);
    }
  }
  clearFacts() { this.factQueue.length = 0; if (this.factOpen) { this.factOpen = null; this.el.fact.classList.add('hidden'); this.el.fact.classList.remove('in'); } }
}

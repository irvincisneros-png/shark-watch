// Shark Watch sound recipes (procedural WebAudio, no files): sonar ping, bite crunch, pick-ups, hurts, notification.
const r = (a, b) => a + Math.random() * (b - a);
const T = (E, o) => E.t + (o.delay ?? 0);
const def = (bus, fn) => { fn.bus = bus; return fn; };

export const SOUNDS = {
  ping: def('ui', (E, out, g, o) => {
    const t = T(E, o);
    const osc = E.osc('sine', 1180, t, 1.6, E.env(out, t, 0.32 * g, 0.004, 1.3));
    osc.frequency.exponentialRampToValueAtTime(1160, t + 1.2);
    const o2 = E.osc('sine', 2360, t, 0.9, E.env(out, t, 0.08 * g, 0.004, 0.7));
    E.osc('sine', 590, t + 0.35, 1.0, E.env(out, t + 0.35, 0.1 * g, 0.01, 0.8));
    E.reverbSend && 0;
  }),
  notify: def('ui', (E, out, g, o) => {
    const t = T(E, o);
    E.osc('triangle', 880, t, 0.2, E.env(out, t, 0.12 * g, 0.005, 0.15));
    E.osc('triangle', 1320, t + 0.11, 0.3, E.env(out, t + 0.11, 0.12 * g, 0.005, 0.22));
  }),
  bite: def('life', (E, out, g, o) => {
    const t = T(E, o);
    const f = E.filter('bandpass', r(900, 1400), 1.1); f.connect(E.env(out, t, 0.28 * g, 0.002, 0.09));
    E.noise('white', t, 0.15, f);
    const lo = E.osc('sine', 150, t, 0.2, E.env(out, t, 0.3 * g, 0.004, 0.14)); lo.frequency.exponentialRampToValueAtTime(60, t + 0.14);
  }),
  pickup: def('ui', (E, out, g, o) => {
    const t = T(E, o);
    [0, 4, 7, 12].forEach((s, i) => E.osc('sine', 523 * Math.pow(2, s / 12), t + i * 0.06, 0.3, E.env(out, t + i * 0.06, 0.1 * g, 0.004, 0.22)));
  }),
  hurt: def('life', (E, out, g, o) => {
    const t = T(E, o);
    const f = E.filter('lowpass', 420, 1); f.connect(E.env(out, t, 0.3 * g, 0.01, 0.35));
    E.noise('brown', t, 0.5, f);
    const l = E.osc('sawtooth', 110, t, 0.3, E.env(out, t, 0.1 * g, 0.01, 0.25)); l.frequency.exponentialRampToValueAtTime(55, t + 0.25);
  }),
  boost: def('body', (E, out, g, o) => {
    const t = T(E, o);
    const f = E.filter('lowpass', 300, 1); f.frequency.linearRampToValueAtTime(900, t + 0.2); f.connect(E.env(out, t, 0.22 * g, 0.05, 0.4));
    E.noise('pink', t, 0.6, f);
  }),
  sense: def('ui', (E, out, g, o) => {
    const t = T(E, o);
    const l = E.osc('sawtooth', 120, t, 0.9, E.env(out, t, 0.08 * g, 0.2, 0.6)); l.frequency.exponentialRampToValueAtTime(900, t + 0.7);
  }),
  fact: def('ui', (E, out, g, o) => { const t = T(E, o); E.osc('sine', 660, t, 0.25, E.env(out, t, 0.08 * g, 0.01, 0.2)); E.osc('sine', 990, t + 0.08, 0.3, E.env(out, t + 0.08, 0.06 * g, 0.01, 0.22)); }),
  thunk: def('world', (E, out, g, o) => { const t = T(E, o); const l = E.osc('sine', 200, t, 0.3, E.env(out, t, 0.4 * g, 0.003, 0.2)); l.frequency.exponentialRampToValueAtTime(60, t + 0.2); }),
  bubbles: def('body', (E, out, g, o) => {
    const t = T(E, o), n = o.n ?? 5;
    for (let i = 0; i < n; i++) { const w = t + i * r(0.03, 0.07), f = 500 * r(1, 2); const osc = E.osc('sine', f, w, 0.1, E.env(out, w, r(0.03, 0.06) * g, 0.008, 0.07)); osc.frequency.exponentialRampToValueAtTime(f * 2, w + 0.07); }
  }),
};

/** Muffled underwater ambience: low rumble + slow shimmer. Returns an update fn. */
export function makeAmbience(E) {
  const hum = E.loopLayer('brown', 'lowpass', 260, E.buses.amb, 0.8); hum.gain.gain.value = 0.22;
  const hiss = E.loopLayer('pink', 'bandpass', 900, E.buses.amb, 0.6); hiss.gain.gain.value = 0.025;
  return (t, speedK, depthK) => {
    hum.filter.frequency.setTargetAtTime(220 + speedK * 160, E.t, 0.4);
    hiss.gain.gain.setTargetAtTime(0.02 + speedK * 0.025, E.t, 0.4);
  };
}

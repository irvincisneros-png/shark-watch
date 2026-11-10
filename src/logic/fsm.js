// Game state machine: which screen/mode we're in and which events move us between them.
export const STATES = ['title', 'intro', 'playing', 'fact', 'paused', 'resting', 'caught', 'ending', 'credits'];

const T = {
  title: { start: 'intro' },
  intro: { done: 'playing', skip: 'playing' },
  playing: { pause: 'paused', fact: 'fact', collapse: 'resting', caught: 'caught', finish: 'ending' },
  fact: { dismiss: 'playing', pause: 'paused', collapse: 'resting', caught: 'caught', finish: 'ending' },
  paused: { resume: '@back', quit: 'title' },
  resting: { retry: 'playing' },
  caught: { released: 'playing' },
  ending: { next: 'credits', replay: 'intro', title: 'title' },
  credits: { back: 'ending', title: 'title' },
};

export class GameFSM {
  constructor(initial = 'title') {
    this.state = initial;
    this.back = null;
    this.listeners = [];
  }
  can(event) { return event in (T[this.state] ?? {}); }
  /** Applies an event; returns the new state, or null if the event is not valid right now. */
  send(event) {
    const to = (T[this.state] ?? {})[event];
    if (!to) return null;
    const from = this.state;
    if (event === 'pause') this.back = from;
    this.state = to === '@back' ? (this.back ?? 'playing') : to;
    for (const l of this.listeners) l(this.state, from, event);
    return this.state;
  }
  on(fn) { this.listeners.push(fn); return () => { this.listeners = this.listeners.filter(l => l !== fn); }; }
  /** The simulation advances (at normal or slowed speed) in these states. */
  get simRunning() { return this.state === 'playing' || this.state === 'fact'; }
  get timeScale() { return this.state === 'fact' ? 0.14 : 1; }
}

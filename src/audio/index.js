import { SoundEngine } from './engine.js';
import { makeAmbience } from './sounds.js';

export class GameAudio {
  constructor() { this.engine = new SoundEngine(); this.muted = false; this.amb = null; this.engine.volume = 0.7; }
  start() {
    const fresh = !this.engine.started;
    if (!this.engine.start()) return;
    if (fresh) this.amb = makeAmbience(this.engine);
  }
  setMuted(m) { this.muted = m; this.engine.setVolume(m ? 0 : 0.7); }
  play(name, opts) { if (!this.muted) this.engine.play(name, opts); }
  update(speedK) { if (this.amb) this.amb(0, speedK, 0); }
}

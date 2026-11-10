// Keyboard + touch + gamepad input, reduced to { steer, boost, sense (edge), taps, pause (edge) }.
export function detectTouch() {
  const q = new URLSearchParams(location.search).get('touch');
  if (q === '1') return true; if (q === '0') return false;
  return matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints > 0 && !matchMedia('(hover: hover)').matches);
}

export class Input {
  constructor(game) {
    this.game = game; this.keys = new Set(); this.senseEdge = false; this.taps = 0; this.pauseEdge = false; this.enterEdge = false;
    this.touchBoost = false; this.targetY = null; this.touch = detectTouch();
    addEventListener('keydown', e => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'KeyE') this.senseEdge = true;
      if (e.code === 'KeyP' || e.code === 'Escape') this.pauseEdge = true;
      if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyF') this.enterEdge = true;
      if (['ArrowUp', 'ArrowDown', 'Space'].includes(e.code) && game.fsm.simRunning) e.preventDefault();
      if (game.fsm.simRunning && ['ArrowUp', 'ArrowDown', 'KeyW', 'KeyS'].includes(e.code)) this.taps++;
      game.audio.start();
    });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    if (this.touch) this.bindTouch();
  }
  bindTouch() {
    document.body.classList.add('touch');
    const zone = document.getElementById('touch-zone');
    const steerTo = e => { this.targetY = e.clientY; };
    zone.addEventListener('pointerdown', e => { e.preventDefault(); this.game.audio.start(); zone.setPointerCapture(e.pointerId); steerTo(e); this.taps++; });
    zone.addEventListener('pointermove', e => { if (this.targetY != null) { if (Math.abs(e.clientY - this.targetY) > 14) this.taps++; steerTo(e); } });
    const end = () => { this.targetY = null; };
    zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end);
    const hold = (id, on, off) => { const b = document.getElementById(id); b.addEventListener('pointerdown', e => { e.preventDefault(); this.game.audio.start(); b.setPointerCapture(e.pointerId); b.classList.add('on'); on(); }); const up = () => { b.classList.remove('on'); off?.(); }; b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); };
    hold('btn-boost', () => { this.touchBoost = true; }, () => { this.touchBoost = false; });
    hold('btn-sense', () => { this.senseEdge = true; });
    addEventListener('gesturestart', e => e.preventDefault());
  }
  read(sim, worldYFromScreen) {
    const k = this.keys;
    let steer = (k.has('ArrowUp') || k.has('KeyW') ? 1 : 0) - (k.has('ArrowDown') || k.has('KeyS') ? 1 : 0);
    if (this.targetY != null) steer = Math.max(-1, Math.min(1, (worldYFromScreen(this.targetY) - sim.y) * 1.3));
    let boost = k.has('Space') || k.has('ShiftLeft') || k.has('ShiftRight') || this.touchBoost;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = pads && [...pads].find(p => p);
    let padSense = false;
    if (gp) { const ay = -gp.axes[1]; if (Math.abs(ay) > 0.2) steer = ay; if (gp.buttons[0]?.pressed) boost = true; padSense = !!gp.buttons[2]?.pressed && !this._padX; this._padX = !!gp.buttons[2]?.pressed; }
    const out = { steer, boost, sense: this.senseEdge || padSense, taps: this.taps };
    this.senseEdge = false; this.taps = 0;
    return out;
  }
  popPause() { const p = this.pauseEdge; this.pauseEdge = false; return p; }
  popEnter() { const p = this.enterEdge; this.enterEdge = false; return p; }
}

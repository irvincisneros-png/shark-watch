// Energy and oxygen. White sharks are ram ventilators: slow down or get tangled and the oxygen meter falls.
export const ENERGY_DRAIN = 1.15;     // per second at cruise
export const BOOST_DRAIN = 9.5;       // extra per second while boosting
export const BOOST_MIN_ENERGY = 6;    // can't start a boost below this
export const OXY_DROP = 14;           // per second when too slow
export const OXY_RECOVER = 24;        // per second when swimming
export const SLOW_RATIO = 0.45;       // below this fraction of cruise speed = "not ventilating"

export class Vitals {
  constructor() { this.reset(); }
  reset(energy = 100) { this.energy = energy; this.oxygen = 100; this.lowOxygenWarned = false; this.collapsed = null; }
  get canBoost() { return this.energy > BOOST_MIN_ENERGY; }
  /** @returns {'energy'|'oxygen'|null} collapse reason this frame, once. */
  update(dt, { speedRatio = 1, boosting = false, tangled = false, drainMult = 1 } = {}) {
    this.energy -= (ENERGY_DRAIN * drainMult + (boosting ? BOOST_DRAIN : 0)) * dt;
    const slow = speedRatio < SLOW_RATIO || tangled;
    this.oxygen += (slow ? -OXY_DROP : OXY_RECOVER) * dt;
    this.energy = Math.max(0, Math.min(100, this.energy));
    this.oxygen = Math.max(0, Math.min(100, this.oxygen));
    if (!this.collapsed) {
      if (this.energy <= 0) this.collapsed = 'energy';
      else if (this.oxygen <= 0) this.collapsed = 'oxygen';
      return this.collapsed;
    }
    return null;
  }
  eat(n) { this.energy = Math.min(100, this.energy + n); }
  hurt(n) { this.energy = Math.max(0, this.energy - n); }
}

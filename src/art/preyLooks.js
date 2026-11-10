// Prey species painted with DeepSwell's fish builder: Australian salmon (Arripis trutta) and tailor (Pomatomus saltatrix).
import { paint } from './looks.js';
const { C, mix, sm, withEye, spots, finSolid, grain } = paint;

export const PREY_LOOKS = {
  salmon: {
    length: 1.3, depth: 0.27, width: 0.16, peak: 0.52, snout: 0.9, tailFrac: 0.2, tail: 'forked', pectoral: 0.13, pecAt: 0.74,
    dorsal: { from: 0.28, to: 0.62, height: 0.1, shape: 'round' }, anal: { from: 0.18, to: 0.3, height: 0.06 },
    paint: {
      body: withEye(spots((u, s) => {
        // olive-green back, silver flank, white belly
        const back = mix(C(0x3d5a3e), C(0x6c8a68), sm(0.15, 0.65, s));
        const flank = mix(C(0xc9d2cc), C(0x9fb0a8), sm(-0.2, 0.3, s));
        const belly = C(0xf2f3ee);
        let c = s > 0.28 ? mix(flank, back, sm(0.28, 0.7, s)) : mix(belly, flank, sm(-0.55, -0.05, s));
        const g = grain(u, s); return [c[0] * g, c[1] * g, c[2] * g];
      }, 0x2b3a2c, 22, 0.1, (u, s) => s > 0.38 && u > 0.2 && u < 0.85), 0.87, 0.18, 0.04, 0x0b0b0b, 0xd8d8c8),
      fin: (u, part, f) => part === 'tail' ? C(0x6b7c68) : part === 'dorsal' ? C(0x55715a) : C(0xb8c4b8),
    },
    swim: { freq: 6, amp: 0.8 },
  },
  tailor: {
    length: 1.45, depth: 0.2, width: 0.12, peak: 0.55, snout: 1.15, tailFrac: 0.2, tail: 'forked', pectoral: 0.1, pecAt: 0.75,
    dorsal: { from: 0.3, to: 0.58, height: 0.07, shape: 'round' }, anal: { from: 0.28, to: 0.48, height: 0.06 },
    paint: {
      body: withEye((u, s) => {
        const back = mix(C(0x2f5a62), C(0x4d8a90), sm(0.2, 0.7, s));
        const flank = mix(C(0xdbe4e4), C(0xa8c2c4), sm(-0.2, 0.4, s));
        const belly = C(0xf5f6f2);
        const c = s > 0.34 ? mix(flank, back, sm(0.34, 0.75, s)) : mix(belly, flank, sm(-0.6, 0, s));
        const g = grain(u, s); return [c[0] * g, c[1] * g, c[2] * g];
      }, 0.89, 0.2, 0.05, 0x080808, 0xcfd2c0),
      fin: (u, part) => part === 'tail' ? C(0x55747a) : part === 'dorsal' ? C(0x47777f) : C(0xa7bcbc),
    },
    swim: { freq: 9, amp: 1.0 },
  },
  ray: {
    kind: 'stingray', length: 2.4, span: 2.8, thick: 0.18, tail: 1.1,
    paint: (u, v, top) => {
      if (!top) return C(0xeee9dc);
      const n = paint.hash(Math.floor(u * 26), Math.floor(v * 26));
      return mix(mix(C(0x9a7e55), C(0x7a6240), v), C(0xb59a6f), n * 0.35);
    },
    swim: { freq: 3, amp: 0.4 },
  },
};

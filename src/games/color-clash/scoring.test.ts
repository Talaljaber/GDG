import { describe, expect, it } from 'vitest';
import { buildRaw, scoreColorClash, speedBonus, validateColorClashRaw, type ColorClashRaw } from './scoring';

function raw(correct: number, wrong: number, timeouts: number, meanRt: number | null): ColorClashRaw {
  return { correct, wrong, timeouts, mean_rt_ms: meanRt };
}

describe('scoreColorClash: worked examples (docs/games/color-clash.md §4)', () => {
  it('A (strong): 32 / 1 / 0 at 630 ms -> net 31, B 46.25 -> 821', () => {
    expect(speedBonus(raw(32, 1, 0, 630))).toBeCloseTo(46.25, 6);
    expect(scoreColorClash(raw(32, 1, 0, 630))).toBe(821);
  });

  it('B (typical): 25 / 2 / 0 at 850 ms -> 594', () => {
    expect(speedBonus(raw(25, 2, 0, 850))).toBeCloseTo(18.75, 6);
    expect(scoreColorClash(raw(25, 2, 0, 850))).toBe(594);
  });

  it('C (weak): 17 / 3 / 1 at 1140 ms -> no bonus -> 325', () => {
    expect(scoreColorClash(raw(17, 3, 1, 1140))).toBe(325);
  });

  it('D (spammer): 12 / 24 / 0 at 300 ms -> negative -> 0', () => {
    expect(scoreColorClash(raw(12, 24, 0, 300))).toBe(0);
  });

  it('E (idle): 9 timeouts -> 0', () => {
    expect(scoreColorClash(raw(0, 0, 9, null))).toBe(0);
  });

  it('F (near-perfect): 40 / 0 / 0 at 450 ms -> capped at 1000', () => {
    expect(scoreColorClash(raw(40, 0, 0, 450))).toBe(1000);
  });
});

describe('scoring contract', () => {
  it('always an integer in 0..1000', () => {
    for (let c = 0; c <= 60; c += 3) {
      for (let w = 0; w <= 30; w += 5) {
        for (const rt of [250, 480, 700, 1200]) {
          const s = scoreColorClash(raw(c, w, 0, c ? rt : null));
          expect(Number.isInteger(s)).toBe(true);
          expect(s).toBeGreaterThanOrEqual(0);
          expect(s).toBeLessThanOrEqual(1000);
        }
      }
    }
  });

  it('buildRaw: mean over correct trials, rounded; null without a correct tap', () => {
    expect(buildRaw(3, 1, 0, 2000)).toEqual({ correct: 3, wrong: 1, timeouts: 0, mean_rt_ms: 667 });
    expect(buildRaw(0, 2, 5, 0)).toEqual({ correct: 0, wrong: 2, timeouts: 5, mean_rt_ms: null });
  });

  it('a wrong tap costs one net point; the bonus is worth less than three correct taps', () => {
    expect(scoreColorClash(raw(30, 0, 0, 1000)) - scoreColorClash(raw(30, 1, 0, 1000))).toBe(25);
    expect(scoreColorClash(raw(30, 0, 0, 400)) - scoreColorClash(raw(30, 0, 0, 1000))).toBe(75);
  });
});

describe('validateColorClashRaw mirrors the server bounds (SCORING.md §4)', () => {
  it('accepts every worked example with its own score', () => {
    for (const r of [raw(32, 1, 0, 630), raw(25, 2, 0, 850), raw(17, 3, 1, 1140), raw(12, 24, 0, 300), raw(0, 0, 9, null), raw(40, 0, 0, 450)]) {
      expect(validateColorClashRaw(r, scoreColorClash(r))).toBeNull();
    }
  });

  it('CC-T4: a mean under 250 ms is too fast', () => {
    expect(validateColorClashRaw(raw(32, 1, 0, 249), 821)).toBe('cc.too_fast');
    expect(validateColorClashRaw(raw(32, 1, 0, 250), 821)).toBeNull();
  });

  it('CC-T5: 50 correct at 307 ms do not fit in 30 s; 306 ms do', () => {
    expect(validateColorClashRaw(raw(50, 0, 0, 307), 1000)).toBe('cc.too_many');
    expect(validateColorClashRaw(raw(50, 0, 0, 306), 1000)).toBeNull();
  });

  it('CC-T6: the band at net 31 is 775..850', () => {
    expect(validateColorClashRaw(raw(32, 1, 0, 630), 851)).toBe('cc.formula_band');
    expect(validateColorClashRaw(raw(32, 1, 0, 630), 850)).toBeNull();
    expect(validateColorClashRaw(raw(32, 1, 0, 630), 775)).toBeNull();
    expect(validateColorClashRaw(raw(32, 1, 0, 630), 774)).toBe('cc.formula_band');
  });

  it('shape, range, rt and zero', () => {
    expect(validateColorClashRaw('x', 0)).toBe('cc.shape');
    expect(validateColorClashRaw({ correct: 1, wrong: 0, timeouts: 0 }, 0)).toBe('cc.shape');
    expect(validateColorClashRaw(raw(101, 0, 0, 500), 1000)).toBe('cc.range');
    expect(validateColorClashRaw(raw(10, 0, 11, 500), 0)).toBe('cc.range');
    expect(validateColorClashRaw(raw(0, 0, 0, 500), 0)).toBe('cc.rt');
    expect(validateColorClashRaw(raw(3, 0, 0, null), 75)).toBe('cc.rt');
    expect(validateColorClashRaw(raw(0, 0, 9, null), 25)).toBe('cc.zero');
  });
});

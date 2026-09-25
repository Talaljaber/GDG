import { describe, expect, it } from 'vitest';
import { buildRaw, flashScore, scoreHowMany, validateHowManyRaw, type HowManyRaw, type HowManyRound } from './scoring';

const N = [12, 27, 55];

function r(trueCount: number, guess: number | null, answerMs: number | null = guess === null ? null : 2500): HowManyRound {
  return { true_count: trueCount, guess, answer_ms: answerMs, timed_out: answerMs === null };
}

function raw(guesses: Array<number | null>): HowManyRaw {
  return buildRaw(guesses.map((g, i) => r(N[i], g)));
}

describe('scoreHowMany: worked examples (docs/games/how-many.md §4, N = 12, 27, 55)', () => {
  it('HM-T1 A (strong): 11, 24, 46 -> 0.8667, 0.8254, 0.7475 -> 813', () => {
    const a = raw([11, 24, 46]);
    expect(flashScore(a.rounds[0], 0)).toBeCloseTo(0.8667, 4);
    expect(flashScore(a.rounds[1], 1)).toBeCloseTo(0.8254, 4);
    expect(flashScore(a.rounds[2], 2)).toBeCloseTo(0.7475, 4);
    expect(scoreHowMany(a)).toBe(813);
  });

  it('HM-T2 B (typical): 10, 22, 42 -> 578', () => {
    const b = raw([10, 22, 42]);
    expect(flashScore(b.rounds[0], 0)).toBeCloseTo(0.5333, 4);
    expect(flashScore(b.rounds[1], 1)).toBeCloseTo(0.6138, 4);
    expect(flashScore(b.rounds[2], 2)).toBeCloseTo(0.5859, 4);
    expect(scoreHowMany(b)).toBe(578);
  });

  it('C (weak): 9, 18, 30 -> 164', () => {
    const c = raw([9, 18, 30]);
    expect(flashScore(c.rounds[0], 0)).toBeCloseTo(0.2, 4);
    expect(flashScore(c.rounds[1], 1)).toBeCloseTo(0.1905, 4);
    expect(flashScore(c.rounds[2], 2)).toBeCloseTo(0.101, 4);
    expect(scoreHowMany(c)).toBe(164);
  });

  it('HM-T3 E (one timeout): 12, null, 50 -> 1, 0, 0.9091 -> 636', () => {
    const e = raw([12, null, 50]);
    expect(flashScore(e.rounds[2], 2)).toBeCloseTo(0.9091, 4);
    expect(scoreHowMany(e)).toBe(636);
  });

  it('HM-T4 F (near-perfect): 12, 27, 53 -> 1000; D (idle) -> 0', () => {
    expect(scoreHowMany(raw([12, 27, 53]))).toBe(1000);
    expect(scoreHowMany(raw([null, null, null]))).toBe(0);
  });
});

describe('scoring contract', () => {
  it('the dead zone: within 5 % is full marks; W_i off is 0; beyond W_i stays 0', () => {
    expect(flashScore(r(40, 42), 2)).toBe(1); // 5 %
    expect(flashScore(r(20, 12), 1)).toBe(0); // 40 %
    expect(flashScore(r(10, 13), 0)).toBeCloseTo(0, 10); // 30 %
    expect(flashScore(r(12, 999), 0)).toBe(0);
    expect(flashScore(r(12, 0), 0)).toBe(0);
  });

  it('always an integer in 0..1000', () => {
    for (let g1 = 0; g1 <= 30; g1 += 3) {
      for (let g2 = 0; g2 <= 60; g2 += 7) {
        for (const g3 of [null, 0, 30, 55, 80, 999]) {
          const s = scoreHowMany(raw([g1, g2, g3]));
          expect(Number.isInteger(s)).toBe(true);
          expect(s).toBeGreaterThanOrEqual(0);
          expect(s).toBeLessThanOrEqual(1000);
        }
      }
    }
  });

  it('buildRaw copies exactly the four schema fields, in order', () => {
    const extra = { ...r(12, 11), extra: 1 } as HowManyRound;
    expect(buildRaw([extra, r(27, null), r(55, 50, null)])).toEqual({
      rounds: [
        { true_count: 12, guess: 11, answer_ms: 2500, timed_out: false },
        { true_count: 27, guess: null, answer_ms: null, timed_out: true },
        { true_count: 55, guess: 50, answer_ms: null, timed_out: true },
      ],
    });
  });
});

describe('validateHowManyRaw mirrors the server bounds (SCORING.md §4)', () => {
  it('accepts every worked example with its own score', () => {
    for (const g of [[11, 24, 46], [10, 22, 42], [9, 18, 30], [null, null, null], [12, null, 50], [12, 27, 53]]) {
      const x = raw(g);
      expect(validateHowManyRaw(x, scoreHowMany(x))).toBeNull();
    }
  });

  it('HM-T7: 299 ms on a non-timed-out flash is too fast; 300 accepted', () => {
    const x = raw([11, 24, 46]);
    x.rounds[1].answer_ms = 299;
    expect(validateHowManyRaw(x, 813)).toBe('hm.too_fast');
    x.rounds[1].answer_ms = 300;
    expect(validateHowManyRaw(x, 813)).toBeNull();
  });

  it('HM-T8: three exact guesses are too perfect; two exact + one off accepted', () => {
    expect(validateHowManyRaw(raw([12, 27, 55]), 1000)).toBe('hm.too_perfect');
    expect(validateHowManyRaw(raw([12, 27, 54]), 1000)).toBeNull();
  });

  it('HM-T9: example A with 815 is outside the band; 814 and 700 accepted', () => {
    expect(validateHowManyRaw(raw([11, 24, 46]), 815)).toBe('hm.formula_band');
    expect(validateHowManyRaw(raw([11, 24, 46]), 814)).toBeNull();
    expect(validateHowManyRaw(raw([11, 24, 46]), 700)).toBeNull();
  });

  it('HM-T10: true_count 16 on flash 1 is out of range; a null guess not timed out is hm.timeout', () => {
    const x = raw([11, 24, 46]);
    x.rounds[0].true_count = 16;
    expect(validateHowManyRaw(x, 0)).toBe('hm.range');
    const y = raw([11, 24, 46]);
    y.rounds[0] = { true_count: 12, guess: null, answer_ms: 2000, timed_out: false };
    expect(validateHowManyRaw(y, 0)).toBe('hm.timeout');
  });

  it('shape, range and the timeout pairing', () => {
    expect(validateHowManyRaw('x', 0)).toBe('hm.shape');
    expect(validateHowManyRaw({ rounds: [r(12, 11), r(27, 24)] }, 0)).toBe('hm.shape');
    const missing = raw([11, 24, 46]) as unknown as { rounds: Array<Record<string, unknown>> };
    delete missing.rounds[2].answer_ms;
    expect(validateHowManyRaw(missing, 0)).toBe('hm.shape');
    const frac = raw([11, 24, 46]);
    frac.rounds[0].guess = 11.5;
    expect(validateHowManyRaw(frac, 0)).toBe('hm.shape');
    const big = raw([11, 24, 1000]);
    expect(validateHowManyRaw(big, 0)).toBe('hm.range');
    const slow = raw([11, 24, 46]);
    slow.rounds[0].answer_ms = 10_001;
    expect(validateHowManyRaw(slow, 0)).toBe('hm.range');
    const tout = raw([11, 24, 46]);
    tout.rounds[0].timed_out = true;
    expect(validateHowManyRaw(tout, 0)).toBe('hm.timeout');
  });
});

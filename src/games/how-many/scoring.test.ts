import { describe, expect, it } from 'vitest';
import { buildRaw, flashScore, scoreHowMany, validateHowManyRaw, type HowManyRaw, type HowManyRound } from './scoring';

const N = [6, 11, 16];

function r(trueCount: number, guess: number | null, answerMs: number | null = guess === null ? null : 2500): HowManyRound {
  return { true_count: trueCount, guess, answer_ms: answerMs, timed_out: answerMs === null };
}

function raw(guesses: Array<number | null>): HowManyRaw {
  return buildRaw(guesses.map((g, i) => r(N[i], g)));
}

describe('scoreHowMany: worked examples (docs/games/how-many.md §4, N = 6, 11, 16)', () => {
  it('HM-T1 A (strong): 6, 10, 14 -> 1, 0.8831, 0.8333 -> 905', () => {
    const a = raw([6, 10, 14]);
    expect(flashScore(a.rounds[0], 0)).toBe(1);
    expect(flashScore(a.rounds[1], 1)).toBeCloseTo(0.8831, 4);
    expect(flashScore(a.rounds[2], 2)).toBeCloseTo(0.8333, 4);
    expect(scoreHowMany(a)).toBe(905);
  });

  it('HM-T2 B (typical): 5, 9, 13 -> 617', () => {
    const b = raw([5, 9, 13]);
    expect(flashScore(b.rounds[0], 0)).toBeCloseTo(0.5333, 4);
    expect(flashScore(b.rounds[1], 1)).toBeCloseTo(0.6234, 4);
    expect(flashScore(b.rounds[2], 2)).toBeCloseTo(0.6944, 4);
    expect(scoreHowMany(b)).toBe(617);
  });

  it('C (weak): 4, 8, 11 -> 260', () => {
    const c = raw([4, 8, 11]);
    expect(flashScore(c.rounds[0], 0)).toBe(0);
    expect(flashScore(c.rounds[1], 1)).toBeCloseTo(0.3636, 4);
    expect(flashScore(c.rounds[2], 2)).toBeCloseTo(0.4167, 4);
    expect(scoreHowMany(c)).toBe(260);
  });

  it('HM-T3 E (one timeout): 6, null, 15 -> 1, 0, 0.9722 -> 657', () => {
    const e = raw([6, null, 15]);
    expect(flashScore(e.rounds[2], 2)).toBeCloseTo(0.9722, 4);
    expect(scoreHowMany(e)).toBe(657);
  });

  it('HM-T4 F (perfect): 6, 11, 16 -> 1000; G (near-perfect): 6, 11, 15 -> 991; D (idle) -> 0', () => {
    expect(scoreHowMany(raw([6, 11, 16]))).toBe(1000);
    expect(scoreHowMany(raw([6, 11, 15]))).toBe(991);
    expect(scoreHowMany(raw([null, null, null]))).toBe(0);
  });
});

describe('scoring contract', () => {
  it('the dead zone: within 5 % is full marks; W_i off is 0; beyond W_i stays 0', () => {
    expect(flashScore(r(20, 21), 2)).toBe(1); // 5 %
    expect(flashScore(r(10, 6), 1)).toBe(0); // 40 %
    expect(flashScore(r(10, 13), 0)).toBeCloseTo(0, 10); // 30 %
    expect(flashScore(r(6, 999), 0)).toBe(0);
    expect(flashScore(r(6, 0), 0)).toBe(0);
    // With these counts ±1 is outside the dead zone on every flash (1/18 > 5 %): only exact is full marks.
    expect(flashScore(r(18, 17), 2)).toBeLessThan(1);
  });

  it('always an integer in 0..1000', () => {
    for (let g1 = 0; g1 <= 14; g1 += 1) {
      for (let g2 = 0; g2 <= 26; g2 += 3) {
        for (const g3 of [null, 0, 10, 16, 30, 999]) {
          const s = scoreHowMany(raw([g1, g2, g3]));
          expect(Number.isInteger(s)).toBe(true);
          expect(s).toBeGreaterThanOrEqual(0);
          expect(s).toBeLessThanOrEqual(1000);
        }
      }
    }
  });

  it('buildRaw copies exactly the four schema fields, in order', () => {
    const extra = { ...r(6, 5), extra: 1 } as HowManyRound;
    expect(buildRaw([extra, r(11, null), r(16, 15, null)])).toEqual({
      rounds: [
        { true_count: 6, guess: 5, answer_ms: 2500, timed_out: false },
        { true_count: 11, guess: null, answer_ms: null, timed_out: true },
        { true_count: 16, guess: 15, answer_ms: null, timed_out: true },
      ],
    });
  });
});

describe('validateHowManyRaw mirrors the server bounds (SCORING.md §4)', () => {
  it('accepts every worked example with its own score', () => {
    for (const g of [[6, 10, 14], [5, 9, 13], [4, 8, 11], [null, null, null], [6, null, 15], [6, 11, 16], [6, 11, 15]]) {
      const x = raw(g);
      expect(validateHowManyRaw(x, scoreHowMany(x))).toBeNull();
    }
  });

  it('HM-T7: 299 ms on a non-timed-out flash is too fast; 300 accepted', () => {
    const x = raw([6, 10, 14]);
    x.rounds[1].answer_ms = 299;
    expect(validateHowManyRaw(x, 905)).toBe('hm.too_fast');
    x.rounds[1].answer_ms = 300;
    expect(validateHowManyRaw(x, 905)).toBeNull();
  });

  it('HM-T8 (ADR-138): three exact guesses are normal play: 1000 accepted', () => {
    expect(validateHowManyRaw(raw([6, 11, 16]), 1000)).toBeNull();
    // every band edge, all exact
    const edges = buildRaw([r(4, 4), r(9, 9), r(14, 14)]);
    expect(validateHowManyRaw(edges, 1000)).toBeNull();
    const top = buildRaw([r(7, 7), r(13, 13), r(18, 18)]);
    expect(validateHowManyRaw(top, 1000)).toBeNull();
  });

  it('HM-T9: example A with 907 is outside the band; 906 and 700 accepted', () => {
    expect(validateHowManyRaw(raw([6, 10, 14]), 907)).toBe('hm.formula_band');
    expect(validateHowManyRaw(raw([6, 10, 14]), 906)).toBeNull();
    expect(validateHowManyRaw(raw([6, 10, 14]), 700)).toBeNull();
  });

  it('HM-T10: true_count 16 on flash 1 (and 3, 14 on flash 2, 19 on flash 3) is out of range; a null guess not timed out is hm.timeout', () => {
    const x = raw([6, 10, 14]);
    x.rounds[0].true_count = 16;
    expect(validateHowManyRaw(x, 0)).toBe('hm.range');
    // 8 is outside the new band too (the server still accepts it during the rollout: the old band 8-15)
    const old = raw([6, 10, 14]);
    old.rounds[0].true_count = 8;
    expect(validateHowManyRaw(old, 0)).toBe('hm.range');
    const low = raw([6, 10, 14]);
    low.rounds[0].true_count = 3;
    expect(validateHowManyRaw(low, 0)).toBe('hm.range');
    const mid = raw([6, 10, 14]);
    mid.rounds[1].true_count = 14;
    expect(validateHowManyRaw(mid, 0)).toBe('hm.range');
    const high = raw([6, 10, 14]);
    high.rounds[2].true_count = 19;
    expect(validateHowManyRaw(high, 0)).toBe('hm.range');
    const y = raw([6, 10, 14]);
    y.rounds[0] = { true_count: 6, guess: null, answer_ms: 2000, timed_out: false };
    expect(validateHowManyRaw(y, 0)).toBe('hm.timeout');
  });

  it('answer_ms: 15 000 accepted (ADR-138), 15 001 out of range', () => {
    const x = raw([6, 10, 14]);
    x.rounds[2].answer_ms = 15_000;
    expect(validateHowManyRaw(x, 905)).toBeNull();
    x.rounds[2].answer_ms = 15_001;
    expect(validateHowManyRaw(x, 905)).toBe('hm.range');
  });

  it('shape, range and the timeout pairing', () => {
    expect(validateHowManyRaw('x', 0)).toBe('hm.shape');
    expect(validateHowManyRaw({ rounds: [r(6, 5), r(11, 10)] }, 0)).toBe('hm.shape');
    const missing = raw([6, 10, 14]) as unknown as { rounds: Array<Record<string, unknown>> };
    delete missing.rounds[2].answer_ms;
    expect(validateHowManyRaw(missing, 0)).toBe('hm.shape');
    const frac = raw([6, 10, 14]);
    frac.rounds[0].guess = 5.5;
    expect(validateHowManyRaw(frac, 0)).toBe('hm.shape');
    const big = raw([6, 10, 1000]);
    expect(validateHowManyRaw(big, 0)).toBe('hm.range');
    const tout = raw([6, 10, 14]);
    tout.rounds[0].timed_out = true;
    expect(validateHowManyRaw(tout, 0)).toBe('hm.timeout');
  });
});

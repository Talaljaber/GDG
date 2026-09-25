import { describe, expect, it } from 'vitest';
import { buildRaw, pairsBase, scorePairs, validatePairsRaw, type PairsRaw } from './scoring';

function raw(matched: number, misses: number, clear: number | null): PairsRaw {
  return { matched, misses, clear_ms: clear };
}

const A = raw(8, 5, 34_200);
const B = raw(6, 9, null);
const C = raw(3, 12, null);
const D = raw(0, 0, null);
const E = raw(8, 3, 21_500);
const F = raw(8, 0, 14_000);
const G = raw(0, 5, null);

describe('scorePairs: worked examples (docs/games/pairs.md §4)', () => {
  it('PR-T1 A (strong): 8 / 5 / 34 200 ms -> base 884.8 -> 825', () => {
    expect(pairsBase(A)).toBeCloseTo(884.8, 9);
    expect(scorePairs(A)).toBe(825);
  });

  it('PR-T2 B (typical): 6 / 9 -> base 570 -> 462; C (weak): 3 / 12 -> base 330 -> 186', () => {
    expect(pairsBase(B)).toBe(570);
    expect(scorePairs(B)).toBe(462);
    expect(pairsBase(C)).toBe(330);
    expect(scorePairs(C)).toBe(186);
  });

  it('PR-T3 D (idle) and G (no pair, 5 misses) -> 0 by the p = 0 rule', () => {
    expect(scorePairs(D)).toBe(0);
    expect(scorePairs(G)).toBe(0);
  });

  it('PR-T4 E (fast): 8 / 3 / 21 500 ms -> base 961 -> 925; F (perfect): 8 / 0 / 14 000 ms -> 1000', () => {
    expect(pairsBase(E)).toBe(961);
    expect(scorePairs(E)).toBe(925);
    expect(pairsBase(F)).toBe(1000);
    expect(scorePairs(F)).toBe(1000);
  });
});

describe('scoring contract', () => {
  it('always an integer in 0..1000', () => {
    for (let p = 0; p <= 8; p++) {
      for (let m = 0; m <= 200; m += 7) {
        const clears = p === 8 ? [4000, 15_000, 15_250, 33_333, 59_999, 60_000] : [null];
        for (const c of clears) {
          const s = scorePairs(raw(p, m, c));
          expect(Number.isInteger(s)).toBe(true);
          expect(s).toBeGreaterThanOrEqual(0);
          expect(s).toBeLessThanOrEqual(1000);
        }
      }
    }
  });

  it('a clear at exactly 60 s meets the not-cleared line (730), and each missing pair costs 80', () => {
    expect(pairsBase(raw(8, 0, 60_000))).toBe(730);
    expect(scorePairs(raw(7, 0, null))).toBe(650);
    expect(scorePairs(raw(8, 0, 60_000)) - scorePairs(raw(7, 0, null))).toBe(80);
  });

  it('a miss costs 12; clearing faster pays 6 per second after 15 s', () => {
    expect(scorePairs(raw(6, 0, null)) - scorePairs(raw(6, 1, null))).toBe(12);
    expect(scorePairs(raw(8, 0, 20_000)) - scorePairs(raw(8, 0, 21_000))).toBe(6);
    expect(scorePairs(raw(8, 0, 4000))).toBe(1000);
  });

  it('many misses clamp at 0 (with at least one pair)', () => {
    expect(scorePairs(raw(1, 60, null))).toBe(0);
  });

  it('rounds half up once at the end (clear 15 250 ms -> 998.5 -> 999)', () => {
    expect(pairsBase(raw(8, 0, 15_250))).toBe(998.5);
    expect(scorePairs(raw(8, 0, 15_250))).toBe(999);
  });

  it('buildRaw keeps clear_ms only for a full board, rounded and within the clock', () => {
    expect(buildRaw(8, 5, 34_200.4)).toEqual(A);
    expect(buildRaw(8, 0, 61_000)).toEqual(raw(8, 0, 60_000));
    expect(buildRaw(6, 9, 30_000)).toEqual(B);
    expect(buildRaw(6, 9, null)).toEqual(B);
    expect(buildRaw(0, 0, null)).toEqual(D);
  });
});

describe('validatePairsRaw mirrors the server bounds (SCORING.md §4)', () => {
  it('accepts every worked example with its own score', () => {
    for (const r of [A, B, C, D, E, F, G]) {
      expect(validatePairsRaw(r, scorePairs(r))).toBeNull();
    }
  });

  it('pr.shape: not an object, a missing or non-integer field', () => {
    expect(validatePairsRaw([], 0)).toBe('pr.shape');
    expect(validatePairsRaw(null, 0)).toBe('pr.shape');
    expect(validatePairsRaw({ matched: 8, misses: 5 }, 825)).toBe('pr.shape');
    expect(validatePairsRaw({ ...A, matched: 7.5 }, 825)).toBe('pr.shape');
    expect(validatePairsRaw({ ...A, clear_ms: '34200' }, 825)).toBe('pr.shape');
  });

  it('PR-T7: matched 8 without clear_ms is pr.clear; matched 9 is pr.range', () => {
    expect(validatePairsRaw(raw(8, 5, null), 825)).toBe('pr.clear');
    expect(validatePairsRaw(raw(6, 9, 30_000), 462)).toBe('pr.clear');
    expect(validatePairsRaw(raw(9, 5, 34_200), 825)).toBe('pr.range');
    expect(validatePairsRaw(raw(8, 201, 60_000), 0)).toBe('pr.range');
    expect(validatePairsRaw(raw(8, 5, 60_001), 0)).toBe('pr.range');
    expect(validatePairsRaw(raw(-1, 0, null), 0)).toBe('pr.range');
  });

  it('pr.zero: no pair found must score 0', () => {
    expect(validatePairsRaw(G, 1)).toBe('pr.zero');
  });

  it('PR-T5: clear_ms 7499 with 5 misses (floor 4000 + 5 x 700 = 7500) is too fast; 7500 passes', () => {
    const at = (c: number) => raw(8, 5, c);
    expect(validatePairsRaw(at(7499), scorePairs(at(7499)))).toBe('pr.too_fast');
    expect(validatePairsRaw(at(7500), scorePairs(at(7500)))).toBeNull();
  });

  it('PR-T6: example A with 827 is outside the band; 824-826 pass', () => {
    expect(validatePairsRaw(A, 827)).toBe('pr.formula_band');
    expect(validatePairsRaw(A, 823)).toBe('pr.formula_band');
    for (const s of [824, 825, 826]) expect(validatePairsRaw(A, s)).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import {
  buildRaw,
  lengthAfterSolves,
  scoreCloseBrackets,
  solvedLengthSum,
  speedBonus,
  validateCloseBracketsRaw,
  type CloseBracketsRaw,
} from './scoring';

function raw(solved: number, solveMs: number | null, failed = 0, timeouts = 0): CloseBracketsRaw {
  return { solved, failed, timeouts, solve_ms: solveMs };
}

describe('scoreCloseBrackets: worked examples (docs/games/close-brackets.md §4)', () => {
  it('A (strong): n 9, S 51, solve_ms 23562 -> g 462, B 73 -> 838', () => {
    expect(solvedLengthSum(9)).toBe(51);
    expect(speedBonus(raw(9, 23562))).toBeCloseTo(73, 6);
    expect(scoreCloseBrackets(raw(9, 23562, 1))).toBe(838);
  });

  it('B (typical): n 6, S 27, solve_ms 20600 -> 428', () => {
    expect(solvedLengthSum(6)).toBe(27);
    expect(speedBonus(raw(6, 20600))).toBeCloseTo(22.84, 2);
    expect(scoreCloseBrackets(raw(6, 20600))).toBe(428);
  });

  it('C (weak): n 4, S 14, g 1000 -> no bonus -> 210', () => {
    expect(scoreCloseBrackets(raw(4, 14000, 2))).toBe(210);
  });

  it('D (one solve): n 1, S 2, g 700 -> 63', () => {
    expect(scoreCloseBrackets(raw(1, 1400))).toBe(63);
  });

  it('E (near-perfect): n 11, S 67 -> capped at 1000', () => {
    expect(solvedLengthSum(11)).toBe(67);
    expect(scoreCloseBrackets(raw(11, 21440))).toBe(1000);
  });

  it('F (nothing solved) -> 0', () => {
    expect(scoreCloseBrackets(raw(0, null, 3, 2))).toBe(0);
  });
});

describe('the length curve (docs/games/close-brackets.md §2)', () => {
  it('lengths go 2, 3, ..., 8, then stay at 8', () => {
    expect([0, 1, 2, 5, 6, 7, 20].map(lengthAfterSolves)).toEqual([2, 3, 4, 7, 8, 8, 8]);
  });

  it('CB-T3: S(n) for n = 0, 1, 7, 8, 11 is 0, 2, 35, 43, 67 and equals the summed lengths', () => {
    expect([0, 1, 7, 8, 11].map(solvedLengthSum)).toEqual([0, 2, 35, 43, 67]);
    for (let n = 0; n <= 30; n++) {
      let sum = 0;
      for (let k = 0; k < n; k++) sum += lengthAfterSolves(k);
      expect(solvedLengthSum(n)).toBe(sum);
    }
  });
});

describe('scoring contract', () => {
  it('always an integer in 0..1000', () => {
    for (let n = 0; n <= 30; n++) {
      for (const ms of [150, 300, 500, 900, 2000]) {
        const s = scoreCloseBrackets(buildRaw(n, 0, 0, n ? ms * solvedLengthSum(n) : 0));
        expect(Number.isInteger(s)).toBe(true);
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(1000);
      }
    }
  });

  it('buildRaw: solve_ms is null iff nothing was solved, and rounded', () => {
    expect(buildRaw(0, 2, 1, 0)).toEqual({ solved: 0, failed: 2, timeouts: 1, solve_ms: null });
    expect(buildRaw(2, 0, 0, 3400.4)).toEqual({ solved: 2, failed: 0, timeouts: 0, solve_ms: 3400 });
  });

  it('the bonus (<= 100) is worth less than one length-8 sequence (120)', () => {
    expect(scoreCloseBrackets(raw(8, 43 * 300)) - scoreCloseBrackets(raw(8, 43 * 900))).toBe(100);
    expect(scoreCloseBrackets(raw(9, 51 * 900))).toBeGreaterThan(scoreCloseBrackets(raw(8, 43 * 300)));
  });
});

describe('validateCloseBracketsRaw mirrors the server bounds (SCORING.md §4)', () => {
  it('accepts every worked example with its own score', () => {
    for (const r of [raw(9, 23562, 1), raw(6, 20600), raw(4, 14000, 2), raw(1, 1400), raw(11, 21440), raw(0, null, 3, 2)]) {
      expect(validateCloseBracketsRaw(r, scoreCloseBrackets(r))).toBeNull();
    }
  });

  it('CB-T4: 7649 ms for 51 brackets is too fast; 7650 is accepted', () => {
    expect(validateCloseBracketsRaw(raw(9, 7649), 838)).toBe('cb.too_fast');
    expect(validateCloseBracketsRaw(raw(9, 7650), 838)).toBeNull();
  });

  it('CB-T5: the formula band is 765..865 at S 51', () => {
    expect(validateCloseBracketsRaw(raw(9, 23562), 866)).toBe('cb.formula_band');
    expect(validateCloseBracketsRaw(raw(9, 23562), 865)).toBeNull();
    expect(validateCloseBracketsRaw(raw(9, 23562), 765)).toBeNull();
    expect(validateCloseBracketsRaw(raw(9, 23562), 764)).toBe('cb.formula_band');
  });

  it('CB-T6: nothing solved but a solve time -> cb.solve_ms', () => {
    expect(validateCloseBracketsRaw(raw(0, 1200), 0)).toBe('cb.solve_ms');
    expect(validateCloseBracketsRaw(raw(3, null), 200)).toBe('cb.solve_ms');
  });

  it('CB-T7: nothing solved with a score -> cb.zero', () => {
    expect(validateCloseBracketsRaw(raw(0, null), 10)).toBe('cb.zero');
  });

  it('CB-T8: 4 timeouts -> cb.range; shapes', () => {
    expect(validateCloseBracketsRaw(raw(2, 3000, 0, 4), 80)).toBe('cb.range');
    expect(validateCloseBracketsRaw(raw(31, 30000), 1000)).toBe('cb.range');
    expect(validateCloseBracketsRaw([], 0)).toBe('cb.shape');
    expect(validateCloseBracketsRaw({ solved: 1, failed: 0, timeouts: 0 }, 0)).toBe('cb.shape');
    expect(validateCloseBracketsRaw({ solved: 1.5, failed: 0, timeouts: 0, solve_ms: 900 }, 0)).toBe('cb.shape');
  });
});

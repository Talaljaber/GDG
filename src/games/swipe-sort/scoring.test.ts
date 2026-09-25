import { describe, expect, it } from 'vitest';
import { buildRaw, itemWindowMs, scoreSwipeSort, speedBonus, validateSwipeSortRaw, type SwipeSortRaw } from './scoring';

function raw(correct: number, wrong: number, missed: number, mean: number | null): SwipeSortRaw {
  return { correct, wrong, missed, mean_swipe_ms: mean };
}

const A = raw(43, 1, 5, 450);
const B = raw(33, 3, 8, 550);
const C = raw(22, 5, 12, 640);
const D = raw(30, 33, 0, 260);
const E = raw(0, 0, 36, null);
const F = raw(46, 1, 2, 430);

describe('scoreSwipeSort: worked examples (docs/games/swipe-sort.md §4)', () => {
  it('SS-T1 A (strong): 43 / 1 / 5 at 450 ms -> net 37, B 50 -> 864', () => {
    expect(speedBonus(A)).toBeCloseTo(50, 6);
    expect(scoreSwipeSort(A)).toBe(864);
  });

  it('SS-T2 B (typical): 33 / 3 / 8 at 550 ms -> net 22, B 30 -> 514', () => {
    expect(speedBonus(B)).toBeCloseTo(30, 6);
    expect(scoreSwipeSort(B)).toBe(514);
  });

  it('SS-T3 C (weak): 22 / 5 / 12 at 640 ms -> net 5, B 12 x 0.25 = 3 -> 113', () => {
    expect(speedBonus(C)).toBeCloseTo(3, 6);
    expect(scoreSwipeSort(C)).toBe(113);
  });

  it('SS-T3 D (random spammer): 30 / 33 / 0 at 260 ms -> net -3, no bonus -> 0', () => {
    expect(speedBonus(D)).toBe(0);
    expect(scoreSwipeSort(D)).toBe(0);
  });

  it('E (idle): 36 misses -> 0', () => {
    expect(scoreSwipeSort(E)).toBe(0);
  });

  it('F (near-perfect): 46 / 1 / 2 at 430 ms -> 946 + 54 -> capped at 1000', () => {
    expect(speedBonus(F)).toBeCloseTo(54, 6);
    expect(scoreSwipeSort(F)).toBe(1000);
  });
});

describe('scoring contract', () => {
  it('always an integer in 0..1000', () => {
    for (let c = 0; c <= 80; c += 4) {
      for (let w = 0; w <= 30; w += 5) {
        for (let m = 0; m <= 40; m += 10) {
          for (const rt of [200, 400, 520, 700, 900]) {
            const s = scoreSwipeSort(raw(c, w, m, c ? rt : null));
            expect(Number.isInteger(s)).toBe(true);
            expect(s).toBeGreaterThanOrEqual(0);
            expect(s).toBeLessThanOrEqual(1000);
          }
        }
      }
    }
  });

  it('buildRaw: mean over correct items, rounded; null without a correct swipe', () => {
    expect(buildRaw(3, 1, 2, 1400)).toEqual({ correct: 3, wrong: 1, missed: 2, mean_swipe_ms: 467 });
    expect(buildRaw(0, 2, 30, 0)).toEqual({ correct: 0, wrong: 2, missed: 30, mean_swipe_ms: null });
  });

  it('a wrong swipe and a miss each cost one net point (22); the bonus fades with net under 20', () => {
    expect(scoreSwipeSort(raw(40, 0, 0, 700)) - scoreSwipeSort(raw(40, 1, 0, 700))).toBe(22);
    expect(scoreSwipeSort(raw(40, 0, 0, 700)) - scoreSwipeSort(raw(40, 0, 1, 700))).toBe(22);
    expect(speedBonus(raw(30, 0, 0, 400))).toBe(60);
    expect(speedBonus(raw(10, 0, 0, 400))).toBe(30);
    expect(speedBonus(raw(10, 5, 5, 400))).toBe(0);
  });
});

describe('itemWindowMs (SS-T8)', () => {
  it('ramps 900 -> 675 -> 450 ms and clamps outside the clock', () => {
    expect(itemWindowMs(0)).toBe(900);
    expect(itemWindowMs(15_000)).toBe(675);
    expect(itemWindowMs(30_000)).toBe(450);
    expect(itemWindowMs(10_000)).toBe(750);
    expect(itemWindowMs(-500)).toBe(900);
    expect(itemWindowMs(40_000)).toBe(450);
  });
});

describe('validateSwipeSortRaw mirrors the server bounds (SCORING.md §4)', () => {
  it('accepts every worked example with its own score', () => {
    for (const r of [A, B, C, D, E, F]) {
      expect(validateSwipeSortRaw(r, scoreSwipeSort(r))).toBeNull();
    }
  });

  it('SS-T4: a mean under 200 ms is too fast', () => {
    const at199 = raw(40, 1, 5, 199);
    const at200 = raw(40, 1, 5, 200);
    expect(validateSwipeSortRaw(at199, scoreSwipeSort(at199))).toBe('ss.too_fast');
    expect(validateSwipeSortRaw(at200, scoreSwipeSort(at200))).toBeNull();
  });

  it('SS-T5: 60 correct at 353 ms do not fit in 30 s (60 x 503 = 30180); 352 ms do', () => {
    expect(validateSwipeSortRaw(raw(60, 1, 5, 353), 1000)).toBe('ss.too_many');
    expect(validateSwipeSortRaw(raw(60, 1, 5, 352), 1000)).toBeNull();
  });

  it('SS-T6: the band at net 37 is 814..874', () => {
    expect(validateSwipeSortRaw(A, 875)).toBe('ss.formula_band');
    expect(validateSwipeSortRaw(A, 874)).toBeNull();
    expect(validateSwipeSortRaw(A, 814)).toBeNull();
    expect(validateSwipeSortRaw(A, 813)).toBe('ss.formula_band');
  });

  it('shape, range, rt and zero', () => {
    expect(validateSwipeSortRaw('x', 0)).toBe('ss.shape');
    expect(validateSwipeSortRaw([], 0)).toBe('ss.shape');
    expect(validateSwipeSortRaw({ correct: 1, wrong: 0, missed: 0 }, 0)).toBe('ss.shape');
    expect(validateSwipeSortRaw({ ...A, mean_swipe_ms: 450.5 }, 864)).toBe('ss.shape');
    expect(validateSwipeSortRaw(raw(121, 0, 0, 500), 1000)).toBe('ss.range');
    expect(validateSwipeSortRaw(raw(10, 121, 0, 500), 0)).toBe('ss.range');
    expect(validateSwipeSortRaw(raw(10, 0, 81, 500), 0)).toBe('ss.range');
    expect(validateSwipeSortRaw(raw(10, 0, 0, 901), 220)).toBe('ss.range');
    expect(validateSwipeSortRaw(raw(0, 0, 80, null), 0)).toBeNull();
    expect(validateSwipeSortRaw(raw(0, 0, 0, 500), 0)).toBe('ss.rt');
    expect(validateSwipeSortRaw(raw(3, 0, 0, null), 66)).toBe('ss.rt');
    expect(validateSwipeSortRaw(E, 22)).toBe('ss.zero');
    expect(validateSwipeSortRaw(D, 1)).toBe('ss.formula_band');
  });
});

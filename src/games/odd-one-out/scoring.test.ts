import { describe, expect, it } from 'vitest';
import {
  OOO_GRID_SIZES,
  buildRaw,
  scoreOddOneOut,
  totalTime,
  validateOddOneOutRaw,
  type OddOneOutGrid,
} from './scoring';

const [S1, S2, S3] = OOO_GRID_SIZES;

function grids(findMs: [number, number, number], wrongTaps: [number, number, number] = [0, 0, 0]): OddOneOutGrid[] {
  return [
    { size: S1, find_ms: findMs[0], wrong_taps: wrongTaps[0], timed_out: false },
    { size: S2, find_ms: findMs[1], wrong_taps: wrongTaps[1], timed_out: false },
    { size: S3, find_ms: findMs[2], wrong_taps: wrongTaps[2], timed_out: false },
  ];
}

describe('scoreOddOneOut: worked examples (docs/games/odd-one-out.md §4)', () => {
  it('A (fast): 700, 1400, 3200, no wrong taps -> T 5300 -> 867', () => {
    const raw = buildRaw(grids([700, 1400, 3200]));
    expect(totalTime(raw)).toBe(5300);
    expect(scoreOddOneOut(raw)).toBe(867);
  });

  it('B (typical): 1500, 3000, 6000, no wrong taps -> T 10500 -> 684', () => {
    const raw = buildRaw(grids([1500, 3000, 6000]));
    expect(totalTime(raw)).toBe(10500);
    expect(scoreOddOneOut(raw)).toBe(684);
  });

  it('C (one wrong tap on grid 2): 1500, 3000, 6000; taps 0,1,0 -> T 12500 -> 614', () => {
    const raw = buildRaw(grids([1500, 3000, 6000], [0, 1, 0]));
    expect(totalTime(raw)).toBe(12500);
    expect(scoreOddOneOut(raw)).toBe(614);
  });

  it('D (timed out on grid 3): 1200, 2500, timeout -> T 23700 -> 221', () => {
    const raw = buildRaw([
      { size: S1, find_ms: 1200, wrong_taps: 0, timed_out: false },
      { size: S2, find_ms: 2500, wrong_taps: 0, timed_out: false },
      { size: S3, find_ms: 20000, wrong_taps: 0, timed_out: true },
    ]);
    expect(totalTime(raw)).toBe(23700);
    expect(scoreOddOneOut(raw)).toBe(221);
  });

  it('E (all timed out): T 60000 -> 0', () => {
    const raw = buildRaw([
      { size: S1, find_ms: 20000, wrong_taps: 0, timed_out: true },
      { size: S2, find_ms: 20000, wrong_taps: 0, timed_out: true },
      { size: S3, find_ms: 20000, wrong_taps: 0, timed_out: true },
    ]);
    expect(totalTime(raw)).toBe(60000);
    expect(scoreOddOneOut(raw)).toBe(0);
  });
});

describe('game doc test cases (docs/games/odd-one-out.md §10)', () => {
  it('OOO-T1: example B -> 684', () => {
    const raw = buildRaw(grids([1500, 3000, 6000]));
    expect(scoreOddOneOut(raw)).toBe(684);
  });

  it('OOO-T2: example C -> 614', () => {
    const raw = buildRaw(grids([1500, 3000, 6000], [0, 1, 0]));
    expect(scoreOddOneOut(raw)).toBe(614);
  });

  it('OOO-T3: find_ms 200 on grid 1 (not timed out) -> ooo.find_ms', () => {
    const raw = buildRaw(grids([200, 3000, 6000]));
    expect(validateOddOneOutRaw(raw)).toBe('ooo.find_ms');
  });

  it('OOO-T4: sizes [4,6,5] -> ooo.shape', () => {
    const raw = buildRaw([
      { size: 4, find_ms: 1000, wrong_taps: 0, timed_out: false },
      { size: 6, find_ms: 1000, wrong_taps: 0, timed_out: false },
      { size: 5, find_ms: 1000, wrong_taps: 0, timed_out: false },
    ]);
    expect(validateOddOneOutRaw(raw)).toBe('ooo.shape');
  });
});

describe('scoring bounds', () => {
  it('full marks at T <= 1500', () => {
    const raw = buildRaw(grids([500, 500, 500]));
    expect(totalTime(raw)).toBe(1500);
    expect(scoreOddOneOut(raw)).toBe(1000);
  });

  it('caps each grid time at the 20000ms timeout even with many wrong taps', () => {
    const raw = buildRaw(grids([18000, 0, 0], [10, 0, 0]));
    expect(totalTime(raw)).toBe(20000 + 0 + 0);
  });

  it('validate: wrong_taps out of range -> ooo.taps', () => {
    const raw = buildRaw(grids([1000, 1000, 1000], [51, 0, 0]));
    expect(validateOddOneOutRaw(raw)).toBe('ooo.taps');
  });

  it('validate: timed_out grid with find_ms != 20000 -> ooo.timeout', () => {
    const raw = buildRaw([
      { size: S1, find_ms: 1000, wrong_taps: 0, timed_out: true },
      { size: S2, find_ms: 1000, wrong_taps: 0, timed_out: false },
      { size: S3, find_ms: 1000, wrong_taps: 0, timed_out: false },
    ]);
    expect(validateOddOneOutRaw(raw)).toBe('ooo.timeout');
  });

  it('validate: accepts a valid, non-timed-out submission', () => {
    const raw = buildRaw(grids([1500, 3000, 6000], [0, 1, 0]));
    expect(validateOddOneOutRaw(raw)).toBeNull();
  });

  it('validate: only 2 grids -> ooo.shape', () => {
    const raw = buildRaw([
      { size: S1, find_ms: 1000, wrong_taps: 0, timed_out: false },
      { size: S2, find_ms: 1000, wrong_taps: 0, timed_out: false },
    ]);
    expect(validateOddOneOutRaw(raw)).toBe('ooo.shape');
  });
});

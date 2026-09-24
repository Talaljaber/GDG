import { describe, expect, it } from 'vitest';
import {
  onTimeMs,
  minPlaybackMs,
  scoreSimon,
  timeBonus,
  totalTapsForLevel,
  validateSimonRaw,
  type SimonRaw,
} from './scoring';

function raw(overrides: Partial<SimonRaw>): SimonRaw {
  return { level: 0, avg_gap_ms: null, taps: 0, ended: 'mistake', ...overrides };
}

describe('scoreSimon: worked examples (docs/games/simon.md §4)', () => {
  it('A (strong): level 12, gap 420 -> B 33 -> 801', () => {
    expect(timeBonus(12, 420)).toBe(33);
    expect(scoreSimon(raw({ level: 12, avg_gap_ms: 420 }))).toBe(801);
  });

  it('B (typical): level 8, gap 600 -> B 25 -> 537', () => {
    expect(timeBonus(8, 600)).toBe(25);
    expect(scoreSimon(raw({ level: 8, avg_gap_ms: 600 }))).toBe(537);
  });

  it('C (typical, slower): level 8, gap 900 -> B 13 -> 525', () => {
    expect(timeBonus(8, 900)).toBe(13);
    expect(scoreSimon(raw({ level: 8, avg_gap_ms: 900 }))).toBe(525);
  });

  it('D (failed first): level 0 -> 0', () => {
    expect(scoreSimon(raw({ level: 0, avg_gap_ms: null }))).toBe(0);
  });

  it('E (perfect run, won): level 15, gap 250 -> B 40 -> 1000', () => {
    expect(timeBonus(15, 250)).toBe(40);
    expect(scoreSimon(raw({ level: 15, avg_gap_ms: 250, ended: 'won' }))).toBe(1000);
  });

  it('F (just 3): level 3, gap 1300 -> B 0 -> 192', () => {
    expect(timeBonus(3, 1300)).toBe(0);
    expect(scoreSimon(raw({ level: 3, avg_gap_ms: 1300 }))).toBe(192);
  });
});

describe('game doc test cases (docs/games/simon.md §10)', () => {
  it('SIM-T1: example A -> 801', () => {
    expect(scoreSimon(raw({ level: 12, avg_gap_ms: 420 }))).toBe(801);
  });

  it('SIM-T2: level 16 -> rejected simon.level', () => {
    const r = raw({ level: 16, avg_gap_ms: 500, taps: 100, ended: 'cap' });
    const score = scoreSimon(r);
    expect(validateSimonRaw(r, score, 0)).toBe('simon.level');
  });

  it('SIM-T3: level 10, score 700 (64x10=640, diff 60) -> simon.formula_band', () => {
    const r = raw({ level: 10, avg_gap_ms: 500, taps: 50, ended: 'mistake' });
    expect(validateSimonRaw(r, 700, minPlaybackMs(10))).toBe('simon.formula_band');
  });

  it('SIM-T4: level 10, duration_ms 20000 -> simon.too_fast (min 26720)', () => {
    const r = raw({ level: 10, avg_gap_ms: 500, taps: 50, ended: 'mistake' });
    const score = scoreSimon(r);
    expect(minPlaybackMs(10)).toBe(26720);
    expect(validateSimonRaw(r, score, 20000)).toBe('simon.too_fast');
  });

  it('SIM-T5: avg_gap_ms 100, level 5 -> simon.gap', () => {
    const r = raw({ level: 5, avg_gap_ms: 100, taps: 12, ended: 'mistake' });
    const score = scoreSimon(r);
    expect(validateSimonRaw(r, score, minPlaybackMs(5))).toBe('simon.gap');
  });

  it('SIM-T6: on-time table L=3 -> 450, L=12 -> 270, L=13 -> 250, L=15 -> 250', () => {
    expect(onTimeMs(3)).toBe(450);
    expect(onTimeMs(12)).toBe(270);
    expect(onTimeMs(13)).toBe(250);
    expect(onTimeMs(15)).toBe(250);
  });
});

describe('minPlaybackMs', () => {
  it('minPlaybackMs(10) = 26720', () => {
    expect(minPlaybackMs(10)).toBe(26720);
  });

  it('minPlaybackMs(15) = 53400', () => {
    expect(minPlaybackMs(15)).toBe(53400);
  });

  it('minPlaybackMs(0) = 0 (below the start level)', () => {
    expect(minPlaybackMs(0)).toBe(0);
  });

  it('minPlaybackMs(3) = one flash+gap per tap of the first sequence', () => {
    expect(minPlaybackMs(3)).toBe(3 * (450 + 150));
  });
});

describe('totalTapsForLevel', () => {
  it('is 0 below the start level', () => {
    expect(totalTapsForLevel(0)).toBe(0);
    expect(totalTapsForLevel(2)).toBe(0);
  });

  it('is level for the first sequence (level 3)', () => {
    expect(totalTapsForLevel(3)).toBe(3);
  });

  it('accumulates across sequences: 3 + 4 = 7 taps to complete level 4', () => {
    expect(totalTapsForLevel(4)).toBe(7);
  });

  it('level 15: sum_{3..15} k = 117', () => {
    expect(totalTapsForLevel(15)).toBe(117);
  });
});

describe('validateSimonRaw: shape and bounds', () => {
  it('accepts a well-formed level-0 loss', () => {
    const r = raw({ level: 0, avg_gap_ms: null, taps: 0, ended: 'mistake' });
    expect(validateSimonRaw(r, 0, 0)).toBeNull();
  });

  it('accepts a well-formed win at level 15', () => {
    const r = raw({ level: 15, avg_gap_ms: 250, taps: totalTapsForLevel(15), ended: 'won' });
    const score = scoreSimon(r);
    expect(validateSimonRaw(r, score, minPlaybackMs(15))).toBeNull();
  });

  it('rejects malformed raw (not an object) as simon.shape', () => {
    expect(validateSimonRaw(null, 0, 0)).toBe('simon.shape');
    expect(validateSimonRaw('nope', 0, 0)).toBe('simon.shape');
  });

  it('rejects a non-integer level as simon.shape', () => {
    const r = raw({ level: 3.5 as unknown as number });
    expect(validateSimonRaw(r, 0, 0)).toBe('simon.shape');
  });

  it('rejects an out-of-range avg_gap_ms as simon.shape', () => {
    const r = raw({ level: 5, avg_gap_ms: 5001, taps: 12, ended: 'mistake' });
    expect(validateSimonRaw(r, 320, 0)).toBe('simon.shape');
  });

  it('rejects level 0 with a nonzero score as simon.zero', () => {
    const r = raw({ level: 0, avg_gap_ms: null, taps: 0, ended: 'mistake' });
    expect(validateSimonRaw(r, 5, 0)).toBe('simon.zero');
  });

  it('rejects ended=won at a level other than 15 as simon.won', () => {
    const r = raw({ level: 10, avg_gap_ms: 500, taps: 50, ended: 'won' });
    const score = scoreSimon(r);
    expect(validateSimonRaw(r, score, minPlaybackMs(10))).toBe('simon.won');
  });

  it('rejects level 15 not marked won as simon.won', () => {
    const r = raw({ level: 15, avg_gap_ms: 250, taps: totalTapsForLevel(15), ended: 'cap' });
    const score = scoreSimon(r);
    expect(validateSimonRaw(r, score, minPlaybackMs(15))).toBe('simon.won');
  });
});

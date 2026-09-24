import { describe, expect, it } from 'vitest';
import {
  STC_TARGETS_MS,
  buildRaw,
  scoreStopTheClock,
  totalError,
  validateStopTheClockRaw,
  type StopTheClockAttempt,
} from './scoring';

const [T1, T2, T3] = STC_TARGETS_MS;

function attempts(measured: [number, number, number]): StopTheClockAttempt[] {
  return [
    { target_ms: T1, measured_ms: measured[0], missed_start: false },
    { target_ms: T2, measured_ms: measured[1], missed_start: false },
    { target_ms: T3, measured_ms: measured[2], missed_start: false },
  ];
}

describe('scoreStopTheClock: worked examples (docs/games/stop-the-clock.md §4)', () => {
  it('A (sharp): 5120, 9800, 7050 -> E 370 -> 938', () => {
    const raw = buildRaw(attempts([5120, 9800, 7050]));
    expect(totalError(raw)).toBe(370);
    expect(scoreStopTheClock(raw)).toBe(938);
  });

  it('B (typical): 5400, 10700, 6600 -> E 1500 -> 750', () => {
    const raw = buildRaw(attempts([5400, 10700, 6600]));
    expect(totalError(raw)).toBe(1500);
    expect(scoreStopTheClock(raw)).toBe(750);
  });

  it('C (rushed): 3900, 8200, 5800 -> E 4100 -> 317', () => {
    const raw = buildRaw(attempts([3900, 8200, 5800]));
    expect(totalError(raw)).toBe(4100);
    expect(scoreStopTheClock(raw)).toBe(317);
  });

  it('D (missed one start): 5100, missed, 7200 -> E 10300 -> 0', () => {
    const raw = buildRaw([
      { target_ms: T1, measured_ms: 5100, missed_start: false },
      { target_ms: T2, measured_ms: null, missed_start: true },
      { target_ms: T3, measured_ms: 7200, missed_start: false },
    ]);
    expect(totalError(raw)).toBe(10300);
    expect(scoreStopTheClock(raw)).toBe(0);
  });

  it('E (auto-stop on 2nd): 5000, 20000 (auto), 7000 -> E 10000 -> 0', () => {
    const raw = buildRaw(attempts([5000, 20000, 7000]));
    expect(totalError(raw)).toBe(10000);
    expect(scoreStopTheClock(raw)).toBe(0);
  });

  it('F (bot-perfect): 5000, 10000, 7000 -> E 0 -> 1000 on the client (server rejects: score > 990)', () => {
    const raw = buildRaw(attempts([5000, 10000, 7000]));
    expect(totalError(raw)).toBe(0);
    const score = scoreStopTheClock(raw);
    expect(score).toBe(1000);
    expect(validateStopTheClockRaw(raw, score)).toBe('stc.score_above_990');
  });
});

describe('game doc test cases (docs/games/stop-the-clock.md §10)', () => {
  it('STC-T1: 5000, 10000, 7060 -> E 60 -> score 990, accepted', () => {
    const raw = buildRaw(attempts([5000, 10000, 7060]));
    expect(totalError(raw)).toBe(60);
    const score = scoreStopTheClock(raw);
    expect(score).toBe(990);
    expect(validateStopTheClockRaw(raw, score)).toBeNull();
  });

  it('STC-T2: 5000, 10000, 7050 -> E 50 -> score 992 -> stc.score_above_990', () => {
    const raw = buildRaw(attempts([5000, 10000, 7050]));
    expect(totalError(raw)).toBe(50);
    const score = scoreStopTheClock(raw);
    expect(score).toBe(992);
    expect(validateStopTheClockRaw(raw, score)).toBe('stc.score_above_990');
  });

  it('STC-T3: example B -> 750', () => {
    const raw = buildRaw(attempts([5400, 10700, 6600]));
    expect(scoreStopTheClock(raw)).toBe(750);
  });

  it('STC-T4: all three missed starts -> 0, measured_ms all null, accepted', () => {
    const raw = buildRaw([
      { target_ms: T1, measured_ms: null, missed_start: true },
      { target_ms: T2, measured_ms: null, missed_start: true },
      { target_ms: T3, measured_ms: null, missed_start: true },
    ]);
    expect(raw.attempts.every((a) => a.measured_ms === null)).toBe(true);
    const score = scoreStopTheClock(raw);
    expect(score).toBe(0);
    expect(validateStopTheClockRaw(raw, score)).toBeNull();
  });

  it('STC-T5: measured_ms 20001 on target 10000 -> stc.range', () => {
    const raw = buildRaw([
      { target_ms: T1, measured_ms: 5000, missed_start: false },
      { target_ms: T2, measured_ms: 20001, missed_start: false },
      { target_ms: T3, measured_ms: 7000, missed_start: false },
    ]);
    const score = scoreStopTheClock(raw);
    expect(validateStopTheClockRaw(raw, score)).toBe('stc.range');
  });

  it('STC-T6: submit only 2 attempts -> stc.shape', () => {
    const raw = buildRaw([
      { target_ms: T1, measured_ms: 5000, missed_start: false },
      { target_ms: T2, measured_ms: 10000, missed_start: false },
    ]);
    const score = scoreStopTheClock(raw);
    expect(validateStopTheClockRaw(raw, score)).toBe('stc.shape');
  });
});

describe('scoring bounds', () => {
  it('clamps to 0 when error exceeds E_zero', () => {
    const raw = buildRaw(attempts([5000 + 6000, 10000, 7000]));
    expect(scoreStopTheClock(raw)).toBe(0);
  });

  it('caps per-attempt error at 10000 even for wildly out-of-range measured_ms', () => {
    const raw = buildRaw([
      { target_ms: T1, measured_ms: 999_999, missed_start: false },
      { target_ms: T2, measured_ms: 10000, missed_start: false },
      { target_ms: T3, measured_ms: 7000, missed_start: false },
    ]);
    expect(totalError(raw)).toBe(10000);
  });
});

import { describe, expect, it } from 'vitest';
import { INTERMISSION_TOTAL_MS, intermissionState, phoneIntermissionStep } from './schedule';
import { revealStrips } from './reveal';

const END = 1_000_000;

function at(offsetMs: number, extra: Partial<Parameters<typeof intermissionState>[0]> = {}) {
  return intermissionState({
    endedAtMs: END,
    nowMs: END + offsetMs,
    firstSeenMs: END,
    skipAtMs: null,
    isLast: false,
    ...extra,
  });
}

describe('intermission scheduler (ADR-117: 7 s + 5 s + 3 s)', () => {
  it('lasts 15 s in total', () => {
    expect(INTERMISSION_TOTAL_MS).toBe(15_000);
  });

  it('round board 0–7 s, session total 7–12 s, next 12–15 s, then done', () => {
    expect(at(0)).toEqual({ step: 'round_board', stepEndsAtMs: END + 7000 });
    expect(at(6999).step).toBe('round_board');
    expect(at(7000)).toEqual({ step: 'session_total', stepEndsAtMs: END + 12_000 });
    expect(at(11_999).step).toBe('session_total');
    expect(at(12_000)).toEqual({ step: 'next_intro', stepEndsAtMs: END + 15_000 });
    expect(at(14_999).step).toBe('next_intro');
    expect(at(15_000).step).toBe('done');
  });

  it('"Next round now" jumps to the 3 s next step from the tap', () => {
    const skip = END + 2000;
    expect(at(1999, { skipAtMs: skip }).step).toBe('round_board');
    expect(at(2000, { skipAtMs: skip })).toEqual({ step: 'next_intro', stepEndsAtMs: END + 5000 });
    expect(at(5000, { skipAtMs: skip }).step).toBe('done');
    // tapping during the session total works too
    expect(at(8000, { skipAtMs: END + 8000 })).toEqual({ step: 'next_intro', stepEndsAtMs: END + 11_000 });
  });

  it('a skip during the next step changes nothing', () => {
    expect(at(13_000, { skipAtMs: END + 13_000 })).toEqual({ step: 'next_intro', stepEndsAtMs: END + 15_000 });
  });

  it('a host that reopens after the intermission still shows 3 s of "Next" (E8)', () => {
    const seen = END + 60_000;
    expect(at(60_000, { firstSeenMs: seen })).toEqual({ step: 'next_intro', stepEndsAtMs: seen + 3000 });
    expect(at(63_000, { firstSeenMs: seen }).step).toBe('done');
  });

  it('a host that reopens mid-intermission resumes the same step (E8, E23)', () => {
    expect(at(9000, { firstSeenMs: END + 9000 }).step).toBe('session_total');
    expect(at(13_000, { firstSeenMs: END + 13_000 })).toEqual({ step: 'next_intro', stepEndsAtMs: END + 15_000 });
  });

  it('after the last round: 7 s of round board, then results', () => {
    expect(at(0, { isLast: true })).toEqual({ step: 'round_board', stepEndsAtMs: END + 7000 });
    expect(at(6999, { isLast: true }).step).toBe('round_board');
    expect(at(7000, { isLast: true }).step).toBe('done');
    // reopened later: straight to results
    expect(at(30_000, { isLast: true, firstSeenMs: END + 30_000 }).step).toBe('done');
  });

  it('phones mirror it from the local time they saw the round end, then wait on "Next"', () => {
    const seen = 5_000;
    expect(phoneIntermissionStep(seen, seen)).toBe('round_board');
    expect(phoneIntermissionStep(seen, seen + 7000)).toBe('session_total');
    expect(phoneIntermissionStep(seen, seen + 12_000)).toBe('next_intro');
    expect(phoneIntermissionStep(seen, seen + 99_000)).toBe('next_intro');
  });
});

describe('Stop the Clock reveal layout (games/stop-the-clock.md §6)', () => {
  const attempts = (m: Array<number | null>) => ({
    attempts: [5000, 10_000, 7000].map((target_ms, i) => ({
      target_ms,
      measured_ms: m[i],
      missed_start: m[i] === null,
    })),
  });
  const row = (id: string, m: Array<number | null>, name = id) => ({
    playerRowId: id,
    name,
    displaySuffix: id === 'sara2' ? 2 : null,
    raw: attempts(m),
  });

  it('puts each guess on its strip, centred at the target, ±5 s window', () => {
    const strips = revealStrips([row('a', [5000, 12_500, 4500])]);
    expect(strips).toHaveLength(3);
    expect(strips[0][0]).toMatchObject({ pos: 50, pinned: false });
    expect(strips[1][0]).toMatchObject({ pos: 75, pinned: false });
    expect(strips[2][0]).toMatchObject({ pos: 25, pinned: false });
  });

  it('pins off-window guesses to the edge and skips missed starts', () => {
    const strips = revealStrips([row('a', [16_000, null, 0])]);
    expect(strips[0][0]).toMatchObject({ pos: 100, pinned: true });
    expect(strips[1]).toEqual([]);
    expect(strips[2][0]).toMatchObject({ pos: 0, pinned: true });
  });

  it('labels only the top 5 (round-board order), with display suffixes', () => {
    const rows = ['p1', 'p2', 'p3', 'p4', 'sara2', 'p6', 'p7'].map((id) =>
      row(id, [5000, 10_000, 7000], id === 'sara2' ? 'Sara' : id),
    );
    const labels = revealStrips(rows)[0].map((d) => d.label);
    expect(labels).toEqual(['p1', 'p2', 'p3', 'p4', 'Sara 2', null, null]);
  });

  it('ignores rows without Stop the Clock raw data', () => {
    expect(revealStrips([{ playerRowId: 'x', name: 'x', displaySuffix: null, raw: { level: 3 } }])).toEqual([
      [],
      [],
      [],
    ]);
  });
});

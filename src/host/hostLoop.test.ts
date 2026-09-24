import { describe, expect, it } from 'vitest';
import {
  computeServerOffset,
  decideRoundAction,
  hostScreenFor,
  isIgnorableHostError,
  latestDoneRound,
  nextUpcomingRound,
  roundDeadlineMs,
  roundTimeLeftSeconds,
} from './hostLoop';
import { presenceDot, updateLastSeen } from './presence';
import { defaultLineup, isLineupValid, sameLineup, toggleLineup } from './lineup';

const STARTED = '2026-09-24T10:00:00.000Z';
const T0 = Date.parse(STARTED);

describe('computeServerOffset', () => {
  it('uses the midpoint of the round trip', () => {
    // local 1000..1200, server says 5100 at the midpoint (local 1100) -> offset 4000
    expect(computeServerOffset(1000, new Date(5100).toISOString(), 1200)).toBe(4000);
  });
  it('is negative when the local clock runs ahead', () => {
    expect(computeServerOffset(10_000, new Date(7_000).toISOString(), 10_000)).toBe(-3000);
  });
});

describe('roundDeadlineMs / roundTimeLeftSeconds', () => {
  it('deadline is started_at + 128 s', () => {
    expect(roundDeadlineMs(STARTED) - T0).toBe(128_000);
  });
  it('time left counts down the 3 s countdown + 120 s cap', () => {
    expect(roundTimeLeftSeconds(STARTED, T0)).toBe(123);
    expect(roundTimeLeftSeconds(STARTED, T0 + 23_000)).toBe(100);
    expect(roundTimeLeftSeconds(STARTED, T0 + 122_500)).toBe(1);
    expect(roundTimeLeftSeconds(STARTED, T0 + 200_000)).toBe(0);
  });
});

describe('decideRoundAction', () => {
  const playing = { status: 'playing' as const, started_at: STARTED };

  it('does nothing without a playing round', () => {
    expect(decideRoundAction({ round: null, joinedCount: 3, scoredCount: 3, serverNowMs: T0 })).toEqual({
      action: 'none',
    });
    expect(
      decideRoundAction({
        round: { status: 'done', started_at: STARTED },
        joinedCount: 3,
        scoredCount: 3,
        serverNowMs: T0,
      }),
    ).toEqual({ action: 'none' });
  });

  it('keeps waiting while someone has no score and the deadline has not passed', () => {
    expect(decideRoundAction({ round: playing, joinedCount: 3, scoredCount: 2, serverNowMs: T0 + 60_000 })).toEqual({
      action: 'none',
    });
  });

  it('ends with all_finished once every joined player has scored', () => {
    expect(decideRoundAction({ round: playing, joinedCount: 3, scoredCount: 3, serverNowMs: T0 + 30_000 })).toEqual({
      action: 'end',
      reason: 'all_finished',
    });
  });

  it('counts late scores from more rows than players as finished too', () => {
    expect(decideRoundAction({ round: playing, joinedCount: 2, scoredCount: 3, serverNowMs: T0 })).toMatchObject({
      reason: 'all_finished',
    });
  });

  it('ends with time_cap at exactly 128 s, not before', () => {
    expect(
      decideRoundAction({ round: playing, joinedCount: 3, scoredCount: 1, serverNowMs: T0 + 127_999 }),
    ).toEqual({ action: 'none' });
    expect(
      decideRoundAction({ round: playing, joinedCount: 3, scoredCount: 1, serverNowMs: T0 + 128_000 }),
    ).toEqual({ action: 'end', reason: 'time_cap' });
  });

  it('ends an overdue round immediately after a host reload (E8)', () => {
    expect(
      decideRoundAction({ round: playing, joinedCount: 3, scoredCount: 0, serverNowMs: T0 + 600_000 }),
    ).toMatchObject({ reason: 'time_cap' });
  });
});

describe('host helpers', () => {
  it('ignores GD010 only', () => {
    expect(isIgnorableHostError('invalid_state')).toBe(true);
    expect(isIgnorableHostError('not_admin')).toBe(false);
    expect(isIgnorableHostError('network')).toBe(false);
  });

  it('maps the running session to a screen', () => {
    const r = (round_no: number, status: 'upcoming' | 'playing' | 'done') => ({ round_no, status });
    expect(hostScreenFor(null)).toBe('lobby');
    expect(hostScreenFor({ status: 'playing' }, [r(1, 'playing'), r(2, 'upcoming')])).toBe('round');
    // between rounds: round 1 done, round 2 upcoming -> intermission (reconstructed on reload, E8)
    expect(hostScreenFor({ status: 'playing' }, [r(1, 'done'), r(2, 'upcoming')])).toBe('intermission');
    expect(hostScreenFor({ status: 'results' }, [r(1, 'done')])).toBe('results');
    // the last round's board still showing its 7 s
    expect(hostScreenFor({ status: 'results' }, [r(1, 'done')], true)).toBe('intermission');
    expect(hostScreenFor({ status: 'results', day_board_shown_at: '2026-09-24T10:00:00Z' }, [], true)).toBe('dayboard');
  });

  it('finds the latest done round and the next upcoming one', () => {
    const rounds = [
      { id: 'a', round_no: 1, status: 'done' as const },
      { id: 'b', round_no: 2, status: 'done' as const },
      { id: 'c', round_no: 3, status: 'upcoming' as const },
    ];
    expect(latestDoneRound(rounds)?.id).toBe('b');
    expect(nextUpcomingRound(rounds, rounds[1])?.id).toBe('c');
    expect(nextUpcomingRound(rounds, rounds[2])).toBeNull();
    expect(latestDoneRound([{ id: 'x', round_no: 1, status: 'playing' as const }])).toBeNull();
    expect(nextUpcomingRound(rounds, null)).toBeNull();
  });
});

describe('presence dots', () => {
  it('is on while present, and stays on for 10 s after leaving', () => {
    let seen = updateLastSeen(new Map(), new Set(['a']), ['a'], 1000);
    expect(presenceDot('a', new Set(['a']), seen, 1000)).toBe('on');
    seen = updateLastSeen(seen, new Set(), ['a'], 5000);
    expect(presenceDot('a', new Set(), seen, 10_999)).toBe('on');
    expect(presenceDot('a', new Set(), seen, 11_000)).toBe('off');
  });

  it('gives a newly listed, never-seen player the grace period from when it was listed', () => {
    const seen = updateLastSeen(new Map(), new Set(), ['b'], 2000);
    expect(presenceDot('b', new Set(), seen, 11_999)).toBe('on');
    expect(presenceDot('b', new Set(), seen, 12_000)).toBe('off');
  });

  it('turns back on as soon as presence returns', () => {
    const seen = updateLastSeen(new Map([['a', 0]]), new Set(['a']), ['a'], 60_000);
    expect(presenceDot('a', new Set(['a']), seen, 60_000)).toBe('on');
  });
});

describe('lineup picker', () => {
  const registered = ['stop_the_clock', 'trivia', 'simon'] as const;

  it('adds in order up to the max and removes on a second tap', () => {
    let l = toggleLineup([], 'trivia', 2);
    l = toggleLineup(l, 'stop_the_clock', 2);
    expect(l).toEqual(['trivia', 'stop_the_clock']);
    expect(toggleLineup(l, 'simon', 2)).toEqual(['trivia', 'stop_the_clock']);
    expect(toggleLineup(l, 'trivia', 2)).toEqual(['stop_the_clock']);
  });

  it('is valid only with exactly N distinct registered games', () => {
    expect(isLineupValid(['stop_the_clock'], registered, 1)).toBe(true);
    expect(isLineupValid([], registered, 1)).toBe(false);
    expect(isLineupValid(['odd_one_out'], registered, 1)).toBe(false);
    expect(isLineupValid(['trivia', 'trivia'], registered, 2)).toBe(false);
  });

  it('defaults to the first N registered games', () => {
    expect(defaultLineup(registered, 1)).toEqual(['stop_the_clock']);
  });

  it('compares lineups by order', () => {
    expect(sameLineup(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(sameLineup(['a', 'b'], ['b', 'a'])).toBe(false);
  });
});

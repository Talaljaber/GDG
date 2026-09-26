import { describe, expect, it } from 'vitest';
import { derivePlayerView, hasFinishedRound, isRoundEndedLocally, roundEndedBeforeStart, viewKey } from './playerFlow';
import type { PlayerRow, RoundRow, SessionRow } from '../lib/api';
import type { CurrentState } from '../lib/storage';

const NOW = 1_700_000_000_000;

function local(overrides: Partial<CurrentState> = {}): CurrentState {
  return {
    sessionId: 's1',
    playerRowId: 'p1',
    name: 'Sara',
    displaySuffix: null,
    roundId: null,
    game: null,
    roundStartEpoch: null,
    seed: null,
    gameSnapshot: null,
    pendingSubmit: null,
    submittedRounds: [],
    ...overrides,
  };
}

function session(status: SessionRow['status'], overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    id: 's1',
    event_day_id: 'd1',
    code: '4821',
    status,
    lineup: ['stop_the_clock'],
    current_round: status === 'playing' ? 1 : null,
    created_at: '2026-09-24T10:00:00Z',
    opened_at: null,
    started_at: null,
    ended_at: status === 'results' ? '2026-09-24T10:05:00Z' : null,
    day_board_shown_at: null,
    closed_at: null,
    ...overrides,
  };
}

function round(status: RoundRow['status'], overrides: Partial<RoundRow> = {}): RoundRow {
  return {
    id: 'r1',
    session_id: 's1',
    round_no: 1,
    game: 'stop_the_clock',
    status,
    started_at: status === 'upcoming' ? null : '2026-09-24T10:01:00Z',
    ended_at: status === 'done' ? '2026-09-24T10:03:00Z' : null,
    end_reason: status === 'done' ? 'all_finished' : null,
    ...overrides,
  };
}

function me(status: PlayerRow['status'] = 'joined'): PlayerRow {
  return {
    id: 'p1',
    session_id: 's1',
    player_id: 'u1',
    name: 'Sara',
    name_key: 'sara',
    display_suffix: null,
    status,
    progress: 'waiting',
    progress_round: null,
    joined_at: '2026-09-24T10:00:00Z',
    removed_at: status === 'removed' ? '2026-09-24T10:00:30Z' : null,
  };
}

describe('derivePlayerView', () => {
  it('is loading until the session and own row are known', () => {
    expect(derivePlayerView({ local: local(), session: null, rounds: [], me: me(), now: NOW }).screen).toBe(
      'loading',
    );
    expect(
      derivePlayerView({ local: local(), session: session('lobby'), rounds: [], me: null, now: NOW }).screen,
    ).toBe('loading');
  });

  it('shows the removed screen whatever the session state', () => {
    const v = derivePlayerView({ local: local(), session: session('lobby'), rounds: [], me: me('removed'), now: NOW });
    expect(v.screen).toBe('removed');
  });

  it('shows the lobby for lobby and pending sessions', () => {
    expect(derivePlayerView({ local: local(), session: session('lobby'), rounds: [], me: me(), now: NOW })).toEqual({
      screen: 'lobby',
      pending: false,
    });
    expect(derivePlayerView({ local: local(), session: session('pending'), rounds: [], me: me(), now: NOW })).toEqual({
      screen: 'lobby',
      pending: true,
    });
  });

  it('begins a playing round the phone has no local state for', () => {
    const v = derivePlayerView({
      local: local(),
      session: session('playing'),
      rounds: [round('playing')],
      me: me(),
      now: NOW,
    });
    expect(v).toMatchObject({ screen: 'intro', begin: true });
  });

  it('stays in the 3-2-1 until roundStartEpoch, then shows the game (reload-safe)', () => {
    const l = local({ roundId: 'r1', game: 'stop_the_clock', roundStartEpoch: NOW + 2000 });
    const input = { local: l, session: session('playing'), rounds: [round('playing')], me: me() };
    expect(derivePlayerView({ ...input, now: NOW })).toMatchObject({ screen: 'intro', begin: false });
    expect(derivePlayerView({ ...input, now: NOW + 2000 })).toMatchObject({ screen: 'game', roundEnded: false });
  });

  it('signals roundEnded at the local 120 s cap', () => {
    const l = local({ roundId: 'r1', roundStartEpoch: NOW - 120_000 });
    const v = derivePlayerView({ local: l, session: session('playing'), rounds: [round('playing')], me: me(), now: NOW });
    expect(v).toMatchObject({ screen: 'game', roundEnded: true });
  });

  it('keeps an unfinished game on screen with roundEnded when the server ends the round', () => {
    const l = local({ roundId: 'r1', roundStartEpoch: NOW - 30_000 });
    const v = derivePlayerView({ local: l, session: session('results'), rounds: [round('done')], me: me(), now: NOW });
    expect(v).toMatchObject({ screen: 'game', roundEnded: true });
  });

  describe('a round that ended while the phone was still in its 3-2-1 (E26/E27, ADR-014)', () => {
    const T0 = NOW;
    const l = local({ roundId: 'r1', game: 'how_many', roundStartEpoch: T0 + 3000 });
    const gameKey = viewKey({ screen: 'game', round: round('done'), roundEnded: true });

    it('is not mounted: the intermission follows when more rounds are left', () => {
      const rounds = [
        round('done', { game: 'how_many', end_reason: 'force_end' }),
        round('upcoming', { id: 'r2', round_no: 2, game: 'pairs' }),
      ];
      const v = derivePlayerView({ local: l, session: session('playing'), rounds, me: me(), now: T0 + 1000 });
      expect(v.screen).not.toBe('game');
      expect(v.screen).not.toBe('intro');
      expect(v).toMatchObject({ screen: 'intermission', round: { id: 'r1' }, next: { id: 'r2' } });
      expect(viewKey(v)).not.toBe(gameKey);
    });

    it('is not mounted: the session results follow after the last round', () => {
      const rounds = [round('done', { game: 'how_many', end_reason: 'force_end' })];
      const v = derivePlayerView({ local: l, session: session('results'), rounds, me: me(), now: T0 + 1000 });
      expect(v).toEqual({ screen: 'results' });
      expect(viewKey(v)).not.toBe(gameKey);
    });

    it('roundEndedBeforeStart is true only for a server-ended round before the local start', () => {
      const done = [round('done')];
      expect(roundEndedBeforeStart(l, done, T0 + 1000)).toBe(true);
      // Started (the game was on screen): finish and submit as usual (§5).
      expect(roundEndedBeforeStart(l, done, T0 + 3000)).toBe(false);
      // Still playing on the server: the 3-2-1 goes on.
      expect(roundEndedBeforeStart(l, [round('playing')], T0 + 1000)).toBe(false);
      // Already has a result, or no local round.
      expect(roundEndedBeforeStart({ ...l, submittedRounds: ['r1'] }, done, T0 + 1000)).toBe(false);
      expect(roundEndedBeforeStart(local(), done, T0 + 1000)).toBe(false);
    });

    it('a round still playing keeps the 3-2-1', () => {
      const v = derivePlayerView({
        local: l,
        session: session('playing'),
        rounds: [round('playing', { game: 'how_many' })],
        me: me(),
        now: T0 + 1000,
      });
      expect(v).toMatchObject({ screen: 'intro', begin: false });
    });
  });

  it('shows the round result after finishing while the round is still playing (E3)', () => {
    const l = local({
      roundId: 'r1',
      roundStartEpoch: NOW - 30_000,
      submittedRounds: ['r1'],
    });
    const v = derivePlayerView({ local: l, session: session('playing'), rounds: [round('playing')], me: me(), now: NOW });
    expect(v).toMatchObject({ screen: 'round_result' });
  });

  it('counts a pending (unacknowledged) submit as finished, never a new game', () => {
    const l = local({
      roundId: 'r1',
      roundStartEpoch: NOW - 30_000,
      pendingSubmit: { roundId: 'r1', score: 1, durationMs: 1, raw: {} },
    });
    const v = derivePlayerView({ local: l, session: session('playing'), rounds: [round('playing')], me: me(), now: NOW });
    expect(v.screen).toBe('round_result');
  });

  it('shows results when the session is in results and the phone is done', () => {
    const l = local({ roundId: 'r1', roundStartEpoch: NOW - 30_000, submittedRounds: ['r1'] });
    const v = derivePlayerView({ local: l, session: session('results'), rounds: [round('done')], me: me(), now: NOW });
    expect(v.screen).toBe('results');
  });

  it('shows results to a phone that never played the round (AC1.7)', () => {
    const v = derivePlayerView({ local: local(), session: session('results'), rounds: [round('done')], me: me(), now: NOW });
    expect(v.screen).toBe('results');
  });

  it('shows the ended screen for a session closed without results (E25)', () => {
    const v = derivePlayerView({ local: local(), session: session('closed'), rounds: [], me: me(), now: NOW });
    expect(v.screen).toBe('ended');
  });

  it('shows frozen results for a session closed after results', () => {
    const s = session('closed', { ended_at: '2026-09-24T10:05:00Z' });
    const v = derivePlayerView({ local: local(), session: s, rounds: [round('done')], me: me(), now: NOW });
    expect(v.screen).toBe('results');
  });
});

describe('derivePlayerView: multi-round sessions, pending lobby, day board (Phase 2)', () => {
  const lineup: SessionRow['lineup'] = ['stop_the_clock', 'odd_one_out', 'simon'];
  const s3 = (status: SessionRow['status'], o: Partial<SessionRow> = {}) => session(status, { lineup, ...o });
  const r1done = round('done', { id: 'r1', round_no: 1 });
  const r2up = round('upcoming', { id: 'r2', round_no: 2, game: 'odd_one_out' });
  const r3up = round('upcoming', { id: 'r3', round_no: 3, game: 'simon' });

  it('P3b: a guest in the pending session sees "next round" until New session flips it to lobby (E6, AC2.3)', () => {
    const input = { local: local(), rounds: [], me: me(), now: NOW };
    expect(derivePlayerView({ ...input, session: s3('pending') })).toEqual({ screen: 'lobby', pending: true });
    // New session: pending -> lobby, the player row is carried over
    expect(derivePlayerView({ ...input, session: s3('lobby', { opened_at: '2026-09-24T10:10:00Z' }) })).toEqual({
      screen: 'lobby',
      pending: false,
    });
    // a pending session closed by a new event day (E25)
    expect(derivePlayerView({ ...input, session: s3('closed') }).screen).toBe('ended');
  });

  it('P8: between rounds the phone mirrors the intermission from when it saw the round end', () => {
    const l = local({ roundId: 'r1', roundStartEpoch: NOW - 60_000, submittedRounds: ['r1'] });
    const input = { local: l, session: s3('playing'), rounds: [r1done, r2up, r3up], me: me() };
    expect(derivePlayerView({ ...input, now: NOW, intermissionSeenAt: NOW })).toMatchObject({
      screen: 'intermission',
      step: 'round_board',
      round: { id: 'r1' },
      next: { id: 'r2' },
    });
    expect(derivePlayerView({ ...input, now: NOW + 7000, intermissionSeenAt: NOW })).toMatchObject({
      step: 'session_total',
    });
    expect(derivePlayerView({ ...input, now: NOW + 40_000, intermissionSeenAt: NOW })).toMatchObject({
      step: 'next_intro',
    });
    // not seen yet: starts at the round board
    expect(derivePlayerView({ ...input, now: NOW })).toMatchObject({ step: 'round_board' });
  });

  it('P8 also for a phone that missed the round (no score)', () => {
    const v = derivePlayerView({ local: local(), session: s3('playing'), rounds: [r1done, r2up, r3up], me: me(), now: NOW });
    expect(v.screen).toBe('intermission');
  });

  it('round 2 starts: the phone begins it (3-2-1), even straight from the intermission', () => {
    const l = local({ roundId: 'r1', roundStartEpoch: NOW - 60_000, submittedRounds: ['r1'] });
    const r2 = round('playing', { id: 'r2', round_no: 2, game: 'odd_one_out' });
    const v = derivePlayerView({ local: l, session: s3('playing'), rounds: [r1done, r2, r3up], me: me(), now: NOW });
    expect(v).toMatchObject({ screen: 'intro', begin: true, round: { id: 'r2' } });
  });

  it('a phone still in round 1 when it ended finishes it first (E27), then the intermission', () => {
    const l = local({ roundId: 'r1', roundStartEpoch: NOW - 30_000 });
    const input = { session: s3('playing'), rounds: [r1done, r2up, r3up], me: me(), now: NOW };
    expect(derivePlayerView({ ...input, local: l })).toMatchObject({ screen: 'game', roundEnded: true });
    const after = { ...l, pendingSubmit: { roundId: 'r1', score: 10, durationMs: 30_000, raw: {} } };
    expect(derivePlayerView({ ...input, local: after }).screen).toBe('intermission');
  });

  it('after the last round: results, then the day board once the host shows it (P9 → P10)', () => {
    const done = [r1done, round('done', { id: 'r2', round_no: 2 }), round('done', { id: 'r3', round_no: 3 })];
    const base = { local: local({ submittedRounds: ['r1', 'r2', 'r3'] }), rounds: done, me: me(), now: NOW };
    expect(derivePlayerView({ ...base, session: s3('results') }).screen).toBe('results');
    expect(
      derivePlayerView({ ...base, session: s3('results', { day_board_shown_at: '2026-09-24T10:20:00Z' }) }).screen,
    ).toBe('dayboard');
    // New session closes it: the phone keeps its frozen results / day board
    const closed = s3('closed', { ended_at: '2026-09-24T10:19:00Z', day_board_shown_at: '2026-09-24T10:20:00Z' });
    expect(derivePlayerView({ ...base, session: closed, dayCurrent: true }).screen).toBe('dayboard');
    // ...until a new event day ends it (E25, P11)
    expect(derivePlayerView({ ...base, session: closed, dayCurrent: false }).screen).toBe('ended');
  });

  it('a session in results closed by a new event day shows P11 (E25)', () => {
    const closed = s3('closed', { ended_at: '2026-09-24T10:19:00Z' });
    expect(derivePlayerView({ local: local(), session: closed, rounds: [r1done], me: me(), now: NOW, dayCurrent: false }).screen).toBe(
      'ended',
    );
  });
});

describe('helpers', () => {
  it('hasFinishedRound covers saved, pending, last result and failed', () => {
    expect(hasFinishedRound(local({ submittedRounds: ['r1'] }), 'r1')).toBe(true);
    expect(hasFinishedRound(local({ saveFailedRound: 'r1' }), 'r1')).toBe(true);
    expect(hasFinishedRound(local({ lastResult: { roundId: 'r1', score: 0, durationMs: 0, raw: {} } }), 'r1')).toBe(
      true,
    );
    expect(hasFinishedRound(local(), 'r1')).toBe(false);
  });

  it('isRoundEndedLocally: done on the server, or past the cap', () => {
    expect(isRoundEndedLocally(round('done'), null, NOW)).toBe(true);
    expect(isRoundEndedLocally(round('playing'), NOW - 119_999, NOW)).toBe(false);
    expect(isRoundEndedLocally(round('playing'), NOW - 120_000, NOW)).toBe(true);
  });
});

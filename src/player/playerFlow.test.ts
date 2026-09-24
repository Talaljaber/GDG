import { describe, expect, it } from 'vitest';
import { derivePlayerView, hasFinishedRound, isRoundEndedLocally } from './playerFlow';
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

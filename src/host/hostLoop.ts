/**
 * The host loop's decisions as pure functions (`SESSION_LIFECYCLE.md` §3.1,
 * ADR-104). The host view is the authority for the round lifecycle: it ends
 * a round when every joined player has a score, or when its own deadline
 * (started_at + 3 s + 120 s + 5 s = 128 s, in server time) passes. Server
 * time comes from one `server_now()` call and a Date.now() offset.
 */
import { COUNTDOWN_MS, HOST_GRACE_MS, ROUND_CAP_MS } from '../config';
import type { ErrorKind } from '../lib/errors';
import type { RoundRow } from '../lib/api';

/**
 * Clock offset (server − local) from one round trip: the server's time is
 * assumed to correspond to the midpoint of the request.
 */
export function computeServerOffset(localBefore: number, serverIso: string, localAfter: number): number {
  const server = Date.parse(serverIso);
  return server - (localBefore + localAfter) / 2;
}

/** Host deadline for a round: started_at + countdown + cap + grace (128 s). */
export function roundDeadlineMs(startedAtIso: string): number {
  return Date.parse(startedAtIso) + COUNTDOWN_MS + ROUND_CAP_MS + HOST_GRACE_MS;
}

/** Seconds left of the phones' round (countdown + 120 s cap), for the big screen; never negative. */
export function roundTimeLeftSeconds(startedAtIso: string | null, serverNowMs: number): number {
  if (!startedAtIso) return Math.ceil(ROUND_CAP_MS / 1000);
  const end = Date.parse(startedAtIso) + COUNTDOWN_MS + ROUND_CAP_MS;
  return Math.max(0, Math.ceil((end - serverNowMs) / 1000));
}

export type HostDecision = { action: 'none' } | { action: 'end'; reason: 'all_finished' | 'time_cap' };

export interface RoundCheck {
  round: Pick<RoundRow, 'status' | 'started_at'> | null;
  /** Players with status 'joined' in the session. */
  joinedCount: number;
  /** Score rows for the round. */
  scoredCount: number;
  /** Date.now() + offset. */
  serverNowMs: number;
}

/** One tick of the loop (every 500 ms while a round is playing). */
export function decideRoundAction({ round, joinedCount, scoredCount, serverNowMs }: RoundCheck): HostDecision {
  if (!round || round.status !== 'playing') return { action: 'none' };
  if (scoredCount >= joinedCount) return { action: 'end', reason: 'all_finished' };
  if (round.started_at && serverNowMs >= roundDeadlineMs(round.started_at)) {
    return { action: 'end', reason: 'time_cap' };
  }
  return { action: 'none' };
}

/**
 * GD010 (invalid state) from an admin call means another tab or a double tap
 * already advanced the state; the host view ignores it and re-reads the DB
 * (§3.1 step 5, E23).
 */
export function isIgnorableHostError(kind: ErrorKind): boolean {
  return kind === 'invalid_state';
}

export type HostScreen = 'lobby' | 'round' | 'intermission' | 'results' | 'dayboard';

type RoundLite = Pick<RoundRow, 'status' | 'round_no'>;

/**
 * Which host screen the database state calls for (reconstructed on every
 * load, §3.1 step 2). `finalBoardShowing` is true while the last round's
 * board (the Stop the Clock reveal) is still on its 7 s after the session
 * went to `results` (see schedule.ts).
 */
export function hostScreenFor(
  running: { status: string; day_board_shown_at?: string | null } | null,
  rounds: readonly RoundLite[] = [],
  finalBoardShowing = false,
): HostScreen {
  if (!running) return 'lobby';
  if (running.status === 'playing') {
    return rounds.some((r) => r.status === 'playing') ? 'round' : 'intermission';
  }
  if (running.status === 'results') {
    if (running.day_board_shown_at) return 'dayboard';
    return finalBoardShowing ? 'intermission' : 'results';
  }
  return 'lobby';
}

/** The most recently ended round (highest round_no that is done), or null. */
export function latestDoneRound<R extends RoundLite>(rounds: readonly R[]): R | null {
  return [...rounds].filter((r) => r.status === 'done').sort((a, b) => b.round_no - a.round_no)[0] ?? null;
}

/** The round after `after`, if it is still upcoming. */
export function nextUpcomingRound<R extends RoundLite>(rounds: readonly R[], after: RoundLite | null): R | null {
  if (!after) return null;
  return rounds.find((r) => r.round_no === after.round_no + 1 && r.status === 'upcoming') ?? null;
}

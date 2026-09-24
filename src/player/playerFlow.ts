/**
 * The phone's screen as a pure function of the database state it can see
 * (own session, its rounds, own player row) and its persisted local state
 * (`SESSION_LIFECYCLE.md` §4, §4.1, §5; `SCREENS.md` §1.1). Keeping this
 * pure makes reloads trivial: after a reload the same inputs give the same
 * screen (E1–E4), and it is unit-tested without a browser.
 */
import { ROUND_CAP_MS } from '../config';
import type { PlayerRow, RoundRow, SessionRow } from '../lib/api';
import type { CurrentState } from '../lib/storage';

export type PlayerView =
  | { screen: 'loading' }
  | { screen: 'removed' }
  | { screen: 'lobby'; pending: boolean }
  /** 3-2-1 before the game; `begin` = the phone hasn't set up this round locally yet. */
  | { screen: 'intro'; round: RoundRow; begin: boolean }
  | { screen: 'game'; round: RoundRow; roundEnded: boolean }
  | { screen: 'round_result'; round: RoundRow | null }
  | { screen: 'results' }
  /** The session was closed without results (new event day, E25). */
  | { screen: 'ended' };

/** True once this phone has a result (saved, pending or failed) for the round. */
export function hasFinishedRound(local: CurrentState, roundId: string): boolean {
  return (
    local.submittedRounds.includes(roundId) ||
    local.pendingSubmit?.roundId === roundId ||
    local.lastResult?.roundId === roundId ||
    local.saveFailedRound === roundId
  );
}

/** The round is over for this phone: ended on the server, or its local 120 s cap passed. */
export function isRoundEndedLocally(round: RoundRow, roundStartEpoch: number | null, now: number): boolean {
  if (round.status === 'done') return true;
  return roundStartEpoch !== null && now >= roundStartEpoch + ROUND_CAP_MS;
}

export interface FlowInput {
  local: CurrentState;
  session: SessionRow | null;
  rounds: readonly RoundRow[];
  me: PlayerRow | null;
  now: number;
}

export function derivePlayerView({ local, session, rounds, me, now }: FlowInput): PlayerView {
  if (!session || !me) return { screen: 'loading' };
  if (me.status === 'removed') return { screen: 'removed' };
  if (session.status === 'pending' || session.status === 'lobby') {
    return { screen: 'lobby', pending: session.status === 'pending' };
  }

  // A round this phone started locally and hasn't finished must be finished
  // first (and submitted), even if the server already ended it (§5).
  const localRound = local.roundId ? rounds.find((r) => r.id === local.roundId) : undefined;
  if (localRound && local.roundStartEpoch !== null && !hasFinishedRound(local, localRound.id)) {
    const ended = isRoundEndedLocally(localRound, local.roundStartEpoch, now);
    if (!ended && now < local.roundStartEpoch) {
      return { screen: 'intro', round: localRound, begin: false };
    }
    return { screen: 'game', round: localRound, roundEnded: ended };
  }

  if (session.status === 'closed' && !session.ended_at) return { screen: 'ended' };
  if (session.status === 'results' || session.status === 'closed') return { screen: 'results' };

  // playing
  const active = rounds.find((r) => r.status === 'playing');
  if (active && !hasFinishedRound(local, active.id)) {
    // Not set up locally yet (fresh start, or E26 late phone): begin its 3-2-1 now.
    return { screen: 'intro', round: active, begin: true };
  }
  const shown =
    active ??
    [...rounds].filter((r) => r.status === 'done').sort((a, b) => b.round_no - a.round_no)[0] ??
    null;
  return { screen: 'round_result', round: shown };
}

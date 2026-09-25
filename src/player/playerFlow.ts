/**
 * The phone's screen as a pure function of the database state it can see
 * (own session, its rounds, own player row, whether its event day is still
 * current) and its persisted local state (`SESSION_LIFECYCLE.md` §4, §4.1,
 * §5; `SCREENS.md` §1.1). Keeping this pure makes reloads trivial: after a
 * reload the same inputs give the same screen (E1–E4), and it is
 * unit-tested without a browser.
 */
import { ROUND_CAP_MS } from '../config';
import type { PlayerRow, RoundRow, SessionRow } from '../lib/api';
import type { CurrentState } from '../lib/storage';
import { latestDoneRound, nextUpcomingRound } from '../host/hostLoop';
import { phoneIntermissionStep } from '../host/schedule';

export type PhoneIntermissionStep = ReturnType<typeof phoneIntermissionStep>;

export type PlayerView =
  | { screen: 'loading' }
  | { screen: 'removed' }
  /** P3 (lobby) or P3b (pending: "You're in the next round", ADR-108). */
  | { screen: 'lobby'; pending: boolean }
  /** 3-2-1 before the game; `begin` = the phone hasn't set up this round locally yet. */
  | { screen: 'intro'; round: RoundRow; begin: boolean }
  | { screen: 'game'; round: RoundRow; roundEnded: boolean }
  | { screen: 'round_result'; round: RoundRow | null }
  /** P8: mirrors the big screen between rounds (ADR-117). */
  | { screen: 'intermission'; round: RoundRow; next: RoundRow; step: PhoneIntermissionStep }
  | { screen: 'results' }
  /** P10: after the host tapped Show day board (`sessions.day_board_shown_at`). */
  | { screen: 'dayboard' }
  /** P11: the session was closed by a new event day (E25). */
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
  /**
   * Local epoch when this phone first saw the latest round end (P8 anchor);
   * null = not seen yet (treated as now).
   */
  intermissionSeenAt?: number | null;
  /** Whether the session's event day is still current; null = unknown (E25). */
  dayCurrent?: boolean | null;
}

/**
 * Everything about a view that can change with time alone (the 3-2-1 ending, the local 120 s
 * cap, the P8 steps), as one string. MemberFlow's clock re-renders only when this changes.
 */
export function viewKey(view: PlayerView): string {
  switch (view.screen) {
    case 'intro':
      return `intro:${view.round.id}:${view.begin}`;
    case 'game':
      return `game:${view.round.id}:${view.roundEnded}`;
    case 'round_result':
      return `round_result:${view.round?.id ?? ''}`;
    case 'intermission':
      return `intermission:${view.round.id}:${view.next.id}:${view.step}`;
    case 'lobby':
      return `lobby:${view.pending}`;
    default:
      return view.screen;
  }
}

export function derivePlayerView({
  local,
  session,
  rounds,
  me,
  now,
  intermissionSeenAt = null,
  dayCurrent = null,
}: FlowInput): PlayerView {
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

  if (session.status === 'closed' && (!session.ended_at || dayCurrent === false)) return { screen: 'ended' };
  if (session.status === 'results' || session.status === 'closed') {
    return session.day_board_shown_at ? { screen: 'dayboard' } : { screen: 'results' };
  }

  // playing
  const active = rounds.find((r) => r.status === 'playing');
  if (active && !hasFinishedRound(local, active.id)) {
    // Not set up locally yet (fresh start, or E26 late phone): begin its 3-2-1 now.
    return { screen: 'intro', round: active, begin: true };
  }
  if (active) return { screen: 'round_result', round: active };

  // Between rounds: the intermission mirror (P8), until the next round starts.
  const done = latestDoneRound(rounds);
  const next = nextUpcomingRound(rounds, done);
  if (done && next) {
    return { screen: 'intermission', round: done, next, step: phoneIntermissionStep(intermissionSeenAt ?? now, now) };
  }
  return { screen: 'round_result', round: done };
}

/**
 * The intermission scheduler as a pure function (`SESSION_LIFECYCLE.md` §1,
 * §3.1 step 4; ADR-117; `SCREENS.md` H3, P8).
 *
 * After a round that has a next round: round board 7 s → session total 5 s →
 * "Next: <game>" 3 s, then the host starts the next round. "Next round now"
 * skips straight to the 3 s "Next" step. After the last round the round
 * board (for Stop the Clock: the guess reveal) shows for 7 s, then results.
 *
 * Everything is anchored on the round's `ended_at` (server time, via the
 * host's one `server_now()` offset), so a reloaded or second host tab lands
 * on the same step (E8, E23). A host that comes back after the intermission
 * should have ended still shows the 3 s "Next" step before starting the next
 * round, so the room gets a heads-up.
 */
import {
  INTERMISSION_NEXT_GAME_MS,
  INTERMISSION_ROUND_BOARD_MS,
  INTERMISSION_SESSION_TOTAL_MS,
} from '../config';

export type IntermissionStep = 'round_board' | 'session_total' | 'next_intro' | 'done';

export interface IntermissionInput {
  /** `rounds.ended_at` of the round that just ended, epoch ms (server time). */
  endedAtMs: number;
  /** Server time now: Date.now() + offset. */
  nowMs: number;
  /** When this view first saw the intermission (server time); anchors a late resume. */
  firstSeenMs: number;
  /** When "Next round now" was tapped (server time), or null. */
  skipAtMs: number | null;
  /** True after the session's last round: no total / next steps, results follow. */
  isLast: boolean;
}

export interface IntermissionState {
  step: IntermissionStep;
  /** When the current step ends (server time); equals nowMs for `done`. */
  stepEndsAtMs: number;
}

const ROUND_BOARD_END = INTERMISSION_ROUND_BOARD_MS;
const TOTAL_END = ROUND_BOARD_END + INTERMISSION_SESSION_TOTAL_MS;
const NEXT_END = TOTAL_END + INTERMISSION_NEXT_GAME_MS;

/** Full intermission length (15 s). */
export const INTERMISSION_TOTAL_MS = NEXT_END;

export function intermissionState({ endedAtMs, nowMs, firstSeenMs, skipAtMs, isLast }: IntermissionInput): IntermissionState {
  if (isLast) {
    const end = endedAtMs + ROUND_BOARD_END;
    // A view that arrives after the final round board is over goes straight to results.
    if (firstSeenMs >= end || nowMs >= end) return { step: 'done', stepEndsAtMs: nowMs };
    return { step: 'round_board', stepEndsAtMs: end };
  }

  // Where the "Next" step starts: the skip tap, a late resume, or 12 s after the end.
  let nextStart = endedAtMs + TOTAL_END;
  if (firstSeenMs >= endedAtMs + NEXT_END) nextStart = firstSeenMs; // late resume: 3 s heads-up
  if (skipAtMs !== null && skipAtMs < nextStart) nextStart = Math.max(skipAtMs, endedAtMs);
  const nextEnd = nextStart + INTERMISSION_NEXT_GAME_MS;

  if (nowMs >= nextEnd) return { step: 'done', stepEndsAtMs: nowMs };
  if (nowMs >= nextStart) return { step: 'next_intro', stepEndsAtMs: nextEnd };
  if (nowMs >= endedAtMs + ROUND_BOARD_END) return { step: 'session_total', stepEndsAtMs: nextStart };
  return { step: 'round_board', stepEndsAtMs: Math.min(endedAtMs + ROUND_BOARD_END, nextStart) };
}

/**
 * The phone's mirror (P8). Phones never compare clocks with the server
 * (ADR-104), so they anchor on the local time they saw the round end and
 * then wait on "Next: <game>" until the next round actually starts.
 */
export function phoneIntermissionStep(seenAtMs: number, nowMs: number): Exclude<IntermissionStep, 'done'> {
  const s = intermissionState({ endedAtMs: seenAtMs, nowMs, firstSeenMs: seenAtMs, skipAtMs: null, isLast: false });
  return s.step === 'done' ? 'next_intro' : s.step;
}

/**
 * Pure scoring for Stop the Clock. Source of truth: docs/SCORING.md §3.2,
 * docs/games/stop-the-clock.md §4-5. No DOM, time or randomness.
 */

/** Fixed targets in order, same for every player (ADR-025). */
export const STC_TARGETS_MS = [5000, 10000, 7000] as const;

/** A tap on Start must land within this many ms of the ready screen appearing. */
export const STC_START_WINDOW_MS = 10_000;

/** Auto-stop fires this many ms after the target, if Stop was never tapped. */
export const STC_AUTO_STOP_EXTRA_MS = 10_000;

/** Per-attempt error is capped here (a missed start or auto-stop hits exactly this). */
export const STC_ERROR_CAP_MS = 10_000;

/** Total error at which the score reaches zero. */
export const STC_E_ZERO_MS = 6000;

/** The server-enforced score ceiling: total error must be >= 60 ms (SCORING §4). */
export const STC_MAX_ACCEPTED_SCORE = 990;

export interface StopTheClockAttempt {
  target_ms: (typeof STC_TARGETS_MS)[number];
  measured_ms: number | null;
  missed_start: boolean;
}

/** The `raw` evidence object submitted with the score; matches the game doc's JSON Schema §5. */
export interface StopTheClockRaw {
  attempts: StopTheClockAttempt[];
}

/** Builds the `raw` payload from the three recorded attempts, in target order. */
export function buildRaw(attempts: StopTheClockAttempt[]): StopTheClockRaw {
  return { attempts };
}

function attemptError(attempt: StopTheClockAttempt): number {
  if (attempt.missed_start || attempt.measured_ms === null) {
    return STC_ERROR_CAP_MS;
  }
  return Math.min(STC_ERROR_CAP_MS, Math.abs(attempt.measured_ms - attempt.target_ms));
}

/** Total error across all attempts, in ms. Exported for tests and diagnostics. */
export function totalError(raw: StopTheClockRaw): number {
  return raw.attempts.reduce((sum, attempt) => sum + attemptError(attempt), 0);
}

/**
 * score = round(1000 x max(0, 1 - E / 6000)), clamped to [0, 1000].
 *
 * This is the value computed on the phone; the server independently rejects
 * (but never recomputes) values outside docs/SCORING.md §4's bounds, e.g.
 * score > 990 (worked example F).
 */
export function scoreStopTheClock(raw: unknown): number {
  const { attempts } = raw as StopTheClockRaw;
  const e = attempts.reduce((sum, attempt) => sum + attemptError(attempt), 0);
  const score = Math.round(1000 * Math.max(0, 1 - e / STC_E_ZERO_MS));
  return Math.min(1000, Math.max(0, score));
}

/** Reason codes from docs/SCORING.md §4's Stop the Clock row, in check order. */
export type StcRejectReason = 'stc.shape' | 'stc.missed' | 'stc.range' | 'stc.score_above_990';

/**
 * Mirrors the server's rejection bounds (docs/SCORING.md §4) for tests and
 * for instant client-side UX feedback; the server remains authoritative and
 * never recomputes the score (docs/SCORING.md §1.4). Returns the first
 * violated reason code, or null if `raw`/`score` would be accepted.
 */
export function validateStopTheClockRaw(raw: StopTheClockRaw, score: number): StcRejectReason | null {
  const { attempts } = raw;
  if (
    attempts.length !== STC_TARGETS_MS.length ||
    attempts.some((attempt, i) => attempt.target_ms !== STC_TARGETS_MS[i])
  ) {
    return 'stc.shape';
  }
  for (const attempt of attempts) {
    const nullMismatch = attempt.missed_start ? attempt.measured_ms !== null : attempt.measured_ms === null;
    if (nullMismatch) {
      return 'stc.missed';
    }
  }
  for (const attempt of attempts) {
    if (attempt.measured_ms === null) continue;
    if (attempt.measured_ms < 0 || attempt.measured_ms > attempt.target_ms + STC_AUTO_STOP_EXTRA_MS) {
      return 'stc.range';
    }
  }
  if (score > STC_MAX_ACCEPTED_SCORE) {
    return 'stc.score_above_990';
  }
  return null;
}

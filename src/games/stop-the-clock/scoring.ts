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

/** Per-attempt error at which that attempt's share reaches zero (ADR-132). */
export const STC_ATTEMPT_ZERO_MS = 2000;

/**
 * The server-enforced score ceiling (SCORING §4). A score above 990 needs every
 * attempt within 2 s and a summed error under 60 ms.
 */
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

/** e_i = min(10000, |measured - target|); a missed start or auto-stop is 10000. */
export function attemptError(attempt: StopTheClockAttempt): number {
  if (attempt.missed_start || attempt.measured_ms === null) {
    return STC_ERROR_CAP_MS;
  }
  return Math.min(STC_ERROR_CAP_MS, Math.abs(attempt.measured_ms - attempt.target_ms));
}

/** s_i = max(0, 1 - e_i / 2000): one attempt's share, 0..1 (unrounded; for tests and display). */
export function attemptShare(attempt: StopTheClockAttempt): number {
  return Math.max(0, 1 - attemptError(attempt) / STC_ATTEMPT_ZERO_MS);
}

/** Total error across all attempts, in ms. Exported for tests and diagnostics. */
export function totalError(raw: StopTheClockRaw): number {
  return raw.attempts.reduce((sum, attempt) => sum + attemptError(attempt), 0);
}

/**
 * score = round(1000 x (s_1 + s_2 + s_3) / 3), clamped to [0, 1000] (ADR-132).
 * When every attempt is within 2 s this equals round(1000 x (1 - E / 6000)).
 *
 * This is the value computed on the phone; the server independently rejects
 * (but never recomputes) values outside docs/SCORING.md §4's bounds, e.g.
 * score > 990 (worked example F).
 */
export function scoreStopTheClock(raw: unknown): number {
  const { attempts } = raw as StopTheClockRaw;
  // Integer form of 1000 x mean(s_i), so halves round the same on every device:
  // sum of (2000 - min(e_i, 2000)) over the attempts, x 1000 / (3 x 2000).
  const kept = attempts.reduce(
    (sum, attempt) => sum + STC_ATTEMPT_ZERO_MS - Math.min(STC_ATTEMPT_ZERO_MS, attemptError(attempt)),
    0,
  );
  const score = Math.round((1000 * kept) / (STC_TARGETS_MS.length * STC_ATTEMPT_ZERO_MS));
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

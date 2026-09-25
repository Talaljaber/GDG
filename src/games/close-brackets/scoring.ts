/**
 * Pure scoring for Close the Brackets. Source of truth: docs/SCORING.md §3.6,
 * docs/games/close-brackets.md §4-5. No DOM, time or randomness.
 */

/** The 30 s game clock, from the first sequence (docs/games/close-brackets.md §3). */
export const CB_GAME_MS = 30_000;

/** Per-sequence timeout. */
export const CB_SEQUENCE_TIMEOUT_MS = 10_000;

/** First sequence length, and the cap it grows to (+1 per solved sequence). */
export const CB_START_LENGTH = 2;
export const CB_MAX_LENGTH = 8;

/** Points per solved bracket (15 x S). */
export const CB_POINTS_PER_BRACKET = 15;

/** The speed bonus: full at <= 300 ms per bracket, 0 at >= 900 ms, at most 100. */
export const CB_BONUS_MAX = 100;
export const CB_BONUS_ZERO_MS = 900;
export const CB_BONUS_FULL_MS = 300;

/** Server bounds (SCORING.md §4). */
export const CB_MAX_SOLVED = 30;
export const CB_MAX_FAILED = 50;
export const CB_MAX_TIMEOUTS = 3;
/** Minimum mean ms per solved bracket, reading included (cb.too_fast). */
export const CB_MIN_MS_PER_BRACKET = 150;

/** The `raw` evidence object submitted with the score; matches the game doc's JSON Schema §5. */
export interface CloseBracketsRaw {
  /** Sequences solved (n). */
  solved: number;
  /** Sequences failed by a wrong closer. */
  failed: number;
  /** Sequences that hit the 10 s timeout. */
  timeouts: number;
  /** Sum over solved sequences of (last correct tap - sequence start), ms; null iff solved = 0. */
  solve_ms: number | null;
}

export function buildRaw(solved: number, failed: number, timeouts: number, solveMs: number): CloseBracketsRaw {
  return { solved, failed, timeouts, solve_ms: solved > 0 ? Math.round(solveMs) : null };
}

/** Length of the (k+1)-th sequence after k solves: 2, 3, ..., 8, 8, ... */
export function lengthAfterSolves(solved: number): number {
  return Math.min(CB_MAX_LENGTH, CB_START_LENGTH + solved);
}

/**
 * S(n): the sum of the lengths of n solved sequences, fully determined by n because
 * lengths go 2, 3, ..., 8, 8, ...: n(n + 3)/2 for n <= 7, 35 + 8(n - 7) above.
 */
export function solvedLengthSum(n: number): number {
  if (n <= 0) return 0;
  if (n <= 7) return (n * (n + 3)) / 2;
  return 35 + CB_MAX_LENGTH * (n - 7);
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/** The unrounded speed bonus B = 100 x clamp((900 - g) / 600, 0, 1), g = solve_ms / S. */
export function speedBonus(raw: CloseBracketsRaw): number {
  const s = solvedLengthSum(raw.solved);
  if (s === 0 || raw.solve_ms === null) return 0;
  const g = raw.solve_ms / s;
  return CB_BONUS_MAX * clamp((CB_BONUS_ZERO_MS - g) / (CB_BONUS_ZERO_MS - CB_BONUS_FULL_MS), 0, 1);
}

/**
 * score = round(min(1000, 15 x S + B)); 0 when nothing was solved.
 *
 * Computed on the phone; the server only rejects values outside
 * docs/SCORING.md §4's bounds and never recomputes.
 */
export function scoreCloseBrackets(raw: unknown): number {
  const r = raw as CloseBracketsRaw;
  const s = solvedLengthSum(r.solved);
  if (s === 0) return 0;
  const score = Math.round(Math.min(1000, CB_POINTS_PER_BRACKET * s + speedBonus(r)));
  return Math.min(1000, Math.max(0, score));
}

/** Reason codes from docs/SCORING.md §4's Close the Brackets row, in check order. */
export type CloseBracketsRejectReason =
  | 'cb.shape'
  | 'cb.range'
  | 'cb.solve_ms'
  | 'cb.zero'
  | 'cb.too_fast'
  | 'cb.formula_band';

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

/**
 * Mirrors the server's rejection bounds (docs/SCORING.md §4) for tests; the
 * server remains authoritative. Returns the first violated reason, or null.
 */
export function validateCloseBracketsRaw(raw: unknown, score: number): CloseBracketsRejectReason | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return 'cb.shape';
  const r = raw as Record<string, unknown>;
  if (!isInt(r.solved) || !isInt(r.failed) || !isInt(r.timeouts) || !('solve_ms' in r)) return 'cb.shape';
  if (r.solve_ms !== null && !isInt(r.solve_ms)) return 'cb.shape';
  const solveMs = r.solve_ms as number | null;
  if (
    r.solved < 0 ||
    r.solved > CB_MAX_SOLVED ||
    r.failed < 0 ||
    r.failed > CB_MAX_FAILED ||
    r.timeouts < 0 ||
    r.timeouts > CB_MAX_TIMEOUTS ||
    (solveMs !== null && (solveMs < 0 || solveMs > CB_GAME_MS))
  ) {
    return 'cb.range';
  }
  if ((solveMs === null) !== (r.solved === 0)) return 'cb.solve_ms';
  if (r.solved === 0) return score === 0 ? null : 'cb.zero';
  const s = solvedLengthSum(r.solved);
  if ((solveMs as number) < CB_MIN_MS_PER_BRACKET * s) return 'cb.too_fast';
  const lo = Math.min(1000, CB_POINTS_PER_BRACKET * s);
  const hi = Math.min(1000, CB_POINTS_PER_BRACKET * s + CB_BONUS_MAX);
  if (score < lo || score > hi) return 'cb.formula_band';
  return null;
}

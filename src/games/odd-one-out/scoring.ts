/**
 * Pure scoring for Odd One Out. Source of truth: docs/SCORING.md §3.1,
 * docs/games/odd-one-out.md §4-5. No DOM, time or randomness.
 */

/** Grid sizes in order (docs/games/odd-one-out.md §2). */
export const OOO_GRID_SIZES = [4, 5, 6] as const;

/** Per-grid timeout; a timed-out grid always has find_ms = 20000. */
export const OOO_GRID_TIMEOUT_MS = 20_000;

/** Added per wrong tap, inside the per-grid time (capped at the timeout). */
export const OOO_WRONG_TAP_PENALTY_MS = 2_000;

/** T at or below this yields score 1000 (full marks). */
export const OOO_T_ZERO_MS = 1_500;

/** T at or above this yields score 0. */
export const OOO_T_MAX_MS = 30_000;

/** Denominator of the score formula: OOO_T_MAX_MS - OOO_T_ZERO_MS. */
export const OOO_SCORE_SPAN_MS = OOO_T_MAX_MS - OOO_T_ZERO_MS;

/** Server-enforced minimum find_ms for a grid that was not timed out. */
export const OOO_MIN_FIND_MS = 250;

/** Server-enforced maximum wrong_taps per grid. */
export const OOO_MAX_WRONG_TAPS = 50;

export interface OddOneOutGrid {
  size: (typeof OOO_GRID_SIZES)[number];
  find_ms: number;
  wrong_taps: number;
  timed_out: boolean;
}

/** The `raw` evidence object submitted with the score; matches the game doc's JSON Schema §5. */
export interface OddOneOutRaw {
  grids: OddOneOutGrid[];
}

/** Builds the `raw` payload from the three recorded grids, in order. */
export function buildRaw(grids: OddOneOutGrid[]): OddOneOutRaw {
  return { grids };
}

function gridTime(grid: OddOneOutGrid): number {
  if (grid.timed_out) return OOO_GRID_TIMEOUT_MS;
  return Math.min(OOO_GRID_TIMEOUT_MS, grid.find_ms + OOO_WRONG_TAP_PENALTY_MS * grid.wrong_taps);
}

/** Total time T across all grids, in ms. Exported for tests and diagnostics. */
export function totalTime(raw: OddOneOutRaw): number {
  return raw.grids.reduce((sum, grid) => sum + gridTime(grid), 0);
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/**
 * score = round(1000 x clamp((30000 - T) / 28500, 0, 1)), clamped to [0, 1000].
 *
 * This is the value computed on the phone; the server independently rejects
 * (but never recomputes) values outside docs/SCORING.md §4's bounds.
 */
export function scoreOddOneOut(raw: unknown): number {
  const { grids } = raw as OddOneOutRaw;
  const t = grids.reduce((sum, grid) => sum + gridTime(grid), 0);
  const score = Math.round(1000 * clamp((OOO_T_MAX_MS - t) / OOO_SCORE_SPAN_MS, 0, 1));
  return Math.min(1000, Math.max(0, score));
}

/** Reason codes from docs/SCORING.md §4's Odd One Out row, in check order. */
export type OooRejectReason = 'ooo.shape' | 'ooo.taps' | 'ooo.find_ms' | 'ooo.timeout';

/**
 * Mirrors the server's rejection bounds (docs/SCORING.md §4) for tests and
 * for instant client-side UX feedback; the server remains authoritative and
 * never recomputes the score. Returns the first violated reason code, or
 * null if `raw` would be accepted.
 */
export function validateOddOneOutRaw(raw: OddOneOutRaw): OooRejectReason | null {
  const { grids } = raw;
  if (
    grids.length !== OOO_GRID_SIZES.length ||
    grids.some((grid, i) => grid.size !== OOO_GRID_SIZES[i])
  ) {
    return 'ooo.shape';
  }
  for (const grid of grids) {
    if (grid.wrong_taps < 0 || grid.wrong_taps > OOO_MAX_WRONG_TAPS) {
      return 'ooo.taps';
    }
  }
  for (const grid of grids) {
    if (!grid.timed_out && (grid.find_ms < OOO_MIN_FIND_MS || grid.find_ms > OOO_GRID_TIMEOUT_MS)) {
      return 'ooo.find_ms';
    }
  }
  for (const grid of grids) {
    if (grid.timed_out && grid.find_ms !== OOO_GRID_TIMEOUT_MS) {
      return 'ooo.timeout';
    }
  }
  return null;
}

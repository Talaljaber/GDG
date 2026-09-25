/**
 * Pure scoring for Pairs. Source of truth: docs/SCORING.md §3.10,
 * docs/games/pairs.md §4-5. No DOM, time or randomness.
 */

/** The 60 s game clock, from the board appearing (docs/games/pairs.md §3). */
export const PR_GAME_MS = 60_000;

/** A mismatch shows both cards this long, then flips them back; all input is ignored meanwhile. */
export const PR_LOCK_MS = 700;

/** The amber feedback on a match; no lock, the next tap is accepted at once. */
export const PR_MATCH_MS = 300;

/** 8 pairs on a 4 x 4 board. */
export const PR_PAIRS = 8;

/** Cleared: full marks up to 15 s, then 6 points per second. */
export const PR_CLEAR_FREE_MS = 15_000;
export const PR_CLEAR_POINTS_PER_S = 6;

/** Not cleared: 730 minus 80 per missing pair (730 = a clear at exactly 60 s). */
export const PR_NOT_CLEARED_BASE = 730;
export const PR_POINTS_PER_MISSING_PAIR = 80;

/** Every mismatched flip-pair costs 12. */
export const PR_POINTS_PER_MISS = 12;

/** Server bounds (SCORING.md §4). */
export const PR_MAX_MISSES = 200;
/** 16 taps at >= 250 ms each: the floor of a clear without misses (pr.too_fast). */
export const PR_MIN_CLEAR_MS = 16 * 250;

/** The `raw` evidence object submitted with the score; matches the game doc's JSON Schema §5. */
export interface PairsRaw {
  /** Pairs found, 0-8. */
  matched: number;
  /** Mismatched flip-pairs. */
  misses: number;
  /** Game-clock time at the eighth match, ms; null unless matched = 8. */
  clear_ms: number | null;
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/** Builds the raw payload; `clearMs` is only kept (rounded, within the clock) when all 8 pairs are found. */
export function buildRaw(matched: number, misses: number, clearMs: number | null): PairsRaw {
  return {
    matched,
    misses,
    clear_ms: matched === PR_PAIRS && clearMs !== null ? clamp(Math.round(clearMs), 0, PR_GAME_MS) : null,
  };
}

/**
 * The unrounded base before the miss cost:
 * cleared -> 1000 - 6 x max(0, clear_ms - 15000) / 1000; not cleared -> 730 - 80 x (8 - p).
 */
export function pairsBase(raw: PairsRaw): number {
  if (raw.matched >= PR_PAIRS && raw.clear_ms !== null) {
    return 1000 - (PR_CLEAR_POINTS_PER_S * Math.max(0, raw.clear_ms - PR_CLEAR_FREE_MS)) / 1000;
  }
  return PR_NOT_CLEARED_BASE - PR_POINTS_PER_MISSING_PAIR * (PR_PAIRS - raw.matched);
}

/**
 * score = clamp(round(base - 12 x misses), 0, 1000); no pair found -> 0.
 *
 * Computed on the phone; the server only rejects values outside
 * docs/SCORING.md §4's bounds and never recomputes.
 */
export function scorePairs(raw: unknown): number {
  const r = raw as PairsRaw;
  if (r.matched <= 0) return 0;
  return clamp(Math.round(pairsBase(r) - PR_POINTS_PER_MISS * r.misses), 0, 1000);
}

/** Reason codes from docs/SCORING.md §4's Pairs row, in check order. */
export type PairsRejectReason = 'pr.shape' | 'pr.range' | 'pr.clear' | 'pr.zero' | 'pr.too_fast' | 'pr.formula_band';

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

/**
 * Mirrors the server's rejection bounds (docs/SCORING.md §4) for tests; the
 * server remains authoritative. Returns the first violated reason, or null.
 */
export function validatePairsRaw(raw: unknown, score: number): PairsRejectReason | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return 'pr.shape';
  const r = raw as Record<string, unknown>;
  if (!isInt(r.matched) || !isInt(r.misses) || !('clear_ms' in r)) return 'pr.shape';
  if (r.clear_ms !== null && !isInt(r.clear_ms)) return 'pr.shape';
  const clear = r.clear_ms as number | null;
  if (
    r.matched < 0 ||
    r.matched > PR_PAIRS ||
    r.misses < 0 ||
    r.misses > PR_MAX_MISSES ||
    (clear !== null && (clear < 0 || clear > PR_GAME_MS))
  ) {
    return 'pr.range';
  }
  if ((clear === null) !== (r.matched < PR_PAIRS)) return 'pr.clear';
  if (r.matched === 0) return score === 0 ? null : 'pr.zero';
  if (r.matched === PR_PAIRS && (clear as number) < PR_MIN_CLEAR_MS + PR_LOCK_MS * r.misses) return 'pr.too_fast';
  const expected = clamp(
    Math.round(pairsBase({ matched: r.matched, misses: r.misses, clear_ms: clear }) - PR_POINTS_PER_MISS * r.misses),
    0,
    1000,
  );
  if (Math.abs(score - expected) > 1) return 'pr.formula_band';
  return null;
}

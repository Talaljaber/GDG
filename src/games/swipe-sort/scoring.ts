/**
 * Pure scoring for Swipe Sort. Source of truth: docs/SCORING.md §3.9,
 * docs/games/swipe-sort.md §4-5. No DOM, time or randomness.
 */

/** The 30 s game clock, from the first chevron (docs/games/swipe-sort.md §3). */
export const SS_GAME_MS = 30_000;

/** The gap after every item (the chevron flies off / fades; feedback). */
export const SS_GAP_MS = 150;

/** The item window I(t) ramps linearly from 900 ms at t = 0 to 450 ms at t = 30 s (ADR-136 floor). */
export const SS_WINDOW_START_MS = 900;
export const SS_WINDOW_END_MS = 450;

/** Points per net correct swipe (22 x net). */
export const SS_POINTS_PER_NET = 22;

/** The speed bonus: at most 60; full at <= 400 ms mean and net >= 20, 0 at >= 700 ms. */
export const SS_BONUS_MAX = 60;
export const SS_BONUS_ZERO_MS = 700;
export const SS_BONUS_FULL_MS = 400;
export const SS_BONUS_FULL_NET = 20;

/** Server bounds (SCORING.md §4). */
export const SS_MAX_CORRECT = 120;
export const SS_MAX_WRONG = 120;
export const SS_MAX_MISSED = 80;
export const SS_MAX_MEAN_MS = SS_WINDOW_START_MS;
export const SS_MIN_MEAN_MS = 200;
/** correct x (mean_swipe_ms + gap) must fit in the game plus one gap of slack (ss.too_many). */
export const SS_MAX_CORRECT_TIME_MS = SS_GAME_MS + SS_GAP_MS;

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/**
 * The item window I(t) = round(900 - 450 x t / 30000) ms, where t is the item's
 * onset on the game clock (clamped to 0..30 s): 900 -> 675 -> 450.
 */
export function itemWindowMs(t: number): number {
  const onset = clamp(t, 0, SS_GAME_MS);
  return Math.round(SS_WINDOW_START_MS - ((SS_WINDOW_START_MS - SS_WINDOW_END_MS) * onset) / SS_GAME_MS);
}

/** The `raw` evidence object submitted with the score; matches the game doc's JSON Schema §5. */
export interface SwipeSortRaw {
  correct: number;
  wrong: number;
  missed: number;
  /** Rounded mean time from an item's onset to the swipe registering, over correct items, ms; null iff correct = 0. */
  mean_swipe_ms: number | null;
}

/** Builds the raw payload from the counts and the summed swipe time of the correct items. */
export function buildRaw(correct: number, wrong: number, missed: number, swipeSumMs: number): SwipeSortRaw {
  return {
    correct,
    wrong,
    missed,
    mean_swipe_ms: correct > 0 ? Math.round(swipeSumMs / correct) : null,
  };
}

/** net = correct - wrong - missed. */
export function netSorted(raw: SwipeSortRaw): number {
  return raw.correct - raw.wrong - raw.missed;
}

/**
 * The unrounded speed bonus
 * B = 60 x clamp((700 - mean) / 300, 0, 1) x clamp(net / 20, 0, 1); 0 without a correct swipe.
 * The net factor keeps a random swiper (expected net 0) at about 0.
 */
export function speedBonus(raw: SwipeSortRaw): number {
  if (raw.correct <= 0 || raw.mean_swipe_ms === null) return 0;
  const speed = clamp((SS_BONUS_ZERO_MS - raw.mean_swipe_ms) / (SS_BONUS_ZERO_MS - SS_BONUS_FULL_MS), 0, 1);
  return SS_BONUS_MAX * speed * clamp(netSorted(raw) / SS_BONUS_FULL_NET, 0, 1);
}

/**
 * score = clamp(round(22 x net + B), 0, 1000); correct = 0 -> 0.
 *
 * Computed on the phone; the server only rejects values outside
 * docs/SCORING.md §4's bounds and never recomputes.
 */
export function scoreSwipeSort(raw: unknown): number {
  const r = raw as SwipeSortRaw;
  if (r.correct <= 0) return 0;
  const score = Math.round(SS_POINTS_PER_NET * netSorted(r) + speedBonus(r));
  return clamp(score, 0, 1000);
}

/** Reason codes from docs/SCORING.md §4's Swipe Sort row, in check order. */
export type SwipeSortRejectReason =
  | 'ss.shape'
  | 'ss.range'
  | 'ss.rt'
  | 'ss.zero'
  | 'ss.too_fast'
  | 'ss.too_many'
  | 'ss.formula_band';

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

/**
 * Mirrors the server's rejection bounds (docs/SCORING.md §4) for tests; the
 * server remains authoritative. Returns the first violated reason, or null.
 */
export function validateSwipeSortRaw(raw: unknown, score: number): SwipeSortRejectReason | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return 'ss.shape';
  const r = raw as Record<string, unknown>;
  if (!isInt(r.correct) || !isInt(r.wrong) || !isInt(r.missed) || !('mean_swipe_ms' in r)) return 'ss.shape';
  if (r.mean_swipe_ms !== null && !isInt(r.mean_swipe_ms)) return 'ss.shape';
  const rt = r.mean_swipe_ms as number | null;
  if (
    r.correct < 0 ||
    r.correct > SS_MAX_CORRECT ||
    r.wrong < 0 ||
    r.wrong > SS_MAX_WRONG ||
    r.missed < 0 ||
    r.missed > SS_MAX_MISSED ||
    (rt !== null && (rt < 0 || rt > SS_MAX_MEAN_MS))
  ) {
    return 'ss.range';
  }
  if ((rt === null) !== (r.correct === 0)) return 'ss.rt';
  if (r.correct === 0) return score === 0 ? null : 'ss.zero';
  if ((rt as number) < SS_MIN_MEAN_MS) return 'ss.too_fast';
  if (r.correct * ((rt as number) + SS_GAP_MS) > SS_MAX_CORRECT_TIME_MS) return 'ss.too_many';
  const net = r.correct - r.wrong - r.missed;
  const lo = clamp(SS_POINTS_PER_NET * net, 0, 1000);
  const hi = clamp(SS_POINTS_PER_NET * net + SS_BONUS_MAX, 0, 1000);
  if (score < lo || score > hi) return 'ss.formula_band';
  return null;
}

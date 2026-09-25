/**
 * Pure scoring for Color Clash. Source of truth: docs/SCORING.md §3.7,
 * docs/games/color-clash.md §4-5. No DOM, time or randomness.
 */

/** The 30 s game clock, from the first word (docs/games/color-clash.md §3). */
export const CC_GAME_MS = 30_000;

/** Per-trial timeout; a timeout counts like a wrong tap. */
export const CC_TRIAL_TIMEOUT_MS = 3_000;

/** The gap after every trial (feedback; the word is hidden). */
export const CC_GAP_MS = 300;

/** Points per net correct tap (25 x net). */
export const CC_POINTS_PER_NET = 25;

/** The speed bonus: full at <= 400 ms mean, 0 at >= 1000 ms, at most 75. */
export const CC_BONUS_MAX = 75;
export const CC_BONUS_ZERO_MS = 1000;
export const CC_BONUS_FULL_MS = 400;

/** Server bounds (SCORING.md §4). */
export const CC_MAX_CORRECT = 100;
export const CC_MAX_WRONG = 100;
export const CC_MAX_TIMEOUTS = 10;
export const CC_MIN_MEAN_RT_MS = 250;
/** correct x (mean_rt_ms + gap) must fit in the game plus one gap of slack (cc.too_many). */
export const CC_MAX_CORRECT_TIME_MS = CC_GAME_MS + CC_GAP_MS;

/** The `raw` evidence object submitted with the score; matches the game doc's JSON Schema §5. */
export interface ColorClashRaw {
  correct: number;
  wrong: number;
  timeouts: number;
  /** Rounded mean reaction time over correct trials, ms; null iff correct = 0. */
  mean_rt_ms: number | null;
}

/** Builds the raw payload from the counts and the summed reaction time of the correct trials. */
export function buildRaw(correct: number, wrong: number, timeouts: number, correctRtSumMs: number): ColorClashRaw {
  return {
    correct,
    wrong,
    timeouts,
    mean_rt_ms: correct > 0 ? Math.round(correctRtSumMs / correct) : null,
  };
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/** net = correct - wrong - timeouts. */
export function netCorrect(raw: ColorClashRaw): number {
  return raw.correct - raw.wrong - raw.timeouts;
}

/** The unrounded speed bonus B = 75 x clamp((1000 - mean_rt) / 600, 0, 1); 0 without a correct tap. */
export function speedBonus(raw: ColorClashRaw): number {
  if (raw.correct <= 0 || raw.mean_rt_ms === null) return 0;
  return CC_BONUS_MAX * clamp((CC_BONUS_ZERO_MS - raw.mean_rt_ms) / (CC_BONUS_ZERO_MS - CC_BONUS_FULL_MS), 0, 1);
}

/**
 * score = clamp(round(25 x net + B), 0, 1000).
 *
 * Computed on the phone; the server only rejects values outside
 * docs/SCORING.md §4's bounds and never recomputes.
 */
export function scoreColorClash(raw: unknown): number {
  const r = raw as ColorClashRaw;
  if (r.correct <= 0) return 0;
  const score = Math.round(CC_POINTS_PER_NET * netCorrect(r) + speedBonus(r));
  return Math.min(1000, Math.max(0, score));
}

/** Reason codes from docs/SCORING.md §4's Color Clash row, in check order. */
export type ColorClashRejectReason =
  | 'cc.shape'
  | 'cc.range'
  | 'cc.rt'
  | 'cc.zero'
  | 'cc.too_fast'
  | 'cc.too_many'
  | 'cc.formula_band';

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

/**
 * Mirrors the server's rejection bounds (docs/SCORING.md §4) for tests; the
 * server remains authoritative. Returns the first violated reason, or null.
 */
export function validateColorClashRaw(raw: unknown, score: number): ColorClashRejectReason | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return 'cc.shape';
  const r = raw as Record<string, unknown>;
  if (!isInt(r.correct) || !isInt(r.wrong) || !isInt(r.timeouts) || !('mean_rt_ms' in r)) return 'cc.shape';
  if (r.mean_rt_ms !== null && !isInt(r.mean_rt_ms)) return 'cc.shape';
  const rt = r.mean_rt_ms as number | null;
  if (
    r.correct < 0 ||
    r.correct > CC_MAX_CORRECT ||
    r.wrong < 0 ||
    r.wrong > CC_MAX_WRONG ||
    r.timeouts < 0 ||
    r.timeouts > CC_MAX_TIMEOUTS ||
    (rt !== null && (rt < 0 || rt > CC_TRIAL_TIMEOUT_MS))
  ) {
    return 'cc.range';
  }
  if ((rt === null) !== (r.correct === 0)) return 'cc.rt';
  if (r.correct === 0) return score === 0 ? null : 'cc.zero';
  if ((rt as number) < CC_MIN_MEAN_RT_MS) return 'cc.too_fast';
  if (r.correct * ((rt as number) + CC_GAP_MS) > CC_MAX_CORRECT_TIME_MS) return 'cc.too_many';
  const net = r.correct - r.wrong - r.timeouts;
  const lo = clamp(CC_POINTS_PER_NET * net, 0, 1000);
  const hi = clamp(CC_POINTS_PER_NET * net + CC_BONUS_MAX, 0, 1000);
  if (score < lo || score > hi) return 'cc.formula_band';
  return null;
}

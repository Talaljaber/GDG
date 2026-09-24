/**
 * Pure scoring for Simon. Source of truth: docs/SCORING.md §3.3,
 * docs/games/simon.md §3-5. No DOM, time or randomness.
 */

/** First sequence length; each success appends one pad, up to SIMON_MAX_LEVEL. */
export const SIMON_START_LEVEL = 3;

/** Completing this length ends the game as a win (docs/games/simon.md §1). */
export const SIMON_MAX_LEVEL = 15;

/** Gap between flashes during playback, ms (docs/games/simon.md §3). */
export const SIMON_FLASH_GAP_MS = 150;

/** Pause between sequences / "Nice!" success card duration, ms (§3). */
export const SIMON_SUCCESS_MS = 800;

/** Per-tap timeout: from end of playback, and from each previous tap, ms (§3). */
export const SIMON_TAP_TIMEOUT_MS = 5000;

/** Intro card duration before the first sequence, ms (§3 state diagram). */
export const SIMON_INTRO_MS = 1500;

/** A second pointerdown within this window of the first is a bounce; ignore it (§9). */
export const SIMON_DEBOUNCE_MS = 80;

/**
 * Flash on-time at sequence length L: max(250, 450 - 20 x (L - 3)) ms.
 * 450 at L = 3, floors at 250 from L = 13 (docs/games/simon.md §3).
 */
export function onTimeMs(level: number): number {
  return Math.max(250, 450 - 20 * (level - 3));
}

/**
 * Minimum possible playback duration to legitimately reach `level`: the sum,
 * over every sequence length k from 3 to `level`, of k taps each contributing
 * one flash (onTimeMs(k)) plus one gap (docs/SCORING.md §4 simon.too_fast).
 * minPlaybackMs(10) = 26720, minPlaybackMs(15) = 53400.
 */
export function minPlaybackMs(level: number): number {
  if (level < SIMON_START_LEVEL) return 0;
  let total = 0;
  for (let k = SIMON_START_LEVEL; k <= level; k++) {
    total += k * (onTimeMs(k) + SIMON_FLASH_GAP_MS);
  }
  return total;
}

export type SimonEnded = 'mistake' | 'timeout' | 'cap' | 'won';

/** The `raw` evidence object submitted with the score; matches the game doc's JSON Schema §5. */
export interface SimonRaw {
  level: number;
  avg_gap_ms: number | null;
  taps: number;
  ended: SimonEnded;
}

const ALLOWED_LEVELS = new Set<number>([0, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
const ALLOWED_ENDED = new Set<SimonEnded>(['mistake', 'timeout', 'cap', 'won']);

/**
 * Total taps a player makes to reach `level` legitimately: `level` taps for
 * every completed sequence length 3..level (each tap advances one step),
 * i.e. sum_{k=3}^{level} k = level(level+1)/2 - 3. 0 when level is 0.
 */
export function totalTapsForLevel(level: number): number {
  if (level < SIMON_START_LEVEL) return 0;
  return (level * (level + 1)) / 2 - 3;
}

/**
 * The `raw` object for a finished Simon turn (§5): the longest completed
 * length, the mean tap gap over every completed sequence (null below
 * length 3 or without gaps), the tap count a legitimate run makes (plus the
 * one wrong tap on a mistake), and why it ended.
 */
export function buildRaw(completedLevel: number, gaps: readonly number[], ended: SimonEnded): SimonRaw {
  const level = completedLevel;
  const avgGapMs =
    level >= SIMON_START_LEVEL && gaps.length > 0 ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : null;
  const taps = totalTapsForLevel(level) + (ended === 'mistake' ? 1 : 0);
  return { level, avg_gap_ms: avgGapMs, taps, ended };
}

/** Time bonus B = round(40 x clamp((1200 - g) / 950, 0, 1)) when level >= 3, else 0 (§4). */
export function timeBonus(level: number, avgGapMs: number | null): number {
  if (level < SIMON_START_LEVEL || avgGapMs === null) return 0;
  const clamped = Math.min(1, Math.max(0, (1200 - avgGapMs) / 950));
  return Math.round(40 * clamped);
}

/**
 * score = 64 x L + B, clamped to [0, 1000].
 *
 * This is the value computed on the phone; the server independently rejects
 * (but never recomputes) values outside docs/SCORING.md §4's bounds.
 */
export function scoreSimon(raw: unknown): number {
  const { level, avg_gap_ms: avgGapMs } = raw as SimonRaw;
  const bonus = timeBonus(level, avgGapMs);
  const score = 64 * level + bonus;
  return Math.min(1000, Math.max(0, Math.round(score)));
}

/** Reason codes from docs/SCORING.md §4's Simon row, in check order. */
export type SimonRejectReason =
  | 'simon.shape'
  | 'simon.level'
  | 'simon.zero'
  | 'simon.gap'
  | 'simon.formula_band'
  | 'simon.won'
  | 'simon.too_fast';

function isShapeValid(raw: unknown): raw is SimonRaw {
  if (typeof raw !== 'object' || raw === null) return false;
  const candidate = raw as Record<string, unknown>;
  if (!Number.isInteger(candidate.level)) return false;
  const gap = candidate.avg_gap_ms;
  if (gap !== null && (!Number.isInteger(gap) || (gap as number) < 0 || (gap as number) > 5000)) {
    return false;
  }
  const taps = candidate.taps;
  if (!Number.isInteger(taps) || (taps as number) < 0 || (taps as number) > 200) return false;
  if (!ALLOWED_ENDED.has(candidate.ended as SimonEnded)) return false;
  return true;
}

/**
 * Mirrors the server's rejection bounds (docs/SCORING.md §4) for tests and
 * for instant client-side UX feedback; the server remains authoritative and
 * never recomputes the score. Returns the first violated reason code, or
 * null if `raw`/`score`/`durationMs` would be accepted.
 */
export function validateSimonRaw(raw: unknown, score: number, durationMs: number): SimonRejectReason | null {
  if (!isShapeValid(raw)) {
    return 'simon.shape';
  }
  if (!ALLOWED_LEVELS.has(raw.level)) {
    return 'simon.level';
  }
  if (raw.level === 0 && score !== 0) {
    return 'simon.zero';
  }
  if (raw.level >= SIMON_START_LEVEL) {
    if (raw.avg_gap_ms === null || raw.avg_gap_ms < 120) {
      return 'simon.gap';
    }
    const band = score - 64 * raw.level;
    if (band < 0 || band > 40) {
      return 'simon.formula_band';
    }
  }
  const isWon = raw.ended === 'won';
  if (isWon !== (raw.level === SIMON_MAX_LEVEL)) {
    return 'simon.won';
  }
  if (durationMs < minPlaybackMs(raw.level)) {
    return 'simon.too_fast';
  }
  return null;
}

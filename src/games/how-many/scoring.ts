/**
 * Pure scoring for How Many?. Source of truth: docs/SCORING.md §3.8,
 * docs/games/how-many.md §4-5. No DOM, time or randomness.
 */

/** Flashes per round. */
export const HM_FLASHES = 3;

/** True-count band per flash, inclusive; every integer in it can be drawn (field.ts, ADR-138). */
export const HM_BANDS: ReadonlyArray<readonly [number, number]> = [
  [4, 7],
  [9, 13],
  [14, 18],
];

/** Dead zone: within 5 % of the true count = full marks. */
export const HM_D = 0.05;

/** W_i: the relative error that scores 0, per flash (widens with the count, Weber's law). */
export const HM_W: readonly number[] = [0.3, 0.4, 0.5];

/** Per-answer timeout, from the end of the flash window (ADR-138: was 10 s). */
export const HM_ANSWER_MS = 15_000;

/** A non-timed-out answer needs a digit and OK after the pad appears (hm.too_fast). */
export const HM_MIN_ANSWER_MS = 300;

/** The pad takes at most 3 digits. */
export const HM_MAX_DIGITS = 3;
export const HM_MAX_GUESS = 999;

/** One flash in the `raw` evidence object (docs/games/how-many.md §5). */
export interface HowManyRound {
  true_count: number;
  /** The typed number; null = nothing typed (then timed_out is true). */
  guess: number | null;
  /** Pad shown -> OK tap, ms; null iff timed_out. */
  answer_ms: number | null;
  timed_out: boolean;
}

/** The `raw` evidence object submitted with the score; matches the game doc's JSON Schema §5. */
export interface HowManyRaw {
  rounds: HowManyRound[];
}

/** Builds the raw payload from the three flashes, in order. */
export function buildRaw(rounds: readonly HowManyRound[]): HowManyRaw {
  return {
    rounds: rounds.map((r) => ({ true_count: r.true_count, guess: r.guess, answer_ms: r.answer_ms, timed_out: r.timed_out })),
  };
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/** s_i = clamp(1 - max(0, rel_i - D) / (W_i - D), 0, 1); 0 for a null guess. */
export function flashScore(round: HowManyRound, index: number): number {
  if (round.guess === null) return 0;
  const rel = Math.abs(round.guess - round.true_count) / round.true_count;
  const w = HM_W[index];
  return clamp(1 - Math.max(0, rel - HM_D) / (w - HM_D), 0, 1);
}

/**
 * score = clamp(round(1000 x (s_1 + s_2 + s_3) / 3), 0, 1000).
 *
 * Computed on the phone; the server only rejects values outside
 * docs/SCORING.md §4's bounds and never recomputes.
 */
export function scoreHowMany(raw: unknown): number {
  const r = raw as HowManyRaw;
  let sum = 0;
  for (let i = 0; i < HM_FLASHES; i++) {
    const round = r.rounds[i];
    if (round) sum += flashScore(round, i);
  }
  const score = Math.round((1000 * sum) / HM_FLASHES);
  return Math.min(1000, Math.max(0, score));
}

/** Reason codes from docs/SCORING.md §4's How Many? row, in check order. */
export type HowManyRejectReason =
  | 'hm.shape'
  | 'hm.range'
  | 'hm.timeout'
  | 'hm.too_fast'
  | 'hm.formula_band';

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isIntOrNull = (o: Record<string, unknown>, k: string) => k in o && (o[k] === null || isInt(o[k]));

/**
 * Mirrors the server's rejection bounds (docs/SCORING.md §4) for tests; the
 * server remains authoritative. Returns the first violated reason, or null.
 * Three exact guesses are normal play since ADR-138 (no `hm.too_perfect`).
 * Only the current bands pass here; during the rollout the server also
 * accepts the pre-ADR-138 bands (migration 20260926000100).
 */
export function validateHowManyRaw(raw: unknown, score: number): HowManyRejectReason | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return 'hm.shape';
  const rounds = (raw as Record<string, unknown>).rounds;
  if (!Array.isArray(rounds) || rounds.length !== HM_FLASHES) return 'hm.shape';
  for (const e of rounds) {
    if (typeof e !== 'object' || e === null || Array.isArray(e)) return 'hm.shape';
    const o = e as Record<string, unknown>;
    if (!isInt(o.true_count) || !isIntOrNull(o, 'guess') || !isIntOrNull(o, 'answer_ms') || typeof o.timed_out !== 'boolean') {
      return 'hm.shape';
    }
  }
  const rs = rounds as HowManyRound[];
  for (let i = 0; i < HM_FLASHES; i++) {
    const { true_count: n, guess: g, answer_ms: a } = rs[i];
    const [lo, hi] = HM_BANDS[i];
    if (n < lo || n > hi || (g !== null && (g < 0 || g > HM_MAX_GUESS)) || (a !== null && (a < 0 || a > HM_ANSWER_MS))) {
      return 'hm.range';
    }
  }
  for (const r of rs) {
    if ((r.answer_ms === null) !== r.timed_out) return 'hm.timeout';
    if (r.guess === null && !r.timed_out) return 'hm.timeout';
  }
  for (const r of rs) {
    if (!r.timed_out && (r.answer_ms as number) < HM_MIN_ANSWER_MS) return 'hm.too_fast';
  }
  let sum = 0;
  for (let i = 0; i < HM_FLASHES; i++) sum += flashScore(rs[i], i);
  if (score > Math.round((1000 * sum) / HM_FLASHES) + 1) return 'hm.formula_band';
  return null;
}

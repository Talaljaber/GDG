/**
 * Pure scoring for Perfect Circle. Source of truth: docs/SCORING.md §3.4 and
 * §4, docs/games/perfect-circle.md §4-6. No DOM, time or randomness.
 *
 * The geometry (resampling, ε, sweep) lives in ./metric.ts; this file turns
 * one evaluated stroke into the submitted `raw` and the 0-1000 score.
 */
import {
  PC_MAX_STROKE_MS,
  PC_MAX_SWEEP_DEG,
  PC_MIN_STROKE_MS,
  PC_MIN_SWEEP_DEG,
  scoreFromMetrics,
  type ValidEvaluation,
} from './metric';

/** Invalid strokes that don't use up the attempt (§1); the next invalid one ends it. */
export const PC_FREE_INVALID_STROKES = 3;

/** The invalid stroke that ends the attempt with score 0 (`timed_out = true`). */
export const PC_MAX_INVALID_STROKES = PC_FREE_INVALID_STROKES + 1;

/** Whole-attempt timeout, from the canvas appearing (§1). */
export const PC_ATTEMPT_TIMEOUT_MS = 30_000;

/** The server-enforced score ceiling (SCORING §4 `pc.score_above_975`). */
export const PC_MAX_ACCEPTED_SCORE = 975;

/** ε below this is rejected as scripted (SCORING §4 `pc.too_perfect`). */
export const PC_MIN_ACCEPTED_EPSILON = 0.005;

/**
 * The `raw` evidence object; matches the JSON Schema in
 * docs/games/perfect-circle.md §6 exactly (all six keys always present).
 */
export interface PerfectCircleRaw {
  epsilon: number | null;
  sweep_deg: number | null;
  diameter_px: number | null;
  stroke_ms: number | null;
  invalid_strokes: number;
  timed_out: boolean;
}

/** Builds the raw payload from the one valid (scored) stroke. */
export function buildRaw(evaluation: ValidEvaluation, strokeMs: number, invalidStrokes: number): PerfectCircleRaw;
/** Builds the raw payload for an attempt that timed out or ended on the 4th invalid stroke. */
export function buildRaw(evaluation: null, strokeMs: null, invalidStrokes: number): PerfectCircleRaw;
export function buildRaw(
  evaluation: ValidEvaluation | null,
  strokeMs: number | null,
  invalidStrokes: number,
): PerfectCircleRaw {
  const invalid = Math.max(0, Math.min(PC_MAX_INVALID_STROKES, Math.trunc(invalidStrokes)));
  if (evaluation === null || strokeMs === null) {
    return {
      epsilon: null,
      sweep_deg: null,
      diameter_px: null,
      stroke_ms: null,
      invalid_strokes: invalid,
      timed_out: true,
    };
  }
  return {
    // Unrounded, so scorePerfectCircle(raw) reproduces the stroke's score exactly.
    epsilon: evaluation.epsilon,
    sweep_deg: evaluation.sweepDeg,
    diameter_px: evaluation.diameterPx,
    stroke_ms: Math.max(0, Math.min(PC_MAX_STROKE_MS, Math.round(strokeMs))),
    invalid_strokes: Math.min(PC_FREE_INVALID_STROKES, invalid),
    timed_out: false,
  };
}

/**
 * score = round(1000 × R × C) from the raw's ε and sweep; 0 when timed out
 * (or if the metric fields are missing). Clamped to [0, 1000].
 *
 * This is the value computed on the phone; the server independently rejects
 * (never recomputes) values outside SCORING §4, e.g. a scripted perfect 1000.
 */
export function scorePerfectCircle(raw: unknown): number {
  const r = raw as PerfectCircleRaw;
  if (r.timed_out || r.epsilon === null || r.sweep_deg === null) return 0;
  return scoreFromMetrics(r.epsilon, r.sweep_deg);
}

/** Reason codes from docs/SCORING.md §4's Perfect Circle row, in check order. */
export type PcRejectReason =
  | 'pc.shape'
  | 'pc.invalid'
  | 'pc.timeout'
  | 'pc.too_perfect'
  | 'pc.sweep'
  | 'pc.stroke_ms'
  | 'pc.score_above_975';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isInteger(value: unknown): value is number {
  return isFiniteNumber(value) && Number.isInteger(value) && Math.abs(value) <= 2147483647;
}

function hasNumOrNull(o: Record<string, unknown>, key: string): boolean {
  return key in o && (o[key] === null || isFiniteNumber(o[key]));
}

function hasIntOrNull(o: Record<string, unknown>, key: string): boolean {
  return key in o && (o[key] === null || isInteger(o[key]));
}

/**
 * Mirrors the server's rejection bounds (docs/SCORING.md §4, implemented by
 * `score_bounds_violation` in supabase/migrations/…_score_trigger.sql) for
 * tests and instant client feedback. The server stays authoritative. Returns
 * the first violated reason code, or null if `raw`/`score` would be accepted.
 */
export function validatePerfectCircleRaw(raw: unknown, score: number): PcRejectReason | null {
  if (!isObject(raw)) return 'pc.shape';
  if (
    !hasNumOrNull(raw, 'epsilon') ||
    !hasNumOrNull(raw, 'sweep_deg') ||
    !hasNumOrNull(raw, 'diameter_px') ||
    !hasIntOrNull(raw, 'stroke_ms') ||
    !isInteger(raw.invalid_strokes) ||
    typeof raw.timed_out !== 'boolean'
  ) {
    return 'pc.shape';
  }
  const invalid = raw.invalid_strokes as number;
  const timedOut = raw.timed_out;
  const epsilon = raw.epsilon as number | null;
  const sweep = raw.sweep_deg as number | null;
  const strokeMs = raw.stroke_ms as number | null;

  if (invalid < 0 || invalid > PC_MAX_INVALID_STROKES || (!timedOut && invalid > PC_FREE_INVALID_STROKES)) {
    return 'pc.invalid';
  }
  if (timedOut) {
    return score !== 0 ? 'pc.timeout' : null;
  }
  if (epsilon === null || epsilon < PC_MIN_ACCEPTED_EPSILON) return 'pc.too_perfect';
  if (sweep === null || sweep < PC_MIN_SWEEP_DEG || sweep > PC_MAX_SWEEP_DEG) return 'pc.sweep';
  if (strokeMs === null || strokeMs < PC_MIN_STROKE_MS || strokeMs > PC_MAX_STROKE_MS) return 'pc.stroke_ms';
  if (score > PC_MAX_ACCEPTED_SCORE) return 'pc.score_above_975';
  return null;
}

/**
 * The Perfect Circle roundness and closure metric. Source of truth:
 * docs/games/perfect-circle.md §3-4 and docs/SCORING.md §3.4.
 *
 * Pure: no DOM, time or randomness. Coordinates are CSS pixels relative to
 * the canvas; the canvas side `S` only matters for the minimum-size rule (V2).
 */

export interface Point {
  x: number;
  y: number;
}

/** Samples used for every geometric measurement (§4 step 1). */
export const PC_RESAMPLE_POINTS = 64;
/** V1: at least this many raw points... */
export const PC_MIN_RAW_POINTS = 20;
/** ...and a stroke at least this long, in ms. */
export const PC_MIN_STROKE_MS = 300;
/** A single stroke is cut off here (§1). */
export const PC_MAX_STROKE_MS = 10_000;
/** V2: the diameter floor in CSS px, and as a fraction of the canvas side. */
export const PC_MIN_DIAMETER_PX = 100;
export const PC_MIN_DIAMETER_FRACTION = 0.35;
/** V3 / V4: allowed swept angle around the centroid, in degrees. */
export const PC_MIN_SWEEP_DEG = 300;
export const PC_MAX_SWEEP_DEG = 450;
/** ε at which roundness reaches 0 (radius varies ±20 %). */
export const PC_EPSILON_ZERO = 0.2;
/** The canvas is never smaller than this (§9). */
export const PC_MIN_CANVAS_PX = 280;
/** Horizontal gutter and height fraction in S = min(vw − 32, vh × 0.6) (§3). */
export const PC_CANVAS_GUTTER_PX = 32;
export const PC_CANVAS_HEIGHT_FRACTION = 0.6;

/** Why a stroke was rejected, in check order V1-V4. Maps to `game.perfect_circle.hint.<reason>`. */
export type InvalidReason = 'short' | 'small' | 'open' | 'loops';

interface EvaluationCommon {
  /** Roundness error ε = σ_r / r̄ (population σ), over the first 360° swept. */
  epsilon: number;
  /** Unwrapped swept angle around the centroid of the whole stroke, degrees. */
  sweepDeg: number;
  /** 2 r̄ in CSS px, over the first 360° swept. */
  diameterPx: number;
  /** R = clamp(1 − ε / 0.20, 0, 1). */
  roundness: number;
  /** C = min(sweep, 360) / 360. */
  closure: number;
  /** Best-fit reference circle (centroid and mean radius of the measured samples). */
  center: Point;
  radius: number;
}

export interface ValidEvaluation extends EvaluationCommon {
  valid: true;
  /** round(1000 × R × C), clamped to [0, 1000]. */
  score: number;
}

export interface InvalidEvaluation extends EvaluationCommon {
  valid: false;
  reason: InvalidReason;
  /** An invalid stroke never scores. */
  score: 0;
}

export type StrokeEvaluation = ValidEvaluation | InvalidEvaluation;

const TWO_PI = 2 * Math.PI;
const DEG_PER_RAD = 180 / Math.PI;

/** S = min(vw − 32, vh × 0.6), floored at 280 CSS px (§3, §9). */
export function canvasSide(viewportWidth: number, viewportHeight: number): number {
  const side = Math.min(viewportWidth - PC_CANVAS_GUTTER_PX, viewportHeight * PC_CANVAS_HEIGHT_FRACTION);
  return Math.max(PC_MIN_CANVAS_PX, Math.floor(side));
}

/** V2's threshold for a canvas of side `S`: max(100, 0.35 × S). */
export function minDiameterPx(side: number): number {
  return Math.max(PC_MIN_DIAMETER_PX, PC_MIN_DIAMETER_FRACTION * side);
}

export function roundnessFromEpsilon(epsilon: number): number {
  return Math.min(1, Math.max(0, 1 - epsilon / PC_EPSILON_ZERO));
}

export function closureFromSweep(sweepDeg: number): number {
  return Math.min(Math.max(sweepDeg, 0), 360) / 360;
}

/** score = round(1000 × R × C), rounded once and clamped (SCORING §1.3, §3.4). */
export function scoreFromMetrics(epsilon: number, sweepDeg: number): number {
  const score = Math.round(1000 * roundnessFromEpsilon(epsilon) * closureFromSweep(sweepDeg));
  return Math.min(1000, Math.max(0, score));
}

function dist(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * Resamples a polyline to `n` points equally spaced by arc length, at the
 * midpoints of `n` equal arc-length intervals: sample k sits at arc length
 * (k + ½) · L / n. Each sample stands for exactly 1/n of the stroke, so the
 * mean of the samples is the stroke's arc-length centroid and a closed
 * stroke's start point is not counted twice (which would pull the centroid
 * by r / n and give a perfect circle ε ≈ 0.011; see PC-T1).
 */
export function resample(points: readonly Point[], n: number = PC_RESAMPLE_POINTS): Point[] {
  if (points.length === 0) return [];
  const cumulative = [0];
  for (let i = 1; i < points.length; i++) {
    cumulative.push(cumulative[i - 1] + dist(points[i - 1], points[i]));
  }
  const total = cumulative[cumulative.length - 1];
  if (points.length === 1 || total === 0) {
    return Array.from({ length: n }, () => ({ x: points[0].x, y: points[0].y }));
  }
  const out: Point[] = [];
  let seg = 1;
  for (let k = 0; k < n; k++) {
    const target = ((k + 0.5) * total) / n;
    while (seg < points.length - 1 && cumulative[seg] < target) seg++;
    const segLen = cumulative[seg] - cumulative[seg - 1];
    const t = segLen > 0 ? (target - cumulative[seg - 1]) / segLen : 0;
    const a = points[seg - 1];
    const b = points[seg];
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  return out;
}

/** The samples framed by the stroke's true endpoints, for measuring the sweep end to end. */
function withEndpoints(points: readonly Point[], samples: readonly Point[]): Point[] {
  return [points[0], ...samples, points[points.length - 1]];
}

export function centroid(points: readonly Point[]): Point {
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  return { x: x / points.length, y: y / points.length };
}

/** Angle step from a to b, wrapped into (−π, π]. */
function wrapAngle(delta: number): number {
  let d = delta;
  while (d > Math.PI) d -= TWO_PI;
  while (d <= -Math.PI) d += TWO_PI;
  return d;
}

/** Signed, unwrapped angle (radians) swept along `points` around `c`. */
export function unwrappedSweep(points: readonly Point[], c: Point): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = Math.atan2(points[i - 1].y - c.y, points[i - 1].x - c.x);
    const b = Math.atan2(points[i].y - c.y, points[i].x - c.x);
    total += wrapAngle(b - a);
  }
  return total;
}

/**
 * §4 step 4: the raw stroke cut where it has swept 360° around `c`. The cut
 * point is where the segment crosses the ray from `c` through the first
 * point, so the trimmed stroke closes exactly. Returns the stroke unchanged
 * if it never reaches 360°.
 */
export function trimAtFullTurn(points: readonly Point[], c: Point): Point[] {
  const start = points[0];
  const ux = start.x - c.x;
  const uy = start.y - c.y;
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    total += wrapAngle(Math.atan2(b.y - c.y, b.x - c.x) - Math.atan2(a.y - c.y, a.x - c.x));
    if (Math.abs(total) >= TWO_PI) {
      // Solve cross((a + t(b − a)) − c, u) = 0 for t.
      const ax = a.x - c.x;
      const ay = a.y - c.y;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const denom = dx * uy - dy * ux;
      const t = denom !== 0 ? Math.min(1, Math.max(0, -(ax * uy - ay * ux) / denom)) : 1;
      return [...points.slice(0, i), { x: a.x + dx * t, y: a.y + dy * t }];
    }
  }
  return points.slice();
}

/** Mean radius and population standard deviation of the radii around `c`. */
export function radiusStats(points: readonly Point[], c: Point): { mean: number; sd: number } {
  const radii = points.map((p) => dist(p, c));
  const mean = radii.reduce((s, r) => s + r, 0) / radii.length;
  const variance = radii.reduce((s, r) => s + (r - mean) ** 2, 0) / radii.length;
  return { mean, sd: Math.sqrt(variance) };
}

/**
 * Evaluates one stroke per §3-4: resample, centroid, unwrapped sweep, trim at
 * 360° and recompute, radii, ε, R, C, score; then validity V1-V4 in order.
 *
 * @param points raw pointer positions in CSS px relative to the canvas
 * @param strokeMs pointerdown -> pointerup (or the 10 s cut)
 * @param side the canvas side S in CSS px (V2)
 */
export function evaluateStroke(points: readonly Point[], strokeMs: number, side: number): StrokeEvaluation {
  let epsilon = 0;
  let sweepDeg = 0;
  let center: Point = points.length > 0 ? { x: points[0].x, y: points[0].y } : { x: 0, y: 0 };
  let radius = 0;

  if (points.length >= 2) {
    const samples = resample(points);
    const c = centroid(samples);
    // §4 step 3: unwrap along the samples, framed by the stroke's own first
    // and last points so the sweep runs end to end (a perfect closed circle
    // sweeps exactly 360°, not 360° × 63/64).
    sweepDeg =Math.abs(unwrappedSweep(withEndpoints(points, samples), c)) * DEG_PER_RAD;

    let measured = samples;
    center = c;
    if (sweepDeg > 360) {
      measured = resample(trimAtFullTurn(points, c));
      center = centroid(measured);
    }
    const { mean, sd } = radiusStats(measured, center);
    radius = mean;
    // A degenerate (zero-size) stroke has no defined ε; V2 rejects it anyway.
    epsilon = mean > 0 ? sd / mean : 0;
  }

  const diameterPx = 2 * radius;
  const common: EvaluationCommon = {
    epsilon,
    sweepDeg,
    diameterPx,
    roundness: roundnessFromEpsilon(epsilon),
    closure: closureFromSweep(sweepDeg),
    center,
    radius,
  };

  let reason: InvalidReason | null = null;
  if (points.length < PC_MIN_RAW_POINTS || strokeMs < PC_MIN_STROKE_MS) reason = 'short';
  else if (diameterPx < minDiameterPx(side)) reason = 'small';
  else if (sweepDeg < PC_MIN_SWEEP_DEG) reason = 'open';
  else if (sweepDeg > PC_MAX_SWEEP_DEG) reason = 'loops';

  if (reason !== null) {
    return { ...common, valid: false, reason, score: 0 };
  }
  return { ...common, valid: true, score: scoreFromMetrics(epsilon, sweepDeg) };
}

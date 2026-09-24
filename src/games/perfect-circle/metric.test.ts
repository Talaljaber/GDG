import { describe, expect, it } from 'vitest';
import { Rng } from '../../lib/rng';
import {
  canvasSide,
  centroid,
  evaluateStroke,
  minDiameterPx,
  resample,
  scoreFromMetrics,
  trimAtFullTurn,
  unwrappedSweep,
  type Point,
  type StrokeEvaluation,
} from './metric';
import { buildRaw, scorePerfectCircle, validatePerfectCircleRaw } from './scoring';

/** A 360 px wide phone: S = min(360 − 32, vh × 0.6) = 328 for any normal portrait height. */
const S = 328;
const CX = 164;
const CY = 164;
const MS = 2000;
const DEG = Math.PI / 180;

/**
 * `n` points along a polar curve r(θ) from θ = 0 to θ = spanDeg, both ends
 * included (so a 360° span closes exactly on its first point).
 */
function polarStroke(spanDeg: number, n: number, r: (theta: number) => number, cx = CX, cy = CY): Point[] {
  return Array.from({ length: n }, (_, k) => {
    const theta = (spanDeg * DEG * k) / (n - 1);
    const radius = r(theta);
    return { x: cx + radius * Math.cos(theta), y: cy + radius * Math.sin(theta) };
  });
}

function circle(radius: number, spanDeg = 360, n = 200): Point[] {
  return polarStroke(spanDeg, n, () => radius);
}

function ellipse(a: number, b: number, n = 200): Point[] {
  return Array.from({ length: n }, (_, k) => {
    const t = (2 * Math.PI * k) / (n - 1);
    return { x: CX + a * Math.cos(t), y: CY + b * Math.sin(t) };
  });
}

/** Circle r = 100 with independent uniform radius noise ±6 % per raw point (seeded). */
function noisyCircle(seed: string): Point[] {
  const rng = new Rng(seed);
  return polarStroke(360, 200, () => 100 * (1 + (rng.float() * 2 - 1) * 0.06));
}

/**
 * A circular arc (r = 100) whose sweep *around its own centroid* is
 * `targetDeg`, found by bisection on the geometric span. See the PC-T4/T5
 * note below for why this differs from the geometric span.
 */
function arcWithCentroidSweep(targetDeg: number): { points: Point[]; spanDeg: number } {
  let lo = 200;
  let hi = 360;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const sweep = evaluateStroke(circle(100, mid), MS, S).sweepDeg;
    if (sweep < targetDeg) lo = mid;
    else hi = mid;
  }
  const spanDeg = (lo + hi) / 2;
  return { points: circle(100, spanDeg), spanDeg };
}

function expectValid(e: StrokeEvaluation): asserts e is Extract<StrokeEvaluation, { valid: true }> {
  expect(e.valid).toBe(true);
}

describe('canvas geometry (§3, §9)', () => {
  it('S = min(vw − 32, vh × 0.6), floored at 280', () => {
    expect(canvasSide(360, 740)).toBe(328);
    expect(canvasSide(320, 568)).toBe(288); // §9: "on a 320 px phone S = 288"
    expect(canvasSide(414, 500)).toBe(300); // height-bound
    expect(canvasSide(300, 400)).toBe(280); // floor
  });

  it('V2 threshold is max(100, 0.35 × S)', () => {
    expect(minDiameterPx(200)).toBe(100);
    expect(minDiameterPx(S)).toBeCloseTo(114.8, 6);
  });
});

describe('resampling and sweep building blocks (§4 steps 1-4)', () => {
  it('resamples to 64 points equally spaced by arc length', () => {
    const line: Point[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 64, y: 0 },
    ];
    const samples = resample(line);
    expect(samples).toHaveLength(64);
    for (let k = 1; k < 64; k++) {
      expect(samples[k].x - samples[k - 1].x).toBeCloseTo(1, 9);
    }
    // Midpoint rule: every sample stands for 1/64 of the stroke.
    expect(samples[0].x).toBeCloseTo(0.5, 9);
    expect(samples[63].x).toBeCloseTo(63.5, 9);
  });

  it('a closed circle does not double-count its start point: centroid = true centre', () => {
    const c = centroid(resample(circle(100)));
    expect(c.x).toBeCloseTo(CX, 2);
    expect(c.y).toBeCloseTo(CY, 2);
  });

  it('unwraps the angle past ±180°', () => {
    const pts = circle(100, 540, 300);
    expect(Math.abs(unwrappedSweep(pts, { x: CX, y: CY })) / DEG).toBeCloseTo(540, 6);
  });

  it('trims a 540° stroke exactly where it reaches 360°', () => {
    const pts = circle(100, 540, 301);
    const trimmed = trimAtFullTurn(pts, { x: CX, y: CY });
    const last = trimmed[trimmed.length - 1];
    expect(last.x).toBeCloseTo(CX + 100, 6);
    expect(last.y).toBeCloseTo(CY, 6);
    expect(trimmed.length).toBeLessThan(pts.length);
  });

  it('matches the §5 worked examples through scoreFromMetrics', () => {
    expect(scoreFromMetrics(0.03, 358)).toBe(845);
    expect(scoreFromMetrics(0.065, 345)).toBe(647);
    expect(scoreFromMetrics(0.12, 360)).toBe(400);
    expect(scoreFromMetrics(0.04, 305)).toBe(678);
    expect(scoreFromMetrics(0.21, 360)).toBe(0);
    expect(scoreFromMetrics(0, 360)).toBe(1000);
  });
});

describe('game doc test cases (docs/games/perfect-circle.md §11)', () => {
  it('PC-T1: perfect circle r = 100, 360°, 200 points -> ε < 0.001, score 1000, server rejects pc.too_perfect', () => {
    const e = evaluateStroke(circle(100), MS, S);
    expectValid(e);
    expect(e.epsilon).toBeLessThan(0.001);
    expect(e.sweepDeg).toBeCloseTo(360, 6);
    expect(e.diameterPx).toBeCloseTo(200, 1);
    expect(e.score).toBe(1000);
    const raw = buildRaw(e, MS, 0);
    expect(scorePerfectCircle(raw)).toBe(1000);
    expect(validatePerfectCircleRaw(raw, 1000)).toBe('pc.too_perfect');
  });

  it('PC-T2: radius noise ±6 % uniform -> ε ≈ 0.035 ± 0.01, score 800-860 (mean over 50 seeded strokes)', () => {
    // σ of U(−6 %, +6 %) is 6 % / √3 = 3.46 %, so ε ≈ 0.035 on average.
    // Individual seeded strokes spread ε ≈ 0.024-0.052 (scores ≈ 740-880),
    // so the doc's expectation is asserted on the mean of 50 strokes, and
    // each single stroke is only asserted to be valid and in a looser band.
    let epsSum = 0;
    let scoreSum = 0;
    for (let i = 0; i < 50; i++) {
      const e = evaluateStroke(noisyCircle(`pc-t2-${i}`), MS, S);
      expectValid(e);
      expect(e.epsilon).toBeGreaterThan(0.015);
      expect(e.epsilon).toBeLessThan(0.06);
      epsSum += e.epsilon;
      scoreSum += e.score;
    }
    const meanEps = epsSum / 50;
    const meanScore = scoreSum / 50;
    expect(meanEps).toBeGreaterThanOrEqual(0.025);
    expect(meanEps).toBeLessThanOrEqual(0.045);
    expect(meanScore).toBeGreaterThanOrEqual(800);
    expect(meanScore).toBeLessThanOrEqual(860);
  });

  it('PC-T3: ellipse a = 120, b = 80 -> ε ≈ 0.14, score 260-340', () => {
    const e = evaluateStroke(ellipse(120, 80), MS, S);
    expectValid(e);
    expect(e.epsilon).toBeCloseTo(0.14, 2); // measured 0.1412
    expect(e.score).toBeGreaterThanOrEqual(260);
    expect(e.score).toBeLessThanOrEqual(340); // measured 294
  });

  // PC-T4 / PC-T5 note: the sweep is measured around the stroke's centroid,
  // and an open arc's centroid sits off the circle's centre, towards the
  // arc's middle. So a *geometric* 300° arc sweeps ≈ 309.4° around its
  // centroid (C ≈ 0.859, not 0.8333), and a geometric 290° arc sweeps ≈ 302.5°
  // and is VALID. The V3 boundary (300° around the centroid) is a geometric
  // arc of ≈ 286.2°. The doc's expectations hold for arcs whose sweep around
  // their centroid is 300° / 290°, which is what these two tests construct.
  it('PC-T4: 300° arc (around its centroid) -> valid, C = 0.8333', () => {
    const { points } = arcWithCentroidSweep(300.001);
    const e = evaluateStroke(points, MS, S);
    expectValid(e);
    expect(e.sweepDeg).toBeCloseTo(300, 2);
    expect(e.closure).toBeCloseTo(0.8333, 4);
  });

  it('PC-T5: 290° arc (around its centroid) -> invalid V3 (open)', () => {
    const { points } = arcWithCentroidSweep(290);
    const e = evaluateStroke(points, MS, S);
    expect(e.valid).toBe(false);
    expect(e.valid === false && e.reason).toBe('open');
  });

  it('PC-T4/T5 geometry: geometric 300° and 290° arcs sweep ≈ 309° and ≈ 302.5° around the centroid (both valid)', () => {
    const a300 = evaluateStroke(circle(100, 300), MS, S);
    const a290 = evaluateStroke(circle(100, 290), MS, S);
    expect(a300.sweepDeg).toBeCloseTo(309.4, 0);
    expect(a290.sweepDeg).toBeCloseTo(302.5, 0);
    expect(a300.valid).toBe(true);
    expect(a290.valid).toBe(true);
    expect(arcWithCentroidSweep(300).spanDeg).toBeCloseTo(286.2, 0);
    // The off-centre centroid also costs roundness: a real open arc has ε ≈ 0.12-0.15.
    expect(a300.epsilon).toBeGreaterThan(0.1);
  });

  it('PC-T6: 460° spiral -> invalid V4 (loops)', () => {
    const span = 460 * DEG;
    const pts = polarStroke(460, 300, (theta) => 80 + (40 * theta) / span);
    const e = evaluateStroke(pts, MS, S);
    expect(e.valid).toBe(false);
    expect(e.valid === false && e.reason).toBe('loops');
    expect(e.sweepDeg).toBeGreaterThan(450);
  });

  it('PC-T7: diameter 90 px on a 360 px phone (S = 328) -> invalid V2 (small)', () => {
    expect(canvasSide(360, 740)).toBe(S);
    const e = evaluateStroke(circle(45), MS, S);
    expect(e.diameterPx).toBeCloseTo(90, 1);
    expect(e.valid).toBe(false);
    expect(e.valid === false && e.reason).toBe('small');
  });

  it('PC-T8: 1.5 loops (540°) -> invalid V4 (loops)', () => {
    const e = evaluateStroke(circle(100, 540, 300), MS, S);
    expect(e.valid).toBe(false);
    expect(e.valid === false && e.reason).toBe('loops');
    // The overlapping tail is trimmed before measuring the shape.
    expect(e.epsilon).toBeLessThan(0.001);
    expect(e.diameterPx).toBeCloseTo(200, 0);
  });

  it('PC-T9: 4 invalid strokes -> score 0, timed_out = true, accepted', () => {
    const raw = buildRaw(null, null, 4);
    expect(raw).toEqual({
      epsilon: null,
      sweep_deg: null,
      diameter_px: null,
      stroke_ms: null,
      invalid_strokes: 4,
      timed_out: true,
    });
    const score = scorePerfectCircle(raw);
    expect(score).toBe(0);
    expect(validatePerfectCircleRaw(raw, score)).toBeNull();
  });

  it('PC-T10: the same stroke scaled ×2 -> same score (scale-free)', () => {
    const base = polarStroke(360, 200, (theta) => 100 * (1 + 0.05 * Math.cos(3 * theta)));
    const doubled = base.map((p) => ({ x: p.x * 2, y: p.y * 2 }));
    const a = evaluateStroke(base, MS, S);
    const b = evaluateStroke(doubled, MS, 2 * S);
    expectValid(a);
    expectValid(b);
    expect(b.epsilon).toBeCloseTo(a.epsilon, 12);
    expect(b.sweepDeg).toBeCloseTo(a.sweepDeg, 9);
    expect(b.diameterPx).toBeCloseTo(2 * a.diameterPx, 9);
    expect(b.score).toBe(a.score);
  });
});

describe('validity rules V1-V4 (§3), checked in order', () => {
  it('V1: fewer than 20 raw points -> short', () => {
    const e = evaluateStroke(circle(100, 360, 19), MS, S);
    expect(e.valid === false && e.reason).toBe('short');
  });

  it('V1: stroke_ms < 300 -> short (even for a big round circle)', () => {
    const e = evaluateStroke(circle(100), 299, S);
    expect(e.valid === false && e.reason).toBe('short');
    expect(evaluateStroke(circle(100), 300, S).valid).toBe(true);
  });

  it('V1 wins over V2-V4 (a tiny, short, open scribble reports short)', () => {
    const e = evaluateStroke(circle(10, 90, 10), 100, S);
    expect(e.valid === false && e.reason).toBe('short');
  });

  it('V2 wins over V3 (a small open arc reports small)', () => {
    const e = evaluateStroke(circle(30, 200), MS, S);
    expect(e.valid === false && e.reason).toBe('small');
  });

  it('V2 at the boundary: diameter just above / below max(100, 0.35 × S)', () => {
    expect(evaluateStroke(circle(57.5), MS, S).valid).toBe(true); // 115 px ≥ 114.8
    expect(evaluateStroke(circle(57.3), MS, S).valid).toBe(false); // 114.6 px
    expect(evaluateStroke(circle(50.1), MS, 200).valid).toBe(true); // floor 100 px
    expect(evaluateStroke(circle(49.9), MS, 200).valid).toBe(false);
  });

  it('degenerate input (no movement, single point, empty) is rejected without NaN', () => {
    const still = Array.from({ length: 30 }, () => ({ x: 50, y: 50 }));
    for (const pts of [still, [{ x: 1, y: 1 }], []]) {
      const e = evaluateStroke(pts, MS, S);
      expect(e.valid).toBe(false);
      expect(Number.isFinite(e.epsilon)).toBe(true);
      expect(Number.isFinite(e.sweepDeg)).toBe(true);
      expect(e.score).toBe(0);
    }
  });

  it('an invalid evaluation never scores', () => {
    const e = evaluateStroke(circle(45), MS, S);
    expect(e.score).toBe(0);
  });

  it('reports the best-fit reference circle (centroid, mean radius)', () => {
    const e = evaluateStroke(circle(100), MS, S);
    expect(e.center.x).toBeCloseTo(CX, 2);
    expect(e.center.y).toBeCloseTo(CY, 2);
    expect(e.radius).toBeCloseTo(100, 1);
  });

  it('direction does not matter (clockwise = counter-clockwise)', () => {
    const cw = ellipse(120, 80);
    const ccw = cw.slice().reverse();
    expect(evaluateStroke(ccw, MS, S).score).toBe(evaluateStroke(cw, MS, S).score);
  });
});

import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import { evaluateStroke, type Point, type ValidEvaluation } from './metric';
import {
  buildRaw,
  scorePerfectCircle,
  validatePerfectCircleRaw,
  type PerfectCircleRaw,
} from './scoring';

/** The JSON Schema from docs/games/perfect-circle.md §6, verbatim. */
const RAW_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'perfect_circle raw',
  type: 'object',
  required: ['epsilon', 'sweep_deg', 'diameter_px', 'stroke_ms', 'invalid_strokes', 'timed_out'],
  additionalProperties: false,
  properties: {
    epsilon: { type: ['number', 'null'], minimum: 0 },
    sweep_deg: { type: ['number', 'null'], minimum: 0, maximum: 450 },
    diameter_px: { type: ['number', 'null'], minimum: 0 },
    stroke_ms: { type: ['integer', 'null'], minimum: 0, maximum: 10000 },
    invalid_strokes: { type: 'integer', minimum: 0, maximum: 4 },
    timed_out: { type: 'boolean' },
  },
};
const validateSchema = new Ajv2020({ strict: false }).compile(RAW_SCHEMA);

/** The pgTAP base payloads (supabase/tests/05_score_bounds.sql). */
const BASE: PerfectCircleRaw = {
  epsilon: 0.05,
  sweep_deg: 350,
  diameter_px: 300,
  stroke_ms: 2000,
  invalid_strokes: 1,
  timed_out: false,
};
const TIMED_OUT: PerfectCircleRaw = {
  epsilon: null,
  sweep_deg: null,
  diameter_px: null,
  stroke_ms: null,
  invalid_strokes: 4,
  timed_out: true,
};

function withField(base: PerfectCircleRaw, key: string, value: unknown): Record<string, unknown> {
  return { ...base, [key]: value };
}

function without(base: PerfectCircleRaw, key: keyof PerfectCircleRaw): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...base };
  delete copy[key];
  return copy;
}

function raw(epsilon: number, sweep: number): PerfectCircleRaw {
  return { ...BASE, epsilon, sweep_deg: sweep, invalid_strokes: 0 };
}

function wobblyCircle(): Point[] {
  return Array.from({ length: 200 }, (_, k) => {
    const t = (2 * Math.PI * k) / 199;
    const r = 100 * (1 + 0.05 * Math.cos(3 * t));
    return { x: 164 + r * Math.cos(t), y: 164 + r * Math.sin(t) };
  });
}

describe('scorePerfectCircle: worked examples (docs/games/perfect-circle.md §5)', () => {
  it('very good circle: ε 0.030, 358° -> 845', () => expect(scorePerfectCircle(raw(0.03, 358))).toBe(845));
  it('typical: ε 0.065, 345° -> 647', () => expect(scorePerfectCircle(raw(0.065, 345))).toBe(647));
  it('egg shape: ε 0.120, 360° -> 400', () => expect(scorePerfectCircle(raw(0.12, 360))).toBe(400));
  it('open arc: ε 0.040, 305° -> 678', () => expect(scorePerfectCircle(raw(0.04, 305))).toBe(678));
  it('square-ish: ε 0.210, 360° -> 0', () => expect(scorePerfectCircle(raw(0.21, 360))).toBe(0));

  it('4 invalid strokes / timeout -> 0, accepted', () => {
    expect(scorePerfectCircle(TIMED_OUT)).toBe(0);
    expect(validatePerfectCircleRaw(TIMED_OUT, 0)).toBeNull();
    const timeout = buildRaw(null, null, 2);
    expect(scorePerfectCircle(timeout)).toBe(0);
    expect(validatePerfectCircleRaw(timeout, 0)).toBeNull();
  });

  it('scripted perfect: ε 0, 360° -> 1000 on the client, rejected pc.too_perfect', () => {
    const r = raw(0, 360);
    expect(scorePerfectCircle(r)).toBe(1000);
    expect(validatePerfectCircleRaw(r, 1000)).toBe('pc.too_perfect');
  });

  it('sweeps above 360° count as fully closed', () => {
    expect(scorePerfectCircle(raw(0.03, 420))).toBe(850);
  });
});

describe('buildRaw', () => {
  it('builds a schema-valid raw from a valid stroke whose score matches the evaluation', () => {
    const e = evaluateStroke(wobblyCircle(), 1834.6, 328) as ValidEvaluation;
    expect(e.valid).toBe(true);
    const r = buildRaw(e, 1834.6, 2);
    expect(r).toEqual({
      epsilon: e.epsilon,
      sweep_deg: e.sweepDeg,
      diameter_px: e.diameterPx,
      stroke_ms: 1835,
      invalid_strokes: 2,
      timed_out: false,
    });
    expect(Object.keys(r).sort()).toEqual(
      ['diameter_px', 'epsilon', 'invalid_strokes', 'stroke_ms', 'sweep_deg', 'timed_out'].sort(),
    );
    expect(validateSchema(r)).toBe(true);
    expect(scorePerfectCircle(r)).toBe(e.score);
    expect(validatePerfectCircleRaw(r, e.score)).toBeNull();
  });

  it('builds a schema-valid timed-out raw with null metric fields', () => {
    for (const n of [0, 3, 4]) {
      const r = buildRaw(null, null, n);
      expect(validateSchema(r)).toBe(true);
      expect(r.timed_out).toBe(true);
      expect(r.invalid_strokes).toBe(n);
    }
  });

  it('clamps stroke_ms to 10000 (the stroke cap) and invalid_strokes into range', () => {
    const e = evaluateStroke(wobblyCircle(), 10_000.4, 328) as ValidEvaluation;
    expect(buildRaw(e, 10_000.4, 0).stroke_ms).toBe(10_000);
    expect(buildRaw(e, 2000, 7).invalid_strokes).toBe(3);
    expect(buildRaw(null, null, 9).invalid_strokes).toBe(4);
  });
});

describe('validatePerfectCircleRaw mirrors SCORING §4 (same cases as supabase/tests/05_score_bounds.sql)', () => {
  const cases: Array<[string, unknown, number, string | null]> = [
    ['pc base passes', BASE, 700, null],
    ['pc.shape: not an object', [1, 2], 700, 'pc.shape'],
    ['pc.shape: null', null, 700, 'pc.shape'],
    ['pc.shape: diameter_px missing', without(BASE, 'diameter_px'), 700, 'pc.shape'],
    ['pc.shape: epsilon is a string', withField(BASE, 'epsilon', '0.05'), 700, 'pc.shape'],
    ['pc.shape: invalid_strokes not an integer', withField(BASE, 'invalid_strokes', 1.5), 700, 'pc.shape'],
    ['pc.shape: stroke_ms not an integer', withField(BASE, 'stroke_ms', 2000.5), 700, 'pc.shape'],
    ['pc.shape: timed_out not a boolean', withField(BASE, 'timed_out', 'false'), 700, 'pc.shape'],
    ['pc.invalid pass: 3 without timeout', withField(BASE, 'invalid_strokes', 3), 700, null],
    ['pc.invalid pass: 4 with timeout', TIMED_OUT, 0, null],
    ['pc.invalid fail: 4 without timeout', withField(BASE, 'invalid_strokes', 4), 700, 'pc.invalid'],
    ['pc.invalid fail: 5 with timeout', withField(TIMED_OUT, 'invalid_strokes', 5), 0, 'pc.invalid'],
    ['pc.invalid fail: negative', withField(BASE, 'invalid_strokes', -1), 700, 'pc.invalid'],
    ['pc.timeout pass: timed out, score 0', withField(TIMED_OUT, 'invalid_strokes', 0), 0, null],
    ['pc.timeout fail: timed out, score 1', TIMED_OUT, 1, 'pc.timeout'],
    ['pc.too_perfect pass: 0.005', withField(BASE, 'epsilon', 0.005), 700, null],
    ['pc.too_perfect fail: 0.0049', withField(BASE, 'epsilon', 0.0049), 700, 'pc.too_perfect'],
    ['pc.too_perfect fail: null without timeout', withField(BASE, 'epsilon', null), 700, 'pc.too_perfect'],
    ['pc.sweep pass: 300', withField(BASE, 'sweep_deg', 300), 700, null],
    ['pc.sweep pass: 450', withField(BASE, 'sweep_deg', 450), 700, null],
    ['pc.sweep fail: 299.9', withField(BASE, 'sweep_deg', 299.9), 700, 'pc.sweep'],
    ['pc.sweep fail: 450.1', withField(BASE, 'sweep_deg', 450.1), 700, 'pc.sweep'],
    ['pc.sweep fail: null without timeout', withField(BASE, 'sweep_deg', null), 700, 'pc.sweep'],
    ['pc.stroke_ms pass: 300', withField(BASE, 'stroke_ms', 300), 700, null],
    ['pc.stroke_ms pass: 10000', withField(BASE, 'stroke_ms', 10000), 700, null],
    ['pc.stroke_ms fail: 299', withField(BASE, 'stroke_ms', 299), 700, 'pc.stroke_ms'],
    ['pc.stroke_ms fail: 10001', withField(BASE, 'stroke_ms', 10001), 700, 'pc.stroke_ms'],
    ['pc.score_above_975 pass: 975', BASE, 975, null],
    ['pc.score_above_975 fail: 976', BASE, 976, 'pc.score_above_975'],
  ];

  it.each(cases)('%s', (_name, input, score, expected) => {
    expect(validatePerfectCircleRaw(input, score)).toBe(expected);
  });

  it('checks in order: pc.invalid before pc.timeout, pc.too_perfect before pc.sweep', () => {
    expect(validatePerfectCircleRaw({ ...TIMED_OUT, invalid_strokes: 5 }, 10)).toBe('pc.invalid');
    expect(validatePerfectCircleRaw({ ...BASE, epsilon: 0, sweep_deg: 100 }, 700)).toBe('pc.too_perfect');
    expect(validatePerfectCircleRaw({ ...BASE, sweep_deg: 100, stroke_ms: 1 }, 999)).toBe('pc.sweep');
  });
});

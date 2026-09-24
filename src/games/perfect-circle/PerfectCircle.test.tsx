import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PerfectCircle, type PerfectCircleSnapshot } from './PerfectCircle';
import type { GameProps, GameResult } from '../types';
import { scorePerfectCircle, validatePerfectCircleRaw, type PerfectCircleRaw } from './scoring';
import type { Point } from './metric';

vi.mock('../../i18n', () => ({
  useT: () => (key: string, params?: Record<string, string | number>) =>
    params ? `${key}|${JSON.stringify(params)}` : key,
}));

const ROUND_START = 1_700_000_000_000;
/** 360 × 740 viewport -> S = min(328, 444) = 328. */
const VW = 360;
const VH = 740;
const CENTRE = 164;

// ---- jsdom shims -------------------------------------------------------

/** jsdom 25 has no PointerEvent: a MouseEvent subclass carrying pointerId (+ optional coalesced events). */
class TestPointerEvent extends MouseEvent {
  pointerId: number;
  private coalesced: Array<{ clientX: number; clientY: number }> | undefined;
  constructor(type: string, init: PointerEventInit & { coalesced?: Array<{ clientX: number; clientY: number }> } = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
    this.coalesced = init.coalesced;
  }
  getCoalescedEvents() {
    return this.coalesced ?? [];
  }
}

interface FakeCtx {
  calls: Array<[string, ...unknown[]]>;
  [key: string]: unknown;
}

function makeFakeContext(): FakeCtx {
  const calls: Array<[string, ...unknown[]]> = [];
  const record =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push([name, ...args]);
    };
  const ctx: FakeCtx = { calls };
  for (const name of [
    'clearRect',
    'beginPath',
    'moveTo',
    'lineTo',
    'closePath',
    'stroke',
    'fill',
    'arc',
    'save',
    'restore',
    'setTransform',
  ]) {
    ctx[name] = record(name);
  }
  ctx.createPattern = () => ({ pattern: true });
  return ctx;
}

/** One fake 2D context per canvas element (the mosaic tile canvas gets its own). */
let contexts: Map<HTMLCanvasElement, FakeCtx>;
/** The game canvas's context. */
let fakeCtx: FakeCtx;

function setViewport(width: number, height: number) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true });
  Object.defineProperty(window, 'innerHeight', { value: height, configurable: true, writable: true });
}

function mockReducedMotion(reduce: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: reduce && query.includes('reduce'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
}

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame'],
  });
  vi.setSystemTime(ROUND_START);
  vi.stubGlobal('PointerEvent', TestPointerEvent);
  setViewport(VW, VH);
  mockReducedMotion(false);
  contexts = new Map();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    let ctx = contexts.get(this);
    if (!ctx) {
      ctx = makeFakeContext();
      contexts.set(this, ctx);
      if (this.dataset.testid === 'pc-canvas') fakeCtx = ctx;
    }
    return ctx as unknown as CanvasRenderingContext2D;
  } as unknown as HTMLCanvasElement['getContext']);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---- helpers -----------------------------------------------------------

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function renderGame(overrides: Partial<GameProps<PerfectCircleSnapshot>> = {}) {
  const onProgress = vi.fn();
  const onFinish = vi.fn();
  const props: GameProps<PerfectCircleSnapshot> = {
    seed: 'seed-1',
    roundStartEpoch: ROUND_START,
    roundEnded: false,
    snapshot: null,
    onProgress,
    onFinish,
    ...overrides,
  };
  const utils = render(<PerfectCircle {...props} />);
  return {
    ...utils,
    onProgress,
    onFinish,
    canvas: () => utils.getByTestId('pc-canvas'),
    rerenderWith: (next: Partial<GameProps<PerfectCircleSnapshot>>) =>
      utils.rerender(<PerfectCircle {...props} {...next} />),
  };
}

function snapshots(onProgress: ReturnType<typeof vi.fn>): PerfectCircleSnapshot[] {
  return onProgress.mock.calls.map((call) => call[0] as PerfectCircleSnapshot);
}

function finished(onFinish: ReturnType<typeof vi.fn>): GameResult & { raw: PerfectCircleRaw } {
  expect(onFinish).toHaveBeenCalledTimes(1);
  return onFinish.mock.calls[0][0] as GameResult & { raw: PerfectCircleRaw };
}

function circlePoints(radius: number, n = 60, spanDeg = 360, cx = CENTRE, cy = CENTRE): Point[] {
  return Array.from({ length: n }, (_, k) => {
    const t = (spanDeg * Math.PI * k) / (180 * (n - 1));
    const r = radius * (1 + 0.04 * Math.cos(3 * t)); // a human-ish wobble, scores well below 975
    return { x: cx + r * Math.cos(t), y: cy + r * Math.sin(t) };
  });
}

function pointer(el: Element, type: string, p: Point, pointerId: number) {
  fireEvent(el, new TestPointerEvent(type, { pointerId, clientX: p.x, clientY: p.y, bubbles: true }));
}
function down(el: Element, p: Point, pointerId = 1) {
  pointer(el, 'pointerdown', p, pointerId);
}
function move(el: Element, p: Point, pointerId = 1, coalesced?: Point[]) {
  fireEvent(
    el,
    new TestPointerEvent('pointermove', {
      pointerId,
      clientX: p.x,
      clientY: p.y,
      bubbles: true,
      coalesced: coalesced?.map((c) => ({ clientX: c.x, clientY: c.y })),
    }),
  );
}
function up(el: Element, p: Point, pointerId = 1) {
  pointer(el, 'pointerup', p, pointerId);
}

/** Draws `points` with pointer 1 over `durationMs`, then lifts (unless `lift` is false). */
function drawStroke(el: Element, points: Point[], durationMs = 2000, lift = true) {
  // Whole-ms steps that add up to exactly durationMs.
  const at = (i: number) => Math.round((durationMs * i) / (points.length - 1));
  down(el, points[0]);
  for (let i = 1; i < points.length; i++) {
    advance(at(i) - at(i - 1));
    move(el, points[i]);
  }
  if (lift) up(el, points[points.length - 1]);
}

function startCanvas() {
  const game = renderGame();
  advance(1500); // intro -> canvas
  return game;
}

// ---- tests -------------------------------------------------------------

describe('PerfectCircle: flow', () => {
  it('intro -> canvas persists attemptStartEpoch, then a valid stroke scores and finishes once', () => {
    const { canvas, onProgress, onFinish, getByText, queryByText, queryAllByText, getByTestId } = renderGame();
    expect(getByText('game.perfect_circle.name')).toBeInTheDocument();
    expect(getByText('game.perfect_circle.intro')).toBeInTheDocument();

    advance(1500);
    expect(snapshots(onProgress)[0]).toEqual({
      phase: 'playing',
      attemptStartEpoch: ROUND_START + 1500,
      invalidStrokes: 0,
      result: null,
    });
    expect(getByText('game.perfect_circle.draw')).toBeInTheDocument();
    expect(queryByText(/tries_left/)).toBeNull(); // only after an invalid stroke

    drawStroke(canvas(), circlePoints(100), 2000);

    // scored: ring + result line, stroke painted with lines, reference circle drawn.
    expect(getByTestId('pc-score-ring')).toBeInTheDocument();
    expect(queryAllByText(/game\.perfect_circle\.result/).length).toBeGreaterThan(0);
    expect(fakeCtx.calls.some(([name]) => name === 'lineTo')).toBe(true);
    expect(fakeCtx.calls.some(([name]) => name === 'arc')).toBe(true);
    expect(onFinish).not.toHaveBeenCalled();

    advance(2000); // ring hold
    const result = finished(onFinish);
    expect(result.raw.timed_out).toBe(false);
    expect(result.raw.invalid_strokes).toBe(0);
    expect(result.raw.stroke_ms).toBe(2000);
    expect(result.raw.sweep_deg).toBeGreaterThan(355);
    expect(result.score).toBe(scorePerfectCircle(result.raw));
    expect(result.score).toBeGreaterThan(700);
    expect(validatePerfectCircleRaw(result.raw, result.score)).toBeNull();
    expect(result.durationMs).toBe(1500 + 2000 + 2000);

    const scoredSnap = snapshots(onProgress).at(-1);
    expect(scoredSnap?.phase).toBe('scored');
    expect(scoredSnap?.result?.score).toBe(result.score);

    advance(60_000);
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('an invalid stroke shows its hint for 1.2 s, persists the count, then offers the canvas with tries left', () => {
    const { canvas, onProgress, getByText, queryByText } = startCanvas();

    drawStroke(canvas(), circlePoints(40), 1500); // 80 px < 114.8 px: V2
    expect(getByText('game.perfect_circle.hint.small')).toBeInTheDocument();
    expect(snapshots(onProgress).at(-1)?.invalidStrokes).toBe(1);
    expect(canvas().className).toMatch(/fading/);

    advance(1200);
    expect(queryByText('game.perfect_circle.hint.small')).toBeNull();
    expect(getByText('game.perfect_circle.draw')).toBeInTheDocument();
    expect(getByText('game.perfect_circle.tries_left|{"n":3}')).toBeInTheDocument();
  });

  it('shows the right hint per rule: short (V1), open (V3), loops (V4)', () => {
    const { canvas, getByText } = startCanvas();

    drawStroke(canvas(), circlePoints(100, 10), 1000); // 10 points
    expect(getByText('game.perfect_circle.hint.short')).toBeInTheDocument();
    advance(1200);

    drawStroke(canvas(), circlePoints(100, 60, 200), 1000);
    expect(getByText('game.perfect_circle.hint.open')).toBeInTheDocument();
    advance(1200);

    drawStroke(canvas(), circlePoints(100, 90, 540), 1500);
    expect(getByText('game.perfect_circle.hint.loops')).toBeInTheDocument();
  });

  it('after 3 invalid strokes the next valid stroke still counts (invalid_strokes 3)', () => {
    const { canvas, onFinish } = startCanvas();
    for (let i = 0; i < 3; i++) {
      drawStroke(canvas(), circlePoints(40), 1000);
      advance(1200);
    }
    drawStroke(canvas(), circlePoints(100), 2000);
    advance(2000);
    const result = finished(onFinish);
    expect(result.raw.invalid_strokes).toBe(3);
    expect(result.raw.timed_out).toBe(false);
    expect(result.score).toBeGreaterThan(0);
  });

  it('PC-T9: the 4th invalid stroke ends the attempt with score 0, timed_out, invalid_strokes 4', () => {
    const { canvas, onFinish } = startCanvas();
    for (let i = 0; i < 3; i++) {
      drawStroke(canvas(), circlePoints(40), 1000);
      advance(1200);
    }
    drawStroke(canvas(), circlePoints(40), 1000);
    advance(2000);
    const result = finished(onFinish);
    expect(result.score).toBe(0);
    expect(result.raw).toEqual({
      epsilon: null,
      sweep_deg: null,
      diameter_px: null,
      stroke_ms: null,
      invalid_strokes: 4,
      timed_out: true,
    });
    expect(validatePerfectCircleRaw(result.raw, result.score)).toBeNull();
  });
});

describe('PerfectCircle: timeouts', () => {
  it('30 s attempt timeout with no stroke -> score 0 timed_out, finished at the deadline', () => {
    const { onFinish } = startCanvas();
    advance(29_999);
    expect(onFinish).not.toHaveBeenCalled();
    advance(1);
    const result = finished(onFinish);
    expect(result.score).toBe(0);
    expect(result.raw.timed_out).toBe(true);
    expect(result.raw.invalid_strokes).toBe(0);
    expect(result.durationMs).toBe(1500 + 30_000);
  });

  it('a stroke still down at 10 s is cut and evaluated as is (stroke_ms 10000)', () => {
    const { canvas, onFinish, getByTestId } = startCanvas();
    drawStroke(canvas(), circlePoints(100), 9000, false); // never lifted
    advance(1000); // the 10 s cap fires
    expect(getByTestId('pc-score-ring')).toBeInTheDocument();
    advance(2000);
    const result = finished(onFinish);
    expect(result.raw.stroke_ms).toBe(10_000);
    expect(result.raw.timed_out).toBe(false);
  });

  it('the scored ring never holds the finish past the 30 s attempt deadline', () => {
    const { canvas, onFinish } = startCanvas();
    advance(27_000);
    drawStroke(canvas(), circlePoints(100), 2500); // lifted at 29.5 s
    advance(499);
    expect(onFinish).not.toHaveBeenCalled();
    advance(1);
    expect(finished(onFinish).durationMs).toBe(1500 + 30_000);
  });

  it('round ended mid-stroke with no valid stroke yet -> score 0 timed_out, immediately', () => {
    const { canvas, onFinish, rerenderWith } = startCanvas();
    drawStroke(canvas(), circlePoints(40), 1000);
    advance(1200);
    drawStroke(canvas(), circlePoints(100).slice(0, 30), 800, false);
    rerenderWith({ roundEnded: true });
    const result = finished(onFinish);
    expect(result.score).toBe(0);
    expect(result.raw.timed_out).toBe(true);
    expect(result.raw.invalid_strokes).toBe(1);
  });

  it('round ended while the ring shows -> finishes with the score, exactly once', () => {
    const { canvas, onFinish, rerenderWith } = startCanvas();
    drawStroke(canvas(), circlePoints(100), 2000);
    rerenderWith({ roundEnded: true });
    rerenderWith({ roundEnded: true });
    advance(5000);
    const result = finished(onFinish);
    expect(result.raw.timed_out).toBe(false);
    expect(result.score).toBeGreaterThan(0);
  });
});

describe('PerfectCircle: input handling', () => {
  it('only the first pointer draws; a second finger is ignored', () => {
    const { canvas, onFinish } = startCanvas();
    const el = canvas();
    const pts = circlePoints(100);
    down(el, pts[0], 1);
    down(el, { x: 10, y: 10 }, 2); // second finger
    for (let i = 1; i < pts.length; i++) {
      advance(35);
      move(el, pts[i], 1);
      move(el, { x: 5 + i, y: 300 }, 2); // noise from the second finger
    }
    up(el, { x: 5, y: 300 }, 2); // lifting the second finger doesn't end the stroke
    expect(onFinish).not.toHaveBeenCalled();
    up(el, pts[pts.length - 1], 1);
    advance(2000);
    const result = finished(onFinish);
    expect(result.raw.timed_out).toBe(false);
    expect(result.raw.diameter_px).toBeGreaterThan(190);
  });

  it('collects coalesced events when the browser provides them', () => {
    const { canvas, onFinish } = startCanvas();
    const el = canvas();
    const pts = circlePoints(100, 31);
    // 3 pointermove events, each carrying 10 coalesced samples: 31 raw points (V1 needs 20).
    down(el, pts[0]);
    for (let batch = 0; batch < 3; batch++) {
      advance(600);
      const chunk = pts.slice(1 + batch * 10, 11 + batch * 10);
      move(el, chunk[chunk.length - 1], 1, chunk);
    }
    up(el, pts[30]);
    advance(2000);
    expect(finished(onFinish).raw.timed_out).toBe(false);
  });

  it('clamps points outside the canvas to its edge', () => {
    const { canvas } = startCanvas();
    const el = canvas();
    down(el, { x: 164, y: 164 });
    advance(50);
    move(el, { x: -80, y: 900 });
    const coords = fakeCtx.calls
      .filter(([name]) => name === 'lineTo' || name === 'moveTo')
      .map(([, x, y]) => [x as number, y as number]);
    expect(coords.length).toBeGreaterThan(0);
    for (const [x, y] of coords) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(328.01);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(328.01);
    }
  });

  it('pointercancel discards the stroke without using an invalid try', () => {
    const { canvas, onProgress, getByText } = startCanvas();
    const el = canvas();
    const pts = circlePoints(100);
    drawStroke(el, pts.slice(0, 30), 800, false);
    pointer(el, 'pointercancel', pts[29], 1);
    expect(getByText('game.perfect_circle.draw')).toBeInTheDocument();
    expect(snapshots(onProgress).every((s) => s.invalidStrokes === 0)).toBe(true);
  });

  it('a resize that changes S mid-stroke discards it without using an invalid try, and resizes the canvas', () => {
    const { canvas, onProgress, onFinish, getByText, queryByText } = startCanvas();
    expect(canvas().style.inlineSize).toBe('328px');
    drawStroke(canvas(), circlePoints(100).slice(0, 40), 1000, false);

    act(() => {
      setViewport(320, 568); // S = 288
      window.dispatchEvent(new Event('resize'));
    });
    expect(canvas().style.inlineSize).toBe('288px');
    expect(getByText('game.perfect_circle.draw')).toBeInTheDocument();
    expect(queryByText(/hint/)).toBeNull();
    expect(snapshots(onProgress).every((s) => s.invalidStrokes === 0)).toBe(true);

    // The old pointer's late events do nothing; a fresh stroke works.
    move(canvas(), { x: 10, y: 10 });
    up(canvas(), { x: 10, y: 10 });
    drawStroke(canvas(), circlePoints(90, 60, 360, 144, 144), 2000);
    advance(2000);
    expect(finished(onFinish).raw.invalid_strokes).toBe(0);
  });

  it('a resize that leaves S unchanged (e.g. the URL bar) does not interrupt the stroke', () => {
    const { canvas, onFinish } = startCanvas();
    const pts = circlePoints(100);
    drawStroke(canvas(), pts.slice(0, 30), 1000, false);
    act(() => {
      setViewport(VW, VH + 60); // still S = 328
      window.dispatchEvent(new Event('resize'));
    });
    for (let i = 30; i < pts.length; i++) {
      advance(30);
      move(canvas(), pts[i]);
    }
    up(canvas(), pts[pts.length - 1]);
    advance(2000);
    expect(finished(onFinish).raw.timed_out).toBe(false);
  });
});

describe('PerfectCircle: reload', () => {
  it('resumes the attempt clock and invalid count from the snapshot (no intro, no reset)', () => {
    const attemptStartEpoch = ROUND_START + 1500;
    vi.setSystemTime(attemptStartEpoch + 20_000); // reloaded 20 s into the attempt
    const snapshot: PerfectCircleSnapshot = {
      phase: 'playing',
      attemptStartEpoch,
      invalidStrokes: 2,
      result: null,
    };
    const { onFinish, getByText } = renderGame({ snapshot });
    expect(getByText('game.perfect_circle.draw')).toBeInTheDocument();
    expect(getByText('game.perfect_circle.tries_left|{"n":2}')).toBeInTheDocument();

    advance(9_999);
    expect(onFinish).not.toHaveBeenCalled();
    advance(1);
    const result = finished(onFinish);
    expect(result.raw.timed_out).toBe(true);
    expect(result.raw.invalid_strokes).toBe(2);
  });

  it('a reload after the deadline times out at once', () => {
    vi.setSystemTime(ROUND_START + 40_000);
    const { onFinish } = renderGame({
      snapshot: { phase: 'playing', attemptStartEpoch: ROUND_START + 1500, invalidStrokes: 0, result: null },
    });
    expect(finished(onFinish).raw.timed_out).toBe(true);
  });

  it('a reload after scoring finishes with the persisted result', () => {
    const raw: PerfectCircleRaw = {
      epsilon: 0.03,
      sweep_deg: 358,
      diameter_px: 220,
      stroke_ms: 1800,
      invalid_strokes: 1,
      timed_out: false,
    };
    vi.setSystemTime(ROUND_START + 8000);
    const { onFinish } = renderGame({
      snapshot: { phase: 'scored', attemptStartEpoch: ROUND_START + 1500, invalidStrokes: 1, result: { score: 845, raw } },
    });
    const result = finished(onFinish);
    expect(result.score).toBe(845);
    expect(result.raw).toEqual(raw);
  });
});

describe('PerfectCircle: score ring', () => {
  it('animates 0 -> score', () => {
    const { canvas, getByTestId, onProgress } = startCanvas();
    drawStroke(canvas(), circlePoints(100), 2000);
    const score = snapshots(onProgress).at(-1)?.result?.score ?? -1;
    expect(score).toBeGreaterThan(0);
    expect(getByTestId('pc-ring-value').textContent).toBe('0');
    advance(900);
    expect(getByTestId('pc-ring-value').textContent).toBe(String(score));
  });

  it('jumps straight to the score under reduced motion', () => {
    mockReducedMotion(true);
    const { canvas, getByTestId, onProgress } = startCanvas();
    drawStroke(canvas(), circlePoints(100), 2000);
    const score = snapshots(onProgress).at(-1)?.result?.score ?? -1;
    expect(getByTestId('pc-ring-value').textContent).toBe(String(score));
  });

  it('announces the result to screen readers', () => {
    const { canvas, getByRole } = startCanvas();
    drawStroke(canvas(), circlePoints(100), 2000);
    const status = getByRole('status');
    expect(status.textContent).toContain('round.your_score');
    expect(status.textContent).toContain('game.perfect_circle.result');
  });
});

describe('PerfectCircle: canvas without a 2D context', () => {
  it('still plays when getContext returns null', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const { canvas, onFinish } = startCanvas();
    drawStroke(canvas(), circlePoints(100), 2000);
    advance(2000);
    expect(finished(onFinish).raw.timed_out).toBe(false);
  });
});

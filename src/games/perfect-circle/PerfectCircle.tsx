/**
 * Perfect Circle screen. Source of truth: docs/games/perfect-circle.md.
 *
 * One scored stroke on a square canvas (S = min(vw − 32, vh × 0.6), ≥ 280 px).
 * Up to 3 invalid strokes are free; the 4th ends the attempt with score 0.
 * The attempt times out 30 s after the canvas appears; one stroke is cut at
 * 10 s. Only the first pointer draws. A reload, rotation or resize mid-stroke
 * discards the stroke without using an invalid try (§10, SESSION_LIFECYCLE
 * E2/E16).
 *
 * States: intro -> canvas -> drawing -> evaluating -> invalid | scored ->
 * finish. `evaluating` is the synchronous metric step on pointerup (the
 * metric runs in well under a frame), so it never renders on its own.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useT } from '../../i18n';
import type { GameProps } from '../types';
import {
  PC_MAX_STROKE_MS,
  canvasSide,
  evaluateStroke,
  type InvalidReason,
  type Point,
  type ValidEvaluation,
} from './metric';
import { createMosaicStyle, drawPolyline, drawReferenceCircle, get2d } from './mosaic';
import {
  PC_ATTEMPT_TIMEOUT_MS,
  PC_MAX_INVALID_STROKES,
  buildRaw,
  scorePerfectCircle,
  type PerfectCircleRaw,
} from './scoring';
import { ScoreRing } from './ScoreRing';
import styles from './PerfectCircle.module.css';

/** Intro card (§2). */
const INTRO_MS = 1500;
/** Invalid-stroke hint (§2). */
const HINT_MS = 1200;
/** How long the scored ring stays up before finishing (count-up 800 ms + a beat to read it). */
const SCORED_HOLD_MS = 2000;
/** Canvas backing-store density cap (memory on low-end phones). */
const MAX_DPR = 3;

type Phase = 'intro' | 'canvas' | 'drawing' | 'evaluating' | 'invalid' | 'scored';

export interface PerfectCircleSnapshot {
  /** `playing` covers canvas/drawing/invalid: a stroke in progress is never persisted. */
  phase: 'intro' | 'playing' | 'scored';
  /** Date.now() when the canvas first appeared; the 30 s attempt clock runs from here. */
  attemptStartEpoch: number | null;
  /** Invalid strokes so far (0-4). */
  invalidStrokes: number;
  /** The final result once scored, so a reload finishes with it instead of replaying. */
  result: { score: number; raw: PerfectCircleRaw } | null;
}

interface ActiveStroke {
  pointerId: number;
  points: Point[];
  startPerf: number;
}

function initialSnapshot(): PerfectCircleSnapshot {
  return { phase: 'intro', attemptStartEpoch: null, invalidStrokes: 0, result: null };
}

function viewportSide(): number {
  return canvasSide(window.innerWidth, window.innerHeight);
}

function prefersReducedMotion(): boolean {
  try {
    return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function PerfectCircle({
  seed,
  roundStartEpoch,
  roundEnded,
  snapshot,
  onProgress,
  onFinish,
}: GameProps<PerfectCircleSnapshot>) {
  const t = useT();
  const [snap, setSnap] = useState<PerfectCircleSnapshot>(() => snapshot ?? initialSnapshot());
  const [phase, setPhase] = useState<Phase>(() =>
    snapshot?.phase === 'scored' ? 'scored' : snapshot?.phase === 'playing' ? 'canvas' : 'intro',
  );
  const [hint, setHint] = useState<InvalidReason | null>(null);
  const [side, setSide] = useState<number>(viewportSide);
  const [evaluation, setEvaluation] = useState<ValidEvaluation | null>(null);
  const evaluationRef = useRef(evaluation);
  evaluationRef.current = evaluation;
  const [reducedMotion] = useState<boolean>(prefersReducedMotion);

  // Refs mirror the latest state/props so timers and pointer handlers never
  // act on stale closures (same pattern as Stop the Clock).
  const snapRef = useRef(snap);
  snapRef.current = snap;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const sideRef = useRef(side);
  sideRef.current = side;
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;
  const roundStartEpochRef = useRef(roundStartEpoch);
  roundStartEpochRef.current = roundStartEpoch;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokeStyleRef = useRef<CanvasPattern | string | null>(null);
  const strokeRef = useRef<ActiveStroke | null>(null);
  /** The last drawn stroke and the canvas side it was drawn at (for redraw after resize). */
  const lastStrokeRef = useRef<{ points: Point[]; side: number } | null>(null);
  const strokeCapTimerRef = useRef<number | null>(null);
  const finishedRef = useRef(false);

  const commit = useCallback((next: PerfectCircleSnapshot) => {
    snapRef.current = next;
    setSnap(next);
    onProgressRef.current(next);
  }, []);

  const moveTo = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const finishWith = useCallback((score: number, raw: PerfectCircleRaw) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    const durationMs = Math.max(0, Math.min(120_000, Date.now() - roundStartEpochRef.current));
    onFinishRef.current({ score, raw, durationMs });
  }, []);

  // ---- canvas helpers (every call guarded: jsdom has no 2D context) ----

  const context = useCallback(() => get2d(canvasRef.current), []);

  const strokeStyle = useCallback((ctx: CanvasRenderingContext2D) => {
    if (strokeStyleRef.current === null) strokeStyleRef.current = createMosaicStyle(ctx, seed);
    return strokeStyleRef.current;
  }, [seed]);

  const clearCanvas = useCallback(() => {
    const ctx = context();
    if (!ctx) return;
    const s = sideRef.current;
    ctx.clearRect(0, 0, s, s);
  }, [context]);

  const redraw = useCallback(
    (reference: ValidEvaluation | null) => {
      const ctx = context();
      if (!ctx) return;
      const s = sideRef.current;
      ctx.clearRect(0, 0, s, s);
      const last = lastStrokeRef.current;
      if (!last) return;
      const scale = s / last.side;
      drawPolyline(ctx, strokeStyle(ctx), last.points, scale);
      if (reference) drawReferenceCircle(ctx, reference.center, reference.radius, scale);
    },
    [context, strokeStyle],
  );

  const clearStrokeCap = useCallback(() => {
    if (strokeCapTimerRef.current !== null) {
      window.clearTimeout(strokeCapTimerRef.current);
      strokeCapTimerRef.current = null;
    }
  }, []);

  // ---- outcomes ----

  const enterScored = useCallback(
    (score: number, raw: PerfectCircleRaw, valid: ValidEvaluation | null) => {
      commit({ ...snapRef.current, phase: 'scored', result: { score, raw } });
      setEvaluation(valid);
      setHint(null);
      moveTo('scored');
    },
    [commit, moveTo],
  );

  /** No valid stroke in time (30 s, 4th invalid, round ended): score 0, timed_out. */
  const timeOut = useCallback(
    (invalidStrokes: number) => {
      const raw = buildRaw(null, null, invalidStrokes);
      lastStrokeRef.current = null;
      clearCanvas();
      enterScored(scorePerfectCircle(raw), raw, null);
    },
    [clearCanvas, enterScored],
  );

  /** Drops the stroke in progress without counting it (reload/rotation/resize/cancel). */
  const discardStroke = useCallback(() => {
    clearStrokeCap();
    strokeRef.current = null;
    lastStrokeRef.current = null;
    clearCanvas();
    if (phaseRef.current === 'drawing') moveTo('canvas');
  }, [clearStrokeCap, clearCanvas, moveTo]);

  /**
   * pointerup, the 10 s stroke cap, or the attempt deadline mid-stroke:
   * evaluate the stroke as drawn so far. At the deadline an invalid stroke
   * can't be retried, so it ends the attempt.
   */
  const endStroke = useCallback(
    (atDeadline = false) => {
      const stroke = strokeRef.current;
      if (!stroke || phaseRef.current !== 'drawing') return;
      clearStrokeCap();
      strokeRef.current = null;
      moveTo('evaluating');

      const strokeMs = Math.min(PC_MAX_STROKE_MS, performance.now() - stroke.startPerf);
      const result = evaluateStroke(stroke.points, strokeMs, sideRef.current);
      const current = snapRef.current;

      if (result.valid) {
        const raw = buildRaw(result, strokeMs, current.invalidStrokes);
        enterScored(scorePerfectCircle(raw), raw, result);
        redraw(result);
        return;
      }

      const invalidStrokes = Math.min(PC_MAX_INVALID_STROKES, current.invalidStrokes + 1);
      if (invalidStrokes >= PC_MAX_INVALID_STROKES || atDeadline) {
        commit({ ...current, invalidStrokes });
        timeOut(invalidStrokes);
        return;
      }
      commit({ ...current, invalidStrokes });
      setHint(result.reason);
      moveTo('invalid');
    },
    [clearStrokeCap, commit, enterScored, moveTo, redraw, timeOut],
  );

  const finishNow = useCallback(() => {
    if (finishedRef.current) return;
    clearStrokeCap();
    strokeRef.current = null;
    const current = snapRef.current;
    if (current.result) {
      finishWith(current.result.score, current.result.raw);
      return;
    }
    // Round ended with no valid stroke yet (§10): timed out, score 0.
    const raw = buildRaw(null, null, current.invalidStrokes);
    commit({ ...current, phase: 'scored', result: { score: 0, raw } });
    finishWith(0, raw);
  }, [clearStrokeCap, commit, finishWith]);

  // ---- pointer input ----

  const toCanvasPoint = useCallback((clientX: number, clientY: number): Point => {
    const canvas = canvasRef.current;
    const rect = canvas ? canvas.getBoundingClientRect() : { left: 0, top: 0 };
    const s = sideRef.current;
    // Points outside the canvas are clamped to its edge (§10).
    return { x: clamp(clientX - rect.left, 0, s), y: clamp(clientY - rect.top, 0, s) };
  }, []);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (finishedRef.current || phaseRef.current !== 'canvas' || strokeRef.current) return;
      event.preventDefault();
      try {
        event.currentTarget.setPointerCapture?.(event.pointerId);
      } catch {
        // Capture is a nicety; drawing still works without it.
      }
      const first = toCanvasPoint(event.clientX, event.clientY);
      strokeRef.current = { pointerId: event.pointerId, points: [first], startPerf: performance.now() };
      lastStrokeRef.current = { points: strokeRef.current.points, side: sideRef.current };
      moveTo('drawing');
      const ctx = context();
      if (ctx) {
        clearCanvas();
        drawPolyline(ctx, strokeStyle(ctx), [first]);
      }
      strokeCapTimerRef.current = window.setTimeout(() => endStroke(), PC_MAX_STROKE_MS);
    },
    [clearCanvas, context, endStroke, moveTo, strokeStyle, toCanvasPoint],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const stroke = strokeRef.current;
      if (!stroke || event.pointerId !== stroke.pointerId) return; // only the first pointer counts
      const native = event.nativeEvent as PointerEvent;
      let samples: Array<{ clientX: number; clientY: number }> = [];
      try {
        samples = typeof native.getCoalescedEvents === 'function' ? native.getCoalescedEvents() : [];
      } catch {
        samples = [];
      }
      if (samples.length === 0) samples = [{ clientX: event.clientX, clientY: event.clientY }];
      const from = stroke.points[stroke.points.length - 1];
      const added = samples.map((s) => toCanvasPoint(s.clientX, s.clientY));
      stroke.points.push(...added);
      const ctx = context();
      if (ctx) drawPolyline(ctx, strokeStyle(ctx), [from, ...added]);
    },
    [context, strokeStyle, toCanvasPoint],
  );

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const stroke = strokeRef.current;
      if (!stroke || event.pointerId !== stroke.pointerId) return;
      endStroke();
    },
    [endStroke],
  );

  const handlePointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const stroke = strokeRef.current;
      if (!stroke || event.pointerId !== stroke.pointerId) return;
      // The browser took the gesture away: like an interruption, not the player's fault.
      discardStroke();
    },
    [discardStroke],
  );

  // ---- effects ----

  // Intro card -> canvas; the 30 s attempt clock starts now and is persisted.
  useEffect(() => {
    if (phase !== 'intro') return;
    const timer = window.setTimeout(() => {
      commit({ ...snapRef.current, phase: 'playing', attemptStartEpoch: Date.now() });
      moveTo('canvas');
    }, INTRO_MS);
    return () => window.clearTimeout(timer);
  }, [phase, commit, moveTo]);

  // Attempt deadline, resumable from the persisted epoch (never reset by a reload).
  useEffect(() => {
    if (snap.phase !== 'playing' || snap.attemptStartEpoch === null) return;
    const onDeadline = () => {
      if (finishedRef.current || snapRef.current.phase !== 'playing') return;
      if (phaseRef.current === 'drawing') {
        endStroke(true);
        return;
      }
      timeOut(snapRef.current.invalidStrokes);
    };
    const remaining = snap.attemptStartEpoch + PC_ATTEMPT_TIMEOUT_MS - Date.now();
    if (remaining <= 0) {
      onDeadline();
      return;
    }
    const timer = window.setTimeout(onDeadline, remaining);
    return () => window.clearTimeout(timer);
  }, [snap.phase, snap.attemptStartEpoch, endStroke, timeOut]);

  // Invalid hint -> back to a clean canvas.
  useEffect(() => {
    if (phase !== 'invalid') return;
    const timer = window.setTimeout(() => {
      if (phaseRef.current !== 'invalid') return;
      lastStrokeRef.current = null;
      clearCanvas();
      setHint(null);
      moveTo('canvas');
    }, HINT_MS);
    return () => window.clearTimeout(timer);
  }, [phase, clearCanvas, moveTo]);

  // Scored: hold the ring, then finish, never past the attempt deadline
  // (docs/SCORING.md §2 worst case). A reload in this state finishes at once.
  useEffect(() => {
    if (phase !== 'scored') return;
    const current = snapRef.current;
    if (!current.result) return;
    const { score, raw } = current.result;
    const deadline =
      current.attemptStartEpoch !== null ? current.attemptStartEpoch + PC_ATTEMPT_TIMEOUT_MS : Date.now();
    // Only a result produced in this page load holds the ring; a reload into
    // `scored` (no live evaluation, not a timeout) finishes straight away.
    const fresh = evaluation !== null || raw.timed_out;
    const delay = fresh ? Math.min(SCORED_HOLD_MS, deadline - Date.now()) : 0;
    if (delay <= 0) {
      finishWith(score, raw);
      return;
    }
    const timer = window.setTimeout(() => finishWith(score, raw), delay);
    return () => window.clearTimeout(timer);
  }, [phase, evaluation, finishWith]);

  // The shell signals the round is over: finish immediately.
  useEffect(() => {
    if (roundEnded) finishNow();
  }, [roundEnded, finishNow]);

  // Rotation / resize: a stroke in progress is discarded (no invalid try) and the canvas resizes.
  useEffect(() => {
    const onResize = () => {
      const next = viewportSide();
      if (next === sideRef.current) return;
      if (strokeRef.current) discardStroke();
      sideRef.current = next;
      setSide(next);
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, [discardStroke]);

  // Size the backing store for crisp strokes; resizing clears the bitmap, so redraw.
  const hasCanvas = phase !== 'intro';
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
    canvas.width = Math.round(side * dpr);
    canvas.height = Math.round(side * dpr);
    const ctx = get2d(canvas);
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    strokeStyleRef.current = null; // patterns are per-context state; rebuild lazily
    if (phaseRef.current === 'scored' || phaseRef.current === 'invalid') redraw(evaluationRef.current);
  }, [side, hasCanvas, redraw]);

  // ---- render ----

  if (phase === 'intro') {
    return (
      <div className={styles.screen}>
        <div className={styles.intro}>
          <p className={styles.eyebrow}>{t('game.perfect_circle.intro')}</p>
          <h1 className={styles.title}>{t('game.perfect_circle.name')}</h1>
          <p className={styles.pitch}>{t('game.perfect_circle.pitch')}</p>
        </div>
      </div>
    );
  }

  const triesLeft = PC_MAX_INVALID_STROKES - snap.invalidStrokes;
  const showTries = snap.invalidStrokes > 0 && (phase === 'canvas' || phase === 'drawing');
  const result = snap.result;
  const resultLine = evaluation
    ? t('game.perfect_circle.result', {
        r: Math.round(evaluation.roundness * 100),
        c: Math.round(evaluation.closure * 100),
      })
    : null;

  return (
    <div className={styles.screen}>
      <div className={styles.panel}>
        {phase === 'canvas' || phase === 'drawing' || phase === 'evaluating' ? (
          <>
            <p className={styles.draw}>{t('game.perfect_circle.draw')}</p>
            {showTries ? (
              <p className={styles.caption}>{t('game.perfect_circle.tries_left', { n: triesLeft })}</p>
            ) : null}
          </>
        ) : null}
        {phase === 'invalid' && hint ? (
          <p className={styles.hint} role="status">
            {t(`game.perfect_circle.hint.${hint}`)}
          </p>
        ) : null}
        {phase === 'scored' && result ? (
          <>
            <ScoreRing score={result.score} reducedMotion={reducedMotion} />
            {resultLine ? (
              <p className={styles.caption} aria-hidden="true">
                {resultLine}
              </p>
            ) : null}
            <p className={styles.srOnly} role="status">
              <span>{t('round.your_score')}</span> <span>{result.score}</span>
              {resultLine ? <span> {resultLine}</span> : null}
            </p>
          </>
        ) : null}
      </div>
      <div className={styles.board} style={{ inlineSize: side, blockSize: side }}>
        <canvas
          ref={canvasRef}
          className={phase === 'invalid' ? `${styles.canvas} ${styles.fading}` : styles.canvas}
          style={{ inlineSize: side, blockSize: side }}
          data-testid="pc-canvas"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
        />
        {phase === 'canvas' ? <span className={styles.centreDot} aria-hidden="true" /> : null}
      </div>
    </div>
  );
}

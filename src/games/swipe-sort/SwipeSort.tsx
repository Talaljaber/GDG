/**
 * Swipe Sort screen. Source of truth: docs/games/swipe-sort.md.
 *
 * Chevrons appear one at a time on a swipe surface: swipe blue ones LEFT and
 * amber ones RIGHT (physical screen sides, the same in Arabic: game
 * geometry, never mirrored). A blue chevron always points left, an amber one
 * right (the shape cue beside colour). Each item has a window I(t) that
 * shrinks from 1100 to 600 ms over the 30 s game clock; no swipe in time is a
 * miss. The first chevron appears at roundStartEpoch + 1.5 s (never from
 * mount, so a phone hidden during the 3-2-1 or the intro doesn't start
 * late). Swipe time = performance.now() at the swipe registering (40 px of
 * horizontal travel) minus the item's onset; every clock is an epoch
 * persisted through onProgress, so a reload never resets it (ADR-018). Only
 * the live item a drag started on follows the finger.
 *
 * Browser-gesture defence (§3, §9): `touch-action: none` on the surface, a
 * non-passive `touchmove` listener that calls preventDefault, a non-passive
 * `touchstart` edge guard, `overscroll-behavior: none` on <html>/<body>
 * while mounted, and the surface inset by `--swipe-safe-inset`. All removed
 * on unmount.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { useLang, useT } from '../../i18n';
import type { GameProps } from '../types';
import { Chevron } from '../odd-one-out/Chevron';
import { itemFor, type SwipeSide } from './items';
import { GESTURE_IDLE, isInEdgeBand, reduceGesture, type GestureState } from './gesture';
import { buildRaw, SS_GAME_MS, SS_GAP_MS, scoreSwipeSort } from './scoring';
import {
  catchUp,
  currentWindowMs,
  gameEndEpoch,
  initialSnapshot,
  itemDeadline,
  type SwipeSortSnapshot,
} from './timeline';
import styles from './SwipeSort.module.css';

export type { SwipeSortSnapshot };

/** Intro card duration (docs/games/swipe-sort.md §3). */
const INTRO_MS = 1500;
/** The countdown number turns amber for the last 5 s (as Color Clash). */
const AMBER_FROM_MS = 5000;

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function viewportWidth(): number {
  return window.innerWidth || document.documentElement.clientWidth;
}

/** A small `<` glyph in the brand stroke style (currentColor), for the catch labels. */
function ArrowGlyph({ side }: { side: SwipeSide }) {
  return (
    <svg className={styles.glyph} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d={side === 'left' ? 'M15 5 L8 12 L15 19' : 'M9 5 L16 12 L9 19'}
        fill="none"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SwipeSort({ seed, roundStartEpoch, roundEnded, snapshot, onProgress, onFinish }: GameProps<SwipeSortSnapshot>) {
  const t = useT();
  const { dir } = useLang();
  const [state, setState] = useState<SwipeSortSnapshot>(() => snapshot ?? initialSnapshot());
  // Display-only re-render for the countdown; never persisted or reported.
  const [tick, setTick] = useState(0);
  // Bumped when the scheduler fires before anything is due (or the page becomes visible), so it re-arms.
  const [wake, setWake] = useState(0);

  const stateRef = useRef(state);
  stateRef.current = state;
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;
  const roundStartEpochRef = useRef(roundStartEpoch);
  roundStartEpochRef.current = roundStartEpoch;

  const rootRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const chevronRef = useRef<HTMLDivElement | null>(null);
  // performance.now() at the current item's onset (back-dated when the onset
  // was on a past epoch); null outside an item.
  const perfStartRef = useRef<number | null>(null);
  const gestureRef = useRef<GestureState>(GESTURE_IDLE);
  // The item a tracked drag started on: a drag only ever sorts that item.
  const dragItemRef = useRef<number>(-1);
  const finishedRef = useRef(false);
  const reducedMotionRef = useRef<boolean | null>(null);
  if (reducedMotionRef.current === null) reducedMotionRef.current = prefersReducedMotion();
  const reducedMotion = reducedMotionRef.current;

  const commit = useCallback((next: SwipeSortSnapshot) => {
    stateRef.current = next;
    setState(next);
    onProgressRef.current(next);
  }, []);

  const setDrag = useCallback(
    (dx: number) => {
      if (reducedMotion) return;
      chevronRef.current?.style.setProperty('--ss-drag', `${dx}px`);
    },
    [reducedMotion],
  );

  const finishNow = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    const now = Date.now();
    // Every window that elapsed on the epochs is a miss; the item still open doesn't count (§9).
    const current = catchUp(stateRef.current, now);
    const raw = buildRaw(current.correct, current.wrong, current.missed, current.swipeSumMs);
    const score = scoreSwipeSort(raw);
    const durationMs = Math.min(120_000, Math.max(0, now - roundStartEpochRef.current));
    perfStartRef.current = null;
    gestureRef.current = GESTURE_IDLE;
    commit({ ...current, phase: 'done', itemStartEpoch: null, gapEndEpoch: null, feedback: null, side: null });
    onFinishRef.current({ score, raw, durationMs });
  }, [commit]);

  /** Applies whatever is due on the epochs (misses, gap ends, the game end). */
  const runTimeline = useCallback(() => {
    const current = stateRef.current;
    const gameEnd = gameEndEpoch(current);
    if (current.phase !== 'play' || gameEnd === null || finishedRef.current) return;
    const now = Date.now();
    if (now >= gameEnd) {
      finishNow();
      return;
    }
    const next = catchUp(current, now);
    if (next === current) {
      setWake((n) => n + 1);
      return;
    }
    if (next.itemStartEpoch !== current.itemStartEpoch) {
      perfStartRef.current = next.itemStartEpoch !== null ? performance.now() - (now - next.itemStartEpoch) : null;
    }
    commit(next);
  }, [commit, finishNow]);

  const registerSwipe = useCallback(
    (side: SwipeSide) => {
      const current = stateRef.current;
      const deadline = itemDeadline(current);
      const gameEnd = gameEndEpoch(current);
      // Every early return below comes after the gesture was consumed: the
      // chevron springs back (nothing else would reset it).
      if (current.phase !== 'play' || deadline === null || gameEnd === null || current.gapEndEpoch !== null) {
        setDrag(0);
        return;
      }
      if (dragItemRef.current !== current.itemIndex) {
        setDrag(0);
        return;
      }
      const now = Date.now();
      // Past the window or the clock: the scheduler is about to count the miss / end the game.
      if (now >= deadline || now >= gameEnd) {
        setDrag(0);
        return;
      }
      const rawMs =
        perfStartRef.current !== null ? performance.now() - perfStartRef.current : now - (current.itemStartEpoch as number);
      const swipeMs = Math.round(Math.max(0, Math.min(rawMs, currentWindowMs(current))));
      perfStartRef.current = null;
      const isCorrect = side === itemFor(seed, current.itemIndex).side;
      commit({
        ...current,
        correct: current.correct + (isCorrect ? 1 : 0),
        wrong: current.wrong + (isCorrect ? 0 : 1),
        swipeSumMs: current.swipeSumMs + (isCorrect ? swipeMs : 0),
        itemStartEpoch: null,
        gapEndEpoch: now + SS_GAP_MS,
        feedback: isCorrect ? 'correct' : 'wrong',
        side,
      });
    },
    [commit, seed, setDrag],
  );

  // ---- pointer handlers (the surface) ----

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const current = stateRef.current;
    // Only a live item can be sorted; the intro, the gap and the end ignore input.
    if (current.phase !== 'play' || current.itemStartEpoch === null || current.gapEndEpoch !== null) return;
    const step = reduceGesture(gestureRef.current, {
      type: 'down',
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      viewportWidth: viewportWidth(),
    });
    if (step.state === gestureRef.current) return; // second finger or edge-started touch
    gestureRef.current = step.state;
    dragItemRef.current = current.itemIndex;
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // Capture is best effort (a pointer that already ended can't be captured).
    }
  }, []);

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const before = gestureRef.current;
      if (before.pointerId === null || event.pointerId !== before.pointerId) return;
      const step = reduceGesture(before, { type: 'move', pointerId: event.pointerId, x: event.clientX, y: event.clientY });
      gestureRef.current = step.state;
      if (step.swipe) {
        registerSwipe(step.swipe);
        return;
      }
      // Only the live item the drag started on follows the finger: a drag held
      // across a miss never moves the next chevron (it can't sort it, §3).
      const current = stateRef.current;
      if (dragItemRef.current === current.itemIndex && current.itemStartEpoch !== null) setDrag(step.dx);
      else setDrag(0);
    },
    [registerSwipe, setDrag],
  );

  const handlePointerEnd = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const before = gestureRef.current;
      if (before.pointerId === null || event.pointerId !== before.pointerId) return;
      gestureRef.current = reduceGesture(before, { type: event.type === 'pointercancel' ? 'cancel' : 'up', pointerId: event.pointerId }).state;
      // Released short of a swipe (or taken by the browser): the chevron springs back, the item keeps its window.
      setDrag(0);
    },
    [setDrag],
  );

  // ---- browser-gesture defence while mounted ----
  useEffect(() => {
    const root = rootRef.current;
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.overscrollBehavior;
    const prevBody = body.style.overscrollBehavior;
    // No pull-to-refresh / rubber band while the game is on screen.
    html.style.overscrollBehavior = 'none';
    body.style.overscrollBehavior = 'none';

    // Edge guard: a touch that starts in the 24 px edge band (where iOS starts
    // its edge-swipe-back) gets no default action from the page; the gesture
    // reducer also never starts a drag for it. Other touches are untouched.
    const onTouchStart = (event: TouchEvent) => {
      const touch = event.changedTouches?.[0];
      if (!touch || !event.cancelable) return;
      if (isInEdgeBand(touch.clientX, viewportWidth())) event.preventDefault();
    };
    // While swiping: no scroll, no pull-to-refresh, no history swipe (iOS < 16 and Chrome ignore
    // touch-action alone for some of these). Every touch that starts on the surface is a swipe.
    const onTouchMove = (event: TouchEvent) => {
      if (!event.cancelable) return;
      const surface = surfaceRef.current;
      const onSurface = surface !== null && event.target instanceof Node && surface.contains(event.target);
      if (onSurface || gestureRef.current.pointerId !== null) event.preventDefault();
    };
    // A screen lock / tab switch throttles timers: re-run the timeline as soon as the page is back.
    const onVisibility = () => {
      if (document.visibilityState === 'visible') setWake((n) => n + 1);
    };

    root?.addEventListener('touchstart', onTouchStart, { passive: false });
    root?.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      root?.removeEventListener('touchstart', onTouchStart);
      root?.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('visibilitychange', onVisibility);
      html.style.overscrollBehavior = prevHtml;
      body.style.overscrollBehavior = prevBody;
    };
  }, []);

  // Intro card -> first chevron at roundStartEpoch + 1.5 s: the 30 s game
  // clock is anchored on the round start, never on mount, so a phone hidden
  // during the 3-2-1 or the intro doesn't start late (§3). A later mount or
  // return lands on that epoch and the scheduler counts the missed items.
  useEffect(() => {
    if (state.phase !== 'intro') return;
    const onset = roundStartEpochRef.current + INTRO_MS;
    const timer = window.setTimeout(() => {
      const now = Date.now();
      if (now < onset) {
        setWake((n) => n + 1);
        return;
      }
      // Back-dated to the onset epoch, as after a reload.
      perfStartRef.current = performance.now() - (now - onset);
      commit({ ...stateRef.current, phase: 'play', gameStartEpoch: onset, itemIndex: 0, itemStartEpoch: onset });
      // A late mount / return: count what already elapsed (or end the game) at once.
      if (now > onset) runTimeline();
    }, Math.max(0, onset - Date.now()));
    return () => window.clearTimeout(timer);
  }, [state.phase, wake, commit, runTimeline]);

  // One scheduler for what is due on the epochs: the game end, the item's
  // deadline (a miss) and the end of a gap (resumable after a reload).
  useEffect(() => {
    const gameEnd = gameEndEpoch(state);
    if (state.phase !== 'play' || gameEnd === null) return;
    const deadline = itemDeadline(state);
    const due = Math.min(state.gapEndEpoch ?? deadline ?? gameEnd, gameEnd);
    const timer = window.setTimeout(runTimeline, Math.max(0, due - Date.now()));
    return () => window.clearTimeout(timer);
  }, [state, wake, runTimeline]);

  // After a reload into a live item, time it from its stored onset (the epoch, back-dated).
  useEffect(() => {
    const s = stateRef.current;
    if (s.phase === 'play' && s.itemStartEpoch !== null && perfStartRef.current === null) {
      perfStartRef.current = performance.now() - (Date.now() - s.itemStartEpoch);
    }
  }, []);

  // Countdown display only.
  useEffect(() => {
    if (state.phase !== 'play') return;
    const timer = window.setTimeout(() => setTick((n) => n + 1), reducedMotion ? 1000 : 250);
    return () => window.clearTimeout(timer);
  }, [state.phase, tick, reducedMotion]);

  // The shell signals the round is over: finish immediately (§9).
  useEffect(() => {
    if (roundEnded) finishNow();
  }, [roundEnded, finishNow]);

  const item = useMemo(() => itemFor(seed, state.itemIndex), [seed, state.itemIndex]);

  let body: ReactNode;
  if (state.phase === 'intro') {
    body = (
      <div className={styles.center}>
        <div className={styles.intro}>
          <p className={styles.eyebrow}>{t('game.swipe_sort.intro')}</p>
          <h1 className={styles.title}>{t('game.swipe_sort.name')}</h1>
          <p className={styles.pitch}>{t('game.swipe_sort.pitch')}</p>
        </div>
      </div>
    );
  } else if (state.phase === 'done') {
    body = (
      <div className={styles.center}>
        <p className={styles.caption} data-testid="ss-done">
          {t('game.swipe_sort.times_up')}
        </p>
      </div>
    );
  } else {
    const remainingMs = Math.max(0, (state.gameStartEpoch ?? Date.now()) + SS_GAME_MS - Date.now());
    const secondsLeft = Math.ceil(remainingMs / 1000);
    const fraction = remainingMs / SS_GAME_MS;
    const isAmber = remainingMs <= AMBER_FROM_MS;
    const inGap = state.gapEndEpoch !== null;
    const showChevron = !inGap || (!reducedMotion && state.feedback !== null);

    const chevronClasses = [styles.item];
    if (inGap && (state.feedback === 'correct' || state.feedback === 'wrong')) {
      chevronClasses.push(state.side === 'left' ? styles.flyLeft : styles.flyRight);
    } else if (inGap && state.feedback === 'missed') {
      chevronClasses.push(styles.fade);
    }

    const zoneClass = (side: SwipeSide) => {
      const classes = [styles.zone];
      if (inGap && state.side === side && state.feedback === 'correct') classes.push(styles.zoneCorrect);
      if (inGap && state.side === side && state.feedback === 'wrong') classes.push(styles.zoneWrong);
      return classes.join(' ');
    };

    body = (
      <>
        <div className={styles.countdownWrap}>
          <div className={styles.countdownBar}>
            <div
              className={isAmber ? `${styles.countdownFill} ${styles.countdownFillAmber}` : styles.countdownFill}
              style={{ transform: `scaleX(${fraction})`, transformOrigin: dir === 'rtl' ? '100% 50%' : '0% 50%' }}
            />
          </div>
          <span className={isAmber ? `${styles.countdownNumber} ${styles.countdownNumberAmber}` : styles.countdownNumber}>
            {secondsLeft}
          </span>
        </div>
        <p className={styles.counter}>{t('game.swipe_sort.sorted', { n: state.correct })}</p>

        <div
          ref={surfaceRef}
          className={styles.surface}
          role="img"
          aria-label={t(`game.swipe_sort.zone_${item.color}`)}
          data-testid="ss-surface"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
        >
          <div className={styles.stage}>
            {showChevron ? (
              <div
                key={state.itemIndex}
                ref={chevronRef}
                className={chevronClasses.join(' ')}
                data-testid="ss-item"
                data-color={item.color}
                data-side={item.side}
                data-index={state.itemIndex}
              >
                <Chevron
                  color={item.color}
                  mirrored={item.color === 'amber'}
                  rotationDeg={item.tiltDeg}
                  className={styles.chevronSvg}
                />
              </div>
            ) : null}
            {inGap && state.feedback === 'wrong' ? (
              <p className={styles.feedback} data-testid="ss-wrong">
                {t('game.swipe_sort.wrong')}
              </p>
            ) : inGap && state.feedback === 'missed' ? (
              <p className={styles.feedback} data-testid="ss-missed">
                {t('game.swipe_sort.missed')}
              </p>
            ) : null}
          </div>

          <div className={styles.zones}>
            <div className={zoneClass('left')} data-testid="ss-zone-left">
              <ArrowGlyph side="left" />
              <span className={`${styles.swatch} ${styles.swatchBlue}`} aria-hidden="true" />
              <span className={styles.zoneName}>{t('game.swipe_sort.zone_blue')}</span>
            </div>
            <div className={zoneClass('right')} data-testid="ss-zone-right">
              <span className={styles.zoneName}>{t('game.swipe_sort.zone_amber')}</span>
              <span className={`${styles.swatch} ${styles.swatchAmber}`} aria-hidden="true" />
              <ArrowGlyph side="right" />
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <div ref={rootRef} className={styles.screen} data-testid={state.phase === 'play' ? 'ss-play' : undefined}>
      {body}
    </div>
  );
}

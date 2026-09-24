/**
 * Odd One Out screen. Source of truth: docs/games/odd-one-out.md.
 *
 * Three grids of chevrons, each harder; tap the odd one. find_ms is
 * measured from the first painted frame (requestAnimationFrame after
 * render) to pointerdown via performance.now(); a wrong tap adds a 2s
 * scoring penalty and shakes the tile; each grid has a 20s timeout.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { useT } from '../../i18n';
import type { GameProps } from '../types';
import { Chevron } from './Chevron';
import { GRID3_ROTATION_DEG, GRID_SIZES, oddTileIndex, tileTheme } from './grid';
import { computeGridLayout } from './layout';
import { buildRaw, scoreOddOneOut, type OddOneOutGrid } from './scoring';
import styles from './OddOneOut.module.css';

export { GRID3_ROTATION_DEG };

/** Intro card duration (docs/games/odd-one-out.md §3). */
const INTRO_MS = 1500;

/** The "found"/"timeout" transition between grids (odd tile pulses/rings). */
const TRANSITION_MS = 600;

/** Per-grid timeout (§3). */
const GRID_TIMEOUT_MS = 20_000;

/** Only the first pointerdown per 100ms counts, so a two-finger tap counts once (§9). */
const POINTER_DEBOUNCE_MS = 100;

/** How long the wrong-tap shake/"+2s" overlay stays up (§6). */
const WRONG_TAP_FLASH_MS = 300;

type Phase = 'intro' | 'grid' | 'transition';
type TransitionType = 'found' | 'timeout' | null;

export interface OddOneOutSnapshot {
  phase: Phase;
  /** Completed grids, in order. Length also determines the current/next grid's index. */
  grids: OddOneOutGrid[];
  /** Date.now() when the current grid's first frame was painted; null outside `grid`. */
  gridStartEpoch: number | null;
  /** Wrong taps so far on the in-progress grid. */
  wrongTapsCurrent: number;
  /** Which transition is showing; null outside `transition`. */
  transitionType: TransitionType;
}

function initialSnapshot(): OddOneOutSnapshot {
  return { phase: 'intro', grids: [], gridStartEpoch: null, wrongTapsCurrent: 0, transitionType: null };
}

function viewportWidth(): number {
  return typeof window !== 'undefined' && window.innerWidth > 0 ? window.innerWidth : 360;
}

export function OddOneOut({
  seed,
  roundStartEpoch,
  roundEnded,
  snapshot,
  onProgress,
  onFinish,
}: GameProps<OddOneOutSnapshot>) {
  const t = useT();
  const [state, setState] = useState<OddOneOutSnapshot>(() => snapshot ?? initialSnapshot());
  const [wrongFlash, setWrongFlash] = useState<{ tileIndex: number; key: number } | null>(null);

  // Refs mirror the latest state/props so timers and handlers registered in
  // one render never act on stale closures (see stop-the-clock for the same
  // pattern; onProgress/onFinish are not guaranteed referentially stable).
  const stateRef = useRef(state);
  stateRef.current = state;
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;
  const roundStartEpochRef = useRef(roundStartEpoch);
  roundStartEpochRef.current = roundStartEpoch;

  // performance.now() at the live paint of the current grid; null when this
  // grid was resumed from a reload (performance.now() resets on reload, so
  // find_ms falls back to the persisted epoch in that case, like stop-the-clock).
  const perfStartRef = useRef<number | null>(null);
  const lastPointerDownPerfRef = useRef<number>(-Infinity);
  const finishedRef = useRef(false);
  const flashTimerRef = useRef<number | null>(null);
  // Set by the fresh-grid effect below when it schedules the 20s timeout
  // itself (directly, inside the rAF callback); tells the resumable-timeout
  // effect to skip re-scheduling for that same grid once the epoch commit
  // it made comes back around on the next render.
  const freshTimeoutGridRef = useRef<number | null>(null);
  // The currently pending 20s grid-timeout id, if any. Tracked here (rather
  // than solely relying on a useEffect cleanup) so it is reliably cleared
  // the moment a grid actually ends, regardless of how late React gets
  // around to re-rendering after the state update that scheduled it (a
  // rAF-driven commit can lag React's own effect flush under fake timers).
  const activeGridTimeoutIdRef = useRef<number | null>(null);
  const clearActiveGridTimeout = useCallback(() => {
    if (activeGridTimeoutIdRef.current !== null) {
      window.clearTimeout(activeGridTimeoutIdRef.current);
      activeGridTimeoutIdRef.current = null;
    }
  }, []);

  const commit = useCallback((next: OddOneOutSnapshot) => {
    stateRef.current = next;
    setState(next);
    onProgressRef.current(next);
  }, []);

  const finishNow = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    clearActiveGridTimeout();
    const current = stateRef.current;
    const grids = [...current.grids];
    const inProgressIndex = grids.length;
    // Timeout rule (§9 "round ends early"): the current and every remaining
    // grid count as timed out, no partial credit.
    for (let i = inProgressIndex; i < GRID_SIZES.length; i++) {
      grids.push({
        size: GRID_SIZES[i],
        find_ms: GRID_TIMEOUT_MS,
        wrong_taps: i === inProgressIndex ? current.wrongTapsCurrent : 0,
        timed_out: true,
      });
    }
    const raw = buildRaw(grids);
    const score = scoreOddOneOut(raw);
    const durationMs = Math.min(120_000, Date.now() - roundStartEpochRef.current);
    onFinishRef.current({ score, raw, durationMs });
  }, [clearActiveGridTimeout]);

  const recordGridEnd = useCallback(
    (timedOut: boolean, findMs: number) => {
      const current = stateRef.current;
      if (current.phase !== 'grid') return;
      clearActiveGridTimeout();
      const gridIndex = current.grids.length;
      const result: OddOneOutGrid = {
        size: GRID_SIZES[gridIndex],
        find_ms: timedOut ? GRID_TIMEOUT_MS : findMs,
        wrong_taps: current.wrongTapsCurrent,
        timed_out: timedOut,
      };
      perfStartRef.current = null;
      commit({
        ...current,
        phase: 'transition',
        transitionType: timedOut ? 'timeout' : 'found',
        grids: [...current.grids, result],
        gridStartEpoch: null,
        wrongTapsCurrent: 0,
      });
    },
    [commit, clearActiveGridTimeout],
  );

  const handleTileTap = useCallback(
    (tileIndex: number) => (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      const now = performance.now();
      if (now - lastPointerDownPerfRef.current < POINTER_DEBOUNCE_MS) {
        return; // multi-touch: only the first pointerdown per 100ms counts (§9).
      }
      lastPointerDownPerfRef.current = now;

      const current = stateRef.current;
      if (current.phase !== 'grid' || current.gridStartEpoch === null) {
        return; // taps during intro/transitions, or before the first paint, are ignored (§9).
      }

      const gridIndex = current.grids.length;
      const size = GRID_SIZES[gridIndex];
      const odd = oddTileIndex(seed, gridIndex, size);

      if (tileIndex === odd) {
        const findMs =
          perfStartRef.current !== null
            ? now - perfStartRef.current
            : Date.now() - current.gridStartEpoch;
        recordGridEnd(false, Math.round(Math.max(0, findMs)));
        return;
      }

      // Wrong tap: +2s scoring penalty, shake + "+2s" overlay; the grid stays up.
      if (flashTimerRef.current !== null) {
        window.clearTimeout(flashTimerRef.current);
      }
      const flashKey = Date.now();
      setWrongFlash({ tileIndex, key: flashKey });
      flashTimerRef.current = window.setTimeout(() => {
        setWrongFlash((prev) => (prev?.key === flashKey ? null : prev));
        flashTimerRef.current = null;
      }, WRONG_TAP_FLASH_MS);
      commit({ ...current, wrongTapsCurrent: current.wrongTapsCurrent + 1 });
    },
    [commit, recordGridEnd, seed],
  );

  // Intro card -> first grid.
  useEffect(() => {
    if (state.phase !== 'intro') return;
    const timer = window.setTimeout(() => {
      commit({ ...stateRef.current, phase: 'grid', gridStartEpoch: null });
    }, INTRO_MS);
    return () => window.clearTimeout(timer);
  }, [state.phase, commit]);

  // A fresh grid: capture the first painted frame, then start its clock
  // *and* its 20s timeout together, directly inside the rAF callback (not
  // left to the effect below, which depends on React state) so the timeout
  // does not depend on a second render/effect pass observing the new
  // gridStartEpoch before continuing (a real browser flushes that
  // immediately, but nothing guarantees a fake-timer-driven test does).
  // Ownership of the pending timeout lives in activeGridTimeoutIdRef, not
  // in this effect's cleanup, so a delayed re-render of this same effect
  // (once React catches up) can't cancel a timer that already fired or
  // whose ownership has moved on.
  useEffect(() => {
    if (state.phase !== 'grid' || state.gridStartEpoch !== null) return;
    const gridIndex = state.grids.length;
    const rafId = window.requestAnimationFrame(() => {
      perfStartRef.current = performance.now();
      const epoch = Date.now();
      freshTimeoutGridRef.current = gridIndex;
      clearActiveGridTimeout();
      activeGridTimeoutIdRef.current = window.setTimeout(() => recordGridEnd(true, GRID_TIMEOUT_MS), GRID_TIMEOUT_MS);
      commit({ ...stateRef.current, gridStartEpoch: epoch });
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [state.phase, state.gridStartEpoch, state.grids.length, commit, recordGridEnd, clearActiveGridTimeout]);

  // The grid's 20s timeout, resumed from a persisted epoch after a reload.
  // Skips re-scheduling when the epoch was just set by the fresh-grid
  // effect above (it already scheduled the timeout itself).
  useEffect(() => {
    if (state.phase !== 'grid' || state.gridStartEpoch === null) return;
    if (freshTimeoutGridRef.current === state.grids.length) {
      freshTimeoutGridRef.current = null;
      return;
    }
    const remaining = state.gridStartEpoch + GRID_TIMEOUT_MS - Date.now();
    if (remaining <= 0) {
      recordGridEnd(true, GRID_TIMEOUT_MS);
      return;
    }
    clearActiveGridTimeout();
    activeGridTimeoutIdRef.current = window.setTimeout(() => recordGridEnd(true, GRID_TIMEOUT_MS), remaining);
  }, [state.phase, state.gridStartEpoch, state.grids.length, recordGridEnd, clearActiveGridTimeout]);

  // Transition (found/timeout) -> next grid, or finish after grid 3.
  useEffect(() => {
    if (state.phase !== 'transition') return;
    const timer = window.setTimeout(() => {
      const current = stateRef.current;
      if (current.phase !== 'transition') return;
      if (current.grids.length >= GRID_SIZES.length) {
        finishNow();
      } else {
        commit({ ...current, phase: 'grid', transitionType: null, gridStartEpoch: null });
      }
    }, TRANSITION_MS);
    return () => window.clearTimeout(timer);
  }, [state.phase, state.grids.length, commit, finishNow]);

  // The shell signals the round is over: finish immediately (§9).
  useEffect(() => {
    if (roundEnded) {
      finishNow();
    }
  }, [roundEnded, finishNow]);

  useEffect(() => {
    return () => {
      if (flashTimerRef.current !== null) {
        window.clearTimeout(flashTimerRef.current);
      }
      clearActiveGridTimeout();
    };
  }, [clearActiveGridTimeout]);

  if (state.phase === 'intro') {
    return (
      <div className={styles.screen}>
        <div className={styles.intro}>
          <p className={styles.eyebrow}>{t('game.odd_one_out.intro')}</p>
          <h1 className={styles.title}>{t('game.odd_one_out.name')}</h1>
          <p className={styles.pitch}>{t('game.odd_one_out.pitch')}</p>
        </div>
      </div>
    );
  }

  // grid_n (active) or a found/timeout transition: both render the same grid
  // (transition keeps showing the just-finished one) with different modes.
  const displayIndex = state.phase === 'transition' ? state.grids.length - 1 : state.grids.length;
  const size = GRID_SIZES[displayIndex];
  const oddIndex = oddTileIndex(seed, displayIndex, size);
  const mode: 'active' | TransitionType = state.phase === 'transition' ? state.transitionType : 'active';
  const layout = computeGridLayout(viewportWidth(), size);
  const showLabel = layout.tileSize >= 40;

  const tiles = Array.from({ length: size * size }, (_, i) => i);

  return (
    <div className={styles.screen}>
      {showLabel ? (
        <p className={styles.gridLabel}>{t('game.odd_one_out.grid', { n: displayIndex + 1 })}</p>
      ) : null}
      {mode === 'timeout' ? <p className={styles.timeoutCaption}>{t('game.odd_one_out.timeout')}</p> : null}
      <div
        className={styles.grid}
        style={
          {
            gridTemplateColumns: `repeat(${size}, 1fr)`,
            '--ooo-side': `${layout.side}px`,
            '--ooo-gap': `${layout.gap}px`,
          } as CSSProperties
        }
      >
        {tiles.map((tileIndex) => {
          const isOdd = tileIndex === oddIndex;
          const theme = tileTheme(displayIndex, isOdd);
          const isFlashing = wrongFlash?.tileIndex === tileIndex;
          const tileClasses = [styles.tile];
          if (mode === 'found' && !isOdd) tileClasses.push(styles.tileDimmed);
          if (mode === 'found' && isOdd) tileClasses.push(styles.tileFound);
          if (mode === 'timeout' && isOdd) tileClasses.push(styles.tileTimedOut);
          if (isFlashing) tileClasses.push(styles.tileShake);

          return (
            <button
              key={tileIndex}
              type="button"
              className={tileClasses.join(' ')}
              onPointerDown={handleTileTap(tileIndex)}
              disabled={mode !== 'active'}
              aria-hidden={mode !== 'active'}
              tabIndex={mode === 'active' ? 0 : -1}
            >
              <Chevron
                className={styles.chevron}
                color={theme.color}
                mirrored={theme.mirrored}
                rotationDeg={theme.rotationDeg}
              />
              {isFlashing ? (
                <span className={styles.penalty}>
                  <bdi dir="ltr">{t('game.odd_one_out.penalty')}</bdi>
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

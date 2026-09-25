/**
 * Close the Brackets screen. Source of truth: docs/games/close-brackets.md.
 *
 * Openers appear in a row; the player closes them last one first on four
 * fixed buttons `)` `]` `}` `>`. Length 2, +1 per solved sequence up to 8; a
 * wrong closer fails the sequence (same length next); every sequence has a
 * 10 s timeout; the whole game runs 30 s from the first sequence. All clocks
 * are epochs persisted through onProgress, so a reload never resets them
 * (ADR-018); solve times use performance.now() on pointerdown while live.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useLang, useT } from '../../i18n';
import type { GameProps } from '../types';
import { Bracket } from './Bracket';
import { BRACKET_KINDS, expectedCloser, openersFor, type BracketKind } from './sequence';
import {
  buildRaw,
  CB_GAME_MS,
  CB_SEQUENCE_TIMEOUT_MS,
  lengthAfterSolves,
  scoreCloseBrackets,
} from './scoring';
import styles from './CloseBrackets.module.css';

/** Intro card duration (docs/games/close-brackets.md §3). */
const INTRO_MS = 1500;
/** Transition after a solved sequence (row flashes amber). */
const SOLVED_MS = 400;
/** Transition after a failed or timed-out sequence (row shakes / caption). */
const FAILED_MS = 700;
/** A second pointerdown within this window is a bounce (§9). */
const DEBOUNCE_MS = 60;
/** How long a button stays amber after a correct tap (§6). */
const FLASH_MS = 150;
/** The countdown number turns amber for the last 5 s (§7). */
const AMBER_FROM_MS = 5000;

type Phase = 'intro' | 'play' | 'done';
type Transition = 'solved' | 'failed' | 'timeout' | null;

export interface CloseBracketsSnapshot {
  phase: Phase;
  /** Date.now() when the first sequence appeared (the 30 s game clock); null in `intro`. */
  gameStartEpoch: number | null;
  solved: number;
  failed: number;
  timeouts: number;
  /** Sum over solved sequences of (last correct tap - sequence start), ms. */
  solveMs: number;
  /** Length of the current sequence (the one just ended, during a transition). */
  seqLength: number;
  /** k: how many sequences of this length were shown before this one (seeds the openers). */
  seqIndex: number;
  /** Date.now() when the current sequence appeared; null during a transition or the intro. */
  seqStartEpoch: number | null;
  /** Correct closers placed in the current sequence. */
  closed: number;
  transition: Transition;
  /** Date.now() at which the current transition ends; null outside a transition. */
  transitionEndEpoch: number | null;
}

function initialSnapshot(): CloseBracketsSnapshot {
  return {
    phase: 'intro',
    gameStartEpoch: null,
    solved: 0,
    failed: 0,
    timeouts: 0,
    solveMs: 0,
    seqLength: lengthAfterSolves(0),
    seqIndex: 0,
    seqStartEpoch: null,
    closed: 0,
    transition: null,
    transitionEndEpoch: null,
  };
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function CloseBrackets({
  seed,
  roundStartEpoch,
  roundEnded,
  snapshot,
  onProgress,
  onFinish,
}: GameProps<CloseBracketsSnapshot>) {
  const t = useT();
  const { dir } = useLang();
  const [state, setState] = useState<CloseBracketsSnapshot>(() => snapshot ?? initialSnapshot());
  const [flash, setFlash] = useState<{ kind: BracketKind; key: number } | null>(null);
  // Display-only re-render for the countdown; never persisted or reported.
  const [tick, setTick] = useState(0);
  // Bumped when the scheduler fires before anything is due, so it re-arms.
  const [wake, setWake] = useState(0);

  // Refs mirror the latest state/props so timers and handlers never act on
  // stale closures (same pattern as the other games).
  const stateRef = useRef(state);
  stateRef.current = state;
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;
  const roundStartEpochRef = useRef(roundStartEpoch);
  roundStartEpochRef.current = roundStartEpoch;

  // performance.now() when the current sequence appeared live; null when it
  // was restored from a reload (solve time then falls back to the epoch).
  const perfStartRef = useRef<number | null>(null);
  const lastPointerDownPerfRef = useRef<number>(-Infinity);
  const finishedRef = useRef(false);
  const flashTimerRef = useRef<number | null>(null);
  const reducedMotionRef = useRef<boolean | null>(null);
  if (reducedMotionRef.current === null) reducedMotionRef.current = prefersReducedMotion();
  const reducedMotion = reducedMotionRef.current;

  const commit = useCallback((next: CloseBracketsSnapshot) => {
    stateRef.current = next;
    setState(next);
    onProgressRef.current(next);
  }, []);

  const finishNow = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    const current = stateRef.current;
    // Timeout rule (§9): the open sequence simply doesn't count.
    const raw = buildRaw(current.solved, current.failed, current.timeouts, current.solveMs);
    const score = scoreCloseBrackets(raw);
    const durationMs = Math.min(120_000, Math.max(0, Date.now() - roundStartEpochRef.current));
    commit({ ...current, phase: 'done', seqStartEpoch: null, transition: null, transitionEndEpoch: null });
    onFinishRef.current({ score, raw, durationMs });
  }, [commit]);

  /** Ends the current transition: the next sequence appears now. */
  const startNextSequence = useCallback(() => {
    const current = stateRef.current;
    const nextLength = lengthAfterSolves(current.solved);
    const nextIndex = nextLength === current.seqLength ? current.seqIndex + 1 : 0;
    perfStartRef.current = performance.now();
    commit({
      ...current,
      seqLength: nextLength,
      seqIndex: nextIndex,
      seqStartEpoch: Date.now(),
      closed: 0,
      transition: null,
      transitionEndEpoch: null,
    });
  }, [commit]);

  const handleTap = useCallback(
    (kind: BracketKind) => (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      const nowPerf = performance.now();
      if (nowPerf - lastPointerDownPerfRef.current < DEBOUNCE_MS) return;
      lastPointerDownPerfRef.current = nowPerf;

      const current = stateRef.current;
      if (current.phase !== 'play' || current.transition !== null || current.seqStartEpoch === null) return;
      if (current.gameStartEpoch !== null && Date.now() >= current.gameStartEpoch + CB_GAME_MS) return;

      const openers = openersFor(seed, current.seqLength, current.seqIndex);
      if (kind !== expectedCloser(openers, current.closed)) {
        perfStartRef.current = null;
        commit({
          ...current,
          failed: current.failed + 1,
          seqStartEpoch: null,
          transition: 'failed',
          transitionEndEpoch: Date.now() + FAILED_MS,
        });
        return;
      }

      if (flashTimerRef.current !== null) window.clearTimeout(flashTimerRef.current);
      const key = nowPerf;
      setFlash({ kind, key });
      flashTimerRef.current = window.setTimeout(() => {
        setFlash((prev) => (prev?.key === key ? null : prev));
        flashTimerRef.current = null;
      }, FLASH_MS);

      const closed = current.closed + 1;
      if (closed < current.seqLength) {
        commit({ ...current, closed });
        return;
      }
      const elapsed =
        perfStartRef.current !== null ? nowPerf - perfStartRef.current : Date.now() - current.seqStartEpoch;
      perfStartRef.current = null;
      commit({
        ...current,
        closed,
        solved: current.solved + 1,
        solveMs: current.solveMs + Math.round(Math.max(0, Math.min(elapsed, CB_SEQUENCE_TIMEOUT_MS))),
        seqStartEpoch: null,
        transition: 'solved',
        transitionEndEpoch: Date.now() + SOLVED_MS,
      });
    },
    [commit, seed],
  );

  // Intro card -> first sequence; the 30 s game clock starts here.
  useEffect(() => {
    if (state.phase !== 'intro') return;
    const timer = window.setTimeout(() => {
      const now = Date.now();
      perfStartRef.current = performance.now();
      commit({ ...stateRef.current, phase: 'play', gameStartEpoch: now, seqStartEpoch: now });
    }, INTRO_MS);
    return () => window.clearTimeout(timer);
  }, [state.phase, commit]);

  // One scheduler for everything that is due on the epochs: the game end, the
  // sequence timeout and the end of a transition (resumable after a reload).
  useEffect(() => {
    if (state.phase !== 'play' || state.gameStartEpoch === null) return;
    const gameEnd = state.gameStartEpoch + CB_GAME_MS;
    const due =
      state.transition !== null
        ? Math.min(state.transitionEndEpoch ?? gameEnd, gameEnd)
        : Math.min((state.seqStartEpoch ?? gameEnd) + CB_SEQUENCE_TIMEOUT_MS, gameEnd);
    const timer = window.setTimeout(() => {
      const current = stateRef.current;
      if (current.phase !== 'play' || current.gameStartEpoch === null) return;
      const now = Date.now();
      if (now >= current.gameStartEpoch + CB_GAME_MS) {
        finishNow();
      } else if (current.transition !== null) {
        if (current.transitionEndEpoch !== null && now >= current.transitionEndEpoch) startNextSequence();
        else setWake((n) => n + 1);
      } else if (current.seqStartEpoch !== null && now >= current.seqStartEpoch + CB_SEQUENCE_TIMEOUT_MS) {
        perfStartRef.current = null;
        commit({
          ...current,
          timeouts: current.timeouts + 1,
          seqStartEpoch: null,
          transition: 'timeout',
          transitionEndEpoch: now + FAILED_MS,
        });
      } else {
        setWake((n) => n + 1);
      }
    }, Math.max(0, due - Date.now()));
    return () => window.clearTimeout(timer);
  }, [state, wake, commit, finishNow, startNextSequence]);

  // Countdown display only (re-renders without touching the persisted state).
  useEffect(() => {
    if (state.phase !== 'play') return;
    const timer = window.setTimeout(() => setTick((n) => n + 1), reducedMotion ? 1000 : 250);
    return () => window.clearTimeout(timer);
  }, [state.phase, tick, reducedMotion]);

  // The shell signals the round is over: finish immediately (§9).
  useEffect(() => {
    if (roundEnded) finishNow();
  }, [roundEnded, finishNow]);

  useEffect(
    () => () => {
      if (flashTimerRef.current !== null) window.clearTimeout(flashTimerRef.current);
    },
    [],
  );

  const openers = useMemo(
    () => openersFor(seed, state.seqLength, state.seqIndex),
    [seed, state.seqLength, state.seqIndex],
  );

  if (state.phase === 'intro') {
    return (
      <div className={`${styles.screen} ${styles.screenCenter}`}>
        <div className={styles.intro}>
          <p className={styles.eyebrow}>{t('game.close_brackets.intro')}</p>
          <h1 className={styles.title}>{t('game.close_brackets.name')}</h1>
          <p className={styles.pitch}>{t('game.close_brackets.pitch')}</p>
        </div>
      </div>
    );
  }

  if (state.phase === 'done') {
    return (
      <div className={`${styles.screen} ${styles.screenCenter}`}>
        <p className={styles.caption} data-testid="cb-done">
          {t('game.close_brackets.times_up')}
        </p>
      </div>
    );
  }

  const remainingMs = Math.max(0, (state.gameStartEpoch ?? Date.now()) + CB_GAME_MS - Date.now());
  const secondsLeft = Math.ceil(remainingMs / 1000);
  const fraction = remainingMs / CB_GAME_MS;
  const isAmber = remainingMs <= AMBER_FROM_MS;
  const len = openers.length;
  const nextSlot = state.transition === null ? len - 1 - state.closed : -1;

  const rowClasses = [styles.row];
  if (state.transition === 'solved') rowClasses.push(styles.rowSolved);
  if (state.transition === 'failed') rowClasses.push(styles.rowShake);

  return (
    <div className={styles.screen} data-testid="cb-play">
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
      <div className={styles.labels}>
        <span>{t('game.close_brackets.length', { n: state.seqLength })}</span>
        <span>{t('game.close_brackets.solved', { n: state.solved })}</span>
      </div>

      <div className={styles.board}>
        <div className={rowClasses.join(' ')} data-testid="cb-row" data-length={len} data-closed={state.closed}>
          {openers.map((kind, i) => {
            const placed = i >= len - state.closed;
            const slotClasses = [styles.slot];
            if (i === nextSlot) slotClasses.push(styles.slotNext);
            return (
              <div key={`${state.seqLength}-${state.seqIndex}-${i}`} className={styles.cell} data-kind={kind}>
                <Bracket kind={kind} className={styles.opener} />
                <div className={slotClasses.join(' ')}>
                  {placed ? <Bracket kind={kind} closer className={styles.closer} /> : null}
                </div>
              </div>
            );
          })}
        </div>
        <p className={styles.feedback} role="status">
          {state.transition === 'failed'
            ? t('game.close_brackets.wrong')
            : state.transition === 'timeout'
              ? t('game.close_brackets.timeout')
              : ''}
        </p>
      </div>

      <div className={styles.keys}>
        {BRACKET_KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            className={flash?.kind === kind ? `${styles.key} ${styles.keyFlash}` : styles.key}
            onPointerDown={handleTap(kind)}
            aria-label={t(`game.close_brackets.key.${kind}`)}
            data-testid={`cb-key-${kind}`}
          >
            <Bracket kind={kind} closer className={styles.keyGlyph} />
          </button>
        ))}
      </div>
    </div>
  );
}

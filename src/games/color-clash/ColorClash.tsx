/**
 * Color Clash screen. Source of truth: docs/games/color-clash.md.
 *
 * A colour word in a (usually different) ink; tap the INK. Three fixed
 * buttons (swatch + name), about 30 % congruent trials, 3 s per trial, a
 * 0.3 s gap after each, 30 s in total from the first word. Reaction times
 * are performance.now() on pointerdown while live; every clock is an epoch
 * persisted through onProgress, so a reload never resets it (ADR-018).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useLang, useT } from '../../i18n';
import type { GameProps } from '../types';
import { INKS, trialFor, type Ink } from './trials';
import { buildRaw, CC_GAME_MS, CC_GAP_MS, CC_TRIAL_TIMEOUT_MS, scoreColorClash } from './scoring';
import styles from './ColorClash.module.css';

/** Intro card duration (docs/games/color-clash.md §3). */
const INTRO_MS = 1500;
/** A second pointerdown within this window is a bounce (§9). */
const DEBOUNCE_MS = 60;
/** The countdown number turns amber for the last 5 s (§7). */
const AMBER_FROM_MS = 5000;

type Phase = 'intro' | 'play' | 'done';
type Feedback = 'correct' | 'wrong' | 'timeout' | null;

export interface ColorClashSnapshot {
  phase: Phase;
  /** Date.now() when the first word appeared (the 30 s game clock); null in `intro`. */
  gameStartEpoch: number | null;
  /** k of the current trial (the one just answered, during a gap). */
  trialIndex: number;
  /** Date.now() when the current word appeared; null during a gap or the intro. */
  trialStartEpoch: number | null;
  /** Date.now() at which the current gap ends; null outside a gap. */
  gapEndEpoch: number | null;
  correct: number;
  wrong: number;
  timeouts: number;
  /** Sum of the reaction times of the correct trials, ms. */
  correctRtSumMs: number;
  /** What the gap shows; null outside a gap. */
  feedback: Feedback;
  /** The ink tapped in the last trial (for the gap's ring or shake). */
  chosen: Ink | null;
}

function initialSnapshot(): ColorClashSnapshot {
  return {
    phase: 'intro',
    gameStartEpoch: null,
    trialIndex: 0,
    trialStartEpoch: null,
    gapEndEpoch: null,
    correct: 0,
    wrong: 0,
    timeouts: 0,
    correctRtSumMs: 0,
    feedback: null,
    chosen: null,
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

const INK_CLASS: Record<Ink, string> = {
  blue: styles.inkBlue,
  amber: styles.inkAmber,
  charcoal: styles.inkCharcoal,
};

export function ColorClash({ seed, roundStartEpoch, roundEnded, snapshot, onProgress, onFinish }: GameProps<ColorClashSnapshot>) {
  const t = useT();
  const { dir } = useLang();
  const [state, setState] = useState<ColorClashSnapshot>(() => snapshot ?? initialSnapshot());
  // Display-only re-render for the countdown; never persisted or reported.
  const [tick, setTick] = useState(0);
  // Bumped when the scheduler fires before anything is due, so it re-arms.
  const [wake, setWake] = useState(0);

  const stateRef = useRef(state);
  stateRef.current = state;
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;
  const roundStartEpochRef = useRef(roundStartEpoch);
  roundStartEpochRef.current = roundStartEpoch;

  // performance.now() when the current word appeared live; null after a reload
  // (the reaction time then falls back to the epoch).
  const perfStartRef = useRef<number | null>(null);
  const lastPointerDownPerfRef = useRef<number>(-Infinity);
  const finishedRef = useRef(false);
  const reducedMotionRef = useRef<boolean | null>(null);
  if (reducedMotionRef.current === null) reducedMotionRef.current = prefersReducedMotion();
  const reducedMotion = reducedMotionRef.current;

  const commit = useCallback((next: ColorClashSnapshot) => {
    stateRef.current = next;
    setState(next);
    onProgressRef.current(next);
  }, []);

  const finishNow = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    const current = stateRef.current;
    // Timeout rule (§9): the open trial simply doesn't count.
    const raw = buildRaw(current.correct, current.wrong, current.timeouts, current.correctRtSumMs);
    const score = scoreColorClash(raw);
    const durationMs = Math.min(120_000, Math.max(0, Date.now() - roundStartEpochRef.current));
    commit({ ...current, phase: 'done', trialStartEpoch: null, gapEndEpoch: null, feedback: null });
    onFinishRef.current({ score, raw, durationMs });
  }, [commit]);

  const startNextTrial = useCallback(() => {
    const current = stateRef.current;
    perfStartRef.current = performance.now();
    commit({
      ...current,
      trialIndex: current.trialIndex + 1,
      trialStartEpoch: Date.now(),
      gapEndEpoch: null,
      feedback: null,
      chosen: null,
    });
  }, [commit]);

  const handleTap = useCallback(
    (ink: Ink) => (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      const nowPerf = performance.now();
      if (nowPerf - lastPointerDownPerfRef.current < DEBOUNCE_MS) return;
      lastPointerDownPerfRef.current = nowPerf;

      const current = stateRef.current;
      if (current.phase !== 'play' || current.trialStartEpoch === null || current.gapEndEpoch !== null) return;
      if (current.gameStartEpoch !== null && Date.now() >= current.gameStartEpoch + CC_GAME_MS) return;

      const rawRt = perfStartRef.current !== null ? nowPerf - perfStartRef.current : Date.now() - current.trialStartEpoch;
      const rt = Math.round(Math.max(0, Math.min(rawRt, CC_TRIAL_TIMEOUT_MS)));
      perfStartRef.current = null;
      const isCorrect = ink === trialFor(seed, current.trialIndex).ink;
      commit({
        ...current,
        correct: current.correct + (isCorrect ? 1 : 0),
        wrong: current.wrong + (isCorrect ? 0 : 1),
        correctRtSumMs: current.correctRtSumMs + (isCorrect ? rt : 0),
        trialStartEpoch: null,
        gapEndEpoch: Date.now() + CC_GAP_MS,
        feedback: isCorrect ? 'correct' : 'wrong',
        chosen: ink,
      });
    },
    [commit, seed],
  );

  // Intro card -> first word; the 30 s game clock starts here.
  useEffect(() => {
    if (state.phase !== 'intro') return;
    const timer = window.setTimeout(() => {
      const now = Date.now();
      perfStartRef.current = performance.now();
      commit({ ...stateRef.current, phase: 'play', gameStartEpoch: now, trialIndex: 0, trialStartEpoch: now });
    }, INTRO_MS);
    return () => window.clearTimeout(timer);
  }, [state.phase, commit]);

  // One scheduler for what is due on the epochs: the game end, the trial
  // timeout and the end of a gap (resumable after a reload).
  useEffect(() => {
    if (state.phase !== 'play' || state.gameStartEpoch === null) return;
    const gameEnd = state.gameStartEpoch + CC_GAME_MS;
    const due =
      state.gapEndEpoch !== null
        ? Math.min(state.gapEndEpoch, gameEnd)
        : Math.min((state.trialStartEpoch ?? gameEnd) + CC_TRIAL_TIMEOUT_MS, gameEnd);
    const timer = window.setTimeout(() => {
      const current = stateRef.current;
      if (current.phase !== 'play' || current.gameStartEpoch === null) return;
      const now = Date.now();
      if (now >= current.gameStartEpoch + CC_GAME_MS) {
        finishNow();
      } else if (current.gapEndEpoch !== null) {
        if (now >= current.gapEndEpoch) startNextTrial();
        else setWake((n) => n + 1);
      } else if (current.trialStartEpoch !== null && now >= current.trialStartEpoch + CC_TRIAL_TIMEOUT_MS) {
        perfStartRef.current = null;
        commit({
          ...current,
          timeouts: current.timeouts + 1,
          trialStartEpoch: null,
          gapEndEpoch: now + CC_GAP_MS,
          feedback: 'timeout',
          chosen: null,
        });
      } else {
        setWake((n) => n + 1);
      }
    }, Math.max(0, due - Date.now()));
    return () => window.clearTimeout(timer);
  }, [state, wake, commit, finishNow, startNextTrial]);

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

  const trial = useMemo(() => trialFor(seed, state.trialIndex), [seed, state.trialIndex]);

  if (state.phase === 'intro') {
    return (
      <div className={`${styles.screen} ${styles.screenCenter}`}>
        <div className={styles.intro}>
          <p className={styles.eyebrow}>{t('game.color_clash.intro')}</p>
          <h1 className={styles.title}>{t('game.color_clash.name')}</h1>
          <p className={styles.pitch}>{t('game.color_clash.pitch')}</p>
        </div>
      </div>
    );
  }

  if (state.phase === 'done') {
    return (
      <div className={`${styles.screen} ${styles.screenCenter}`}>
        <p className={styles.caption} data-testid="cc-done">
          {t('game.color_clash.times_up')}
        </p>
      </div>
    );
  }

  const remainingMs = Math.max(0, (state.gameStartEpoch ?? Date.now()) + CC_GAME_MS - Date.now());
  const secondsLeft = Math.ceil(remainingMs / 1000);
  const fraction = remainingMs / CC_GAME_MS;
  const isAmber = remainingMs <= AMBER_FROM_MS;
  const inGap = state.gapEndEpoch !== null;

  return (
    <div className={styles.screen} data-testid="cc-play">
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
      <p className={styles.counter}>{t('game.color_clash.correct', { n: state.correct })}</p>

      <div className={styles.stage}>
        {!inGap ? (
          <p
            className={`${styles.word} ${INK_CLASS[trial.ink]}`}
            data-testid="cc-word"
            data-ink={trial.ink}
            data-word={trial.word}
          >
            {t(`game.color_clash.word.${trial.word}`)}
          </p>
        ) : state.feedback === 'wrong' ? (
          <svg className={styles.mark} viewBox="0 0 24 24" aria-hidden="true" focusable="false" data-testid="cc-wrong-mark">
            <path d="M6 6 L18 18 M18 6 L6 18" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
        ) : state.feedback === 'timeout' ? (
          <p className={styles.caption}>{t('game.color_clash.too_slow')}</p>
        ) : null}
      </div>

      <div className={styles.buttons}>
        {INKS.map((ink) => {
          const classes = [styles.button];
          if (inGap && state.chosen === ink && state.feedback === 'correct') classes.push(styles.buttonCorrect);
          if (inGap && state.chosen === ink && state.feedback === 'wrong') classes.push(styles.buttonShake);
          return (
            <button
              key={ink}
              type="button"
              className={classes.join(' ')}
              onPointerDown={handleTap(ink)}
              data-testid={`cc-button-${ink}`}
            >
              <span className={`${styles.swatch} ${INK_CLASS[ink]}`} aria-hidden="true" />
              <span className={styles.name}>{t(`game.color_clash.ink.${ink}`)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

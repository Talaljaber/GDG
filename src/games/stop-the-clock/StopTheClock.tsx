/**
 * Stop the Clock screen. Source of truth: docs/games/stop-the-clock.md.
 *
 * Three attempts with fixed, ordered targets (5 s, 10 s, 7 s). Start/Stop
 * are measured on pointerdown with performance.now(); nothing on screen may
 * change while the hidden timer runs (.claude/rules/games.md).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useT } from '../../i18n';
import type { GameProps } from '../types';
import {
  STC_AUTO_STOP_EXTRA_MS,
  STC_START_WINDOW_MS,
  STC_TARGETS_MS,
  buildRaw,
  scoreStopTheClock,
  type StopTheClockAttempt,
} from './scoring';
import styles from './StopTheClock.module.css';

/** Intro card and "Locked in" card durations (docs/games/stop-the-clock.md §2). */
const INTRO_MS = 1500;
const LOCKED_MS = 1500;

/** A second pointerdown within this window of the first is a bounce; ignore it (§9). */
const DEBOUNCE_MS = 150;

type Phase = 'intro' | 'ready' | 'running' | 'locked';

export interface StopTheClockSnapshot {
  phase: Phase;
  /** Completed attempts, in order. Length also determines the current attempt's index. */
  attempts: StopTheClockAttempt[];
  /** Date.now() when the current ready_n window started; null outside `ready`. */
  readyStartEpoch: number | null;
  /** Date.now() when Start was tapped for the current attempt; null outside `running`. */
  attemptStartEpoch: number | null;
}

function initialSnapshot(): StopTheClockSnapshot {
  return { phase: 'intro', attempts: [], readyStartEpoch: null, attemptStartEpoch: null };
}

export function StopTheClock({
  roundStartEpoch,
  roundEnded,
  snapshot,
  onProgress,
  onFinish,
}: GameProps<StopTheClockSnapshot>) {
  const t = useT();
  const [state, setState] = useState<StopTheClockSnapshot>(() => snapshot ?? initialSnapshot());

  // Refs mirror the latest state/props so timers and handlers registered in
  // one render never act on stale closures, without forcing effects to
  // re-subscribe on every parent re-render (onProgress/onFinish are not
  // guaranteed to be referentially stable across renders).
  const stateRef = useRef(state);
  stateRef.current = state;
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;
  const roundStartEpochRef = useRef(roundStartEpoch);
  roundStartEpochRef.current = roundStartEpoch;

  // performance.now() at the live Start tap; null if this attempt is running
  // because it was resumed from a reload (performance.now() resets on
  // reload, so Stop falls back to the persisted epoch in that case, §9).
  const startPerfRef = useRef<number | null>(null);
  const lastPointerDownPerfRef = useRef<number>(-Infinity);
  const finishedRef = useRef(false);

  const commit = useCallback((next: StopTheClockSnapshot) => {
    stateRef.current = next;
    setState(next);
    onProgressRef.current(next);
  }, []);

  const finishNow = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    const current = stateRef.current;
    const attempts = [...current.attempts];
    const inProgressIndex = attempts.length;
    // Timeout rule (§2 "Round ends early", SESSION_LIFECYCLE E27): the
    // in-progress attempt closes with time-so-far; every attempt not yet
    // started (including one waiting at `ready`) closes as a missed start.
    for (let i = inProgressIndex; i < STC_TARGETS_MS.length; i++) {
      const target = STC_TARGETS_MS[i];
      if (i === inProgressIndex && current.phase === 'running' && current.attemptStartEpoch !== null) {
        const elapsed = Date.now() - current.attemptStartEpoch;
        const measuredMs = Math.round(Math.max(0, Math.min(elapsed, target + STC_AUTO_STOP_EXTRA_MS)));
        attempts.push({ target_ms: target, measured_ms: measuredMs, missed_start: false });
      } else {
        attempts.push({ target_ms: target, measured_ms: null, missed_start: true });
      }
    }
    const raw = buildRaw(attempts);
    const score = scoreStopTheClock(raw);
    const durationMs = Math.min(120_000, Date.now() - roundStartEpochRef.current);
    onFinishRef.current({ score, raw, durationMs });
  }, []);

  const recordMissedStart = useCallback(() => {
    const current = stateRef.current;
    if (current.phase !== 'ready') return;
    const target = STC_TARGETS_MS[current.attempts.length];
    const attempt: StopTheClockAttempt = { target_ms: target, measured_ms: null, missed_start: true };
    commit({
      ...current,
      phase: 'locked',
      attempts: [...current.attempts, attempt],
      readyStartEpoch: null,
    });
  }, [commit]);

  const recordAutoStop = useCallback(() => {
    const current = stateRef.current;
    if (current.phase !== 'running') return;
    const target = STC_TARGETS_MS[current.attempts.length];
    startPerfRef.current = null;
    const attempt: StopTheClockAttempt = {
      target_ms: target,
      measured_ms: target + STC_AUTO_STOP_EXTRA_MS,
      missed_start: false,
    };
    commit({
      ...current,
      phase: 'locked',
      attempts: [...current.attempts, attempt],
      attemptStartEpoch: null,
    });
  }, [commit]);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      const now = performance.now();
      if (now - lastPointerDownPerfRef.current < DEBOUNCE_MS) {
        return; // bounce: the first tap already registered (§9 double tap).
      }
      lastPointerDownPerfRef.current = now;

      const current = stateRef.current;
      if (current.phase === 'ready') {
        startPerfRef.current = now;
        commit({ ...current, phase: 'running', attemptStartEpoch: Date.now() });
        return;
      }
      if (current.phase === 'running') {
        const target = STC_TARGETS_MS[current.attempts.length];
        const rawMeasured =
          startPerfRef.current !== null
            ? now - startPerfRef.current
            : current.attemptStartEpoch !== null
              ? Date.now() - current.attemptStartEpoch
              : target;
        const measuredMs = Math.round(Math.max(0, Math.min(rawMeasured, target + STC_AUTO_STOP_EXTRA_MS)));
        startPerfRef.current = null;
        const attempt: StopTheClockAttempt = { target_ms: target, measured_ms: measuredMs, missed_start: false };
        commit({
          ...current,
          phase: 'locked',
          attempts: [...current.attempts, attempt],
          attemptStartEpoch: null,
        });
      }
    },
    [commit],
  );

  // Intro card -> first ready window.
  useEffect(() => {
    if (state.phase !== 'intro') return;
    const timer = window.setTimeout(() => {
      commit({ ...stateRef.current, phase: 'ready', readyStartEpoch: Date.now() });
    }, INTRO_MS);
    return () => window.clearTimeout(timer);
  }, [state.phase, commit]);

  // Ready window: missed-start timeout, resumable from a persisted epoch.
  useEffect(() => {
    if (state.phase !== 'ready' || state.readyStartEpoch === null) return;
    const remaining = STC_START_WINDOW_MS - (Date.now() - state.readyStartEpoch);
    if (remaining <= 0) {
      recordMissedStart();
      return;
    }
    const timer = window.setTimeout(recordMissedStart, remaining);
    return () => window.clearTimeout(timer);
  }, [state.phase, state.readyStartEpoch, state.attempts.length, recordMissedStart]);

  // Running: auto-stop timeout, resumable from a persisted epoch.
  useEffect(() => {
    if (state.phase !== 'running' || state.attemptStartEpoch === null) return;
    const target = STC_TARGETS_MS[state.attempts.length];
    const remaining = state.attemptStartEpoch + target + STC_AUTO_STOP_EXTRA_MS - Date.now();
    if (remaining <= 0) {
      recordAutoStop();
      return;
    }
    const timer = window.setTimeout(recordAutoStop, remaining);
    return () => window.clearTimeout(timer);
  }, [state.phase, state.attemptStartEpoch, state.attempts.length, recordAutoStop]);

  // Locked card -> next ready window, or finish after the 3rd attempt.
  useEffect(() => {
    if (state.phase !== 'locked') return;
    const timer = window.setTimeout(() => {
      const current = stateRef.current;
      if (current.phase !== 'locked') return;
      if (current.attempts.length >= STC_TARGETS_MS.length) {
        finishNow();
      } else {
        commit({ ...current, phase: 'ready', readyStartEpoch: Date.now() });
      }
    }, LOCKED_MS);
    return () => window.clearTimeout(timer);
  }, [state.phase, state.attempts.length, commit, finishNow]);

  // The shell signals the round is over: finish immediately with whatever we have.
  useEffect(() => {
    if (roundEnded) {
      finishNow();
    }
  }, [roundEnded, finishNow]);

  if (state.phase === 'intro') {
    return (
      <div className={styles.screen}>
        <h1 className={styles.title}>{t('game.stop_the_clock.name')}</h1>
        <p className={styles.pitch}>{t('game.stop_the_clock.pitch')}</p>
        <p className={styles.caption}>{t('game.stop_the_clock.intro')}</p>
      </div>
    );
  }

  if (state.phase === 'locked') {
    const completedIndex = state.attempts.length - 1;
    const justCompleted = state.attempts[completedIndex];
    const nextIndex = state.attempts.length;
    const hasNext = nextIndex < STC_TARGETS_MS.length;
    return (
      <div className={styles.screen}>
        <p className={styles.locked}>{t('game.stop_the_clock.locked')}</p>
        {justCompleted?.missed_start ? (
          <span className={styles.srOnly}>{t('game.stop_the_clock.missed')}</span>
        ) : null}
        {hasNext ? (
          <p className={styles.next}>
            {t('game.stop_the_clock.next', {
              target: t('game.stop_the_clock.target', { s: STC_TARGETS_MS[nextIndex] / 1000 }),
            })}
          </p>
        ) : null}
      </div>
    );
  }

  // ready_n or running_n: same layout throughout; only the button label
  // switches, once, at the moment Start is tapped (§2).
  const currentIndex = state.attempts.length;
  const target = STC_TARGETS_MS[currentIndex];
  const isRunning = state.phase === 'running';
  const label = isRunning ? t('game.stop_the_clock.stop') : t('game.stop_the_clock.start');

  return (
    <div className={styles.screen}>
      <p className={styles.tryLabel}>{t('game.stop_the_clock.try', { n: currentIndex + 1 })}</p>
      <p className={styles.target}>{t('game.stop_the_clock.target', { s: target / 1000 })}</p>
      <button type="button" className={styles.button} onPointerDown={handlePointerDown} aria-label={label}>
        {label}
      </button>
    </div>
  );
}

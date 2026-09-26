/**
 * How Many? screen. Source of truth: docs/games/how-many.md.
 *
 * Three flashes: a 1 s "look" frame with a fixation dot, a field of brand
 * chevrons for exactly 1.0 s, then a number pad with a 10 s timeout and a
 * 0.5 s "locked in". No feedback on the phone; the big screen reveals the true
 * counts. The flash mounts in one commit and never changes; a reload or a late
 * timer never shows it again. Taps are pointerdown with a 60 ms bounce guard.
 *
 * Fixed schedule (how-many.md §3, ADR-137 (2)): every step boundary comes from
 * stored epochs, never from the moment a timer happened to fire. The first
 * look starts at `roundStartEpoch + HM_INTRO_MS`; an answer ends at the OK tap
 * or at `answerStartEpoch + HM_ANSWER_MS`; "locked in" ends 0.5 s after that;
 * the next look starts at `lockedEndEpoch`. `runDue` is a catch-up loop: after
 * a reload, a screen lock, a JS freeze or a hidden page whose timers were
 * throttled, it closes every step whose time has passed with that step's rule
 * (a missed flash is skipped, a missed answer times out), so the round keeps
 * its 39 s worst case. A hidden page never pauses the schedule (ADR-018).
 */
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useLang, useT } from '../../i18n';
import type { GameProps } from '../types';
import { Chevron } from '../odd-one-out/Chevron';
import { fieldFor, HM_GLYPH } from './field';
import {
  buildRaw,
  HM_ANSWER_MS,
  HM_FLASHES,
  HM_MAX_DIGITS,
  HM_MIN_ANSWER_MS,
  scoreHowMany,
  type HowManyRound,
} from './scoring';
import styles from './HowMany.module.css';

/** Intro card (docs/games/how-many.md §3). */
export const HM_INTRO_MS = 1500;
/** "Look": the empty field frame with a fixation dot. */
export const HM_LOOK_MS = 1000;
/** The flash itself. */
export const HM_FLASH_MS = 1000;
/** "Locked in" after every answer or timeout. */
export const HM_LOCKED_MS = 500;
/**
 * The end of a look processed later than this (screen lock, a throttled
 * background tab, the catch-up after a freeze), or while the page is hidden,
 * skips the flash, as a reload does: the flash window
 * (`lookStartEpoch + 1000 … + 2000`) belongs to the fixed schedule, so a late
 * flash would stretch the round. A field painted later than this after its
 * commit (a freeze in between) only stays until the window's end.
 */
export const HM_FLASH_LATE_MS = 250;
/** Guard for the catch-up loop: intro + 3 × (look, answer, locked) is 10 steps. */
const MAX_CATCH_UP_STEPS = 12;
/** A second pointerdown within this window is a bounce. */
const DEBOUNCE_MS = 60;
/** The countdown turns amber for the last 3 s. */
const AMBER_FROM_MS = 3000;

type Phase = 'intro' | 'look' | 'flash' | 'answer' | 'locked' | 'done';
type Key = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'back' | 'ok';

/** Pad order (game geometry, a phone dialler; never mirrored). */
const KEYS: Key[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'back', '0', 'ok'];

export interface HowManySnapshot {
  phase: Phase;
  /** Index (0-2) of the current flash. */
  roundIndex: number;
  /** Date.now() when the current look began; null in `intro`. */
  lookStartEpoch: number | null;
  /** Date.now() when the field was committed; null if it was never shown (skipped) or not yet. */
  flashStartEpoch: number | null;
  /** Anchor of the answer's 10 s timeout (the end of the flash window). */
  answerStartEpoch: number | null;
  /** Date.now() at which "locked in" ends. */
  lockedEndEpoch: number | null;
  /** The digits typed so far for the open flash. */
  typed: string;
  /** The finished flashes, in order. */
  rounds: HowManyRound[];
}

function initialSnapshot(): HowManySnapshot {
  return {
    phase: 'intro',
    roundIndex: 0,
    lookStartEpoch: null,
    flashStartEpoch: null,
    answerStartEpoch: null,
    lockedEndEpoch: null,
    typed: '',
    rounds: [],
  };
}

/**
 * Reload rule (§9): the field is never shown again. A reload during the flash
 * (or after the look should have ended) goes straight to the answer, whose
 * timeout counts from the end of the flash window. Everything else a reload
 * finds overdue (the intro, an answer's timeout, "locked in", the next look)
 * is closed on the schedule by `runDue`'s catch-up loop at mount.
 */
function resumeSnapshot(s: HowManySnapshot, now: number): HowManySnapshot {
  if (s.phase === 'flash') {
    const flashStart = s.flashStartEpoch ?? (s.lookStartEpoch ?? now) + HM_LOOK_MS;
    return { ...s, phase: 'answer', answerStartEpoch: flashStart + HM_FLASH_MS, typed: '' };
  }
  if (s.phase === 'look' && s.lookStartEpoch !== null && now >= s.lookStartEpoch + HM_LOOK_MS) {
    return { ...s, phase: 'answer', flashStartEpoch: null, answerStartEpoch: s.lookStartEpoch + HM_LOOK_MS + HM_FLASH_MS, typed: '' };
  }
  return s;
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function isHidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

/**
 * When the current step ends (epoch ms), or null if nothing is scheduled
 * (`done`). Every step has a deadline, including the intro (anchored on the
 * round start) and a flash whose start epoch is not written yet (the latest
 * allowed end: the flash window's end).
 */
// eslint-disable-next-line react-refresh/only-export-components -- pure helper, exported for tests
export function dueEpoch(s: HowManySnapshot, roundStartEpoch: number): number | null {
  if (s.phase === 'intro') return roundStartEpoch + HM_INTRO_MS;
  if (s.phase === 'look' && s.lookStartEpoch !== null) return s.lookStartEpoch + HM_LOOK_MS;
  if (s.phase === 'flash' && s.flashStartEpoch !== null) return s.flashStartEpoch + HM_FLASH_MS;
  if (s.phase === 'flash' && s.lookStartEpoch !== null) return s.lookStartEpoch + HM_LOOK_MS + HM_FLASH_MS;
  if (s.phase === 'answer' && s.answerStartEpoch !== null) return s.answerStartEpoch + HM_ANSWER_MS;
  if (s.phase === 'locked' && s.lockedEndEpoch !== null) return s.lockedEndEpoch;
  return null;
}

/** "007" -> 7; "" -> null. */
function parseGuess(typed: string): number | null {
  return typed.length > 0 ? Number.parseInt(typed, 10) : null;
}

/**
 * The flash field: every chevron in one commit, memoised on (seed, index) so
 * nothing in it changes between mount and unmount.
 */
const Field = memo(function Field({ seed, index }: { seed: string; index: number }) {
  const field = fieldFor(seed, index);
  const cellPct = 100 / field.grid;
  const size = `${HM_GLYPH * cellPct}%`;
  return (
    <div className={styles.fieldLayer} data-testid="hm-field">
      {field.chevrons.map((c) => (
        <span
          key={c.cell}
          className={styles.glyph}
          data-testid="hm-chevron"
          style={{
            insetInlineStart: `${(c.cx - HM_GLYPH / 2) * cellPct}%`,
            insetBlockStart: `${(c.cy - HM_GLYPH / 2) * cellPct}%`,
            inlineSize: size,
            blockSize: size,
          }}
        >
          <Chevron color={c.color} rotationDeg={c.rotationDeg} className={styles.glyphSvg} />
        </span>
      ))}
    </div>
  );
});

function BackspaceIcon() {
  return (
    <svg className={styles.keyIcon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M9 5 H20 V19 H9 L3 12 Z M12 9 L17 15 M17 9 L12 15"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function HowMany({ seed, roundStartEpoch, roundEnded, snapshot, onProgress, onFinish }: GameProps<HowManySnapshot>) {
  const t = useT();
  const { dir } = useLang();
  const [initial] = useState(() => (snapshot ? resumeSnapshot(snapshot, Date.now()) : initialSnapshot()));
  const [state, setState] = useState<HowManySnapshot>(initial);
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

  // performance.now() when the pad appeared live; null after a reload (epoch fallback).
  const perfAnswerStartRef = useRef<number | null>(null);
  // Date.now() when the pad appeared in this page life (a reload can show it before its anchor).
  const padShownEpochRef = useRef<number | null>(initial.phase === 'answer' ? Date.now() : null);
  const lastPointerDownPerfRef = useRef<number>(-Infinity);
  const finishedRef = useRef(false);
  const reducedMotionRef = useRef<boolean | null>(null);
  if (reducedMotionRef.current === null) reducedMotionRef.current = prefersReducedMotion();
  const reducedMotion = reducedMotionRef.current;

  const commit = useCallback((next: HowManySnapshot) => {
    stateRef.current = next;
    setState(next);
    onProgressRef.current(next);
  }, []);

  const trueCount = useCallback((i: number) => fieldFor(seed, i).count, [seed]);

  const finishNow = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    const current = stateRef.current;
    const rounds: HowManyRound[] = [];
    for (let i = 0; i < HM_FLASHES; i++) {
      const done = current.rounds[i];
      if (done) {
        rounds.push(done);
      } else {
        // Timeout rule: the open flash keeps whatever is typed; unstarted flashes have no answer.
        const open = i === current.roundIndex && (current.phase === 'answer' || current.phase === 'look' || current.phase === 'flash');
        rounds.push({ true_count: trueCount(i), guess: open ? parseGuess(current.typed) : null, answer_ms: null, timed_out: true });
      }
    }
    const raw = buildRaw(rounds);
    const score = scoreHowMany(raw);
    const durationMs = Math.min(120_000, Math.max(0, Date.now() - roundStartEpochRef.current));
    perfAnswerStartRef.current = null;
    commit({ ...current, phase: 'done', rounds, lookStartEpoch: null, flashStartEpoch: null, answerStartEpoch: null, lockedEndEpoch: null, typed: '' });
    onFinishRef.current({ score, raw, durationMs });
  }, [commit, trueCount]);

  /** Look `roundIndex` starts at `at`: the intro's end or the previous "locked in" end, never the timer's firing time. */
  const startLook = useCallback(
    (roundIndex: number, at: number) => {
      commit({
        ...stateRef.current,
        phase: 'look',
        roundIndex,
        lookStartEpoch: at,
        flashStartEpoch: null,
        answerStartEpoch: null,
        lockedEndEpoch: null,
        typed: '',
      });
    },
    [commit],
  );

  const startAnswer = useCallback(
    (answerStartEpoch: number, flashStartEpoch: number | null) => {
      perfAnswerStartRef.current = performance.now();
      padShownEpochRef.current = Date.now();
      commit({ ...stateRef.current, phase: 'answer', flashStartEpoch, answerStartEpoch, typed: '' });
    },
    [commit],
  );

  /** The answer ended at `answerEnd` (the OK tap, or the timeout epoch): "locked in" ends 0.5 s after it. */
  const lock = useCallback(
    (round: HowManyRound, answerEnd: number) => {
      const current = stateRef.current;
      perfAnswerStartRef.current = null;
      padShownEpochRef.current = null;
      commit({
        ...current,
        phase: 'locked',
        rounds: [...current.rounds, round],
        lockedEndEpoch: answerEnd + HM_LOCKED_MS,
      });
    },
    [commit],
  );

  const handleKey = useCallback(
    (key: Key) => (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      const nowPerf = performance.now();
      if (nowPerf - lastPointerDownPerfRef.current < DEBOUNCE_MS) return;
      lastPointerDownPerfRef.current = nowPerf;

      const current = stateRef.current;
      if (current.phase !== 'answer' || current.answerStartEpoch === null) return;
      const now = Date.now();
      if (now >= current.answerStartEpoch + HM_ANSWER_MS) return;

      if (key === 'back') {
        if (current.typed.length > 0) commit({ ...current, typed: current.typed.slice(0, -1) });
        return;
      }
      if (key === 'ok') {
        const guess = parseGuess(current.typed);
        if (guess === null) return;
        const padShown = Math.min(current.answerStartEpoch, padShownEpochRef.current ?? current.answerStartEpoch);
        const elapsed = perfAnswerStartRef.current !== null ? nowPerf - perfAnswerStartRef.current : now - padShown;
        // Two taps after the pad appears take >= 300 ms; an earlier OK is ignored (never a rejected score).
        if (elapsed < HM_MIN_ANSWER_MS) return;
        const answerMs = Math.round(Math.min(elapsed, HM_ANSWER_MS));
        lock({ true_count: trueCount(current.roundIndex), guess, answer_ms: answerMs, timed_out: false }, now);
        return;
      }
      if (current.typed.length >= HM_MAX_DIGITS) return;
      commit({ ...current, typed: current.typed + key });
    },
    [commit, lock, trueCount],
  );

  // What is due on the epochs, as a catch-up loop: the end of the intro, of
  // the look, of the flash, the answer timeout and the end of "locked in".
  // Applies every step whose time has passed (reload, screen lock, a throttled
  // hidden page), each with its own rule; stops at a shown flash (it needs a
  // paint) or at the first step still in the future. Returns false when
  // nothing was due yet.
  const runDue = useCallback((): boolean => {
    let applied = false;
    for (let i = 0; i < MAX_CATCH_UP_STEPS && !finishedRef.current; i++) {
      const current = stateRef.current;
      const due = dueEpoch(current, roundStartEpochRef.current);
      const now = Date.now();
      if (due === null || now < due) break;
      applied = true;
      if (current.phase === 'intro') {
        startLook(0, due);
      } else if (current.phase === 'look' && current.lookStartEpoch !== null) {
        if (now <= due + HM_FLASH_LATE_MS && !isHidden()) {
          // Show the field (persisted, so a reload never shows it again); its
          // start epoch is written after the paint. Until then the flash is
          // due at the window's end (dueEpoch).
          commit({ ...current, phase: 'flash', flashStartEpoch: null });
          break;
        }
        // Late (locked screen, background, catch-up) or hidden: the flash
        // window has started or passed; never show it.
        startAnswer(current.lookStartEpoch + HM_LOOK_MS + HM_FLASH_MS, null);
      } else if (current.phase === 'flash') {
        // The field unmounts now; the deadline counts from the end of the flash, not from a late timer.
        if (current.flashStartEpoch !== null) startAnswer(current.flashStartEpoch + HM_FLASH_MS, current.flashStartEpoch);
        else startAnswer(due, null);
      } else if (current.phase === 'answer' && current.answerStartEpoch !== null) {
        lock(
          { true_count: trueCount(current.roundIndex), guess: parseGuess(current.typed), answer_ms: null, timed_out: true },
          current.answerStartEpoch + HM_ANSWER_MS,
        );
      } else if (current.phase === 'locked' && current.lockedEndEpoch !== null) {
        if (current.rounds.length >= HM_FLASHES) {
          finishNow();
          break;
        }
        startLook(current.rounds.length, current.lockedEndEpoch);
      } else {
        break;
      }
    }
    return applied;
  }, [commit, finishNow, lock, startAnswer, startLook, trueCount]);
  const runDueRef = useRef(runDue);
  runDueRef.current = runDue;

  // Mount: a resumed snapshot that the reload rule changed is persisted at
  // once, then everything already due is applied before the first paint (a
  // reload during the intro or after "locked in" ended never replays a step).
  useLayoutEffect(() => {
    if (snapshot && initial !== snapshot) onProgressRef.current(initial);
    runDueRef.current();
    // Mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The field was committed: record when (after the paint), once. A paint
  // later than HM_FLASH_LATE_MS after the look's end (the page froze between
  // the commit and the paint) never gets a new second: the field only stays
  // until the flash window's end, and is hidden at once if that has passed.
  useEffect(() => {
    if (state.phase !== 'flash' || state.flashStartEpoch !== null || state.lookStartEpoch === null) return;
    const now = Date.now();
    const windowStart = state.lookStartEpoch + HM_LOOK_MS;
    const late = now > windowStart + HM_FLASH_LATE_MS;
    commit({ ...stateRef.current, flashStartEpoch: late ? windowStart : now });
    if (late) runDueRef.current();
  }, [state.phase, state.flashStartEpoch, state.lookStartEpoch, commit]);

  // One scheduler, keyed on the snapshot.
  useEffect(() => {
    const due = dueEpoch(state, roundStartEpochRef.current);
    if (due === null) return;
    const timer = window.setTimeout(() => {
      if (!runDueRef.current()) setWake((n) => n + 1);
    }, Math.max(0, due - Date.now()));
    return () => window.clearTimeout(timer);
  }, [state, wake]);

  // Screen lock / tab switch / back-forward cache: timers fire late or not at
  // all; on return apply everything that is due at once (the field is hidden
  // immediately if its second has passed; overdue answers time out).
  useEffect(() => {
    const onVisibility = () => {
      if (!isHidden()) runDueRef.current();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pageshow', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pageshow', onVisibility);
    };
  }, []);

  // Countdown display only.
  useEffect(() => {
    if (state.phase !== 'answer') return;
    const timer = window.setTimeout(() => setTick((n) => n + 1), reducedMotion ? 1000 : 250);
    return () => window.clearTimeout(timer);
  }, [state.phase, tick, reducedMotion]);

  // The shell signals the round is over: finish immediately.
  useEffect(() => {
    if (roundEnded) finishNow();
  }, [roundEnded, finishNow]);

  const roundLabel = useMemo(() => t('game.how_many.round', { n: state.roundIndex + 1 }), [t, state.roundIndex]);

  if (state.phase === 'intro') {
    return (
      <div className={`${styles.screen} ${styles.screenCenter}`} data-testid="hm-intro">
        <div className={styles.intro}>
          <p className={styles.eyebrow}>{t('game.how_many.intro')}</p>
          <h1 className={styles.title}>{t('game.how_many.name')}</h1>
          <p className={styles.pitch}>{t('game.how_many.pitch')}</p>
        </div>
      </div>
    );
  }

  if (state.phase === 'done') {
    return (
      <div className={`${styles.screen} ${styles.screenCenter}`}>
        <p className={styles.caption} data-testid="hm-done">
          {t('game.how_many.done')}
        </p>
      </div>
    );
  }

  if (state.phase === 'look' || state.phase === 'flash') {
    return (
      <div className={`${styles.screen} ${styles.screenCenter}`} data-testid={`hm-${state.phase}`}>
        <p className={styles.eyebrow}>{roundLabel}</p>
        <div className={styles.field} data-testid="hm-field-frame">
          {state.phase === 'flash' ? (
            <Field seed={seed} index={state.roundIndex} />
          ) : (
            <span className={styles.fixation} data-testid="hm-fixation" aria-hidden="true" />
          )}
        </div>
        <p className={styles.caption}>{t('game.how_many.look')}</p>
      </div>
    );
  }

  if (state.phase === 'locked') {
    const last = state.rounds[state.rounds.length - 1];
    return (
      <div className={`${styles.screen} ${styles.screenCenter}`} data-testid="hm-locked">
        <p className={styles.eyebrow}>{roundLabel}</p>
        <p className={styles.caption} role="status">
          {last?.timed_out ? t('game.how_many.timeout') : t('game.how_many.locked')}
        </p>
      </div>
    );
  }

  // answer
  const anchor = state.answerStartEpoch ?? Date.now();
  const remainingMs = Math.min(HM_ANSWER_MS, Math.max(0, anchor + HM_ANSWER_MS - Date.now()));
  const secondsLeft = Math.ceil(remainingMs / 1000);
  const fraction = remainingMs / HM_ANSWER_MS;
  const isAmber = remainingMs < AMBER_FROM_MS;
  const empty = state.typed.length === 0;

  return (
    <div className={styles.screen} data-testid="hm-answer">
      <div className={styles.countdownWrap}>
        <div className={styles.countdownBar}>
          <div
            className={isAmber ? `${styles.countdownFill} ${styles.countdownFillAmber}` : styles.countdownFill}
            style={{ transform: `scaleX(${fraction})`, transformOrigin: dir === 'rtl' ? '100% 50%' : '0% 50%' }}
          />
        </div>
        <span
          className={isAmber ? `${styles.countdownNumber} ${styles.countdownNumberAmber}` : styles.countdownNumber}
          data-testid="hm-seconds"
        >
          {secondsLeft}
        </span>
      </div>
      <p className={styles.eyebrow}>{roundLabel}</p>
      <p className={styles.question}>{t('game.how_many.question')}</p>
      <p className={empty ? `${styles.typed} ${styles.typedEmpty}` : styles.typed} data-testid="hm-typed" aria-live="polite">
        {empty ? '–' : state.typed}
      </p>
      <div className={styles.pad}>
        {KEYS.map((key) => {
          const isOk = key === 'ok';
          const disabled = isOk ? empty : key === 'back' ? empty : state.typed.length >= HM_MAX_DIGITS;
          return (
            <button
              key={key}
              type="button"
              className={isOk ? `${styles.key} ${styles.keyOk}` : styles.key}
              onPointerDown={handleKey(key)}
              disabled={disabled}
              aria-label={key === 'back' ? t('game.how_many.backspace') : undefined}
              data-testid={`hm-key-${key}`}
            >
              {key === 'back' ? <BackspaceIcon /> : isOk ? t('game.how_many.ok') : key}
            </button>
          );
        })}
      </div>
    </div>
  );
}

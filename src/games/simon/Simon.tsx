/**
 * Simon screen. Source of truth: docs/games/simon.md.
 *
 * Four pads flash a growing sequence; the player repeats it. One mistake or
 * a 5 s per-tap timeout ends the turn; completing length 15 wins. The shell
 * owns the round result screen (docs/games/simon.md §3 diagram: over/won ->
 * result); this component only calls onFinish once.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useT } from '../../i18n';
import type { GameProps } from '../types';
import { generateSimonSequence, type SimonPad } from './sequence';
import {
  SIMON_DEBOUNCE_MS,
  SIMON_FLASH_GAP_MS,
  SIMON_INTRO_MS,
  SIMON_MAX_LEVEL,
  SIMON_START_LEVEL,
  SIMON_SUCCESS_MS,
  SIMON_TAP_TIMEOUT_MS,
  buildRaw,
  onTimeMs,
  scoreSimon,
  type SimonEnded,
  type SimonRaw,
} from './scoring';
import styles from './Simon.module.css';

type Phase = 'intro' | 'watch' | 'input' | 'success' | 'over' | 'won';

export interface SimonSnapshot {
  phase: Phase;
  /** Length of the sequence currently being watched/played. */
  level: number;
  /** Longest sequence completed correctly so far (0 if none). */
  completedLevel: number;
  /** One gap (ms) per tap of every completed sequence (docs/SCORING.md §3.3). */
  gaps: number[];
}

function initialSnapshot(): SimonSnapshot {
  return { phase: 'intro', level: SIMON_START_LEVEL, completedLevel: 0, gaps: [] };
}

/** The sequence length to (re)watch given how much has been completed so far. */
function nextLevel(completedLevel: number): number {
  return completedLevel === 0 ? SIMON_START_LEVEL : Math.min(SIMON_MAX_LEVEL, completedLevel + 1);
}

/**
 * A reload always resumes at the start of `watch` for the current sequence,
 * replaying it from scratch; completed length and gaps are kept
 * (docs/games/simon.md §9 "Reload during watch or input").
 */
function resumeSnapshot(snapshot: SimonSnapshot): SimonSnapshot {
  if (snapshot.phase === 'intro') return snapshot;
  return {
    phase: 'watch',
    level: nextLevel(snapshot.completedLevel),
    completedLevel: snapshot.completedLevel,
    gaps: snapshot.gaps,
  };
}

const PAD_ORDER: SimonPad[] = ['up', 'right', 'left', 'down'];

const PAD_LABEL_KEY: Record<SimonPad, string> = {
  up: 'game.simon.pad_up',
  right: 'game.simon.pad_right',
  left: 'game.simon.pad_left',
  down: 'game.simon.pad_down',
};

export function Simon({ seed, roundStartEpoch, roundEnded, snapshot, onProgress, onFinish }: GameProps<SimonSnapshot>) {
  const t = useT();
  const [state, setState] = useState<SimonSnapshot>(() => (snapshot ? resumeSnapshot(snapshot) : initialSnapshot()));

  // Refs mirror the latest state/props so timers and handlers registered in
  // one render never act on stale closures (see stop-the-clock/StopTheClock.tsx).
  const stateRef = useRef(state);
  stateRef.current = state;
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;
  const roundStartEpochRef = useRef(roundStartEpoch);
  roundStartEpochRef.current = roundStartEpoch;

  const finishedRef = useRef(false);
  // The pad sequence for this round; stable for the whole round, sliced per
  // level. Prefix-stable, so a longer slice always extends the same run.
  const fullSequenceRef = useRef<SimonPad[]>(generateSimonSequence(seed, SIMON_MAX_LEVEL));

  // performance.now() reference point for gap measurement: the end of the
  // last playback, or the previous accepted tap, within the current
  // in-progress (not yet completed) sequence.
  const gapMarkRef = useRef<number | null>(null);
  // Gaps recorded so far in the current in-progress sequence; only folded
  // into the persisted snapshot once the whole sequence completes (§3.3).
  const pendingGapsRef = useRef<number[]>([]);
  const inputIndexRef = useRef(0);
  const lastPointerDownPerfRef = useRef<number>(-Infinity);
  // Which pad was wrong-tapped, for the `over` shake (visual only, not scored).
  const [wrongPad, setWrongPad] = useState<SimonPad | null>(null);
  // Pads currently lit during playback (visual only).
  const [litPad, setLitPad] = useState<SimonPad | null>(null);
  // Mirrors inputIndexRef for rendering the step dots (visual only; the ref
  // stays the single source of truth for game logic).
  const [tapProgress, setTapProgress] = useState(0);

  const commit = useCallback((next: SimonSnapshot) => {
    stateRef.current = next;
    setState(next);
    onProgressRef.current(next);
  }, []);

  const finishNow = useCallback((ended: SimonEnded) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    const current = stateRef.current;
    const raw: SimonRaw = buildRaw(current.completedLevel, current.gaps, ended);
    const score = scoreSimon(raw);
    const durationMs = Math.min(120_000, Date.now() - roundStartEpochRef.current);
    onFinishRef.current({ score, raw, durationMs });
  }, []);

  // The shell signals the round is over: finish immediately, counting only
  // the completed length (docs/games/simon.md §9 "Round ends early").
  useEffect(() => {
    if (roundEnded) {
      finishNow('cap');
    }
  }, [roundEnded, finishNow]);

  // intro -> watch, once.
  useEffect(() => {
    if (state.phase !== 'intro') return;
    const timer = window.setTimeout(() => {
      commit({ ...initialSnapshot(), phase: 'watch' });
    }, SIMON_INTRO_MS);
    return () => window.clearTimeout(timer);
  }, [state.phase, commit]);

  // watch: play back the current sequence, then move to input.
  useEffect(() => {
    if (state.phase !== 'watch') return;
    const level = state.level;
    const sequence = fullSequenceRef.current.slice(0, level);
    const onTime = onTimeMs(level);
    const timers: number[] = [];
    let cumulative = 0;
    for (let i = 0; i < sequence.length; i++) {
      const pad = sequence[i];
      timers.push(
        window.setTimeout(() => setLitPad(pad), cumulative),
      );
      timers.push(
        window.setTimeout(() => setLitPad(null), cumulative + onTime),
      );
      cumulative += onTime + SIMON_FLASH_GAP_MS;
    }
    timers.push(
      window.setTimeout(() => {
        gapMarkRef.current = performance.now();
        pendingGapsRef.current = [];
        inputIndexRef.current = 0;
        setTapProgress(0);
        commit({ ...stateRef.current, phase: 'input' });
      }, cumulative),
    );
    return () => {
      timers.forEach((id) => window.clearTimeout(id));
      setLitPad(null);
    };
  }, [state.phase, state.level, commit]);

  // Which ended reason produced the current `over` phase (mistake vs timeout).
  const overReasonRef = useRef<SimonEnded>('mistake');

  // input: per-tap timeout, restarted on every accepted tap.
  const scheduleTapTimeout = useCallback(() => {
    return window.setTimeout(() => {
      overReasonRef.current = 'timeout';
      commit({ ...stateRef.current, phase: 'over' });
    }, SIMON_TAP_TIMEOUT_MS);
  }, [commit]);

  const tapTimeoutRef = useRef<number | null>(null);
  useEffect(() => {
    if (state.phase !== 'input') {
      if (tapTimeoutRef.current !== null) {
        window.clearTimeout(tapTimeoutRef.current);
        tapTimeoutRef.current = null;
      }
      return;
    }
    tapTimeoutRef.current = scheduleTapTimeout();
    return () => {
      if (tapTimeoutRef.current !== null) {
        window.clearTimeout(tapTimeoutRef.current);
        tapTimeoutRef.current = null;
      }
    };
    // Re-armed explicitly on every accepted tap via restartTapTimeout below;
    // this effect only owns the initial arm/cleanup for the phase.
  }, [state.phase, state.level, scheduleTapTimeout]);

  const restartTapTimeout = useCallback(() => {
    if (tapTimeoutRef.current !== null) {
      window.clearTimeout(tapTimeoutRef.current);
    }
    tapTimeoutRef.current = scheduleTapTimeout();
  }, [scheduleTapTimeout]);

  // success -> won (if level 15) or back to watch for the next level.
  useEffect(() => {
    if (state.phase !== 'success') return;
    const timer = window.setTimeout(() => {
      const current = stateRef.current;
      if (current.completedLevel >= SIMON_MAX_LEVEL) {
        commit({ ...current, phase: 'won' });
      } else {
        commit({ ...current, phase: 'watch', level: nextLevel(current.completedLevel) });
      }
    }, SIMON_SUCCESS_MS);
    return () => window.clearTimeout(timer);
  }, [state.phase, commit]);

  // won -> finish.
  useEffect(() => {
    if (state.phase !== 'won') return;
    const timer = window.setTimeout(() => finishNow('won'), SIMON_SUCCESS_MS);
    return () => window.clearTimeout(timer);
  }, [state.phase, finishNow]);

  // over -> finish, with whichever reason (mistake/timeout) produced it.
  useEffect(() => {
    if (state.phase !== 'over') return;
    const timer = window.setTimeout(() => finishNow(overReasonRef.current), SIMON_SUCCESS_MS);
    return () => window.clearTimeout(timer);
  }, [state.phase, finishNow]);

  const handlePadTap = useCallback(
    (pad: SimonPad) => (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      if (stateRef.current.phase !== 'input') return; // taps during watch are ignored (§9)
      const now = performance.now();
      if (now - lastPointerDownPerfRef.current < SIMON_DEBOUNCE_MS) {
        return; // second pointerdown within 80ms: ignored (§9)
      }
      lastPointerDownPerfRef.current = now;

      const current = stateRef.current;
      const sequence = fullSequenceRef.current.slice(0, current.level);
      const index = inputIndexRef.current;
      const expected = sequence[index];

      const mark = gapMarkRef.current ?? now;
      const gap = Math.max(0, Math.round(now - mark));
      gapMarkRef.current = now;

      if (pad !== expected) {
        setWrongPad(pad);
        overReasonRef.current = 'mistake';
        commit({ ...current, phase: 'over' });
        return;
      }

      pendingGapsRef.current.push(gap);
      inputIndexRef.current = index + 1;
      setTapProgress(inputIndexRef.current);

      if (inputIndexRef.current >= sequence.length) {
        const completedLevel = current.level;
        const gaps = [...current.gaps, ...pendingGapsRef.current];
        commit({ ...current, phase: 'success', completedLevel, gaps });
        return;
      }
      restartTapTimeout();
    },
    [commit, restartTapTimeout],
  );

  const dots = useMemo(() => {
    if (state.phase !== 'input') return null;
    return Array.from({ length: state.level }, (_, i) => i < tapProgress);
  }, [state.phase, state.level, tapProgress]);

  if (state.phase === 'intro') {
    return (
      <div className={styles.screen}>
        <h1 className={styles.title}>{t('game.simon.name')}</h1>
        <p className={styles.pitch}>{t('game.simon.pitch')}</p>
        <p className={styles.caption}>{t('game.simon.intro')}</p>
      </div>
    );
  }

  if (state.phase === 'won') {
    return (
      <div className={styles.screen}>
        <p className={styles.won}>{t('game.simon.won')}</p>
      </div>
    );
  }

  if (state.phase === 'over') {
    return (
      <div className={styles.screen}>
        <p className={styles.caption}>{t('game.simon.reached', { n: state.completedLevel })}</p>
        <div className={styles.grid} aria-hidden="true">
          {PAD_ORDER.map((pad) => (
            <span
              key={pad}
              className={[
                styles.pad,
                styles[`pad_${pad}`],
                wrongPad === pad ? styles.shaking : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <Chevron pad={pad} />
            </span>
          ))}
        </div>
      </div>
    );
  }

  const isWatch = state.phase === 'watch';
  const isSuccess = state.phase === 'success';
  const label = isSuccess ? t('game.simon.nice') : isWatch ? t('game.simon.watch') : t('game.simon.your_turn');

  return (
    <div className={styles.screen}>
      <p className={styles.caption}>{t('game.simon.length', { n: state.level })}</p>
      <p className={styles.status}>{label}</p>
      <div className={styles.grid}>
        {PAD_ORDER.map((pad) => {
          const isLit = litPad === pad;
          const disabled = state.phase !== 'input';
          return (
            <button
              key={pad}
              type="button"
              disabled={disabled}
              className={[styles.pad, styles[`pad_${pad}`], isLit ? styles.flashing : '']
                .filter(Boolean)
                .join(' ')}
              aria-label={t(PAD_LABEL_KEY[pad])}
              onPointerDown={handlePadTap(pad)}
            >
              <Chevron pad={pad} />
            </button>
          );
        })}
      </div>
      {dots ? (
        <div className={styles.dots} aria-hidden="true">
          {dots.map((filled, i) => (
            <span key={i} className={[styles.dot, filled || isSuccess ? styles.dotFilled : ''].filter(Boolean).join(' ')} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Rounded chevron tip pointing in the pad's direction (docs/games/simon.md §2, §7). Not the logo. */
function Chevron({ pad }: { pad: SimonPad }) {
  const rotation: Record<SimonPad, number> = { up: 0, right: 90, left: -90, down: 180 };
  return (
    <svg
      className={styles.chevron}
      viewBox="0 0 24 24"
      style={{ transform: `rotate(${rotation[pad]}deg)` }}
      aria-hidden="true"
      focusable="false"
    >
      <path d="M5 15 L12 8 L19 15" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Pairs screen. Source of truth: docs/games/pairs.md.
 *
 * A seeded 4 x 4 board of 8 icon pairs, face down. Flip one card, then a
 * second: a match stays face up (0.3 s amber feedback, no lock); a mismatch
 * shows both for 0.7 s with all input ignored, then both flip back. 60 s
 * from the board appearing; the game ends early on the eighth pair. The
 * clear time is performance.now() on pointerdown while live; every clock
 * is an epoch persisted through onProgress, so a reload never resets it and
 * a reload during the lock resolves it at its stored time (ADR-018).
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useLang, useT } from '../../i18n';
import type { GameProps } from '../types';
import { PairsIcon } from './icons';
import { layoutFor, type IconId } from './layout';
import { buildRaw, PR_GAME_MS, PR_LOCK_MS, PR_MATCH_MS, PR_PAIRS, scorePairs } from './scoring';
import styles from './Pairs.module.css';

/** Intro card duration (docs/games/pairs.md §3). */
const INTRO_MS = 1500;
/** The countdown number turns amber for the last 5 s (as Trivia / Color Clash). */
const AMBER_FROM_MS = 5000;

type Phase = 'intro' | 'play' | 'done';

export interface PairsSnapshot {
  phase: Phase;
  /** Date.now() when the board appeared (the 60 s game clock); null in `intro`. */
  gameStartEpoch: number | null;
  /** Positions (0-15) of the unmatched cards currently face up: 0, 1 or 2 (2 only during the lock). */
  faceUp: number[];
  /** Icons whose pair has been found, in the order found. */
  matchedIcons: IconId[];
  /** Mismatched flip-pairs so far. */
  misses: number;
  /** Date.now() at which the mismatch lock ends (both cards flip back); null outside a lock. */
  lockUntilEpoch: number | null;
  /** gameStartEpoch + the clear time (ms) of the eighth match; null unless cleared. */
  clearEpoch: number | null;
}

function initialSnapshot(): PairsSnapshot {
  return {
    phase: 'intro',
    gameStartEpoch: null,
    faceUp: [],
    matchedIcons: [],
    misses: 0,
    lockUntilEpoch: null,
    clearEpoch: null,
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

interface TileProps {
  index: number;
  icon: IconId;
  up: boolean;
  matched: boolean;
  fresh: boolean;
  muted: boolean;
  label: string;
  onTap(index: number, event: ReactPointerEvent<HTMLButtonElement>): void;
}

/** One card: a two-face button; only `transform` animates (none under reduced motion). */
const Tile = memo(function Tile({ index, icon, up, matched, fresh, muted, label, onTap }: TileProps) {
  const classes = [styles.tile];
  if (up) classes.push(styles.tileUp);
  if (matched) classes.push(styles.tileMatched);
  if (fresh) classes.push(styles.tileFresh);
  if (muted) classes.push(styles.tileMuted);
  return (
    <button
      type="button"
      className={classes.join(' ')}
      aria-label={label}
      aria-pressed={matched}
      onPointerDown={(event) => onTap(index, event)}
      data-testid={`pr-tile-${index}`}
      data-state={matched ? 'matched' : up ? 'up' : 'down'}
    >
      <span className={styles.card} aria-hidden="true">
        <span className={`${styles.face} ${styles.back}`}>
          <svg className={styles.backMark} viewBox="0 0 100 100" focusable="false">
            <path className={styles.backMarkOuter} d="M 62 24 L 34 50 L 62 76" />
            <path className={styles.backMarkInner} d="M 62 24 L 34 50 L 62 76" />
          </svg>
        </span>
        <span className={`${styles.face} ${styles.front}`}>
          <PairsIcon id={icon} className={styles.icon} />
        </span>
      </span>
    </button>
  );
});

export function Pairs({ seed, roundStartEpoch, roundEnded, snapshot, onProgress, onFinish }: GameProps<PairsSnapshot>) {
  const t = useT();
  const { dir } = useLang();
  const [state, setState] = useState<PairsSnapshot>(() => snapshot ?? initialSnapshot());
  // Display-only re-render for the countdown; never persisted or reported.
  const [tick, setTick] = useState(0);
  // Bumped when the scheduler fires before anything is due, so it re-arms.
  const [wake, setWake] = useState(0);
  // The 0.3 s amber feedback of the latest match (display only, not persisted).
  const [fresh, setFresh] = useState<IconId | null>(null);

  const stateRef = useRef(state);
  stateRef.current = state;
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;
  const roundStartEpochRef = useRef(roundStartEpoch);
  roundStartEpochRef.current = roundStartEpoch;

  // performance.now() when the board appeared live; null after a reload
  // (the clear time then falls back to the epoch).
  const perfStartRef = useRef<number | null>(null);
  const finishedRef = useRef(false);
  const reducedMotionRef = useRef<boolean | null>(null);
  if (reducedMotionRef.current === null) reducedMotionRef.current = prefersReducedMotion();
  const reducedMotion = reducedMotionRef.current;

  const layout = useMemo(() => layoutFor(seed), [seed]);

  const commit = useCallback((next: PairsSnapshot) => {
    stateRef.current = next;
    setState(next);
    onProgressRef.current(next);
  }, []);

  const finishNow = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    const current = stateRef.current;
    // Timeout rule (§9): the pairs found so far count; an open card or lock doesn't matter.
    const matched = current.matchedIcons.length;
    const clearMs =
      current.clearEpoch !== null && current.gameStartEpoch !== null ? current.clearEpoch - current.gameStartEpoch : null;
    const raw = buildRaw(matched, current.misses, clearMs);
    const score = scorePairs(raw);
    const durationMs = Math.min(120_000, Math.max(0, Date.now() - roundStartEpochRef.current));
    commit({ ...current, phase: 'done', lockUntilEpoch: null, faceUp: current.clearEpoch !== null ? [] : current.faceUp });
    onFinishRef.current({ score, raw, durationMs });
  }, [commit]);

  const handleTap = useCallback(
    (index: number, event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      const nowPerf = performance.now();
      const now = Date.now();
      let current = stateRef.current;
      const gameStart = current.gameStartEpoch;
      if (current.phase !== 'play' || gameStart === null) return;
      if (now >= gameStart + PR_GAME_MS) return;
      if (current.lockUntilEpoch !== null) {
        // The flip-back lock: every tap is ignored until it ends. A tap that
        // beats the (late) timer after the lock resolves it first.
        if (now < current.lockUntilEpoch) return;
        current = { ...current, faceUp: [], lockUntilEpoch: null };
      }
      const icon = layout[index];
      if (current.matchedIcons.includes(icon) || current.faceUp.includes(index)) {
        if (current !== stateRef.current) commit(current);
        return;
      }

      if (current.faceUp.length === 0) {
        commit({ ...current, faceUp: [index] });
        return;
      }

      const other = current.faceUp[0];
      if (layout[other] === icon) {
        const matchedIcons = [...current.matchedIcons, icon];
        if (matchedIcons.length === PR_PAIRS) {
          const elapsed = perfStartRef.current !== null ? nowPerf - perfStartRef.current : now - gameStart;
          const clearMs = Math.max(0, Math.min(Math.round(elapsed), PR_GAME_MS));
          commit({ ...current, faceUp: [], matchedIcons, clearEpoch: gameStart + clearMs });
          finishNow();
          return;
        }
        commit({ ...current, faceUp: [], matchedIcons });
        setFresh(icon);
        return;
      }

      commit({ ...current, faceUp: [other, index], misses: current.misses + 1, lockUntilEpoch: now + PR_LOCK_MS });
    },
    [commit, finishNow, layout],
  );

  // Intro card -> the board; the 60 s game clock starts here.
  useEffect(() => {
    if (state.phase !== 'intro') return;
    const timer = window.setTimeout(() => {
      perfStartRef.current = performance.now();
      commit({ ...stateRef.current, phase: 'play', gameStartEpoch: Date.now() });
    }, INTRO_MS);
    return () => window.clearTimeout(timer);
  }, [state.phase, commit]);

  // One scheduler for what is due on the epochs: the game end and the end of
  // a mismatch lock (resumable after a reload or a screen lock).
  useEffect(() => {
    if (state.phase !== 'play' || state.gameStartEpoch === null) return;
    const gameEnd = state.gameStartEpoch + PR_GAME_MS;
    const due = state.lockUntilEpoch !== null ? Math.min(state.lockUntilEpoch, gameEnd) : gameEnd;
    const timer = window.setTimeout(() => {
      const current = stateRef.current;
      if (current.phase !== 'play' || current.gameStartEpoch === null) return;
      const now = Date.now();
      if (now >= current.gameStartEpoch + PR_GAME_MS) {
        finishNow();
      } else if (current.lockUntilEpoch !== null && now >= current.lockUntilEpoch) {
        commit({ ...current, faceUp: [], lockUntilEpoch: null });
      } else {
        setWake((n) => n + 1);
      }
    }, Math.max(0, due - Date.now()));
    return () => window.clearTimeout(timer);
  }, [state, wake, commit, finishNow]);

  // The match feedback fades after 0.3 s.
  useEffect(() => {
    if (fresh === null) return;
    const timer = window.setTimeout(() => setFresh(null), PR_MATCH_MS);
    return () => window.clearTimeout(timer);
  }, [fresh]);

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

  if (state.phase === 'intro') {
    return (
      <div className={`${styles.screen} ${styles.screenCenter}`}>
        <div className={styles.intro}>
          <p className={styles.eyebrow}>{t('game.pairs.intro')}</p>
          <h1 className={styles.title}>{t('game.pairs.name')}</h1>
          <p className={styles.pitch}>{t('game.pairs.pitch')}</p>
        </div>
      </div>
    );
  }

  const done = state.phase === 'done';
  const cleared = state.clearEpoch !== null;
  const locked = state.lockUntilEpoch !== null;
  const gameEnd = (state.gameStartEpoch ?? Date.now()) + PR_GAME_MS;
  // A clear freezes the countdown at the time left; a timeout shows 0.
  const remainingMs = Math.min(PR_GAME_MS, Math.max(0, gameEnd - (cleared ? (state.clearEpoch as number) : done ? gameEnd : Date.now())));
  const secondsLeft = Math.ceil(remainingMs / 1000);
  const fraction = remainingMs / PR_GAME_MS;
  const isAmber = remainingMs <= AMBER_FROM_MS;

  return (
    <div
      className={reducedMotion ? `${styles.screen} ${styles.noFlip}` : styles.screen}
      data-testid="pr-play"
      data-motion={reducedMotion ? 'reduced' : undefined}
    >
      <div className={styles.countdownWrap}>
        <div className={styles.countdownBar}>
          <div
            className={isAmber ? `${styles.countdownFill} ${styles.countdownFillAmber}` : styles.countdownFill}
            style={{ transform: `scaleX(${fraction})`, transformOrigin: dir === 'rtl' ? '100% 50%' : '0% 50%' }}
          />
        </div>
        <span
          className={isAmber ? `${styles.countdownNumber} ${styles.countdownNumberAmber}` : styles.countdownNumber}
          data-testid="pr-seconds"
        >
          {secondsLeft}
        </span>
      </div>
      <p className={styles.counter} data-testid="pr-found">
        {t('game.pairs.found', { n: state.matchedIcons.length })}
      </p>

      <div className={styles.stage}>
        <div className={styles.grid} data-testid="pr-grid">
          {layout.map((icon, index) => {
            const matched = state.matchedIcons.includes(icon);
            const up = matched || state.faceUp.includes(index) || (done && cleared);
            return (
              <Tile
                key={index}
                index={index}
                icon={icon}
                up={up}
                matched={matched}
                fresh={matched && fresh === icon}
                muted={locked && state.faceUp.includes(index)}
                label={up ? t(`game.pairs.icon.${icon}`) : t('game.pairs.card_back')}
                onTap={handleTap}
              />
            );
          })}
        </div>
      </div>

      <p className={styles.caption} data-testid="pr-status" aria-live="polite">
        {done ? t(cleared ? 'game.pairs.cleared' : 'game.pairs.times_up') : ''}
      </p>
    </div>
  );
}

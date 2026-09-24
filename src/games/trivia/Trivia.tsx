/**
 * Trivia screen. Source of truth: docs/games/trivia.md.
 *
 * 5 questions drawn per player from the seeded pool (draw.ts), 10 s each
 * with a visible countdown; answer_ms is measured from the first painted
 * frame of the question to pointerdown (performance.now()), with a
 * Date.now()-epoch fallback so a reload never resets the clock
 * (.claude/rules/games.md).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useLang, useT } from '../../i18n';
import type { GameProps } from '../types';
import { triviaPoolFile as poolFile } from './pool';
import {
  drawTriviaQuestions,
  TRIVIA_QUESTIONS_PER_PLAYER,
  type DrawnTriviaQuestion,
  type TriviaPoolQuestion,
} from './draw';
import { buildRaw, pointsForQuestion, scoreTrivia, TRIVIA_QUESTION_MS, type TriviaQuestionAnswer } from './scoring';
import styles from './Trivia.module.css';

/** Intro card duration (docs/games/trivia.md §3). */
const INTRO_MS = 1500;
/** Feedback card duration between questions (docs/games/trivia.md §3). */
const FEEDBACK_MS = 1500;
/** A second pointerdown within this window of the first is a bounce; ignore it (§9). */
const DEBOUNCE_MS = 100;

export type TriviaPhase = 'intro' | 'question' | 'feedback' | 'result';

export interface TriviaAnswerRecord {
  id: string;
  correct: boolean;
  /** ms from the question's first painted frame to the tap; null iff timed_out. */
  answer_ms: number | null;
  timed_out: boolean;
  /** Index into the shuffled options the player tapped; null on a timeout. UI only, not submitted. */
  chosenIndex: number | null;
}

export interface TriviaSnapshot {
  phase: TriviaPhase;
  /** Completed answers, in question order. Length also determines the current question's index. */
  answers: TriviaAnswerRecord[];
  /** Date.now() when the current question's options became visible; null outside `question`. */
  questionStartEpoch: number | null;
}

function initialSnapshot(): TriviaSnapshot {
  return { phase: 'intro', answers: [], questionStartEpoch: null };
}

function toRawAnswer(answer: TriviaAnswerRecord): TriviaQuestionAnswer {
  return { id: answer.id, correct: answer.correct, answer_ms: answer.answer_ms, timed_out: answer.timed_out };
}

/**
 * `resolveJsonModule` infers a structural type for the JSON file (plain
 * `string` fields, not the literal unions in draw.ts's TriviaPoolQuestion);
 * the format is enforced by the JSON Schema in docs/content/trivia-format.md
 * and `npm run check:trivia`, so a narrowing cast here is safe.
 */
const pool = poolFile.questions as TriviaPoolQuestion[];

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function Trivia({ seed, roundStartEpoch, roundEnded, snapshot, onProgress, onFinish }: GameProps<TriviaSnapshot>) {
  const t = useT();
  const { lang, dir } = useLang();
  const [state, setState] = useState<TriviaSnapshot>(() => snapshot ?? initialSnapshot());

  const drawnQuestions = useMemo<DrawnTriviaQuestion[]>(
    () => drawTriviaQuestions(pool, seed),
    [seed],
  );

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

  // performance.now() at the moment the current question's options became
  // visible; null when this question was restored from a snapshot rather
  // than started live in this session (reload falls back to the epoch,
  // matching stop-the-clock's Start/Stop convention, §9 "Reload during a
  // question").
  const startPerfRef = useRef<number | null>(null);
  const lastPointerDownPerfRef = useRef<number>(-Infinity);
  const finishedRef = useRef(false);
  const reducedMotionRef = useRef<boolean | null>(null);
  if (reducedMotionRef.current === null) {
    reducedMotionRef.current = prefersReducedMotion();
  }
  const reducedMotion = reducedMotionRef.current;

  const currentIndex = state.answers.length;
  const elapsedMs = state.questionStartEpoch !== null ? Date.now() - state.questionStartEpoch : 0;
  const remainingMs = Math.max(0, Math.min(TRIVIA_QUESTION_MS, TRIVIA_QUESTION_MS - elapsedMs));
  const secondsLeft = Math.ceil(remainingMs / 1000);
  const fraction = remainingMs / TRIVIA_QUESTION_MS;
  const isAmber = remainingMs <= 3000;

  // Forces a re-render each countdown tick without reporting progress to the
  // shell (onProgress fires only after start events and attempts, per the
  // contract; the tick is a display-only re-render driven by the epoch).
  const [tick, setTick] = useState(0);

  const [srQuestionText, setSrQuestionText] = useState('');
  const [srFiveLeftText, setSrFiveLeftText] = useState('');
  const announcedQuestionIndexRef = useRef<number | null>(null);
  const announcedFiveLeftIndexRef = useRef<number | null>(null);

  const commit = useCallback((next: TriviaSnapshot) => {
    stateRef.current = next;
    setState(next);
    onProgressRef.current(next);
  }, []);

  const finishNow = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    const current = stateRef.current;
    const answers = [...current.answers];
    // Timeout rule (§9 "Round ends early"): every question not yet answered,
    // including one in progress, closes as a timeout.
    for (let i = answers.length; i < TRIVIA_QUESTIONS_PER_PLAYER; i++) {
      const dq = drawnQuestions[i];
      answers.push({ id: dq.id, correct: false, answer_ms: null, timed_out: true, chosenIndex: null });
    }
    const raw = buildRaw(answers.map(toRawAnswer));
    const score = scoreTrivia(raw);
    const durationMs = Math.min(120_000, Date.now() - roundStartEpochRef.current);
    commit({ ...current, phase: 'result', answers, questionStartEpoch: null });
    onFinishRef.current({ score, raw, durationMs });
  }, [commit, drawnQuestions]);

  const recordTimeout = useCallback(() => {
    const current = stateRef.current;
    if (current.phase !== 'question') return;
    const dq = drawnQuestions[current.answers.length];
    startPerfRef.current = null;
    const answer: TriviaAnswerRecord = { id: dq.id, correct: false, answer_ms: null, timed_out: true, chosenIndex: null };
    commit({ ...current, phase: 'feedback', answers: [...current.answers, answer], questionStartEpoch: null });
  }, [commit, drawnQuestions]);

  const handleOptionPointerDown = useCallback(
    (optionIndex: number) => (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      const now = performance.now();
      if (now - lastPointerDownPerfRef.current < DEBOUNCE_MS) {
        return; // bounce: the first tap already registered (§9 double tap).
      }
      lastPointerDownPerfRef.current = now;

      const current = stateRef.current;
      if (current.phase !== 'question') return;
      const dq = drawnQuestions[current.answers.length];

      const rawElapsed =
        startPerfRef.current !== null
          ? now - startPerfRef.current
          : current.questionStartEpoch !== null
            ? Date.now() - current.questionStartEpoch
            : 0;
      const answerMs = Math.round(Math.max(0, Math.min(rawElapsed, TRIVIA_QUESTION_MS)));
      startPerfRef.current = null;

      const correct = optionIndex === dq.correctIndex;
      const answer: TriviaAnswerRecord = { id: dq.id, correct, answer_ms: answerMs, timed_out: false, chosenIndex: optionIndex };
      commit({ ...current, phase: 'feedback', answers: [...current.answers, answer], questionStartEpoch: null });
    },
    [commit, drawnQuestions],
  );

  // Intro card -> first question.
  useEffect(() => {
    if (state.phase !== 'intro') return;
    const timer = window.setTimeout(() => {
      startPerfRef.current = performance.now();
      commit({ ...stateRef.current, phase: 'question', questionStartEpoch: Date.now() });
    }, INTRO_MS);
    return () => window.clearTimeout(timer);
  }, [state.phase, commit]);

  // Question: timeout at 10s, resumable from a persisted epoch. A single
  // scheduled timeout (mirrors stop-the-clock's ready/running effects) so
  // it fires reliably regardless of how the visual tick below is batched.
  useEffect(() => {
    if (state.phase !== 'question' || state.questionStartEpoch === null) return;
    const remaining = TRIVIA_QUESTION_MS - (Date.now() - state.questionStartEpoch);
    if (remaining <= 0) {
      recordTimeout();
      return;
    }
    const timer = window.setTimeout(recordTimeout, remaining);
    return () => window.clearTimeout(timer);
  }, [state.phase, state.questionStartEpoch, state.answers.length, recordTimeout]);

  // Question: drives the countdown bar/number display only (re-renders every
  // tick without touching persisted state or onProgress; the score clock
  // above stays purely epoch-based and independent of this).
  useEffect(() => {
    if (state.phase !== 'question' || state.questionStartEpoch === null) return;
    const remaining = TRIVIA_QUESTION_MS - (Date.now() - state.questionStartEpoch);
    if (remaining <= 0) return; // the timeout effect above handles this.
    // Reduced motion: the bar steps once per second (docs/games/trivia.md §8).
    const tickMs = reducedMotion ? 1000 : 250;
    const timer = window.setTimeout(() => setTick((n) => n + 1), Math.min(tickMs, remaining));
    return () => window.clearTimeout(timer);
    // `tick` deliberately re-runs this effect every countdown step; `remaining` is recomputed from the epoch each time, not tracked as a dep.
  }, [state.phase, state.questionStartEpoch, reducedMotion, tick]);

  // Feedback card -> next question, or result + submit after the 5th.
  useEffect(() => {
    if (state.phase !== 'feedback') return;
    const timer = window.setTimeout(() => {
      const current = stateRef.current;
      if (current.phase !== 'feedback') return;
      if (current.answers.length >= TRIVIA_QUESTIONS_PER_PLAYER) {
        finishNow();
      } else {
        startPerfRef.current = performance.now();
        commit({ ...current, phase: 'question', questionStartEpoch: Date.now() });
      }
    }, FEEDBACK_MS);
    return () => window.clearTimeout(timer);
  }, [state.phase, state.answers.length, commit, finishNow]);

  // The shell signals the round is over: finish immediately, timing out
  // whatever question is in progress and any not yet asked (§9).
  useEffect(() => {
    if (roundEnded) {
      finishNow();
    }
  }, [roundEnded, finishNow]);

  // Screen reader: announce the question and its options once per question.
  useEffect(() => {
    if (state.phase !== 'question') return;
    if (announcedQuestionIndexRef.current === currentIndex) return;
    announcedQuestionIndexRef.current = currentIndex;
    announcedFiveLeftIndexRef.current = null;
    setSrFiveLeftText('');
    const dq = drawnQuestions[currentIndex];
    if (dq) {
      setSrQuestionText(`${dq.question[lang]}. ${dq.options.map((o) => o[lang]).join('. ')}`);
    }
  }, [state.phase, currentIndex, drawnQuestions, lang]);

  // Screen reader: announce "5 seconds left" once per question.
  useEffect(() => {
    if (state.phase !== 'question') return;
    if (secondsLeft > 5) return;
    if (announcedFiveLeftIndexRef.current === currentIndex) return;
    announcedFiveLeftIndexRef.current = currentIndex;
    setSrFiveLeftText(t('game.trivia.five_left'));
  }, [state.phase, secondsLeft, currentIndex, t]);

  if (state.phase === 'intro') {
    return (
      <div className={`${styles.screen} ${styles.screenCenter}`}>
        <div className={styles.intro}>
          <p className={styles.eyebrow}>{t('game.trivia.intro')}</p>
          <h1 className={styles.title}>{t('game.trivia.name')}</h1>
          <p className={styles.pitch}>{t('game.trivia.pitch')}</p>
        </div>
      </div>
    );
  }

  if (state.phase === 'result') {
    const raw = buildRaw(state.answers.map(toRawAnswer));
    const score = scoreTrivia(raw);
    const correctCount = state.answers.filter((a) => a.correct).length;
    return (
      <div className={`${styles.screen} ${styles.screenCenter}`}>
        <p className={styles.score}>{score}</p>
        <p className={styles.resultLine}>{t('game.trivia.result', { n: correctCount })}</p>
      </div>
    );
  }

  if (state.phase === 'feedback') {
    const idx = state.answers.length - 1;
    const answer = state.answers[idx];
    const dq = drawnQuestions[idx];
    const points = answer.correct ? Math.round(pointsForQuestion(toRawAnswer(answer))) : 0;
    return (
      <div className={styles.screen}>
        <p className={styles.progress}>{t('game.trivia.progress', { n: idx + 1 })}</p>
        {answer.timed_out ? <p className={styles.timesUp}>{t('game.trivia.times_up')}</p> : null}
        <h2 className={styles.question}>{dq.question[lang]}</h2>
        <div className={styles.optionsList}>
          {dq.options.map((option, i) => {
            const isCorrectOption = i === dq.correctIndex;
            const isChosenWrong = i === answer.chosenIndex && !isCorrectOption;
            const classNames = [
              styles.option,
              isCorrectOption ? styles.optionCorrect : '',
              isChosenWrong ? styles.optionWrong : '',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <div key={option.en} className={classNames}>
                <span>{option[lang]}</span>
                {isCorrectOption ? <span aria-hidden="true">✓</span> : null}
                {isChosenWrong ? <span aria-hidden="true">✗</span> : null}
              </div>
            );
          })}
        </div>
        {answer.correct ? (
          <p className={styles.pointsBadge}>
            <bdi dir="ltr">{t('game.trivia.correct_points', { p: points })}</bdi>
          </p>
        ) : null}
      </div>
    );
  }

  // question_n
  const dq = drawnQuestions[currentIndex];
  return (
    <div className={styles.screen}>
      <div className={styles.topRow}>
        <p className={styles.progress}>{t('game.trivia.progress', { n: currentIndex + 1 })}</p>
        <span className={styles.bucketChip}>{t(`game.trivia.bucket.${dq.bucket}`)}</span>
      </div>
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
      <h2 className={styles.question}>{dq.question[lang]}</h2>
      <div className={styles.optionsList}>
        {dq.options.map((option, i) => (
          <button
            key={option.en}
            type="button"
            className={styles.option}
            onPointerDown={handleOptionPointerDown(i)}
          >
            {option[lang]}
          </button>
        ))}
      </div>
      <div className={styles.srOnly} role="status" aria-live="polite">
        {srQuestionText}
      </div>
      <div className={styles.srOnly} role="status" aria-live="polite">
        {srFiveLeftText}
      </div>
    </div>
  );
}

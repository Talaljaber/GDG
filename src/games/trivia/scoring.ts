/**
 * Pure scoring for Trivia. Source of truth: docs/SCORING.md §3.5,
 * docs/games/trivia.md §4-5. No DOM, time or randomness.
 */

/** Per-question timeout, and the ms scale the time bonus is computed over. */
export const TRIVIA_QUESTION_MS = 10_000;

/** A correct answer must land at least this many ms after the question started (SCORING §4). */
export const TRIVIA_MIN_CORRECT_MS = 250;

/** The server-enforced score ceiling: at least one question can't be scored at max (SCORING §4). */
export const TRIVIA_MAX_ACCEPTED_SCORE = 988;

/** Number of questions per round (docs/games/trivia.md §1). */
export const TRIVIA_QUESTION_COUNT = 5;

export interface TriviaQuestionAnswer {
  /** Matches `^q[0-9]{2}$`, the id from docs/content/trivia-questions.json. */
  id: string;
  correct: boolean;
  /** ms from the question becoming visible to the tap; null iff `timed_out`. */
  answer_ms: number | null;
  timed_out: boolean;
}

/** The `raw` evidence object submitted with the score; matches the game doc's JSON Schema §5. */
export interface TriviaRaw {
  questions: TriviaQuestionAnswer[];
}

/** Builds the `raw` payload from the five recorded answers, in question order. */
export function buildRaw(questions: TriviaQuestionAnswer[]): TriviaRaw {
  return { questions };
}

/**
 * points = 100 + 100 x (10000 - answer_ms) / 10000 when correct; 0 when
 * wrong or timed out (docs/SCORING.md §3.5).
 */
export function pointsForQuestion(answer: TriviaQuestionAnswer): number {
  if (!answer.correct || answer.answer_ms === null) {
    return 0;
  }
  const remainingMs = TRIVIA_QUESTION_MS - answer.answer_ms;
  return 100 + (100 * remainingMs) / TRIVIA_QUESTION_MS;
}

/** Total points across all questions, before rounding. Exported for tests and diagnostics. */
export function totalPoints(raw: TriviaRaw): number {
  return raw.questions.reduce((sum, answer) => sum + pointsForQuestion(answer), 0);
}

/**
 * score = round(sum(points_q)), clamped to [0, 1000].
 *
 * This is the value computed on the phone; the server independently rejects
 * (but never recomputes) values outside docs/SCORING.md §4's bounds, e.g.
 * score > 988 (worked example E, a scripted run).
 */
export function scoreTrivia(raw: unknown): number {
  const { questions } = raw as TriviaRaw;
  const total = questions.reduce((sum, answer) => sum + pointsForQuestion(answer), 0);
  const score = Math.round(total);
  return Math.min(1000, Math.max(0, score));
}

/** Reason codes from docs/SCORING.md §4's Trivia row, in check order. */
export type TriviaRejectReason =
  | 'trivia.shape'
  | 'trivia.timeout'
  | 'trivia.range'
  | 'trivia.too_fast'
  | 'trivia.zero'
  | 'trivia.score_above_988';

/**
 * Mirrors the server's rejection bounds (docs/SCORING.md §4) for tests and
 * for instant client-side UX feedback; the server remains authoritative and
 * never recomputes the score (docs/SCORING.md §1.4). Returns the first
 * violated reason code, or null if `raw`/`score` would be accepted.
 */
export function validateTriviaRaw(raw: TriviaRaw, score: number): TriviaRejectReason | null {
  const { questions } = raw;

  const ids = new Set(questions.map((q) => q.id));
  if (questions.length !== TRIVIA_QUESTION_COUNT || ids.size !== TRIVIA_QUESTION_COUNT) {
    return 'trivia.shape';
  }

  for (const answer of questions) {
    const nullMismatch = answer.timed_out ? answer.answer_ms !== null : answer.answer_ms === null;
    if (nullMismatch) {
      return 'trivia.timeout';
    }
  }

  for (const answer of questions) {
    if (answer.answer_ms === null) continue;
    if (answer.answer_ms < 0 || answer.answer_ms > TRIVIA_QUESTION_MS) {
      return 'trivia.range';
    }
  }

  for (const answer of questions) {
    if (answer.correct && (answer.answer_ms === null || answer.answer_ms < TRIVIA_MIN_CORRECT_MS)) {
      return 'trivia.too_fast';
    }
  }

  const anyCorrect = questions.some((q) => q.correct);
  if (!anyCorrect && score !== 0) {
    return 'trivia.zero';
  }

  if (score > TRIVIA_MAX_ACCEPTED_SCORE) {
    return 'trivia.score_above_988';
  }

  return null;
}

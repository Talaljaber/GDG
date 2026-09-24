import { describe, expect, it } from 'vitest';
import {
  buildRaw,
  pointsForQuestion,
  scoreTrivia,
  totalPoints,
  validateTriviaRaw,
  type TriviaQuestionAnswer,
} from './scoring';

function q(id: string, correct: boolean, answer_ms: number | null, timed_out = false): TriviaQuestionAnswer {
  return { id, correct, answer_ms, timed_out };
}

describe('scoreTrivia: worked examples (docs/games/trivia.md §4)', () => {
  it('A (all right): 2000, 3000, 4000, 2500, 5000 -> 835', () => {
    const raw = buildRaw([
      q('q01', true, 2000),
      q('q02', true, 3000),
      q('q03', true, 4000),
      q('q04', true, 2500),
      q('q05', true, 5000),
    ]);
    expect(totalPoints(raw)).toBeCloseTo(835, 5);
    expect(scoreTrivia(raw)).toBe(835);
  });

  it('B (3 right): 3000 ✓, 4000 ✗, 5000 ✓, 6000 ✓, 2000 ✗ -> 460', () => {
    const raw = buildRaw([
      q('q01', true, 3000),
      q('q02', false, 4000),
      q('q03', true, 5000),
      q('q04', true, 6000),
      q('q05', false, 2000),
    ]);
    expect(scoreTrivia(raw)).toBe(460);
  });

  it('C (one timeout): 1500 ✓, 2000 ✓, timeout, 9000 ✓, 4000 ✓ -> 635', () => {
    const raw = buildRaw([
      q('q01', true, 1500),
      q('q02', true, 2000),
      q('q03', false, null, true),
      q('q04', true, 9000),
      q('q05', true, 4000),
    ]);
    expect(scoreTrivia(raw)).toBe(635);
  });

  it('D (all wrong): 0', () => {
    const raw = buildRaw([
      q('q01', false, 1000),
      q('q02', false, 2000),
      q('q03', false, 3000),
      q('q04', false, 4000),
      q('q05', false, 5000),
    ]);
    expect(scoreTrivia(raw)).toBe(0);
  });

  it('E (scripted): 100 ✓ x 5 -> 995 on the client, rejected as trivia.too_fast', () => {
    const raw = buildRaw([
      q('q01', true, 100),
      q('q02', true, 100),
      q('q03', true, 100),
      q('q04', true, 100),
      q('q05', true, 100),
    ]);
    const score = scoreTrivia(raw);
    expect(score).toBe(995);
    expect(validateTriviaRaw(raw, score)).toBe('trivia.too_fast');
  });
});

describe('pointsForQuestion', () => {
  it('0 for wrong, non-null answer_ms', () => {
    expect(pointsForQuestion(q('q01', false, 500))).toBe(0);
  });

  it('0 for timeout (answer_ms null)', () => {
    expect(pointsForQuestion(q('q01', false, null, true))).toBe(0);
  });

  it('100-200 range for correct answers', () => {
    expect(pointsForQuestion(q('q01', true, 0))).toBe(200);
    expect(pointsForQuestion(q('q01', true, 10000))).toBe(100);
  });
});

describe('game doc test cases (docs/games/trivia.md §10)', () => {
  it('TRV-T1: example A -> 835', () => {
    const raw = buildRaw([
      q('q01', true, 2000),
      q('q02', true, 3000),
      q('q03', true, 4000),
      q('q04', true, 2500),
      q('q05', true, 5000),
    ]);
    expect(scoreTrivia(raw)).toBe(835);
  });

  it('TRV-T2: example C -> 635', () => {
    const raw = buildRaw([
      q('q01', true, 1500),
      q('q02', true, 2000),
      q('q03', false, null, true),
      q('q04', true, 9000),
      q('q05', true, 4000),
    ]);
    expect(scoreTrivia(raw)).toBe(635);
  });

  it('TRV-T6: a duplicated id -> trivia.shape', () => {
    const raw = buildRaw([
      q('q01', true, 2000),
      q('q01', true, 3000),
      q('q03', true, 4000),
      q('q04', true, 2500),
      q('q05', true, 5000),
    ]);
    const score = scoreTrivia(raw);
    expect(validateTriviaRaw(raw, score)).toBe('trivia.shape');
  });

  it('TRV-T7: a correct answer with answer_ms 200 -> trivia.too_fast', () => {
    const raw = buildRaw([
      q('q01', true, 200),
      q('q02', true, 3000),
      q('q03', true, 4000),
      q('q04', true, 2500),
      q('q05', true, 5000),
    ]);
    const score = scoreTrivia(raw);
    expect(validateTriviaRaw(raw, score)).toBe('trivia.too_fast');
  });

  it('TRV-T8: all 5 correct at answer_ms 250 -> 988, accepted', () => {
    const raw = buildRaw([
      q('q01', true, 250),
      q('q02', true, 250),
      q('q03', true, 250),
      q('q04', true, 250),
      q('q05', true, 250),
    ]);
    const score = scoreTrivia(raw);
    expect(score).toBe(988);
    expect(validateTriviaRaw(raw, score)).toBeNull();
  });
});

describe('validateTriviaRaw', () => {
  it('accepts a normal accepted run (example B)', () => {
    const raw = buildRaw([
      q('q01', true, 3000),
      q('q02', false, 4000),
      q('q03', true, 5000),
      q('q04', true, 6000),
      q('q05', false, 2000),
    ]);
    const score = scoreTrivia(raw);
    expect(validateTriviaRaw(raw, score)).toBeNull();
  });

  it('fewer than 5 questions -> trivia.shape', () => {
    const raw = buildRaw([q('q01', true, 3000), q('q02', true, 4000)]);
    const score = scoreTrivia(raw);
    expect(validateTriviaRaw(raw, score)).toBe('trivia.shape');
  });

  it('answer_ms non-null while timed_out -> trivia.timeout', () => {
    const raw = buildRaw([
      q('q01', false, 5000, true),
      q('q02', true, 3000),
      q('q03', true, 4000),
      q('q04', true, 2500),
      q('q05', true, 5000),
    ]);
    const score = scoreTrivia(raw);
    expect(validateTriviaRaw(raw, score)).toBe('trivia.timeout');
  });

  it('answer_ms null while not timed_out -> trivia.timeout', () => {
    const raw = buildRaw([
      q('q01', false, null, false),
      q('q02', true, 3000),
      q('q03', true, 4000),
      q('q04', true, 2500),
      q('q05', true, 5000),
    ]);
    const score = scoreTrivia(raw);
    expect(validateTriviaRaw(raw, score)).toBe('trivia.timeout');
  });

  it('answer_ms out of 0-10000 range -> trivia.range', () => {
    const raw = buildRaw([
      q('q01', false, 10001),
      q('q02', true, 3000),
      q('q03', true, 4000),
      q('q04', true, 2500),
      q('q05', true, 5000),
    ]);
    const score = scoreTrivia(raw);
    expect(validateTriviaRaw(raw, score)).toBe('trivia.range');
  });

  it('no correct answers but a nonzero score -> trivia.zero', () => {
    const raw = buildRaw([
      q('q01', false, 1000),
      q('q02', false, 2000),
      q('q03', false, 3000),
      q('q04', false, 4000),
      q('q05', false, 5000),
    ]);
    expect(validateTriviaRaw(raw, 1)).toBe('trivia.zero');
  });

  it('score above 988 -> trivia.score_above_988', () => {
    const raw = buildRaw([
      q('q01', true, 250),
      q('q02', true, 250),
      q('q03', true, 250),
      q('q04', true, 250),
      q('q05', true, 250),
    ]);
    expect(validateTriviaRaw(raw, 989)).toBe('trivia.score_above_988');
  });
});

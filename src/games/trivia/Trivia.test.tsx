import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Trivia, type TriviaSnapshot } from './Trivia';
import type { GameProps } from '../types';
import { drawTriviaQuestions, type TriviaPoolQuestion } from './draw';
import type { TriviaRaw } from './scoring';

vi.mock('../../i18n', () => ({
  useT: () => (key: string, params?: Record<string, string | number>) =>
    params ? `${key}|${JSON.stringify(params)}` : key,
  useLang: () => ({ lang: 'en' as const, dir: 'ltr' as const, setLang: vi.fn() }),
}));

/** Exactly the 2/2/1 minimum per bucket, so every mocked question is always drawn. */
const MOCK_POOL = vi.hoisted(
  (): TriviaPoolQuestion[] => {
    const t = (s: string) => ({ en: s, ar: `AR ${s}` });
    return [
      { id: 'gd1', status: 'ready', bucket: 'google_dev', difficulty: 'easy', question: t('gd1?'), options: [t('gd1 correct'), t('gd1 wrong a'), t('gd1 wrong b'), t('gd1 wrong c')], source: 'x', reviewed_by: ['a', 'b'] },
      { id: 'gd2', status: 'ready', bucket: 'google_dev', difficulty: 'medium', question: t('gd2?'), options: [t('gd2 correct'), t('gd2 wrong a'), t('gd2 wrong b'), t('gd2 wrong c')], source: 'x', reviewed_by: ['a', 'b'] },
      { id: 'ai1', status: 'ready', bucket: 'ai_basics', difficulty: 'easy', question: t('ai1?'), options: [t('ai1 correct'), t('ai1 wrong a'), t('ai1 wrong b'), t('ai1 wrong c')], source: 'x', reviewed_by: ['a', 'b'] },
      { id: 'ai2', status: 'ready', bucket: 'ai_basics', difficulty: 'hard', question: t('ai2?'), options: [t('ai2 correct'), t('ai2 wrong a'), t('ai2 wrong b'), t('ai2 wrong c')], source: 'x', reviewed_by: ['a', 'b'] },
      { id: 'gdg1', status: 'ready', bucket: 'gdg_community', difficulty: 'medium', question: t('gdg1?'), options: [t('gdg1 correct'), t('gdg1 wrong a'), t('gdg1 wrong b'), t('gdg1 wrong c')], source: 'x', reviewed_by: ['a', 'b'] },
    ];
  },
);

vi.mock('../../../docs/content/trivia-questions.json', () => ({
  default: {
    _meta: { purpose: 'test', last_updated: '2026-09-24', format_doc: 'x', schema_version: 1 },
    questions: MOCK_POOL,
  },
}));

const ROUND_START = 1_700_000_000_000;
const SEED = 'trivia-test-seed';

/** The same draw the component will produce for SEED/MOCK_POOL; source of truth for assertions. */
const expectedQuestions = drawTriviaQuestions(MOCK_POOL, SEED);

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function renderGame(overrides: Partial<GameProps<TriviaSnapshot>> = {}) {
  const onProgress = vi.fn();
  const onFinish = vi.fn();
  const defaults: GameProps<TriviaSnapshot> = {
    seed: SEED,
    roundStartEpoch: ROUND_START,
    roundEnded: false,
    snapshot: null,
    onProgress,
    onFinish,
  };
  const props = { ...defaults, ...overrides };
  const utils = render(<Trivia {...props} />);
  return {
    ...utils,
    onProgress,
    onFinish,
    rerenderWith: (next: Partial<GameProps<TriviaSnapshot>>) => utils.rerender(<Trivia {...props} {...next} />),
  };
}

function optionButtons(container: HTMLElement): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll('button'));
}

function tapOption(container: HTMLElement, index: number) {
  const buttons = optionButtons(container);
  fireEvent.pointerDown(buttons[index]);
}

function progressSnapshots(onProgress: ReturnType<typeof vi.fn>): TriviaSnapshot[] {
  return onProgress.mock.calls.map((call) => call[0] as TriviaSnapshot);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] });
  vi.setSystemTime(ROUND_START);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Trivia: full run', () => {
  it('answers all 5 correctly and finishes exactly once with the right score', () => {
    const { container, onFinish, onProgress } = renderGame();

    advance(1500); // intro -> question_1

    for (let i = 0; i < 5; i++) {
      const q = expectedQuestions[i];
      expect(container.textContent).toContain(q.question.en);
      tapOption(container, q.correctIndex); // instant, answer_ms 0
      advance(1500); // feedback_i -> question_{i+1} or result
    }

    expect(onFinish).toHaveBeenCalledTimes(1);
    const result = onFinish.mock.calls[0][0];
    const raw = result.raw as TriviaRaw;

    expect(raw.questions).toHaveLength(5);
    expect(raw.questions.map((q) => q.id)).toEqual(expectedQuestions.map((q) => q.id));
    expect(raw.questions.every((q) => q.correct)).toBe(true);
    expect(raw.questions.every((q) => q.timed_out === false)).toBe(true);
    expect(raw.questions.every((q) => q.answer_ms === 0)).toBe(true);
    expect(result.score).toBe(1000); // 5 x 200
    expect(result.durationMs).toBeGreaterThan(0);
    expect(result.durationMs).toBeLessThanOrEqual(120_000);

    // onProgress fires for every start event and every attempt (at least 10: 5 question starts + 5 answers).
    expect(onProgress.mock.calls.length).toBeGreaterThanOrEqual(10);
  });

  it('renders the result screen with the correct count', () => {
    const { container } = renderGame();
    advance(1500);
    for (let i = 0; i < 5; i++) {
      const q = expectedQuestions[i];
      // Answer question 0 wrong, the rest correct.
      const idx = i === 0 ? (q.correctIndex + 1) % 4 : q.correctIndex;
      tapOption(container, idx);
      advance(1500);
    }
    expect(container.textContent).toContain('game.trivia.result|{"n":4}');
  });
});

describe('Trivia: timeout', () => {
  it('records a timeout when no option is tapped within 10s, then continues', () => {
    const { container, onProgress } = renderGame();
    advance(1500); // question_1
    advance(10_000); // the 10s timeout fires

    const afterTimeout = progressSnapshots(onProgress).find((snap) => snap.answers.length === 1);
    expect(afterTimeout?.answers[0]).toEqual({
      id: expectedQuestions[0].id,
      correct: false,
      answer_ms: null,
      timed_out: true,
      chosenIndex: null,
    });
    expect(container.textContent).toContain('game.trivia.times_up');

    advance(1500); // feedback_1 -> question_2
    expect(container.textContent).toContain(expectedQuestions[1].question.en);
  });

  it('a timed-out question scores 0 points for that question', () => {
    const { container, onFinish } = renderGame();
    advance(1500);
    advance(10_000); // q1 times out
    advance(1500); // -> question_2
    for (let i = 1; i < 5; i++) {
      tapOption(container, expectedQuestions[i].correctIndex);
      advance(1500);
    }
    const raw = onFinish.mock.calls[0][0].raw as TriviaRaw;
    expect(raw.questions[0]).toEqual({ id: expectedQuestions[0].id, correct: false, answer_ms: null, timed_out: true });
  });
});

describe('Trivia: reload resume', () => {
  it('resumes mid-question from a snapshot, continuing the same question with elapsed time from the epoch', () => {
    const questionStartEpoch = ROUND_START;
    vi.setSystemTime(ROUND_START + 4000); // reloaded 4s into question 1's 10s window

    const snapshot: TriviaSnapshot = { phase: 'question', answers: [], questionStartEpoch };
    const { container, onProgress } = renderGame({ snapshot });

    expect(container.textContent).toContain(expectedQuestions[0].question.en);

    tapOption(container, expectedQuestions[0].correctIndex); // 4s after questionStartEpoch, via Date.now fallback

    const afterAnswer = progressSnapshots(onProgress).find((snap) => snap.answers.length === 1);
    expect(afterAnswer?.answers[0].answer_ms).toBe(4000);
    expect(afterAnswer?.answers[0].correct).toBe(true);
  });

  it('treats a reload past the 10s window as an immediate timeout', () => {
    const questionStartEpoch = ROUND_START;
    vi.setSystemTime(ROUND_START + 10_500); // reloaded after the window elapsed

    const snapshot: TriviaSnapshot = { phase: 'question', answers: [], questionStartEpoch };
    const { onProgress } = renderGame({ snapshot });

    const afterTimeout = progressSnapshots(onProgress).find((snap) => snap.answers.length === 1);
    expect(afterTimeout?.answers[0]).toEqual({
      id: expectedQuestions[0].id,
      correct: false,
      answer_ms: null,
      timed_out: true,
      chosenIndex: null,
    });
  });

  it('resumes the feedback card and continues to the next question', () => {
    const snapshot: TriviaSnapshot = {
      phase: 'feedback',
      answers: [{ id: expectedQuestions[0].id, correct: true, answer_ms: 2000, timed_out: false, chosenIndex: expectedQuestions[0].correctIndex }],
      questionStartEpoch: null,
    };
    const { container } = renderGame({ snapshot });
    expect(container.textContent).toContain(expectedQuestions[0].question.en);

    advance(1500); // feedback_1 -> question_2
    expect(container.textContent).toContain(expectedQuestions[1].question.en);
  });
});

describe('Trivia: round ends early', () => {
  it('times out every remaining question (including the one in progress) and finishes once', () => {
    const { container, onFinish, rerenderWith } = renderGame();
    advance(1500); // question_1
    tapOption(container, expectedQuestions[0].correctIndex);
    advance(1500); // question_2
    // 3s into question 2's 10s window when the round ends.
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    rerenderWith({ roundEnded: true });

    expect(onFinish).toHaveBeenCalledTimes(1);
    const raw = onFinish.mock.calls[0][0].raw as TriviaRaw;
    expect(raw.questions).toHaveLength(5);
    expect(raw.questions[0].correct).toBe(true);
    for (let i = 1; i < 5; i++) {
      expect(raw.questions[i]).toEqual({ id: expectedQuestions[i].id, correct: false, answer_ms: null, timed_out: true });
    }
  });

  it('finishes only once even if roundEnded stays true across re-renders', () => {
    const { onFinish, rerenderWith } = renderGame();
    advance(1500);
    rerenderWith({ roundEnded: true });
    rerenderWith({ roundEnded: true });
    expect(onFinish).toHaveBeenCalledTimes(1);
  });
});

describe('Trivia: double tap', () => {
  it('ignores a second pointerdown on a different option within the 100ms debounce window', () => {
    const { container, onProgress } = renderGame();
    advance(1500); // question_1
    const buttons = optionButtons(container);
    const q = expectedQuestions[0];
    const wrongIndex = (q.correctIndex + 1) % 4;

    fireEvent.pointerDown(buttons[q.correctIndex]); // first tap: correct
    fireEvent.pointerDown(buttons[wrongIndex]); // bounce (0ms later): must be ignored

    const feedbackTransitions = progressSnapshots(onProgress).filter((snap) => snap.phase === 'feedback');
    expect(feedbackTransitions).toHaveLength(1);
    expect(feedbackTransitions[0].answers[0].correct).toBe(true);
  });
});

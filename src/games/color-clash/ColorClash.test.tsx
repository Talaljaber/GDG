import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ColorClash, type ColorClashSnapshot } from './ColorClash';
import type { GameProps, GameResult } from '../types';
import { INKS, trialFor, type Ink } from './trials';
import { scoreColorClash, validateColorClashRaw, type ColorClashRaw } from './scoring';

vi.mock('../../i18n', () => ({
  useT: () => (key: string, params?: Record<string, string | number>) =>
    params ? `${key}|${JSON.stringify(params)}` : key,
  useLang: () => ({ lang: 'en' as const, dir: 'ltr' as const, setLang: vi.fn() }),
}));

const ROUND_START = 1_700_000_000_000;
const SEED = 'cc-test-seed';

function advance(ms: number) {
  for (let t = 0; t < ms; t += 50) {
    act(() => {
      vi.advanceTimersByTime(Math.min(50, ms - t));
    });
  }
}

function renderGame(overrides: Partial<GameProps<ColorClashSnapshot>> = {}) {
  const onProgress = vi.fn<(s: ColorClashSnapshot) => void>();
  const onFinish = vi.fn<(r: GameResult) => void>();
  const props: GameProps<ColorClashSnapshot> = {
    seed: SEED,
    roundStartEpoch: ROUND_START,
    roundEnded: false,
    snapshot: null,
    onProgress,
    onFinish,
    ...overrides,
  };
  const utils = render(<ColorClash {...props} />);
  return {
    ...utils,
    onProgress,
    onFinish,
    rerenderWith: (next: Partial<GameProps<ColorClashSnapshot>>) => utils.rerender(<ColorClash {...props} {...next} />),
    last: () => onProgress.mock.calls[onProgress.mock.calls.length - 1][0],
  };
}

function shownWord(container: HTMLElement) {
  const el = container.querySelector('[data-testid="cc-word"]');
  return el ? { ink: el.getAttribute('data-ink') as Ink, word: el.getAttribute('data-word') as Ink, text: el.textContent } : null;
}

function tap(container: HTMLElement, ink: Ink) {
  const button = container.querySelector(`[data-testid="cc-button-${ink}"]`);
  if (!button) throw new Error(`no button ${ink}`);
  fireEvent.pointerDown(button);
}

const other = (ink: Ink): Ink => INKS[(INKS.indexOf(ink) + 1) % INKS.length];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] });
  vi.setSystemTime(ROUND_START);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Color Clash: play', () => {
  it('shows the seeded trials in order, counts correct taps and finishes once at 30 s', () => {
    const { container, onFinish, last } = renderGame();
    expect(container.textContent).toContain('game.color_clash.name');
    advance(1500);

    for (let k = 0; k < 5; k++) {
      const shown = shownWord(container);
      const expected = trialFor(SEED, k);
      expect(shown).toEqual({ ink: expected.ink, word: expected.word, text: `game.color_clash.word.${expected.word}` });
      advance(600);
      tap(container, expected.ink);
      expect(shownWord(container)).toBeNull(); // the gap hides the word
      advance(300);
    }
    expect(last()).toMatchObject({ correct: 5, wrong: 0, correctRtSumMs: 5 * 600, trialIndex: 5 });

    advance(30_000);
    expect(onFinish).toHaveBeenCalledTimes(1);
    const result = onFinish.mock.calls[0][0];
    const raw = result.raw as ColorClashRaw;
    expect(raw.correct).toBe(5);
    expect(raw.mean_rt_ms).toBe(600);
    expect(raw.timeouts).toBeGreaterThan(0); // idle after the fifth
    expect(result.score).toBe(scoreColorClash(raw));
    expect(validateColorClashRaw(raw, result.score)).toBeNull();
    expect(result.durationMs).toBeGreaterThanOrEqual(31_500);
    expect(result.durationMs).toBeLessThanOrEqual(31_600);
  });

  it('CC-T8: a wrong tap counts, shows a cross in the gap and moves to the next trial', () => {
    const { container, last } = renderGame();
    advance(1500);
    const first = trialFor(SEED, 0);
    advance(500);
    tap(container, other(first.ink));
    expect(last()).toMatchObject({ wrong: 1, correct: 0, feedback: 'wrong', chosen: other(first.ink) });
    expect(container.querySelector('[data-testid="cc-wrong-mark"]')).not.toBeNull();
    tap(container, first.ink); // bounce / during the gap: ignored
    advance(100);
    tap(container, first.ink); // still in the gap: ignored
    expect(last().correct).toBe(0);
    advance(250);
    expect(last()).toMatchObject({ trialIndex: 1, feedback: null });
    expect(shownWord(container)?.ink).toBe(trialFor(SEED, 1).ink);
  });

  it('each trial times out after 3 s', () => {
    const { container, last } = renderGame();
    advance(1500);
    advance(2950);
    expect(last().timeouts).toBe(0);
    advance(100);
    expect(last()).toMatchObject({ timeouts: 1, feedback: 'timeout' });
    expect(container.textContent).toContain('game.color_clash.too_slow');
    advance(300);
    expect(last().trialIndex).toBe(1);
  });

  it('"round ended" finishes at once; the open trial does not count', () => {
    const { container, onFinish, rerenderWith } = renderGame();
    advance(1500);
    advance(700);
    tap(container, trialFor(SEED, 0).ink);
    advance(300);
    rerenderWith({ roundEnded: true });
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish.mock.calls[0][0].raw).toEqual({ correct: 1, wrong: 0, timeouts: 0, mean_rt_ms: 700 });
  });
});

describe('Color Clash: reload (ADR-018)', () => {
  it('CC-T10: resumes the same trial with its elapsed time; the game still ends at the original 30 s', () => {
    const gameStart = ROUND_START + 1500;
    vi.setSystemTime(gameStart + 10_000);
    const snapshot: ColorClashSnapshot = {
      phase: 'play',
      gameStartEpoch: gameStart,
      trialIndex: 12,
      trialStartEpoch: gameStart + 9_600,
      gapEndEpoch: null,
      correct: 10,
      wrong: 1,
      timeouts: 0,
      correctRtSumMs: 7000,
      feedback: null,
      chosen: null,
    };
    const { container, onFinish, last } = renderGame({ snapshot });
    expect(shownWord(container)?.ink).toBe(trialFor(SEED, 12).ink);
    advance(100);
    tap(container, trialFor(SEED, 12).ink);
    expect(last()).toMatchObject({ correct: 11, correctRtSumMs: 7000 + 500 });

    advance(20_000 - 100 - 50);
    expect(onFinish).not.toHaveBeenCalled();
    advance(100);
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('a reload during the gap ends the gap at its stored time', () => {
    const gameStart = ROUND_START + 1500;
    vi.setSystemTime(gameStart + 5_000);
    const snapshot: ColorClashSnapshot = {
      phase: 'play',
      gameStartEpoch: gameStart,
      trialIndex: 4,
      trialStartEpoch: null,
      gapEndEpoch: gameStart + 5_200,
      correct: 4,
      wrong: 0,
      timeouts: 0,
      correctRtSumMs: 2400,
      feedback: 'correct',
      chosen: 'blue',
    };
    const { container, last } = renderGame({ snapshot });
    expect(shownWord(container)).toBeNull();
    advance(250);
    expect(last()).toMatchObject({ trialIndex: 5, feedback: null });
    expect(shownWord(container)?.ink).toBe(trialFor(SEED, 5).ink);
  });
});

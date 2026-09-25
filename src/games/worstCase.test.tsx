/**
 * AC3.2 across every game (the five originals and the ADR-134 additions): a player who does nothing still gets a
 * finished round inside the game's documented worst case (SCORING.md §2),
 * the worst case never exceeds the 120 s cap, and "round ended" (E27)
 * finishes the game at once with a valid, in-range score. Per-game paths
 * (late starts, slow taps, wrong taps) are covered in each game's own tests.
 */
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ROUND_CAP_MS } from '../config';
import type { GameModule, GameProps, GameResult } from './types';
import { stopTheClock } from './stop-the-clock';
import { oddOneOut } from './odd-one-out';
import { simon } from './simon';
import { perfectCircle } from './perfect-circle';
import { trivia } from './trivia';
import { closeBrackets } from './close-brackets';
import { colorClash } from './color-clash';
import { howMany } from './how-many';
import { swipeSort } from './swipe-sort';
import { pairs } from './pairs';
import type { TriviaPoolQuestion } from './trivia/draw';

vi.mock('../i18n', () => ({
  useT: () => (key: string, params?: Record<string, string | number>) =>
    params ? `${key}|${JSON.stringify(params)}` : key,
  useLang: () => ({ lang: 'en' as const, dir: 'ltr' as const, setLang: vi.fn() }),
}));

const MOCK_POOL = vi.hoisted((): TriviaPoolQuestion[] => {
  const t = (s: string) => ({ en: s, ar: `AR ${s}` });
  const q = (id: string, bucket: TriviaPoolQuestion['bucket']): TriviaPoolQuestion => ({
    id,
    status: 'ready',
    bucket,
    difficulty: 'easy',
    question: t(`${id}?`),
    options: [t(`${id} a`), t(`${id} b`), t(`${id} c`), t(`${id} d`)],
    source: 'x',
    reviewed_by: ['a', 'b'],
  });
  return [q('gd1', 'google_dev'), q('gd2', 'google_dev'), q('ai1', 'ai_basics'), q('ai2', 'ai_basics'), q('c1', 'gdg_community')];
});

vi.mock('../../docs/content/trivia-questions.json', () => ({
  default: {
    _meta: { purpose: 'test', last_updated: '2026-09-24', format_doc: 'x', schema_version: 1 },
    questions: MOCK_POOL,
  },
}));

const ROUND_START = 1_700_000_000_000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MODULES: Array<GameModule<any>> = [
  stopTheClock,
  oddOneOut,
  simon,
  perfectCircle,
  trivia,
  closeBrackets,
  colorClash,
  howMany,
  swipeSort,
  pairs,
];

function renderIdle(mod: GameModule<unknown>, roundEnded = false) {
  const onFinish = vi.fn<(r: GameResult) => void>();
  const props: GameProps<unknown> = {
    seed: `worst-case:${mod.id}`,
    roundStartEpoch: ROUND_START,
    roundEnded,
    snapshot: null,
    onProgress: () => {},
    onFinish,
  };
  const Game = mod.Component;
  const utils = render(<Game {...props} />);
  return { onFinish, rerender: (next: Partial<GameProps<unknown>>) => utils.rerender(<Game {...props} {...next} />) };
}

function advance(ms: number) {
  // step in chunks so chained timers (attempt → transition → next attempt) all fire
  for (let t = 0; t < ms; t += 50) {
    act(() => {
      vi.advanceTimersByTime(Math.min(50, ms - t));
    });
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] });
  vi.setSystemTime(ROUND_START);
  // one "frame" every 16 ms on the fake clock (not the real rAF: React's scheduler uses it too)
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) =>
    window.setTimeout(() => cb(performance.now()), 16),
  );
  vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id));
  // Perfect Circle draws on a canvas; jsdom has none, so every 2D call is a no-op.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => new Proxy({}, { get: () => () => undefined }) as unknown as CanvasRenderingContext2D,
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('AC3.2: every game finishes inside its worst case and on "round ended"', () => {
  it.each(MODULES.map((m) => [m.id, m] as const))('%s: worst case is inside the 120 s cap', (_id, mod) => {
    expect(mod.worstCaseMs).toBeGreaterThan(0);
    expect(mod.worstCaseMs).toBeLessThanOrEqual(ROUND_CAP_MS);
  });

  it.each(MODULES.map((m) => [m.id, m] as const))('%s: an idle player is scored within the worst case', (_id, mod) => {
    const { onFinish } = renderIdle(mod);
    advance(mod.worstCaseMs - 2000);
    advance(3000);
    expect(onFinish).toHaveBeenCalledTimes(1);
    const result = onFinish.mock.calls[0][0];
    expect(Number.isInteger(result.score)).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1000);
    expect(result.durationMs).toBeLessThanOrEqual(mod.worstCaseMs);
    expect(mod.score(result.raw)).toBe(result.score); // the pure scorer agrees with the screen
  });

  it.each(MODULES.map((m) => [m.id, m] as const))('%s: "round ended" mid-round finishes at once (E27)', (_id, mod) => {
    const { onFinish, rerender } = renderIdle(mod);
    advance(4000);
    rerender({ roundEnded: true });
    advance(1500);
    expect(onFinish).toHaveBeenCalledTimes(1);
    const result = onFinish.mock.calls[0][0];
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1000);
    expect(mod.score(result.raw)).toBe(result.score);
  });
});

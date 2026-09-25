import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CloseBrackets, type CloseBracketsSnapshot } from './CloseBrackets';
import type { GameProps, GameResult } from '../types';
import { openersFor, type BracketKind } from './sequence';
import { scoreCloseBrackets, validateCloseBracketsRaw, type CloseBracketsRaw } from './scoring';

vi.mock('../../i18n', () => ({
  useT: () => (key: string, params?: Record<string, string | number>) =>
    params ? `${key}|${JSON.stringify(params)}` : key,
  useLang: () => ({ lang: 'en' as const, dir: 'ltr' as const, setLang: vi.fn() }),
}));

const ROUND_START = 1_700_000_000_000;
const SEED = 'cb-test-seed';

function advance(ms: number) {
  for (let t = 0; t < ms; t += 50) {
    act(() => {
      vi.advanceTimersByTime(Math.min(50, ms - t));
    });
  }
}

function renderGame(overrides: Partial<GameProps<CloseBracketsSnapshot>> = {}) {
  const onProgress = vi.fn<(s: CloseBracketsSnapshot) => void>();
  const onFinish = vi.fn<(r: GameResult) => void>();
  const props: GameProps<CloseBracketsSnapshot> = {
    seed: SEED,
    roundStartEpoch: ROUND_START,
    roundEnded: false,
    snapshot: null,
    onProgress,
    onFinish,
    ...overrides,
  };
  const utils = render(<CloseBrackets {...props} />);
  return {
    ...utils,
    onProgress,
    onFinish,
    rerenderWith: (next: Partial<GameProps<CloseBracketsSnapshot>>) => utils.rerender(<CloseBrackets {...props} {...next} />),
    last: () => onProgress.mock.calls[onProgress.mock.calls.length - 1][0],
  };
}

function shownOpeners(container: HTMLElement): BracketKind[] {
  return Array.from(container.querySelectorAll('[data-testid="cb-row"] [data-kind]')).map(
    (el) => el.getAttribute('data-kind') as BracketKind,
  );
}

function tap(container: HTMLElement, kind: BracketKind) {
  const key = container.querySelector(`[data-testid="cb-key-${kind}"]`);
  if (!key) throw new Error(`no key ${kind}`);
  fireEvent.pointerDown(key);
}

/** Closes the sequence on screen correctly, one tap every `gapMs`. */
function solveShown(container: HTMLElement, gapMs = 200) {
  const openers = shownOpeners(container);
  for (let i = openers.length - 1; i >= 0; i--) {
    advance(gapMs);
    tap(container, openers[i]);
  }
}

function wrongFor(kind: BracketKind): BracketKind {
  return kind === 'round' ? 'square' : 'round';
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] });
  vi.setSystemTime(ROUND_START);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Close the Brackets: play', () => {
  it('shows the seeded openers, grows by one per solve and finishes once at 30 s', () => {
    const { container, onFinish, last } = renderGame();
    expect(container.textContent).toContain('game.close_brackets.name');
    advance(1500);
    expect(shownOpeners(container)).toEqual(openersFor(SEED, 2, 0));

    solveShown(container); // length 2
    advance(400);
    expect(shownOpeners(container)).toEqual(openersFor(SEED, 3, 0));
    solveShown(container); // length 3
    advance(400);
    expect(shownOpeners(container)).toHaveLength(4);
    expect(last().solved).toBe(2);
    expect(last().solveMs).toBe(400 + 600);

    advance(30_000);
    expect(onFinish).toHaveBeenCalledTimes(1);
    const result = onFinish.mock.calls[0][0];
    const raw = result.raw as CloseBracketsRaw;
    expect(raw).toEqual({ solved: 2, failed: 0, timeouts: 2, solve_ms: 1000 });
    expect(result.score).toBe(scoreCloseBrackets(raw));
    expect(validateCloseBracketsRaw(raw, result.score)).toBeNull();
    // 1.5 s intro + 30 s game (+ at most one 50 ms step)
    expect(result.durationMs).toBeGreaterThanOrEqual(31_500);
    expect(result.durationMs).toBeLessThanOrEqual(31_600);
    advance(5000);
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('CB-T10: a wrong closer fails the sequence; the next one keeps the length with the next index', () => {
    const { container, last } = renderGame();
    advance(1500);
    solveShown(container); // -> length 3
    advance(400);
    solveShown(container); // -> length 4
    advance(400);
    const openers = shownOpeners(container);
    expect(openers).toEqual(openersFor(SEED, 4, 0));
    advance(100);
    tap(container, wrongFor(openers[3]));
    expect(last()).toMatchObject({ failed: 1, transition: 'failed', seqLength: 4, seqIndex: 0 });
    expect(container.textContent).toContain('game.close_brackets.wrong');
    advance(700);
    expect(last()).toMatchObject({ seqLength: 4, seqIndex: 1, closed: 0, transition: null });
    expect(shownOpeners(container)).toEqual(openersFor(SEED, 4, 1));
  });

  it('ignores taps during a transition and debounces a bounce', () => {
    const { container, last } = renderGame();
    advance(1500);
    const openers = shownOpeners(container);
    advance(100);
    tap(container, openers[1]);
    tap(container, openers[0]); // same instant: bounce, ignored
    expect(last().closed).toBe(1);
    advance(100);
    tap(container, openers[0]); // solved -> transition
    const before = last();
    tap(container, 'round');
    advance(100);
    tap(container, 'angle');
    expect(last()).toBe(before);
    expect(before.transition).toBe('solved');
  });

  it('each sequence times out after 10 s (same length next)', () => {
    const { container, last } = renderGame();
    advance(1500);
    advance(9_950);
    expect(last().timeouts).toBe(0);
    advance(100);
    expect(last()).toMatchObject({ timeouts: 1, transition: 'timeout' });
    expect(container.textContent).toContain('game.close_brackets.timeout');
    advance(700);
    expect(last()).toMatchObject({ seqLength: 2, seqIndex: 1, transition: null });
  });

  it('"round ended" finishes at once; the open sequence does not count', () => {
    const { container, onFinish, rerenderWith } = renderGame();
    advance(1500);
    solveShown(container);
    advance(400);
    advance(100);
    tap(container, shownOpeners(container)[2]); // one closer into the length-3 sequence
    rerenderWith({ roundEnded: true });
    expect(onFinish).toHaveBeenCalledTimes(1);
    const raw = onFinish.mock.calls[0][0].raw as CloseBracketsRaw;
    expect(raw).toEqual({ solved: 1, failed: 0, timeouts: 0, solve_ms: 400 });
    expect(onFinish.mock.calls[0][0].score).toBe(scoreCloseBrackets(raw));
  });
});

describe('Close the Brackets: reload (ADR-018)', () => {
  it('CB-T11: resumes the same sequence with its placed closers; the game still ends at the original 30 s', () => {
    const gameStart = ROUND_START + 1500;
    vi.setSystemTime(gameStart + 12_000);
    const snapshot: CloseBracketsSnapshot = {
      phase: 'play',
      gameStartEpoch: gameStart,
      solved: 3,
      failed: 1,
      timeouts: 0,
      solveMs: 4200,
      seqLength: 5,
      seqIndex: 0,
      seqStartEpoch: gameStart + 11_000,
      closed: 2,
      transition: null,
      transitionEndEpoch: null,
    };
    const { container, onFinish, last } = renderGame({ snapshot });
    const openers = openersFor(SEED, 5, 0);
    expect(shownOpeners(container)).toEqual(openers);
    expect(container.querySelector('[data-testid="cb-row"]')?.getAttribute('data-closed')).toBe('2');

    // finish it: the solve time falls back to the epoch (1 s before the reload + taps)
    advance(100);
    tap(container, openers[2]);
    advance(100);
    tap(container, openers[1]);
    advance(100);
    tap(container, openers[0]);
    expect(last()).toMatchObject({ solved: 4, solveMs: 4200 + 1300, transition: 'solved' });

    advance(30_000 - 12_300 - 50);
    expect(onFinish).not.toHaveBeenCalled();
    advance(100);
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('a reload after the game clock ran out finishes at once', () => {
    const gameStart = ROUND_START + 1500;
    vi.setSystemTime(gameStart + 45_000);
    const snapshot: CloseBracketsSnapshot = {
      phase: 'play',
      gameStartEpoch: gameStart,
      solved: 2,
      failed: 0,
      timeouts: 0,
      solveMs: 1900,
      seqLength: 4,
      seqIndex: 0,
      seqStartEpoch: gameStart + 5000,
      closed: 0,
      transition: null,
      transitionEndEpoch: null,
    };
    const { onFinish } = renderGame({ snapshot });
    advance(50);
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish.mock.calls[0][0].raw).toEqual({ solved: 2, failed: 0, timeouts: 0, solve_ms: 1900 });
  });
});

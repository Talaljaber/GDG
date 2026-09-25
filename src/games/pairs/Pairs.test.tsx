import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Pairs, type PairsSnapshot } from './Pairs';
import type { GameProps, GameResult } from '../types';
import { ICON_IDS, layoutFor, type IconId } from './layout';
import { scorePairs, validatePairsRaw, type PairsRaw } from './scoring';

vi.mock('../../i18n', () => ({
  useT: () => (key: string, params?: Record<string, string | number>) =>
    params ? `${key}|${JSON.stringify(params)}` : key,
  useLang: () => ({ lang: 'en' as const, dir: 'ltr' as const, setLang: vi.fn() }),
}));

const ROUND_START = 1_700_000_000_000;
const SEED = 'pr-test-seed';
const LAYOUT = layoutFor(SEED);

/** The two positions of an icon on the test board. */
function posOf(icon: IconId): [number, number] {
  const a = LAYOUT.indexOf(icon);
  return [a, LAYOUT.indexOf(icon, a + 1)];
}

const [BUG_1, BUG_2] = posOf('bug');
const [COFFEE_1] = posOf('coffee');
const [GEAR_1, GEAR_2] = posOf('gear');

function advance(ms: number) {
  for (let t = 0; t < ms; t += 50) {
    act(() => {
      vi.advanceTimersByTime(Math.min(50, ms - t));
    });
  }
}

function renderGame(overrides: Partial<GameProps<PairsSnapshot>> = {}) {
  const onProgress = vi.fn<(s: PairsSnapshot) => void>();
  const onFinish = vi.fn<(r: GameResult) => void>();
  const props: GameProps<PairsSnapshot> = {
    seed: SEED,
    roundStartEpoch: ROUND_START,
    roundEnded: false,
    snapshot: null,
    onProgress,
    onFinish,
    ...overrides,
  };
  const utils = render(<Pairs {...props} />);
  return {
    ...utils,
    onProgress,
    onFinish,
    rerenderWith: (next: Partial<GameProps<PairsSnapshot>>) => utils.rerender(<Pairs {...props} {...next} />),
    last: () => onProgress.mock.calls[onProgress.mock.calls.length - 1][0],
  };
}

function tile(container: HTMLElement, i: number): HTMLElement {
  const el = container.querySelector<HTMLElement>(`[data-testid="pr-tile-${i}"]`);
  if (!el) throw new Error(`no tile ${i}`);
  return el;
}

const stateOf = (container: HTMLElement, i: number) => tile(container, i).getAttribute('data-state');

function tap(container: HTMLElement, i: number) {
  fireEvent.pointerDown(tile(container, i));
}

function snap(over: Partial<PairsSnapshot>): PairsSnapshot {
  return {
    phase: 'play',
    gameStartEpoch: ROUND_START + 1500,
    faceUp: [],
    matchedIcons: [],
    misses: 0,
    lockUntilEpoch: null,
    clearEpoch: null,
    ...over,
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] });
  vi.setSystemTime(ROUND_START);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Pairs: board', () => {
  it('shows the intro, then the seeded 4 x 4 board face down with button labels', () => {
    const { container, last } = renderGame();
    expect(container.textContent).toContain('game.pairs.name');
    expect(container.textContent).toContain('game.pairs.intro');
    expect(container.querySelector('[data-testid="pr-grid"]')).toBeNull();
    advance(1500);
    expect(last()).toMatchObject({ phase: 'play', gameStartEpoch: ROUND_START + 1500 });
    const tiles = container.querySelectorAll('button[data-testid^="pr-tile-"]');
    expect(tiles).toHaveLength(16);
    tiles.forEach((el, i) => {
      expect(el.getAttribute('data-state')).toBe('down');
      expect(el.getAttribute('aria-label')).toBe('game.pairs.card_back');
      expect(el.getAttribute('aria-pressed')).toBe('false');
      expect(el.querySelector('svg[data-icon]')?.getAttribute('data-icon')).toBe(LAYOUT[i]);
    });
    expect(container.textContent).toContain('game.pairs.found|{"n":0}');
  });

  it('PR-T10: a match stays up, counts, and the next tap is accepted at once', () => {
    const { container, last } = renderGame();
    advance(1500);
    tap(container, BUG_1);
    expect(stateOf(container, BUG_1)).toBe('up');
    expect(tile(container, BUG_1).getAttribute('aria-label')).toBe('game.pairs.icon.bug');
    expect(last().faceUp).toEqual([BUG_1]);
    tap(container, BUG_1); // double tap on the same card: ignored
    expect(last().faceUp).toEqual([BUG_1]);
    tap(container, BUG_2);
    expect(stateOf(container, BUG_1)).toBe('matched');
    expect(stateOf(container, BUG_2)).toBe('matched');
    expect(tile(container, BUG_2).getAttribute('aria-pressed')).toBe('true');
    expect(last()).toMatchObject({ faceUp: [], matchedIcons: ['bug'], misses: 0, lockUntilEpoch: null });
    expect(container.textContent).toContain('game.pairs.found|{"n":1}');
    // no lock: the next card flips at 0 ms
    tap(container, GEAR_1);
    expect(stateOf(container, GEAR_1)).toBe('up');
    // a matched card is inert
    tap(container, BUG_1);
    expect(last().faceUp).toEqual([GEAR_1]);
  });

  it('PR-T8: a mismatch shows both for 0.7 s with all input ignored, then both flip back', () => {
    const { container, last } = renderGame();
    advance(1500);
    tap(container, BUG_1);
    tap(container, COFFEE_1);
    expect(last()).toMatchObject({ faceUp: [BUG_1, COFFEE_1], misses: 1, lockUntilEpoch: ROUND_START + 1500 + 700 });
    expect(stateOf(container, BUG_1)).toBe('up');
    expect(stateOf(container, COFFEE_1)).toBe('up');
    advance(300);
    tap(container, GEAR_1); // a third tap 300 ms into the lock
    expect(stateOf(container, GEAR_1)).toBe('down');
    expect(last().faceUp).toEqual([BUG_1, COFFEE_1]);
    advance(350);
    expect(stateOf(container, BUG_1)).toBe('up');
    advance(50);
    expect(stateOf(container, BUG_1)).toBe('down');
    expect(stateOf(container, COFFEE_1)).toBe('down');
    expect(last()).toMatchObject({ faceUp: [], lockUntilEpoch: null, misses: 1 });
    tap(container, GEAR_1);
    expect(stateOf(container, GEAR_1)).toBe('up');
  });

  it('clearing the board finishes at once with the clear time; all cards stay up', () => {
    const { container, onFinish, last } = renderGame();
    advance(1500);
    // one miss first, then every pair
    tap(container, BUG_1);
    tap(container, COFFEE_1);
    advance(700);
    for (const icon of ICON_IDS) {
      const [a, b] = posOf(icon);
      advance(500);
      tap(container, a);
      advance(500);
      tap(container, b);
    }
    expect(onFinish).toHaveBeenCalledTimes(1);
    const result = onFinish.mock.calls[0][0];
    const raw = result.raw as PairsRaw;
    expect(raw).toEqual({ matched: 8, misses: 1, clear_ms: 700 + 8 * 1000 });
    expect(result.score).toBe(scorePairs(raw));
    expect(result.score).toBe(988);
    expect(validatePairsRaw(raw, result.score)).toBeNull();
    expect(result.durationMs).toBe(1500 + 8700);
    expect(last()).toMatchObject({ phase: 'done', clearEpoch: ROUND_START + 1500 + 8700 });
    for (let i = 0; i < 16; i++) expect(stateOf(container, i)).toBe('matched');
    expect(container.textContent).toContain('game.pairs.cleared');
    // the countdown freezes at the time left at the clear (60 - 8.7 s -> 52)
    advance(3000);
    expect(container.querySelector('[data-testid="pr-seconds"]')?.textContent).toBe('52');
    advance(60_000);
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('PR-T11: an idle player scores 0 at 60 s, finished by 62 s', () => {
    const { container, onFinish } = renderGame();
    advance(1500 + 59_950);
    expect(onFinish).not.toHaveBeenCalled();
    advance(100);
    expect(onFinish).toHaveBeenCalledTimes(1);
    const result = onFinish.mock.calls[0][0];
    expect(result.raw).toEqual({ matched: 0, misses: 0, clear_ms: null });
    expect(result.score).toBe(0);
    expect(result.durationMs).toBeLessThanOrEqual(62_000);
    expect(container.textContent).toContain('game.pairs.times_up');
    expect(container.querySelector('[data-testid="pr-seconds"]')?.textContent).toBe('0');
    tap(container, BUG_1); // done: inert
    expect(stateOf(container, BUG_1)).toBe('down');
  });

  it('the timeout scores a partial board (2 pairs, 1 miss); taps after 60 s are ignored', () => {
    const { container, onFinish } = renderGame();
    advance(1500);
    tap(container, BUG_1);
    tap(container, BUG_2);
    tap(container, GEAR_1);
    tap(container, COFFEE_1);
    advance(800);
    tap(container, GEAR_1);
    tap(container, GEAR_2);
    advance(60_000);
    expect(onFinish).toHaveBeenCalledTimes(1);
    const result = onFinish.mock.calls[0][0];
    expect(result.raw).toEqual({ matched: 2, misses: 1, clear_ms: null });
    expect(result.score).toBe(730 - 6 * 80 - 12);
  });

  it('"round ended" finishes at once with the pairs so far; onFinish exactly once', () => {
    const { container, onFinish, rerenderWith } = renderGame();
    advance(1500);
    tap(container, BUG_1);
    tap(container, BUG_2);
    tap(container, GEAR_1);
    rerenderWith({ roundEnded: true });
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish.mock.calls[0][0].raw).toEqual({ matched: 1, misses: 0, clear_ms: null });
    expect(onFinish.mock.calls[0][0].score).toBe(730 - 7 * 80);
    advance(61_000);
    rerenderWith({ roundEnded: true });
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('reduced motion: the board is marked for an instant face swap', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} }));
    const { container } = renderGame({ snapshot: snap({}) });
    expect(container.querySelector('[data-testid="pr-play"]')?.getAttribute('data-motion')).toBe('reduced');
  });
});

describe('Pairs: reload (ADR-018)', () => {
  it('PR-T13: a reload during the lock keeps both up until lockUntilEpoch, then flips them back; misses unchanged', () => {
    const gameStart = ROUND_START + 1500;
    vi.setSystemTime(gameStart + 10_000);
    const snapshot = snap({
      faceUp: [BUG_1, COFFEE_1],
      matchedIcons: ['gear'],
      misses: 3,
      lockUntilEpoch: gameStart + 10_400,
    });
    const { container, last } = renderGame({ snapshot });
    expect(stateOf(container, BUG_1)).toBe('up');
    expect(stateOf(container, COFFEE_1)).toBe('up');
    expect(stateOf(container, GEAR_1)).toBe('matched');
    tap(container, BUG_2); // still locked
    expect(stateOf(container, BUG_2)).toBe('down');
    advance(350);
    expect(stateOf(container, BUG_1)).toBe('up');
    advance(100);
    expect(stateOf(container, BUG_1)).toBe('down');
    expect(stateOf(container, COFFEE_1)).toBe('down');
    expect(last()).toMatchObject({ faceUp: [], lockUntilEpoch: null, misses: 3, matchedIcons: ['gear'] });
  });

  it('a lock that ended while the page was away (reload / screen lock) resolves at once', () => {
    const gameStart = ROUND_START + 1500;
    vi.setSystemTime(gameStart + 20_000);
    const snapshot = snap({ faceUp: [BUG_1, COFFEE_1], misses: 1, lockUntilEpoch: gameStart + 12_000 });
    const { container, last } = renderGame({ snapshot });
    advance(50);
    expect(stateOf(container, BUG_1)).toBe('down');
    expect(last()).toMatchObject({ faceUp: [], lockUntilEpoch: null, misses: 1 });
  });

  it('a reload with one card up restores it; the game still ends at the original 60 s', () => {
    const gameStart = ROUND_START + 1500;
    vi.setSystemTime(gameStart + 45_000);
    const snapshot = snap({ faceUp: [BUG_1], matchedIcons: ['gear', 'cloud'], misses: 4 });
    const { container, onFinish, last } = renderGame({ snapshot });
    expect(stateOf(container, BUG_1)).toBe('up');
    expect(container.textContent).toContain('game.pairs.found|{"n":2}');
    tap(container, BUG_2);
    expect(last()).toMatchObject({ matchedIcons: ['gear', 'cloud', 'bug'], faceUp: [] });
    advance(15_000 - 100);
    expect(onFinish).not.toHaveBeenCalled();
    advance(150);
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish.mock.calls[0][0].raw).toEqual({ matched: 3, misses: 4, clear_ms: null });
  });

  it('a screen lock past the 60 s finishes at once on return', () => {
    const gameStart = ROUND_START + 1500;
    vi.setSystemTime(gameStart + 75_000);
    const { onFinish } = renderGame({ snapshot: snap({ matchedIcons: ['bug'], misses: 2 }) });
    advance(50);
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish.mock.calls[0][0].raw).toEqual({ matched: 1, misses: 2, clear_ms: null });
  });
});

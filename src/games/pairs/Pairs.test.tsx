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

describe('Pairs: device sleep and a late mount (PR-T15, E15)', () => {
  const seconds = (container: HTMLElement) => Number(container.querySelector('[data-testid="pr-seconds"]')?.textContent);
  const showPage = () =>
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

  it('a sleep mid-game counts toward clear_ms (epoch clock); the countdown never jumps back up at the clear', () => {
    const { container, onFinish, last } = renderGame();
    const gameStart = ROUND_START + 1500;
    advance(1500);
    tap(container, BUG_1);
    tap(container, BUG_2);
    advance(1000);
    const readings = [seconds(container)];
    // A device sleep: the wall clock jumps 30 s, performance.now() and the pending timers stall.
    vi.setSystemTime(Date.now() + 30_000);
    advance(300);
    readings.push(seconds(container));
    for (const icon of ICON_IDS.filter((i) => i !== 'bug')) {
      const [a, b] = posOf(icon);
      tap(container, a);
      advance(100);
      tap(container, b);
      readings.push(seconds(container));
    }
    expect(onFinish).toHaveBeenCalledTimes(1);
    const raw = onFinish.mock.calls[0][0].raw as PairsRaw;
    const elapsed = Date.now() - gameStart;
    expect(raw).toEqual({ matched: 8, misses: 0, clear_ms: elapsed });
    expect(raw.clear_ms).toBeGreaterThanOrEqual(30_000);
    expect(onFinish.mock.calls[0][0].score).toBe(scorePairs(raw));
    expect(onFinish.mock.calls[0][0].score).toBeLessThan(1000);
    expect(validatePairsRaw(raw, onFinish.mock.calls[0][0].score)).toBeNull();
    expect(last().clearEpoch).toBe(gameStart + elapsed);
    advance(1000);
    readings.push(seconds(container));
    for (let i = 1; i < readings.length; i++) expect(readings[i]).toBeLessThanOrEqual(readings[i - 1]);
    expect(readings[readings.length - 1]).toBe(Math.ceil((60_000 - elapsed) / 1000));
  });

  it('a live sleep across the 60 s end finishes at once on visibilitychange (Time\'s up, taps ignored)', () => {
    const { container, onFinish } = renderGame();
    advance(1500 + 20_000);
    tap(container, BUG_1);
    tap(container, BUG_2);
    vi.setSystemTime(Date.now() + 50_000);
    expect(onFinish).not.toHaveBeenCalled();
    showPage();
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish.mock.calls[0][0].raw).toEqual({ matched: 1, misses: 0, clear_ms: null });
    expect(container.querySelector('[data-testid="pr-status"]')?.textContent).toBe('game.pairs.times_up');
    expect(seconds(container)).toBe(0);
    tap(container, GEAR_1);
    expect(stateOf(container, GEAR_1)).toBe('down');
    advance(60_000);
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('pageshow (back from the bfcache) re-evaluates the board too', () => {
    const { onFinish } = renderGame();
    advance(1500 + 10_000);
    vi.setSystemTime(Date.now() + 55_000);
    act(() => {
      window.dispatchEvent(new Event('pageshow'));
    });
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('a sleep across the end of a mismatch lock flips both back at once on return', () => {
    const { container, last } = renderGame();
    advance(1500 + 5000);
    tap(container, BUG_1);
    tap(container, COFFEE_1);
    advance(100);
    vi.setSystemTime(Date.now() + 10_000);
    expect(stateOf(container, BUG_1)).toBe('up');
    showPage();
    expect(stateOf(container, BUG_1)).toBe('down');
    expect(stateOf(container, COFFEE_1)).toBe('down');
    expect(last()).toMatchObject({ faceUp: [], lockUntilEpoch: null, misses: 1 });
    // the countdown re-rendered on return (60 - 15.1 s -> 45)
    expect(seconds(container)).toBe(45);
    tap(container, GEAR_1);
    expect(stateOf(container, GEAR_1)).toBe('up');
  });

  it('a mismatch tapped at 59.9 s, then the timeout: both tiles end face down', () => {
    const { container, onFinish, last } = renderGame();
    advance(1500 + 59_900);
    tap(container, BUG_1);
    tap(container, COFFEE_1);
    expect(stateOf(container, BUG_1)).toBe('up');
    advance(150);
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish.mock.calls[0][0].raw).toEqual({ matched: 0, misses: 1, clear_ms: null });
    expect(stateOf(container, BUG_1)).toBe('down');
    expect(stateOf(container, COFFEE_1)).toBe('down');
    expect(last()).toMatchObject({ phase: 'done', faceUp: [], lockUntilEpoch: null });
  });

  it('round ended with one card up: the card flips down; found pairs stay up', () => {
    const { container, onFinish, rerenderWith } = renderGame();
    advance(1500);
    tap(container, BUG_1);
    tap(container, BUG_2);
    tap(container, GEAR_1);
    rerenderWith({ roundEnded: true });
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(stateOf(container, GEAR_1)).toBe('down');
    expect(stateOf(container, BUG_1)).toBe('matched');
  });

  it('a mount 30 s after roundStartEpoch (hidden 3-2-1): the board starts at roundStartEpoch + 1.5 s with the time left', () => {
    vi.setSystemTime(ROUND_START + 30_000);
    const { container, onFinish, last } = renderGame();
    advance(50);
    expect(last()).toMatchObject({ phase: 'play', gameStartEpoch: ROUND_START + 1500 });
    expect(seconds(container)).toBe(32); // 60 - 28.5 s
    advance(31_400);
    expect(onFinish).not.toHaveBeenCalled();
    advance(150);
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish.mock.calls[0][0].durationMs).toBe(61_500);
    expect(onFinish.mock.calls[0][0].durationMs).toBeLessThanOrEqual(62_000);
  });

  it('hidden during the intro: on return the board uses roundStartEpoch + 1.5 s; the idle case finishes by 62 s', () => {
    const { container, onFinish, last } = renderGame();
    advance(500);
    expect(container.querySelector('[data-testid="pr-grid"]')).toBeNull();
    vi.setSystemTime(Date.now() + 30_000);
    showPage();
    expect(last()).toMatchObject({ phase: 'play', gameStartEpoch: ROUND_START + 1500 });
    expect(container.querySelector('[data-testid="pr-grid"]')).not.toBeNull();
    advance(32_000);
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish.mock.calls[0][0].durationMs).toBeLessThanOrEqual(62_000);
  });

  it('a mount after the whole board time finishes at once with 0', () => {
    vi.setSystemTime(ROUND_START + 70_000);
    const { onFinish } = renderGame();
    advance(50);
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish.mock.calls[0][0].raw).toEqual({ matched: 0, misses: 0, clear_ms: null });
    expect(onFinish.mock.calls[0][0].score).toBe(0);
  });
});

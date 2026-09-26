import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SwipeSort, type SwipeSortSnapshot } from './SwipeSort';
import type { GameProps, GameResult } from '../types';
import { itemFor, type SwipeSide } from './items';
import { itemWindowMs, scoreSwipeSort, validateSwipeSortRaw, type SwipeSortRaw } from './scoring';
import { catchUp } from './timeline';

vi.mock('../../i18n', () => ({
  useT: () => (key: string, params?: Record<string, string | number>) =>
    params ? `${key}|${JSON.stringify(params)}` : key,
  useLang: () => ({ lang: 'en' as const, dir: 'ltr' as const, setLang: vi.fn() }),
}));

const ROUND_START = 1_700_000_000_000;
const GAME_START = ROUND_START + 1500;
const SEED = 'ss-test-seed';
/** jsdom's window.innerWidth is 1024; the surface centre is far from both edge bands. */
const CX = 500;
const CY = 400;

/** jsdom 25 has no PointerEvent: a MouseEvent subclass carrying pointerId. */
class TestPointerEvent extends MouseEvent {
  pointerId: number;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
  }
}

function advance(ms: number) {
  for (let t = 0; t < ms; t += 50) {
    act(() => {
      vi.advanceTimersByTime(Math.min(50, ms - t));
    });
  }
}

function renderGame(overrides: Partial<GameProps<SwipeSortSnapshot>> = {}) {
  const onProgress = vi.fn<(s: SwipeSortSnapshot) => void>();
  const onFinish = vi.fn<(r: GameResult) => void>();
  const props: GameProps<SwipeSortSnapshot> = {
    seed: SEED,
    roundStartEpoch: ROUND_START,
    roundEnded: false,
    snapshot: null,
    onProgress,
    onFinish,
    ...overrides,
  };
  const utils = render(<SwipeSort {...props} />);
  return {
    ...utils,
    onProgress,
    onFinish,
    rerenderWith: (next: Partial<GameProps<SwipeSortSnapshot>>) => utils.rerender(<SwipeSort {...props} {...next} />),
    last: () => onProgress.mock.calls[onProgress.mock.calls.length - 1][0],
  };
}

function surface(container: HTMLElement): HTMLElement {
  const el = container.querySelector<HTMLElement>('[data-testid="ss-surface"]');
  if (!el) throw new Error('no surface');
  return el;
}

function shownItem(container: HTMLElement) {
  const el = container.querySelector('[data-testid="ss-item"]');
  return el ? { color: el.getAttribute('data-color'), side: el.getAttribute('data-side'), index: Number(el.getAttribute('data-index')) } : null;
}

function pointer(el: Element, type: string, x: number, y: number, pointerId = 1) {
  fireEvent(el, new TestPointerEvent(type, { pointerId, clientX: x, clientY: y, bubbles: true, cancelable: true }));
}

/** Presses at (x, y), moves by (dx, dy) and lifts. */
function drag(container: HTMLElement, dx: number, dy = 0, x = CX, y = CY, pointerId = 1) {
  const el = surface(container);
  pointer(el, 'pointerdown', x, y, pointerId);
  pointer(el, 'pointermove', x + dx / 2, y + dy / 2, pointerId);
  pointer(el, 'pointermove', x + dx, y + dy, pointerId);
  pointer(el, 'pointerup', x + dx, y + dy, pointerId);
}

function swipe(container: HTMLElement, side: SwipeSide) {
  drag(container, side === 'left' ? -60 : 60);
}

const otherSide = (side: SwipeSide): SwipeSide => (side === 'left' ? 'right' : 'left');

function playSnapshot(over: Partial<SwipeSortSnapshot>): SwipeSortSnapshot {
  return {
    phase: 'play',
    gameStartEpoch: GAME_START,
    itemIndex: 0,
    itemStartEpoch: GAME_START,
    gapEndEpoch: null,
    correct: 0,
    wrong: 0,
    missed: 0,
    swipeSumMs: 0,
    feedback: null,
    side: null,
    ...over,
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] });
  vi.setSystemTime(ROUND_START);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Swipe Sort: play', () => {
  it('shows the seeded items in order, counts correct swipes and times them from onset to registration', () => {
    const { container, last } = renderGame();
    expect(container.textContent).toContain('game.swipe_sort.name');
    expect(shownItem(container)).toBeNull();
    advance(1500);

    for (let k = 0; k < 4; k++) {
      const expected = itemFor(SEED, k);
      expect(shownItem(container)).toEqual({ color: expected.color, side: expected.side, index: k });
      advance(400);
      swipe(container, expected.side);
      expect(last()).toMatchObject({ feedback: 'correct', side: expected.side });
      advance(150);
    }
    expect(last()).toMatchObject({ correct: 4, wrong: 0, missed: 0, swipeSumMs: 4 * 400, itemIndex: 4, feedback: null });
    expect(container.textContent).toContain('game.swipe_sort.sorted|{"n":4}');
  });

  it('SS-T9 on the surface: 39 px, a vertical drag and a cancel register nothing; 40 px does', () => {
    const { container, onProgress, last } = renderGame();
    advance(1500);
    const first = itemFor(SEED, 0);
    const sign = first.side === 'left' ? -1 : 1;
    const calls = onProgress.mock.calls.length;

    drag(container, sign * 39);
    drag(container, sign * 30, 50);
    const el = surface(container);
    pointer(el, 'pointerdown', CX, CY);
    pointer(el, 'pointermove', CX + sign * 20, CY);
    pointer(el, 'pointercancel', CX + sign * 20, CY);
    pointer(el, 'pointermove', CX + sign * 80, CY); // after the cancel: not tracked
    expect(onProgress.mock.calls.length).toBe(calls); // nothing happened; the item keeps its window
    expect(shownItem(container)?.index).toBe(0);

    advance(100);
    drag(container, sign * 40);
    expect(last()).toMatchObject({ correct: 1, feedback: 'correct', swipeSumMs: 100 });
  });

  it('SS-T10: a wrong swipe counts, shows "Wrong way" and the next item comes after 150 ms', () => {
    const { container, last } = renderGame();
    advance(1500);
    const first = itemFor(SEED, 0);
    advance(300);
    swipe(container, otherSide(first.side));
    expect(last()).toMatchObject({ wrong: 1, correct: 0, swipeSumMs: 0, feedback: 'wrong', side: otherSide(first.side) });
    expect(container.querySelector('[data-testid="ss-wrong"]')?.textContent).toBe('game.swipe_sort.wrong');
    expect(container.querySelector(`[data-testid="ss-zone-${otherSide(first.side)}"]`)?.className).toMatch(/zoneWrong/);
    swipe(container, first.side); // during the gap: ignored
    expect(last().correct).toBe(0);
    advance(100);
    expect(last().itemIndex).toBe(0);
    advance(50);
    expect(last()).toMatchObject({ itemIndex: 1, feedback: null, itemStartEpoch: GAME_START + 450 });
    expect(shownItem(container)?.index).toBe(1);
  });

  it('a correct swipe rings the matching catch label', () => {
    const { container } = renderGame();
    advance(1500);
    const first = itemFor(SEED, 0);
    swipe(container, first.side);
    expect(container.querySelector(`[data-testid="ss-zone-${first.side}"]`)?.className).toMatch(/zoneCorrect/);
  });

  it('an item not swiped within its window is a miss (900 ms for the first)', () => {
    const { container, last } = renderGame();
    advance(1500);
    advance(850);
    expect(last().missed).toBe(0);
    advance(50);
    expect(last()).toMatchObject({ missed: 1, feedback: 'missed', itemStartEpoch: null, gapEndEpoch: GAME_START + 900 + 150 });
    expect(container.querySelector('[data-testid="ss-missed"]')?.textContent).toBe('game.swipe_sort.missed');
    advance(150);
    expect(last()).toMatchObject({ itemIndex: 1, itemStartEpoch: GAME_START + 1050 });
  });

  it('a drag that started on an item that then timed out never sorts the next item', () => {
    const { container, last } = renderGame();
    advance(1500);
    const el = surface(container);
    advance(800);
    pointer(el, 'pointerdown', CX, CY);
    advance(250); // item 0 missed at 900 ms, item 1 appears at 1050 ms
    expect(last()).toMatchObject({ missed: 1, itemIndex: 1 });
    pointer(el, 'pointermove', CX + 80, CY);
    pointer(el, 'pointermove', CX - 80, CY);
    expect(last()).toMatchObject({ correct: 0, wrong: 0 });
  });

  it('a touch starting in the edge band never scores', () => {
    const { container, onProgress } = renderGame();
    advance(1500);
    const calls = onProgress.mock.calls.length;
    drag(container, 80, 0, 10, CY);
    drag(container, -80, 0, window.innerWidth - 10, CY);
    expect(onProgress.mock.calls.length).toBe(calls);
  });

  it('a second finger is ignored while one is tracked', () => {
    const { container, last } = renderGame();
    advance(1500);
    const first = itemFor(SEED, 0);
    const sign = first.side === 'left' ? -1 : 1;
    const el = surface(container);
    pointer(el, 'pointerdown', CX, CY, 1);
    pointer(el, 'pointerdown', CX, CY, 2);
    pointer(el, 'pointermove', CX - sign * 80, CY, 2); // the wrong way with finger 2: ignored
    pointer(el, 'pointermove', CX + sign * 80, CY, 1);
    expect(last()).toMatchObject({ correct: 1, wrong: 0 });
  });
});

describe('Swipe Sort: the ramp and the clock (fake timers)', () => {
  it('SS-T8 / SS-T11: an idle player misses every item on the I(t) ramp: 37 misses, 0, finished once at 30 s', () => {
    const { onProgress, onFinish } = renderGame();
    advance(1500 + 29_950);
    expect(onFinish).not.toHaveBeenCalled();
    advance(100);
    expect(onFinish).toHaveBeenCalledTimes(1);

    // Every onset / miss on the ramp: deadline = onset + I(onset), next onset = deadline + 150.
    const snaps = onProgress.mock.calls.map((c) => c[0]);
    const onsets = [...new Set(snaps.map((s) => s.itemStartEpoch).filter((e): e is number => e !== null))];
    expect(onsets[0]).toBe(GAME_START);
    for (let i = 1; i < onsets.length; i++) {
      const prev = onsets[i - 1];
      expect(onsets[i]).toBe(prev + itemWindowMs(prev - GAME_START) + 150);
    }
    const windows = onsets.map((o) => itemWindowMs(o - GAME_START));
    expect(windows[0]).toBe(900);
    expect(windows[windows.length - 1]).toBeGreaterThanOrEqual(450);
    expect(windows[windows.length - 1]).toBeLessThan(470);

    const result = onFinish.mock.calls[0][0];
    expect(result.raw).toEqual({ correct: 0, wrong: 0, missed: 37, mean_swipe_ms: null });
    expect(result.score).toBe(0);
    expect(validateSwipeSortRaw(result.raw, result.score)).toBeNull();
    expect(result.durationMs).toBeGreaterThanOrEqual(31_500);
    expect(result.durationMs).toBeLessThanOrEqual(31_600);
    expect(result.durationMs).toBeLessThanOrEqual(32_000);

    advance(5_000);
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('the swipe time is capped by the window and the score matches the formula', () => {
    const { container, onFinish } = renderGame();
    advance(1500);
    for (let k = 0; k < 10; k++) {
      advance(500);
      swipe(container, itemFor(SEED, k).side);
      advance(150);
    }
    advance(30_000);
    const result = onFinish.mock.calls[0][0];
    const raw = result.raw as SwipeSortRaw;
    expect(raw.correct).toBe(10);
    expect(raw.mean_swipe_ms).toBe(500);
    expect(result.score).toBe(scoreSwipeSort(raw));
    expect(validateSwipeSortRaw(raw, result.score)).toBeNull();
  });

  it('screen lock: a 10 s jump counts the elapsed windows as misses in order; the game still ends at the original 30 s', () => {
    const { container, last, onFinish } = renderGame();
    advance(1500);
    advance(15_000);
    const before = last();
    expect(before.missed).toBeGreaterThan(0);

    // The phone sleeps: the clock jumps 10 s without any timer firing.
    act(() => {
      vi.setSystemTime(Date.now() + 10_000);
    });
    advance(50);
    const after = last();
    expect(after.missed - before.missed).toBeGreaterThanOrEqual(12);
    expect(after.itemIndex - before.itemIndex).toBeGreaterThanOrEqual(12);
    // The sequence stayed epoch-exact: the current item's deadline is still ahead or its gap is running.
    expect(after.itemStartEpoch !== null || after.gapEndEpoch !== null).toBe(true);
    expect(shownItem(container)?.index ?? after.itemIndex).toBe(after.itemIndex);

    const end = GAME_START + 30_000;
    advance(end - Date.now() - 60);
    expect(onFinish).not.toHaveBeenCalled();
    advance(100);
    expect(onFinish).toHaveBeenCalledTimes(1);
  });
});

describe('Swipe Sort: reload (ADR-018) and round end', () => {
  it('SS-T12: a reload mid-item resumes the same item with its original deadline; the game ends at the original 30 s', () => {
    const onset = GAME_START + 12_000;
    vi.setSystemTime(onset + 300);
    const snapshot = playSnapshot({ itemIndex: 14, itemStartEpoch: onset, correct: 12, wrong: 1, missed: 1, swipeSumMs: 6000 });
    const { container, last, onFinish, onProgress } = renderGame({ snapshot });
    expect(shownItem(container)?.index).toBe(14);
    const windowMs = itemWindowMs(12_000); // 720
    advance(windowMs - 300 - 50);
    expect(onProgress).not.toHaveBeenCalled(); // the same item is still open
    advance(100);
    expect(last()).toMatchObject({ missed: 2, gapEndEpoch: onset + windowMs + 150 });

    advance(GAME_START + 30_000 - Date.now() - 60);
    expect(onFinish).not.toHaveBeenCalled();
    advance(100);
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('a swipe after a reload is timed from the stored onset (a reload never gains time)', () => {
    const onset = GAME_START + 3_000;
    vi.setSystemTime(onset + 200);
    const snapshot = playSnapshot({ itemIndex: 4, itemStartEpoch: onset, correct: 3, swipeSumMs: 1500 });
    const { container, last } = renderGame({ snapshot });
    advance(100);
    swipe(container, itemFor(SEED, 4).side);
    expect(last()).toMatchObject({ correct: 4, swipeSumMs: 1500 + 300 });
  });

  it('a reload during the gap ends the gap at its stored time', () => {
    vi.setSystemTime(GAME_START + 5_000);
    const snapshot = playSnapshot({ itemIndex: 6, itemStartEpoch: null, gapEndEpoch: GAME_START + 5_100, correct: 6, swipeSumMs: 3000, feedback: 'correct', side: 'left' });
    const { container, last } = renderGame({ snapshot });
    expect(shownItem(container)?.index).toBe(6); // flying off
    advance(150);
    expect(last()).toMatchObject({ itemIndex: 7, itemStartEpoch: GAME_START + 5_100, feedback: null });
    expect(shownItem(container)?.index).toBe(7);
  });

  it('"round ended" finishes at once, exactly once; the open item does not count', () => {
    const { container, onFinish, rerenderWith } = renderGame();
    advance(1500);
    advance(300);
    swipe(container, itemFor(SEED, 0).side);
    advance(150 + 200);
    rerenderWith({ roundEnded: true });
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish.mock.calls[0][0].raw).toEqual({ correct: 1, wrong: 0, missed: 0, mean_swipe_ms: 300 });
    expect(container.querySelector('[data-testid="ss-done"]')).not.toBeNull();
    rerenderWith({ roundEnded: true });
    advance(31_000);
    expect(onFinish).toHaveBeenCalledTimes(1);
  });
});

describe('Swipe Sort: browser-gesture defence', () => {
  it('adds non-passive touchstart / touchmove listeners and removes the same ones on unmount', () => {
    const add = vi.spyOn(HTMLElement.prototype, 'addEventListener');
    const remove = vi.spyOn(HTMLElement.prototype, 'removeEventListener');
    const { container, unmount } = renderGame();
    const root = container.firstElementChild; // the game's root (React's own root listeners are on the container)
    const added = add.mock.calls.filter(([type], i) => add.mock.contexts[i] === root && (type === 'touchstart' || type === 'touchmove'));
    expect(added.map(([type]) => type).sort()).toEqual(['touchmove', 'touchstart']);
    for (const [, , options] of added) expect(options).toEqual({ passive: false });

    unmount();
    for (const [type, listener] of added) {
      expect(remove.mock.calls.some(([t, l], i) => remove.mock.contexts[i] === root && t === type && l === listener)).toBe(true);
    }
  });

  it('sets overscroll-behavior: none on <html> while mounted and restores it on unmount', () => {
    const html = document.documentElement;
    const before = html.style.overscrollBehavior;
    const { unmount } = renderGame();
    expect(html.style.overscrollBehavior).toBe('none');
    expect(document.body.style.overscrollBehavior).toBe('none');
    unmount();
    expect(html.style.overscrollBehavior).toBe(before);
  });

  it('touchmove on the surface is prevented; touchstart only in the edge band', () => {
    const { container, unmount } = renderGame();
    advance(1500);
    const el = surface(container);

    const moveEvent = new Event('touchmove', { bubbles: true, cancelable: true });
    el.dispatchEvent(moveEvent);
    expect(moveEvent.defaultPrevented).toBe(true);

    const touchAt = (x: number) => {
      const ev = new Event('touchstart', { bubbles: true, cancelable: true });
      Object.defineProperty(ev, 'changedTouches', { value: [{ clientX: x, clientY: CY }] });
      el.dispatchEvent(ev);
      return ev.defaultPrevented;
    };
    expect(touchAt(10)).toBe(true);
    expect(touchAt(window.innerWidth - 10)).toBe(true);
    expect(touchAt(CX)).toBe(false);

    unmount();
    const afterUnmount = new Event('touchmove', { bubbles: true, cancelable: true });
    document.body.dispatchEvent(afterUnmount);
    expect(afterUnmount.defaultPrevented).toBe(false);
  });

  it('the surface has touch-action: none in its CSS module', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const css = fs.readFileSync(path.resolve(__dirname, 'SwipeSort.module.css'), 'utf8');
    const surfaceBlock = css.slice(css.indexOf('.surface {'), css.indexOf('}', css.indexOf('.surface {')));
    expect(surfaceBlock).toContain('touch-action: none');
    expect(css).toContain('padding-inline: var(--swipe-safe-inset)');
  });
});

describe('Swipe Sort: anchored game clock (SS-T15)', () => {
  it('a mount 5 s after roundStartEpoch: the clock starts at roundStartEpoch + 1.5 s and the elapsed windows are misses', () => {
    vi.setSystemTime(ROUND_START + 5_000);
    const { last, onFinish } = renderGame();
    advance(50);
    const expected = catchUp(playSnapshot({}), ROUND_START + 5_000);
    expect(expected.missed).toBeGreaterThanOrEqual(3);
    expect(last()).toMatchObject({ phase: 'play', gameStartEpoch: GAME_START, missed: expected.missed, itemIndex: expected.itemIndex });

    advance(GAME_START + 30_000 - Date.now() - 60);
    expect(onFinish).not.toHaveBeenCalled();
    advance(100);
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish.mock.calls[0][0].raw).toMatchObject({ correct: 0, wrong: 0, missed: 37 });
    expect(onFinish.mock.calls[0][0].durationMs).toBeLessThanOrEqual(32_000);
  });

  it('hidden during the intro: on return the first onset is still roundStartEpoch + 1.5 s', () => {
    const { container, last } = renderGame();
    advance(500);
    expect(shownItem(container)).toBeNull();
    vi.setSystemTime(Date.now() + 4_000);
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    advance(50);
    expect(last()).toMatchObject({ phase: 'play', gameStartEpoch: GAME_START });
    expect(last().missed).toBe(catchUp(playSnapshot({}), Date.now()).missed);
  });

  it('a swipe on the first item of a late mount is timed from the anchored onset', () => {
    vi.setSystemTime(ROUND_START + 1_700);
    const { container, last } = renderGame();
    advance(50); // the first item's onset was GAME_START, 200 ms ago
    advance(100);
    swipe(container, itemFor(SEED, 0).side);
    expect(last()).toMatchObject({ correct: 1, swipeSumMs: 350 });
  });

  it('a mount after the whole game time finishes at once with every window missed', () => {
    vi.setSystemTime(ROUND_START + 40_000);
    const { onFinish } = renderGame();
    advance(100);
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish.mock.calls[0][0].raw).toMatchObject({ correct: 0, wrong: 0, missed: 37 });
  });
});

describe('Swipe Sort: the chevron offset (SS-T16)', () => {
  const dragOf = (container: HTMLElement) =>
    container.querySelector<HTMLElement>('[data-testid="ss-item"]')?.style.getPropertyValue('--ss-drag');

  it('a drag held across a miss never moves the next chevron, and a further move counts nothing', () => {
    const { container, last } = renderGame();
    advance(1500);
    const el = surface(container);
    advance(800);
    pointer(el, 'pointerdown', CX, CY);
    pointer(el, 'pointermove', CX + 10, CY);
    expect(dragOf(container)).toBe('10px'); // item 0 follows its own drag
    advance(250); // item 0 missed at 900 ms, item 1 live at 1050 ms
    expect(shownItem(container)?.index).toBe(1);
    pointer(el, 'pointermove', CX + 30, CY);
    expect(dragOf(container)).toBe('0px');
    pointer(el, 'pointermove', CX + 80, CY);
    expect(dragOf(container)).toBe('0px');
    expect(last()).toMatchObject({ correct: 0, wrong: 0, missed: 1, itemIndex: 1 });
    pointer(el, 'pointerup', CX + 80, CY);
    expect(dragOf(container)).toBe('0px');
  });

  it('a swipe that registers past the deadline (before the miss timer) springs the chevron back', () => {
    const { container, last } = renderGame();
    advance(1500);
    const el = surface(container);
    pointer(el, 'pointerdown', CX, CY);
    pointer(el, 'pointermove', CX + 20, CY);
    expect(dragOf(container)).toBe('20px');
    // The clock passes item 0's 900 ms deadline without its timer firing yet.
    vi.setSystemTime(Date.now() + 1_000);
    pointer(el, 'pointermove', CX + 60, CY);
    expect(dragOf(container)).toBe('0px');
    expect(last()).toMatchObject({ correct: 0, wrong: 0 });
  });
});

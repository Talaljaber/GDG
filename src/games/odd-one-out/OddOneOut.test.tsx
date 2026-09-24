import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OddOneOut, type OddOneOutSnapshot } from './OddOneOut';
import type { GameProps } from '../types';
import { oddTileIndex } from './grid';

vi.mock('../../i18n', () => ({
  useT: () => (key: string, params?: Record<string, string | number>) =>
    params ? `${key}|${JSON.stringify(params)}` : key,
}));

const ROUND_START = 1_700_000_000_000;
const SEED = 'seed-1';

// Odd-tile indices for SEED, precomputed from the same seeded RNG used by
// the component (grid.ts), so tests can script exact taps.
const ODD = {
  0: oddTileIndex(SEED, 0, 4),
  1: oddTileIndex(SEED, 1, 5),
  2: oddTileIndex(SEED, 2, 6),
};

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function renderGame(overrides: Partial<GameProps<OddOneOutSnapshot>> = {}) {
  const onProgress = vi.fn();
  const onFinish = vi.fn();
  const defaults: GameProps<OddOneOutSnapshot> = {
    seed: SEED,
    roundStartEpoch: ROUND_START,
    roundEnded: false,
    snapshot: null,
    onProgress,
    onFinish,
  };
  const props = { ...defaults, ...overrides };
  const utils = render(<OddOneOut {...props} />);
  return {
    ...utils,
    onProgress,
    onFinish,
    rerenderWith: (next: Partial<GameProps<OddOneOutSnapshot>>) =>
      utils.rerender(<OddOneOut {...props} {...next} />),
  };
}

function tiles(container: HTMLElement): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll('button'));
}

function tapTile(container: HTMLElement, index: number) {
  const buttons = tiles(container);
  const button = buttons[index];
  if (!button) throw new Error(`tile ${index} not found (only ${buttons.length} tiles)`);
  fireEvent.pointerDown(button);
}

function progressSnapshots(onProgress: ReturnType<typeof vi.fn>): OddOneOutSnapshot[] {
  return onProgress.mock.calls.map((call) => call[0] as OddOneOutSnapshot);
}

beforeEach(() => {
  // requestAnimationFrame/cancelAnimationFrame are NOT included here: faking
  // the same global React's own Scheduler uses for frame pacing makes React
  // 18's effect flushing under these tests non-deterministic. Instead they
  // are stubbed below to invoke synchronously, so "the first painted frame"
  // is deterministic without fighting the Scheduler.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] });
  vi.setSystemTime(ROUND_START);
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(performance.now());
    return 0;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('OddOneOut: full flow with a wrong tap', () => {
  it('runs all 3 grids, records a wrong tap, and finishes exactly once', () => {
    const { container, onFinish } = renderGame();

    advance(1500); // intro -> grid_1 (painted synchronously)
    expect(tiles(container)).toHaveLength(16);

    // Wrong tap on grid 1 (any tile that isn't the odd one).
    const wrongIndex = ODD[0] === 0 ? 1 : 0;
    advance(300);
    tapTile(container, wrongIndex);
    // Still on grid 1: tapping the odd tile now finds it.
    advance(200);
    tapTile(container, ODD[0]);

    advance(600); // found transition -> grid_2
    expect(tiles(container)).toHaveLength(25);
    advance(400);
    tapTile(container, ODD[1]);

    advance(600); // found transition -> grid_3
    expect(tiles(container)).toHaveLength(36);
    advance(1000);
    tapTile(container, ODD[2]);

    advance(600); // found transition -> finish

    expect(onFinish).toHaveBeenCalledTimes(1);
    const result = onFinish.mock.calls[0][0];
    const raw = result.raw as { grids: Array<{ size: number; find_ms: number; wrong_taps: number; timed_out: boolean }> };

    expect(raw.grids).toEqual([
      { size: 4, find_ms: 500, wrong_taps: 1, timed_out: false },
      { size: 5, find_ms: 400, wrong_taps: 0, timed_out: false },
      { size: 6, find_ms: 1000, wrong_taps: 0, timed_out: false },
    ]);

    expect(typeof result.score).toBe('number');
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThanOrEqual(1000);
    expect(result.durationMs).toBeGreaterThan(0);
    expect(result.durationMs).toBeLessThanOrEqual(120_000);
  });
});

describe('OddOneOut: grid timeout', () => {
  it('times out a grid after 20s and moves on, counting find_ms 20000', () => {
    const { container, onProgress } = renderGame();

    advance(1500); // intro -> grid_1
    advance(20_000); // grid 1 timeout fires

    const timedOutSnapshot = progressSnapshots(onProgress).find((snap) => snap.grids.length === 1);
    expect(timedOutSnapshot?.grids[0]).toEqual({ size: 4, find_ms: 20000, wrong_taps: 0, timed_out: true });

    advance(600); // timeout transition -> grid_2
    expect(tiles(container)).toHaveLength(25);
  });
});

describe('OddOneOut: reload resume (OOO-T5)', () => {
  it('resumes mid-grid from a snapshot with the same seeded odd tile, continuing the clock from the epoch', () => {
    const gridStartEpoch = ROUND_START;
    vi.setSystemTime(ROUND_START + 3000); // reloaded 3s into grid 1

    const snapshot: OddOneOutSnapshot = {
      phase: 'grid',
      grids: [],
      gridStartEpoch,
      wrongTapsCurrent: 0,
      transitionType: null,
    };
    const { container, onProgress } = renderGame({ snapshot });

    expect(tiles(container)).toHaveLength(16);
    tapTile(container, ODD[0]); // same odd index as a fresh mount would compute

    const found = progressSnapshots(onProgress).find((snap) => snap.grids.length === 1);
    expect(found?.grids[0]).toEqual({ size: 4, find_ms: 3000, wrong_taps: 0, timed_out: false });
  });

  it('times out on resume if the persisted epoch already exceeded 20s', () => {
    const gridStartEpoch = ROUND_START;
    vi.setSystemTime(ROUND_START + 20_000);

    const snapshot: OddOneOutSnapshot = {
      phase: 'grid',
      grids: [],
      gridStartEpoch,
      wrongTapsCurrent: 0,
      transitionType: null,
    };
    const { onProgress } = renderGame({ snapshot });

    const timedOut = progressSnapshots(onProgress).find((snap) => snap.grids.length === 1);
    expect(timedOut?.grids[0]).toEqual({ size: 4, find_ms: 20000, wrong_taps: 0, timed_out: true });
  });
});

describe('OddOneOut: round ends early', () => {
  it('finishes immediately, marking the current and remaining grids as timed out', () => {
    const { onFinish, rerenderWith } = renderGame();

    advance(1500); // intro -> grid_1
    advance(2000); // partway through grid 1

    rerenderWith({ roundEnded: true });

    expect(onFinish).toHaveBeenCalledTimes(1);
    const raw = onFinish.mock.calls[0][0].raw as { grids: Array<{ size: number; find_ms: number; timed_out: boolean }> };
    expect(raw.grids).toEqual([
      { size: 4, find_ms: 20000, wrong_taps: 0, timed_out: true },
      { size: 5, find_ms: 20000, wrong_taps: 0, timed_out: true },
      { size: 6, find_ms: 20000, wrong_taps: 0, timed_out: true },
    ]);
  });

  it('finishes only once even if roundEnded stays true across re-renders', () => {
    const { onFinish, rerenderWith } = renderGame();
    advance(1500);
    advance(500);
    rerenderWith({ roundEnded: true });
    rerenderWith({ roundEnded: true });
    expect(onFinish).toHaveBeenCalledTimes(1);
  });
});

describe('OddOneOut: multi-touch and transitions', () => {
  it('ignores a second pointerdown within the 100ms debounce window', () => {
    const { container, onProgress } = renderGame();
    advance(1500);

    const wrongIndex = ODD[0] === 0 ? 1 : 0;
    const button = tiles(container)[wrongIndex];
    fireEvent.pointerDown(button); // first tap: counts
    fireEvent.pointerDown(button); // bounce: ignored

    const withOneGrid = progressSnapshots(onProgress).filter((snap) => snap.wrongTapsCurrent === 1);
    expect(withOneGrid.length).toBeGreaterThan(0);
    const withTwoWrongTaps = progressSnapshots(onProgress).some((snap) => snap.wrongTapsCurrent === 2);
    expect(withTwoWrongTaps).toBe(false);
  });

  it('ignores taps during the 0.6s found transition', () => {
    const { container, onFinish } = renderGame();
    advance(1500);
    tapTile(container, ODD[0]); // found_1 transition begins

    // Tap during the transition: should be ignored (still showing grid 1's tiles).
    tapTile(container, ODD[0]);

    advance(600); // -> grid_2
    expect(tiles(container)).toHaveLength(25);
    expect(onFinish).not.toHaveBeenCalled();
  });
});

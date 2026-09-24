import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StopTheClock, type StopTheClockSnapshot } from './StopTheClock';
import type { GameProps } from '../types';

vi.mock('../../i18n', () => ({
  useT: () => (key: string, params?: Record<string, string | number>) =>
    params ? `${key}|${JSON.stringify(params)}` : key,
}));

const ROUND_START = 1_700_000_000_000;

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function renderGame(overrides: Partial<GameProps<StopTheClockSnapshot>> = {}) {
  const onProgress = vi.fn();
  const onFinish = vi.fn();
  const defaults: GameProps<StopTheClockSnapshot> = {
    seed: 'seed-1',
    roundStartEpoch: ROUND_START,
    roundEnded: false,
    snapshot: null,
    onProgress,
    onFinish,
  };
  const props = { ...defaults, ...overrides };
  const utils = render(<StopTheClock {...props} />);
  return {
    ...utils,
    onProgress,
    onFinish,
    rerenderWith: (next: Partial<GameProps<StopTheClockSnapshot>>) =>
      utils.rerender(<StopTheClock {...props} {...next} />),
  };
}

function tap(container: HTMLElement) {
  const button = container.querySelector('button');
  if (!button) throw new Error('Start/Stop button not found');
  fireEvent.pointerDown(button);
}

/** Typed view of the snapshots an onProgress mock was called with, in order. */
function progressSnapshots(onProgress: ReturnType<typeof vi.fn>): StopTheClockSnapshot[] {
  return onProgress.mock.calls.map((call) => call[0] as StopTheClockSnapshot);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] });
  vi.setSystemTime(ROUND_START);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('StopTheClock: full flow', () => {
  it('runs a full 3-attempt sharp session and finishes exactly once', () => {
    const { container, onFinish, onProgress } = renderGame();

    advance(1500); // intro -> ready_1
    tap(container); // start attempt 1
    advance(5000);
    tap(container); // stop attempt 1: measured 5000

    advance(1500); // locked_1 -> ready_2
    tap(container); // start attempt 2
    advance(10000);
    tap(container); // stop attempt 2: measured 10000

    advance(1500); // locked_2 -> ready_3
    tap(container); // start attempt 3
    advance(7000);
    tap(container); // stop attempt 3: measured 7000

    advance(1500); // locked_3 -> finish

    expect(onFinish).toHaveBeenCalledTimes(1);
    const result = onFinish.mock.calls[0][0];
    expect(result.raw).toEqual({
      attempts: [
        { target_ms: 5000, measured_ms: 5000, missed_start: false },
        { target_ms: 10000, measured_ms: 10000, missed_start: false },
        { target_ms: 7000, measured_ms: 7000, missed_start: false },
      ],
    });
    expect(result.score).toBe(1000); // client-side value; the server would reject (> 990)
    expect(result.durationMs).toBeGreaterThan(0);
    expect(result.durationMs).toBeLessThanOrEqual(120_000);

    // onProgress fired for at least every start event and every attempt (6 events).
    expect(onProgress.mock.calls.length).toBeGreaterThanOrEqual(6);
  });

  it('records a missed start when Start is not tapped within 10s, then continues', () => {
    const { onProgress } = renderGame();

    advance(1500); // ready_1
    advance(10_000); // missed-start window elapses

    const snapshotAfterMiss = progressSnapshots(onProgress).find((snap) => snap.attempts.length === 1);
    expect(snapshotAfterMiss?.attempts[0]).toEqual({ target_ms: 5000, measured_ms: null, missed_start: true });

    advance(1500); // locked_1 -> ready_2
    const readyAgain = progressSnapshots(onProgress).at(-1);
    expect(readyAgain?.phase).toBe('ready');
  });

  it('auto-stops at target + 10s when Stop is never tapped', () => {
    const { container, onProgress } = renderGame();

    advance(1500); // ready_1
    tap(container); // start attempt 1
    advance(5000 + 10_000); // auto-stop fires at target(5000) + 10000

    const snapshotAfterAutoStop = progressSnapshots(onProgress).find((snap) => snap.attempts.length === 1);
    expect(snapshotAfterAutoStop?.attempts[0]).toEqual({
      target_ms: 5000,
      measured_ms: 15000,
      missed_start: false,
    });
  });
});

describe('StopTheClock: round ends early', () => {
  it('finishes immediately mid-attempt, closing the running attempt with time-so-far', () => {
    const { container, onFinish, rerenderWith } = renderGame();

    advance(1500); // ready_1
    tap(container); // start attempt 1
    advance(3000); // 3s into a 5s target

    rerenderWith({ roundEnded: true });

    expect(onFinish).toHaveBeenCalledTimes(1);
    const raw = onFinish.mock.calls[0][0].raw as { attempts: unknown[] };
    expect(raw.attempts).toEqual([
      { target_ms: 5000, measured_ms: 3000, missed_start: false },
      { target_ms: 10000, measured_ms: null, missed_start: true },
      { target_ms: 7000, measured_ms: null, missed_start: true },
    ]);
  });

  it('finishes only once even if roundEnded stays true across re-renders', () => {
    const { container, onFinish, rerenderWith } = renderGame();
    advance(1500);
    tap(container);
    advance(1000);
    rerenderWith({ roundEnded: true });
    rerenderWith({ roundEnded: true });
    expect(onFinish).toHaveBeenCalledTimes(1);
  });
});

describe('StopTheClock: reload resume', () => {
  it('resumes a running attempt from a snapshot, measuring via Date.now (not performance.now)', () => {
    const attemptStartEpoch = ROUND_START;
    vi.setSystemTime(ROUND_START + 2000); // phone reloaded 2s into the attempt

    const snapshot: StopTheClockSnapshot = {
      phase: 'running',
      attempts: [],
      readyStartEpoch: null,
      attemptStartEpoch,
    };
    const { container, onProgress } = renderGame({ snapshot });

    tap(container); // Stop, 2s after attemptStartEpoch

    const afterStop = progressSnapshots(onProgress).find((snap) => snap.attempts.length === 1);
    expect(afterStop?.attempts[0]).toEqual({ target_ms: 5000, measured_ms: 2000, missed_start: false });
  });

  it('resumes a ready window from the persisted readyStartEpoch instead of resetting it', () => {
    vi.setSystemTime(ROUND_START + 9000); // reloaded with 1s left of the 10s window
    const snapshot: StopTheClockSnapshot = {
      phase: 'ready',
      attempts: [],
      readyStartEpoch: ROUND_START,
      attemptStartEpoch: null,
    };
    const { onProgress } = renderGame({ snapshot });

    advance(1000); // the remaining 1s of the original window elapses

    const missed = progressSnapshots(onProgress).find((snap) => snap.attempts.length === 1);
    expect(missed?.attempts[0]).toEqual({ target_ms: 5000, measured_ms: null, missed_start: true });
  });
});

describe('StopTheClock: double tap', () => {
  it('ignores a second pointerdown within the 150ms debounce window', () => {
    const { container, onProgress } = renderGame();
    advance(1500); // ready_1
    const button = container.querySelector('button')!;

    fireEvent.pointerDown(button); // Start
    fireEvent.pointerDown(button); // bounce (0ms later): must be ignored

    const runningTransitions = progressSnapshots(onProgress).filter((snap) => snap.phase === 'running');
    expect(runningTransitions).toHaveLength(1);
    expect(button.textContent).toBe('game.stop_the_clock.stop');
  });
});

describe('StopTheClock: running screen stability (STC-T8 analogue)', () => {
  it('renders identical DOM for ~19s while running, with no live updates', () => {
    // Start on attempt 2 (target 10000ms, auto-stop at 20000ms) for headroom to ~19s.
    const snapshot: StopTheClockSnapshot = {
      phase: 'ready',
      attempts: [{ target_ms: 5000, measured_ms: 5000, missed_start: false }],
      readyStartEpoch: ROUND_START,
      attemptStartEpoch: null,
    };
    const { container } = renderGame({ snapshot });
    tap(container); // start attempt 2

    const initialHtml = container.innerHTML;
    expect(initialHtml).toContain('game.stop_the_clock.stop');

    for (let i = 0; i < 19; i++) {
      advance(1000);
      expect(container.innerHTML).toBe(initialHtml);
    }
  });
});

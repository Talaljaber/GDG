import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Simon, type SimonSnapshot } from './Simon';
import type { GameProps } from '../types';
import { generateSimonSequence, type SimonPad } from './sequence';
import { SIMON_MAX_LEVEL, onTimeMs, timeBonus, totalTapsForLevel } from './scoring';

vi.mock('../../i18n', () => ({
  useT: () => (key: string, params?: Record<string, string | number>) =>
    params ? `${key}|${JSON.stringify(params)}` : key,
}));

const ROUND_START = 1_700_000_000_000;
const SEED = 'seed-1';

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function renderGame(overrides: Partial<GameProps<SimonSnapshot>> = {}) {
  const onProgress = vi.fn();
  const onFinish = vi.fn();
  const defaults: GameProps<SimonSnapshot> = {
    seed: SEED,
    roundStartEpoch: ROUND_START,
    roundEnded: false,
    snapshot: null,
    onProgress,
    onFinish,
  };
  const props = { ...defaults, ...overrides };
  const utils = render(<Simon {...props} />);
  return {
    ...utils,
    onProgress,
    onFinish,
    rerenderWith: (next: Partial<GameProps<SimonSnapshot>>) => utils.rerender(<Simon {...props} {...next} />),
  };
}

function padButton(container: HTMLElement, pad: SimonPad): HTMLButtonElement {
  const button = container.querySelector(`button[aria-label="game.simon.pad_${pad}"]`);
  if (!button) throw new Error(`pad button ${pad} not found`);
  return button as HTMLButtonElement;
}

/** Advances past the whole watch playback for a sequence of this length. */
function playbackDurationFor(level: number): number {
  return level * (onTimeMs(level) + 150);
}

function progressSnapshots(onProgress: ReturnType<typeof vi.fn>): SimonSnapshot[] {
  return onProgress.mock.calls.map((call) => call[0] as SimonSnapshot);
}

/** A tap, then a small gap so the next tap clears the 80ms bounce debounce. */
function tap(container: HTMLElement, pad: SimonPad) {
  fireEvent.pointerDown(padButton(container, pad));
  advance(100);
}

/** Taps out the current sequence correctly, from `watch` through to `success`/`won`. */
function playSequenceCorrectly(container: HTMLElement, level: number) {
  advance(playbackDurationFor(level)); // watch -> input
  const sequence = generateSimonSequence(SEED, level);
  for (const pad of sequence) {
    tap(container, pad);
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] });
  vi.setSystemTime(ROUND_START);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Simon: successful levels then a mistake', () => {
  it('advances length by 1 per success and finishes with the completed length on a mistake', () => {
    const { container, onFinish } = renderGame();

    advance(1500); // intro -> watch (level 3)
    playSequenceCorrectly(container, 3); // completes level 3 -> success
    advance(800); // success -> watch (level 4)
    playSequenceCorrectly(container, 4); // completes level 4 -> success
    advance(800); // success -> watch (level 5)

    // Now fail level 5: tap the wrong pad first.
    advance(playbackDurationFor(5));
    const sequence = generateSimonSequence(SEED, 5);
    const wrongPad: SimonPad = (['up', 'right', 'left', 'down'] as const).find((p) => p !== sequence[0])!;
    fireEvent.pointerDown(padButton(container, wrongPad));

    advance(800); // over -> finish

    expect(onFinish).toHaveBeenCalledTimes(1);
    const result = onFinish.mock.calls[0][0];
    expect(result.raw.level).toBe(4);
    expect(result.raw.ended).toBe('mistake');
    expect(result.raw.taps).toBe(totalTapsForLevel(4) + 1);
    expect(result.raw.avg_gap_ms).toBeGreaterThanOrEqual(0);
    expect(result.score).toBe(64 * 4 + timeBonus(4, result.raw.avg_gap_ms));
    expect(result.durationMs).toBeGreaterThan(0);
    expect(result.durationMs).toBeLessThanOrEqual(120_000);
  });

  it('ignores taps during watch (no penalty, no progress)', () => {
    const { container, onProgress } = renderGame();
    advance(1500); // intro -> watch
    const sequence = generateSimonSequence(SEED, 3);
    // Tap during watch, before playback finishes: must be ignored.
    fireEvent.pointerDown(padButton(container, sequence[0]));
    const inputTransitions = progressSnapshots(onProgress).filter((s) => s.phase === 'input');
    expect(inputTransitions).toHaveLength(0);
  });
});

describe('Simon: per-tap timeout', () => {
  it('ends the turn if no tap arrives within 5s of playback ending', () => {
    const { onFinish } = renderGame();
    advance(1500); // intro -> watch
    advance(playbackDurationFor(3)); // watch -> input
    advance(5000); // per-tap timeout fires -> over
    advance(800); // over -> finish

    expect(onFinish).toHaveBeenCalledTimes(1);
    const result = onFinish.mock.calls[0][0];
    expect(result.raw.level).toBe(0);
    expect(result.raw.ended).toBe('timeout');
    expect(result.raw.avg_gap_ms).toBeNull();
    expect(result.score).toBe(0);
  });

  it('restarts the 5s timeout after every correct tap', () => {
    const { container, onFinish } = renderGame();
    advance(1500);
    advance(playbackDurationFor(3));
    const sequence = generateSimonSequence(SEED, 3);

    // Tap the first two pads with almost-5s gaps: should not time out.
    advance(4900);
    fireEvent.pointerDown(padButton(container, sequence[0]));
    advance(4900);
    fireEvent.pointerDown(padButton(container, sequence[1]));
    advance(4900);
    fireEvent.pointerDown(padButton(container, sequence[2]));
    advance(800); // success -> watch(4); no finish yet

    expect(onFinish).not.toHaveBeenCalled();
  });
});

describe('Simon: win at length 15', () => {
  it('completing length 15 ends the game as a win', () => {
    const { container, onFinish } = renderGame();
    advance(1500); // intro -> watch(3)

    for (let level = 3; level <= SIMON_MAX_LEVEL; level++) {
      playSequenceCorrectly(container, level);
      advance(800); // success -> watch(next) or -> won
    }

    // Last advance(800) above moved success -> won; now won -> finish.
    advance(800);

    expect(onFinish).toHaveBeenCalledTimes(1);
    const result = onFinish.mock.calls[0][0];
    expect(result.raw.level).toBe(15);
    expect(result.raw.ended).toBe('won');
    expect(result.raw.taps).toBe(totalTapsForLevel(15));
    expect(result.score).toBeGreaterThanOrEqual(960);
    expect(result.score).toBeLessThanOrEqual(1000);
  }, 20_000);
});

describe('Simon: round ends early', () => {
  it('finishes immediately with ended=cap and the completed length', () => {
    const { container, onFinish, rerenderWith } = renderGame();
    advance(1500); // intro -> watch(3)
    playSequenceCorrectly(container, 3); // success at level 3
    advance(800); // success -> watch(4)
    advance(playbackDurationFor(4)); // watch -> input, mid-sequence

    rerenderWith({ roundEnded: true });

    expect(onFinish).toHaveBeenCalledTimes(1);
    const result = onFinish.mock.calls[0][0];
    expect(result.raw.level).toBe(3); // level 4 wasn't completed, doesn't count
    expect(result.raw.ended).toBe('cap');
  });

  it('finishes only once even if roundEnded stays true across re-renders', () => {
    const { onFinish, rerenderWith } = renderGame();
    advance(1500);
    rerenderWith({ roundEnded: true });
    rerenderWith({ roundEnded: true });
    expect(onFinish).toHaveBeenCalledTimes(1);
  });
});

describe('Simon: reload resume', () => {
  it('resumes mid-input by replaying the current sequence from the start of watch', () => {
    const snapshot: SimonSnapshot = {
      phase: 'input',
      level: 4,
      completedLevel: 3,
      gaps: [300, 310, 295],
    };
    const { container, onProgress } = renderGame({ snapshot });

    // Should start in `watch` for level 4 again (not resume mid-input).
    const first = progressSnapshots(onProgress);
    expect(first).toHaveLength(0); // no progress call yet; verify via DOM state instead
    // Pads should be disabled immediately after mount (watch phase).
    const sequence = generateSimonSequence(SEED, 4);
    const button = padButton(container, sequence[0]);
    expect(button.disabled).toBe(true);

    advance(playbackDurationFor(4)); // watch -> input
    expect(padButton(container, sequence[0]).disabled).toBe(false);

    for (const pad of sequence) {
      tap(container, pad);
    }
    const successSnap = progressSnapshots(onProgress).find((s) => s.phase === 'success');
    expect(successSnap?.completedLevel).toBe(4);
    expect(successSnap?.gaps.length).toBe(3 + 4); // kept 3 prior gaps + 4 new
  });

  it('resumes from watch itself the same way (also replays from the start)', () => {
    const snapshot: SimonSnapshot = {
      phase: 'watch',
      level: 5,
      completedLevel: 4,
      gaps: [1, 2, 3, 4],
    };
    const { container } = renderGame({ snapshot });
    const sequence = generateSimonSequence(SEED, 5);
    expect(padButton(container, sequence[0]).disabled).toBe(true);
    advance(playbackDurationFor(5));
    expect(padButton(container, sequence[0]).disabled).toBe(false);
  });
});

describe('Simon: double tap', () => {
  it('ignores a second pointerdown within the 80ms debounce window', () => {
    const { container, onProgress } = renderGame();
    advance(1500);
    advance(playbackDurationFor(3));
    const sequence = generateSimonSequence(SEED, 3);
    const button = padButton(container, sequence[0]);

    fireEvent.pointerDown(button); // correct tap 1 of 3
    fireEvent.pointerDown(button); // bounce (0ms later): must be ignored, same pad again would be correct anyway,
    // so use a distinguishable check: only one tap should have registered.

    // If the bounce had registered, we'd already be 2 taps into a 3-length
    // sequence; tapping the (different) second pad should not yet finish it.
    const secondPad = sequence[1];
    fireEvent.pointerDown(padButton(container, secondPad));
    const inputSnaps = progressSnapshots(onProgress).filter((s) => s.phase === 'success');
    expect(inputSnaps).toHaveLength(0); // only 2 of 3 taps registered so far
  });
});

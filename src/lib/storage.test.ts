import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  acquireTabLock,
  clearCurrent,
  getCurrent,
  getLastName,
  patchCurrent,
  setCurrent,
  setLastName,
  type CurrentState,
} from './storage';

function sampleState(overrides: Partial<CurrentState> = {}): CurrentState {
  return {
    sessionId: 's1',
    playerRowId: 'p1',
    name: 'Sara',
    displaySuffix: null,
    roundId: 'r1',
    game: 'stop_the_clock',
    roundStartEpoch: 1234,
    seed: 'seed-1',
    gameSnapshot: { attemptIndex: 0 },
    pendingSubmit: null,
    submittedRounds: [],
    ...overrides,
  };
}

describe('current state storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns null when nothing is stored', () => {
    expect(getCurrent()).toBeNull();
  });

  it('round-trips a state object through setCurrent/getCurrent', () => {
    const state = sampleState();
    setCurrent(state);
    expect(getCurrent()).toEqual(state);
  });

  it('patchCurrent merges into an existing state', () => {
    setCurrent(sampleState());
    const merged = patchCurrent({ roundId: 'r2', game: 'simon' });
    expect(merged.roundId).toBe('r2');
    expect(merged.game).toBe('simon');
    expect(merged.sessionId).toBe('s1'); // untouched fields survive
    expect(getCurrent()).toEqual(merged);
  });

  it('patchCurrent starts from an empty state when nothing is stored', () => {
    const merged = patchCurrent({ sessionId: 's9' });
    expect(merged.sessionId).toBe('s9');
    expect(merged.playerRowId).toBeNull();
    expect(merged.submittedRounds).toEqual([]);
  });

  it('clearCurrent removes the stored state', () => {
    setCurrent(sampleState());
    clearCurrent();
    expect(getCurrent()).toBeNull();
  });

  it('getCurrent returns null for corrupted JSON instead of throwing', () => {
    localStorage.setItem('gdg.v1.current', '{not json');
    expect(getCurrent()).toBeNull();
  });

  it('setCurrent does not throw when localStorage.setItem throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota exceeded');
    });
    expect(() => setCurrent(sampleState())).not.toThrow();
    expect(setCurrent(sampleState())).toBe(false);
    spy.mockRestore();
  });

  it('getCurrent does not throw when localStorage.getItem throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });
    expect(() => getCurrent()).not.toThrow();
    expect(getCurrent()).toBeNull();
    spy.mockRestore();
  });
});

describe('last name storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns null when no last name is stored', () => {
    expect(getLastName()).toBeNull();
  });

  it('round-trips through setLastName/getLastName', () => {
    setLastName('Sara');
    expect(getLastName()).toBe('Sara');
  });

  it('setLastName does not throw when storage is unavailable', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('disabled');
    });
    expect(() => setLastName('Sara')).not.toThrow();
    expect(setLastName('Sara')).toBe(false);
    spy.mockRestore();
  });
});

describe('acquireTabLock via Web Locks', () => {
  afterEach(() => {
    delete (navigator as { locks?: unknown }).locks;
  });

  it('resolves acquired: true and holds the lock until release() is called', async () => {
    const request = vi.fn(
      (
        _name: string,
        _opts: { ifAvailable?: boolean },
        callback: (lock: unknown) => Promise<void> | void,
      ) => {
        const maybePromise = callback({});
        return new Promise<void>((resolve) => {
          if (maybePromise && typeof (maybePromise as Promise<void>).then === 'function') {
            (maybePromise as Promise<void>).then(resolve);
          }
        });
      },
    );
    Object.defineProperty(navigator, 'locks', {
      value: { request },
      configurable: true,
    });

    const lock = await acquireTabLock();
    expect(lock.acquired).toBe(true);
    expect(request).toHaveBeenCalledWith(
      'gdg-player',
      { ifAvailable: true },
      expect.any(Function),
    );
    lock.release();
  });

  it('resolves acquired: false when the lock callback receives null', async () => {
    const request = vi.fn(
      (_name: string, _opts: { ifAvailable?: boolean }, callback: (lock: unknown) => unknown) => {
        callback(null);
        return Promise.resolve();
      },
    );
    Object.defineProperty(navigator, 'locks', {
      value: { request },
      configurable: true,
    });

    const lock = await acquireTabLock();
    expect(lock.acquired).toBe(false);
  });
});

describe('acquireTabLock BroadcastChannel fallback', () => {
  const originalBroadcastChannel = globalThis.BroadcastChannel;

  beforeEach(() => {
    delete (navigator as { locks?: unknown }).locks;
  });

  afterEach(() => {
    globalThis.BroadcastChannel = originalBroadcastChannel;
    vi.useRealTimers();
  });

  it('claims the lock when no other tab responds within the timeout', async () => {
    vi.useFakeTimers();
    class FakeChannel {
      onmessage: ((event: MessageEvent) => void) | null = null;
      postMessage(): void {
        // Nobody else is listening: no pong ever arrives.
      }
      close(): void {}
    }
    // @ts-expect-error -- minimal fake implementation for the test
    globalThis.BroadcastChannel = FakeChannel;

    const promise = acquireTabLock();
    await vi.runAllTimersAsync();
    const lock = await promise;
    expect(lock.acquired).toBe(true);
    lock.release();
  });

  it('does not acquire when another tab replies with pong', async () => {
    class FakeChannel {
      onmessage: ((event: MessageEvent) => void) | null = null;
      postMessage(data: unknown): void {
        if (data === 'ping') {
          // Simulate another tab answering on the next microtask.
          queueMicrotask(() => this.onmessage?.({ data: 'pong' } as MessageEvent));
        }
      }
      close(): void {}
    }
    // @ts-expect-error -- minimal fake implementation for the test
    globalThis.BroadcastChannel = FakeChannel;

    const lock = await acquireTabLock();
    expect(lock.acquired).toBe(false);
  });

  it('acquires immediately when BroadcastChannel is unavailable', async () => {
    // @ts-expect-error -- simulate an environment without BroadcastChannel
    delete globalThis.BroadcastChannel;

    const lock = await acquireTabLock();
    expect(lock.acquired).toBe(true);
  });
});

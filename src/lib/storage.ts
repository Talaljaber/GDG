/**
 * Typed localStorage wrapper for the phone's persisted state
 * (`SESSION_LIFECYCLE.md` §4.1, ADR-018) plus a tab lock for the "one game
 * per phone" rule (ADR-121, `SESSION_LIFECYCLE.md` §6 E9). All storage
 * access is wrapped in try/catch: private-browsing, quota errors and
 * disabled storage must never crash the app.
 */

const CURRENT_KEY = 'gdg.v1.current';
const LAST_NAME_KEY = 'gdg.v1.lastName';
const TAB_LOCK_NAME = 'gdg-player';
const BROADCAST_CHANNEL_NAME = 'gdg-tab';
/** How long a fallback tab waits for a "pong" before claiming the lock. */
const BROADCAST_PING_TIMEOUT_MS = 150;

/** The score insert payload kept until the server acknowledges it (E14). */
export interface PendingSubmit {
  roundId: string;
  score: number;
  durationMs: number;
  raw: unknown;
  [key: string]: unknown;
}

/** The one object the phone keeps in localStorage, rewritten on every meaningful change. */
export interface CurrentState {
  sessionId: string | null;
  playerRowId: string | null;
  name: string | null;
  displaySuffix: number | null;
  roundId: string | null;
  game: string | null;
  roundStartEpoch: number | null;
  seed: string | number | null;
  /** Per-game in-progress state; shape is game-specific and opaque here. */
  gameSnapshot: unknown;
  pendingSubmit: PendingSubmit | null;
  submittedRounds: string[];
  /**
   * The finished round's result as computed on the phone, kept after the
   * server acknowledges it so a reload on the round result screen can still
   * show the score and the game's detail line (E3).
   */
  lastResult?: PendingSubmit | null;
  /** Set when the score couldn't be saved in time (GD007, E14): shown locally only. */
  saveFailedRound?: string | null;
}

function emptyCurrentState(): CurrentState {
  return {
    sessionId: null,
    playerRowId: null,
    name: null,
    displaySuffix: null,
    roundId: null,
    game: null,
    roundStartEpoch: null,
    seed: null,
    gameSnapshot: null,
    pendingSubmit: null,
    submittedRounds: [],
  };
}

function readJSON<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJSON(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function removeKey(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore: nothing we can do if storage is unavailable.
  }
}

/** Reads the persisted phone state, or null if absent/unreadable. */
export function getCurrent(): CurrentState | null {
  return readJSON<CurrentState>(CURRENT_KEY);
}

/** Overwrites the persisted phone state. */
export function setCurrent(state: CurrentState): boolean {
  return writeJSON(CURRENT_KEY, state);
}

/**
 * Merges `patch` into the existing state (or a fresh empty state if none is
 * stored yet), persists it, and returns the merged result.
 */
export function patchCurrent(patch: Partial<CurrentState>): CurrentState {
  const merged: CurrentState = { ...(getCurrent() ?? emptyCurrentState()), ...patch };
  writeJSON(CURRENT_KEY, merged);
  return merged;
}

/** Clears the persisted phone state (e.g. after a session ends and the player leaves). */
export function clearCurrent(): void {
  removeKey(CURRENT_KEY);
}

/** Reads the last name the guest used on this device, for pre-filling the join form. */
export function getLastName(): string | null {
  try {
    return localStorage.getItem(LAST_NAME_KEY);
  } catch {
    return null;
  }
}

/** Remembers the name the guest used, for pre-filling the join form next time. */
export function setLastName(name: string): boolean {
  try {
    localStorage.setItem(LAST_NAME_KEY, name);
    return true;
  } catch {
    return false;
  }
}

export interface TabLock {
  /** Whether this tab holds the lock (false means another tab already has it). */
  acquired: boolean;
  /** Releases the lock, if held. Safe to call more than once. */
  release(): void;
}

type LocksNavigator = Navigator & {
  locks: {
    request: (
      name: string,
      options: { ifAvailable?: boolean },
      callback: (lock: unknown | null) => Promise<void> | void,
    ) => Promise<void>;
  };
};

function hasWebLocks(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof (navigator as Partial<LocksNavigator>).locks?.request === 'function'
  );
}

/** Acquires the tab lock via the Web Locks API, holding it until `release()` is called. */
function acquireWebLock(): Promise<TabLock> {
  return new Promise((resolveOuter) => {
    let settled = false;
    const settle = (result: TabLock) => {
      if (!settled) {
        settled = true;
        resolveOuter(result);
      }
    };

    (navigator as LocksNavigator).locks
      .request(TAB_LOCK_NAME, { ifAvailable: true }, (lock) => {
        if (!lock) {
          settle({ acquired: false, release: () => {} });
          return undefined;
        }
        // Hold the lock open until release() is called: the Web Locks API
        // releases the lock as soon as the callback's returned promise
        // settles, so we return a promise we control.
        return new Promise<void>((resolveHeld) => {
          let released = false;
          settle({
            acquired: true,
            release: () => {
              if (!released) {
                released = true;
                resolveHeld();
              }
            },
          });
        });
      })
      .catch(() => {
        settle({ acquired: false, release: () => {} });
      });
  });
}

/**
 * Fallback for browsers without Web Locks (ADR-121): ping the shared
 * BroadcastChannel and wait briefly for a "pong" from a tab that already
 * holds the lock. No reply within the timeout means this tab claims it and
 * starts answering future pings itself.
 */
function acquireBroadcastChannelLock(): Promise<TabLock> {
  return new Promise((resolve) => {
    if (typeof BroadcastChannel === 'undefined') {
      // No cross-tab signalling available at all; don't block the guest.
      resolve({ acquired: true, release: () => {} });
      return;
    }

    let settled = false;
    let channel: BroadcastChannel;
    try {
      channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
    } catch {
      resolve({ acquired: true, release: () => {} });
      return;
    }

    const claim = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      channel.onmessage = (event: MessageEvent) => {
        if (event.data === 'ping') {
          try {
            channel.postMessage('pong');
          } catch {
            // Ignore: nothing to do if the channel is gone.
          }
        }
      };
      resolve({
        acquired: true,
        release: () => {
          try {
            channel.close();
          } catch {
            // Already closed.
          }
        },
      });
    };

    const timer = setTimeout(claim, BROADCAST_PING_TIMEOUT_MS);

    channel.onmessage = (event: MessageEvent) => {
      if (event.data === 'pong' && !settled) {
        settled = true;
        clearTimeout(timer);
        try {
          channel.close();
        } catch {
          // Already closed.
        }
        resolve({ acquired: false, release: () => {} });
      }
    };

    try {
      channel.postMessage('ping');
    } catch {
      claim();
    }
  });
}

/**
 * Acquires the "one game per phone" tab lock (ADR-121,
 * `SESSION_LIFECYCLE.md` §6 E9): Web Locks when available, else a
 * BroadcastChannel ping/pong fallback. Resolves `{ acquired: false }` when
 * another tab already holds it — the caller should show `sys.other_tab` and
 * do nothing further. The lock is held until `release()` is called.
 */
export function acquireTabLock(): Promise<TabLock> {
  if (hasWebLocks()) {
    return acquireWebLock();
  }
  return acquireBroadcastChannelLock();
}

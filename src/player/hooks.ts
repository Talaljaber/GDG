/**
 * Player-side data hooks: session state sync (realtime + refetch), presence
 * tracking, polling, a ticking clock and the tab lock. Fan-out rule
 * (ADR-112): realtime only for own session/rounds/own player row; boards and
 * player counts are polled.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchPlayer,
  fetchRounds,
  fetchSession,
  type PlayerRow,
  type RoundRow,
  type SessionRow,
} from '../lib/api';
import { acquireChannel, phonePresenceChannel, phoneSessionChannel } from '../lib/realtime';
import { acquireTabLock } from '../lib/storage';

/** Safety-net refetch of the state rows, in case a realtime event was missed. */
const STATE_SAFETY_REFETCH_MS = 15_000;

export interface SessionSync {
  session: SessionRow | null;
  rounds: RoundRow[];
  me: PlayerRow | null;
  /** True once a fetch succeeded and the own row isn't visible (not a member, or storage from another user). */
  notMember: boolean;
  /** Realtime channel subscribed. */
  live: boolean;
  refresh(): void;
}

export function useSessionSync(sessionId: string, playerRowId: string): SessionSync {
  const [session, setSession] = useState<SessionRow | null>(null);
  const [rounds, setRounds] = useState<RoundRow[]>([]);
  const [me, setMe] = useState<PlayerRow | null>(null);
  const [notMember, setNotMember] = useState(false);
  const [live, setLive] = useState(false);
  const inFlight = useRef(false);
  const again = useRef(false);
  const alive = useRef(true);

  const load = useCallback(async () => {
    if (inFlight.current) {
      again.current = true;
      return;
    }
    inFlight.current = true;
    try {
      const [s, r, p] = await Promise.all([
        fetchSession(sessionId),
        fetchRounds(sessionId),
        fetchPlayer(playerRowId),
      ]);
      if (!alive.current) return;
      setSession(s);
      setRounds(r);
      setMe(p);
      setNotMember(!s || !p);
    } catch {
      // Offline or transient: keep the last known state; the next event,
      // reconnect or safety refetch tries again.
    } finally {
      inFlight.current = false;
      if (again.current && alive.current) {
        again.current = false;
        void load();
      }
    }
  }, [sessionId, playerRowId]);

  useEffect(() => {
    alive.current = true;
    void load();
    const release = acquireChannel(phoneSessionChannel(sessionId, playerRowId), (event) => {
      if (event.type === 'status') {
        setLive(event.status === 'SUBSCRIBED');
        if (event.status === 'SUBSCRIBED') void load();
      } else if (event.type === 'change') {
        void load();
      }
    });
    const safety = window.setInterval(() => void load(), STATE_SAFETY_REFETCH_MS);
    const onWake = () => {
      if (document.visibilityState === 'visible') void load();
    };
    window.addEventListener('online', onWake);
    document.addEventListener('visibilitychange', onWake);
    return () => {
      alive.current = false;
      release();
      window.clearInterval(safety);
      window.removeEventListener('online', onWake);
      document.removeEventListener('visibilitychange', onWake);
    };
  }, [sessionId, playerRowId, load]);

  return { session, rounds, me, notMember, live, refresh: () => void load() };
}

/** Tracks this phone on `presence:<sid>` while `active` (ADR-103). */
export function usePresence(sessionId: string, playerId: string | null, active: boolean): void {
  useEffect(() => {
    if (!active || !playerId) return;
    return acquireChannel(phonePresenceChannel(sessionId, playerId), () => {});
  }, [sessionId, playerId, active]);
}

/**
 * Runs `fn` now and every `intervalMs` while `active`; the latest `fn` is
 * always used. Returns nothing: `fn` stores its own results.
 */
export function usePolling(fn: () => void | Promise<void>, intervalMs: number, active: boolean, deps: unknown[] = []) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    if (!active) return;
    void fnRef.current();
    const timer = window.setInterval(() => void fnRef.current(), intervalMs);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, active, ...deps]);
}

/** Date.now(), re-rendered every `intervalMs` while `active`. */
export function useNow(intervalMs: number, active = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs, active]);
  return now;
}

export type LockState = 'pending' | 'acquired' | 'denied';

/** Retries so a reload doesn't lose the race against the previous page releasing its lock. */
const LOCK_RETRIES = 4;
const LOCK_RETRY_MS = 250;

let lockPromise: Promise<boolean> | null = null;

/** One lock per page lifetime (never released: the page's unload releases it). */
function acquireOnce(): Promise<boolean> {
  if (!lockPromise) {
    lockPromise = (async () => {
      for (let i = 0; i < LOCK_RETRIES; i++) {
        const lock = await acquireTabLock();
        if (lock.acquired) return true;
        await new Promise((r) => setTimeout(r, LOCK_RETRY_MS));
      }
      return false;
    })();
  }
  return lockPromise;
}

/** ADR-121 / E9: a second tab on the same phone shows `sys.other_tab` and does nothing. */
export function useTabLock(): LockState {
  const [state, setState] = useState<LockState>('pending');
  useEffect(() => {
    let alive = true;
    void acquireOnce().then((ok) => {
      if (alive) setState(ok ? 'acquired' : 'denied');
    });
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

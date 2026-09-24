/**
 * Host view state and loop (`SESSION_LIFECYCLE.md` §3.1, ADR-104, ADR-112).
 * State is always reconstructed from the database (never from memory), so a
 * reload or a second tab lands on the right screen; every admin call is
 * idempotent and GD010 is ignored.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { BOARD_POLL_MS, ROUNDS_PER_SESSION } from '../config';
import {
  adminEndRound,
  adminOpenLobby,
  ApiError,
  countRoundScores,
  fetchJoinableSession,
  fetchPlayers,
  fetchRounds,
  fetchRunningSession,
  serverNow,
  type PlayerRow,
  type RoundEndReason,
  type RoundRow,
  type SessionRow,
} from '../lib/api';
import { acquireChannel, hostPresenceChannel, hostSessionChannel } from '../lib/realtime';
import { games } from '../games/registry';
import type { GameId } from '../games/types';
import { computeServerOffset, decideRoundAction, hostScreenFor, isIgnorableHostError, type HostScreen } from './hostLoop';
import { defaultLineup } from './lineup';

const LOOP_TICK_MS = 500;
const RELOAD_DEBOUNCE_MS = 250;
const SCORES_THROTTLE_MS = 500;
const RETRY_MS = 3000;

export const REGISTERED_GAMES = Object.keys(games) as GameId[];

export interface HostData {
  screen: HostScreen;
  session: SessionRow;
  rounds: RoundRow[];
  players: PlayerRow[];
}

function debounce(fn: () => void, ms: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const run = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn();
    }, ms);
  };
  run.cancel = () => {
    if (timer) clearTimeout(timer);
  };
  return run;
}

/**
 * Leading + trailing throttle: runs at once, then at most every `ms`, so a
 * burst of score inserts refreshes the board immediately and once more at
 * the end (keeps "on the big screen within 1 s", AC1.5).
 */
function throttle(fn: () => void, ms: number) {
  let last = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const run = () => {
    const wait = last + ms - Date.now();
    if (wait <= 0) {
      last = Date.now();
      fn();
    } else if (!timer) {
      timer = setTimeout(() => {
        timer = null;
        last = Date.now();
        fn();
      }, wait);
    }
  };
  run.cancel = () => {
    if (timer) clearTimeout(timer);
  };
  return run;
}

/** Reconstructs the host's state from the DB (§3.1 step 2). Opens a lobby when nothing is running or joinable. */
async function loadHostData(): Promise<HostData> {
  const running = await fetchRunningSession();
  let session = running;
  if (!session) {
    const joinable = await fetchJoinableSession();
    session = joinable?.status === 'lobby' ? joinable : await adminOpenLobby(defaultLineup(REGISTERED_GAMES, ROUNDS_PER_SESSION));
  }
  const [rounds, players] = await Promise.all([fetchRounds(session.id), fetchPlayers(session.id)]);
  return { screen: hostScreenFor(running), session, rounds, players };
}

export interface HostController {
  data: HostData | null;
  /** DB unreachable (last load failed). */
  dbDown: boolean;
  /** Realtime channel subscribed. */
  live: boolean;
  presentIds: Set<string>;
  /** Bumped on every score insert (debounced): boards refetch on change. */
  scoresVersion: number;
  /** Score rows for the playing round, or null until counted. */
  scoredCount: number | null;
  /** Server clock offset (server − local), or null until measured. */
  offset: number | null;
  reload(): void;
  endRound(reason: RoundEndReason): Promise<void>;
  /** Runs an admin call, ignoring GD010 (already advanced), then reloads. */
  act(fn: () => Promise<unknown>): Promise<void>;
}

export function useHost(): HostController {
  const [data, setData] = useState<HostData | null>(null);
  const [dbDown, setDbDown] = useState(false);
  const [live, setLive] = useState(true);
  const [presentIds, setPresentIds] = useState<Set<string>>(() => new Set());
  const [scoresVersion, setScoresVersion] = useState(0);
  /** Score rows counted for a specific round (never trusted for another round). */
  const [scored, setScored] = useState<{ roundId: string; count: number } | null>(null);
  const [offset, setOffset] = useState<number | null>(null);
  const alive = useRef(true);
  const loading = useRef(false);
  const loadAgain = useRef(false);

  const load = useCallback(async () => {
    if (loading.current) {
      loadAgain.current = true;
      return;
    }
    loading.current = true;
    try {
      const next = await loadHostData();
      if (!alive.current) return;
      setData(next);
      setDbDown(false);
    } catch (err) {
      if (!alive.current) return;
      const kind = err instanceof ApiError ? err.mapped.kind : 'unknown';
      if (kind === 'network' || kind === 'unknown') setDbDown(true);
      setTimeout(() => void load(), RETRY_MS);
    } finally {
      loading.current = false;
      if (loadAgain.current && alive.current) {
        loadAgain.current = false;
        void load();
      }
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void load();
    return () => {
      alive.current = false;
    };
  }, [load]);

  // ---- server clock offset, measured once (§3.1 step 1)
  useEffect(() => {
    let cancelled = false;
    const measure = async () => {
      try {
        const before = Date.now();
        const iso = await serverNow();
        const after = Date.now();
        if (!cancelled) setOffset(computeServerOffset(before, iso, after));
      } catch {
        if (!cancelled) setTimeout(() => void measure(), RETRY_MS);
      }
    };
    void measure();
    return () => {
      cancelled = true;
    };
  }, []);

  const sessionId = data?.session.id ?? null;
  const round = data?.rounds.find((r) => r.status === 'playing') ?? null;
  const roundId = round?.id ?? null;

  const refreshPlayers = useCallback(async () => {
    if (!sessionId) return;
    try {
      const players = await fetchPlayers(sessionId);
      if (alive.current) setData((d) => (d && d.session.id === sessionId ? { ...d, players } : d));
    } catch {
      // next event retries
    }
  }, [sessionId]);

  const refreshScores = useCallback(async () => {
    if (!roundId) return;
    try {
      const count = await countRoundScores(roundId);
      if (alive.current) setScored({ roundId, count });
    } catch {
      // next tick retries
    }
  }, [roundId]);

  // ---- realtime: session channel + presence (host subscribes to players/scores, ADR-112)
  useEffect(() => {
    if (!sessionId) return;
    const reload = debounce(() => void load(), RELOAD_DEBOUNCE_MS);
    const players = debounce(() => void refreshPlayers(), RELOAD_DEBOUNCE_MS);
    const scores = throttle(() => {
      setScoresVersion((v) => v + 1);
      void refreshScores();
    }, SCORES_THROTTLE_MS);
    const releaseSession = acquireChannel(hostSessionChannel(sessionId), (event) => {
      if (event.type === 'status') {
        // Only a lost/failed channel shows "Reconnecting…", not the first connect.
        setLive(event.status === 'SUBSCRIBED' || event.status === 'CONNECTING');
        if (event.status === 'SUBSCRIBED') reload();
        return;
      }
      if (event.type !== 'change') return;
      if (event.table === 'sessions' || event.table === 'rounds') reload();
      else if (event.table === 'players') players();
      else if (event.table === 'scores' || event.table === 'hidden_names') scores();
    });
    const releasePresence = acquireChannel(hostPresenceChannel(sessionId), (event) => {
      if (event.type === 'presence') setPresentIds(new Set(event.keys));
    });
    return () => {
      reload.cancel();
      players.cancel();
      scores.cancel();
      releaseSession();
      releasePresence();
    };
  }, [sessionId, load, refreshPlayers, refreshScores]);

  // ---- safety-net refresh of counts/boards while a round is live
  useEffect(() => {
    if (!roundId) return;
    void refreshScores();
    const timer = window.setInterval(() => {
      void refreshScores();
      setScoresVersion((v) => v + 1);
    }, BOARD_POLL_MS);
    return () => window.clearInterval(timer);
  }, [roundId, refreshScores]);

  const act = useCallback(
    async (fn: () => Promise<unknown>) => {
      try {
        await fn();
      } catch (err) {
        const kind = err instanceof ApiError ? err.mapped.kind : 'unknown';
        if (!isIgnorableHostError(kind)) {
          void load();
          throw err;
        }
      }
      await load();
    },
    [load],
  );

  const ending = useRef<string | null>(null);
  const endRound = useCallback(
    async (reason: RoundEndReason) => {
      if (!roundId || ending.current === roundId) return;
      ending.current = roundId;
      try {
        await act(() => adminEndRound(roundId, reason));
      } finally {
        ending.current = null;
      }
    },
    [roundId, act],
  );

  // ---- the loop: every 500 ms while a round is playing (§3.1 step 3)
  const joinedCount = data?.players.filter((p) => p.status === 'joined').length ?? 0;
  const scoredCount = scored && scored.roundId === roundId ? scored.count : null;
  const loopState = useRef({ round, joinedCount, scoredCount, offset, endRound });
  loopState.current = { round, joinedCount, scoredCount, offset, endRound };

  useEffect(() => {
    if (!roundId) return;
    const timer = window.setInterval(() => {
      const s = loopState.current;
      if (s.offset === null || !s.round || s.scoredCount === null) return;
      const decision = decideRoundAction({
        round: s.round,
        joinedCount: s.joinedCount,
        scoredCount: s.scoredCount,
        serverNowMs: Date.now() + s.offset,
      });
      if (decision.action === 'end') void s.endRound(decision.reason).catch(() => {});
    }, LOOP_TICK_MS);
    return () => window.clearInterval(timer);
  }, [roundId]);

  return {
    data,
    dbDown,
    live,
    presentIds,
    scoresVersion,
    scoredCount,
    offset,
    reload: () => void load(),
    endRound,
    act,
  };
}

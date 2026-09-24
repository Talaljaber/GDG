/**
 * Host view state and loop (`SESSION_LIFECYCLE.md` §3.1, ADR-104, ADR-112,
 * ADR-117). State is always reconstructed from the database (never from
 * memory), so a reload or a second tab lands on the right screen (E8, E23);
 * every admin call is idempotent and GD010 is ignored.
 *
 * The loop, per screen:
 * - round: every 500 ms, end the round with `all_finished` (score rows ≥
 *   joined players) or `time_cap` (128 s deadline in server time).
 * - intermission: round board 7 s → session total 5 s → "Next" 3 s, anchored
 *   on the round's `ended_at`, then `admin_start_round(next)`; after the last
 *   round, 7 s of round board, then results.
 * - results / day board: wait for Show day board and New session.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BOARD_POLL_MS, ROUNDS_PER_SESSION } from '../config';
import {
  adminEndRound,
  adminOpenLobby,
  adminStartRound,
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
import { acquireChannel, hostDayChannel, hostPendingChannel, hostPresenceChannel, hostSessionChannel } from '../lib/realtime';
import { games } from '../games/registry';
import type { GameId } from '../games/types';
import {
  computeServerOffset,
  decideRoundAction,
  hostScreenFor,
  isIgnorableHostError,
  latestDoneRound,
  nextUpcomingRound,
  type HostScreen,
} from './hostLoop';
import { intermissionState, type IntermissionState } from './schedule';
import { defaultLineup } from './lineup';

const LOOP_TICK_MS = 500;
const INTERMISSION_TICK_MS = 250;
const RELOAD_DEBOUNCE_MS = 250;
const SCORES_THROTTLE_MS = 500;
const RETRY_MS = 3000;

export const REGISTERED_GAMES = Object.keys(games) as GameId[];

export interface HostData {
  /** The running session (`playing`/`results`), or the lobby when nothing runs. */
  session: SessionRow;
  /** True when `session` is the running one. */
  running: boolean;
  rounds: RoundRow[];
  players: PlayerRow[];
  /** The joinable (`pending`) session while one runs: its code sits in the corner (ADR-015). */
  pending: SessionRow | null;
  /** Joined players of the pending session (late joiners). */
  pendingPlayers: number;
}

export interface IntermissionInfo {
  /** The round that just ended. */
  round: RoundRow;
  /** The round that starts next, or null after the last round. */
  next: RoundRow | null;
  state: IntermissionState;
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
 * the end (keeps "on the big screen within 1 s", AC1.5, AC2.9).
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
  const [running, joinable] = await Promise.all([fetchRunningSession(), fetchJoinableSession()]);
  let session: SessionRow;
  let pending: SessionRow | null = null;
  if (running) {
    session = running;
    pending = joinable;
  } else {
    // A pending session with nothing running is flipped to the lobby by admin_open_lobby.
    session =
      joinable?.status === 'lobby'
        ? joinable
        : await adminOpenLobby(defaultLineup(REGISTERED_GAMES, ROUNDS_PER_SESSION));
  }
  const [rounds, players, pendingPlayers] = await Promise.all([
    fetchRounds(session.id),
    fetchPlayers(session.id),
    pending ? fetchPlayers(pending.id) : Promise.resolve([] as PlayerRow[]),
  ]);
  return {
    session,
    running: !!running,
    rounds,
    players,
    pending,
    pendingPlayers: pendingPlayers.filter((p) => p.status === 'joined').length,
  };
}

export interface HostController {
  data: HostData | null;
  /** The screen to show (includes the final round board's 7 s). */
  screen: HostScreen | 'loading';
  /** DB unreachable (last load failed). */
  dbDown: boolean;
  /** Realtime channel subscribed. */
  live: boolean;
  presentIds: Set<string>;
  /** Bumped on every score insert or hidden-name change (throttled): boards refetch on change. */
  scoresVersion: number;
  /** Bumped on every score insert of the day while day boards show. */
  dayVersion: number;
  /** Score rows for the playing round, or null until counted. */
  scoredCount: number | null;
  /** Server clock offset (server − local), or null until measured. */
  offset: number | null;
  /** The intermission in progress (H3), or null. */
  intermission: IntermissionInfo | null;
  reload(): void;
  endRound(reason: RoundEndReason): Promise<void>;
  /** "Next round now": jump to the 3 s "Next" step (ADR-117). */
  skipIntermission(): void;
  /** Runs an admin call, ignoring GD010 (already advanced), then reloads. */
  act(fn: () => Promise<unknown>): Promise<void>;
}

export function useHost(): HostController {
  const [data, setData] = useState<HostData | null>(null);
  const [dbDown, setDbDown] = useState(false);
  const [live, setLive] = useState(true);
  const [presentIds, setPresentIds] = useState<Set<string>>(() => new Set());
  const [scoresVersion, setScoresVersion] = useState(0);
  const [dayVersion, setDayVersion] = useState(0);
  /** Score rows counted for a specific round (never trusted for another round). */
  const [scored, setScored] = useState<{ roundId: string; count: number } | null>(null);
  const [offset, setOffset] = useState<number | null>(null);
  const [tick, setTick] = useState(() => Date.now());
  const [skip, setSkip] = useState<{ roundId: string; at: number } | null>(null);
  const firstSeen = useRef(new Map<string, number>());
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
  const pendingId = data?.pending?.id ?? null;
  const eventDayId = data?.session.event_day_id ?? null;
  const round = data?.running ? (data.rounds.find((r) => r.status === 'playing') ?? null) : null;
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

  // ---- realtime: session channel + presence (host subscribes to players/scores/hidden names, ADR-112)
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
      else if (event.table === 'scores') scores();
      else if (event.table === 'hidden_names') {
        // Rare and urgent (AC2.9: gone from the big screen within 1 s): refetch every board now, unthrottled.
        setScoresVersion((v) => v + 1);
        setDayVersion((v) => v + 1);
      }
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

  // ---- the pending session (corner code, next-games picker, late joiners)
  useEffect(() => {
    if (!pendingId) return;
    const reload = debounce(() => void load(), RELOAD_DEBOUNCE_MS);
    const release = acquireChannel(hostPendingChannel(pendingId), (event) => {
      if (event.type === 'change') reload();
    });
    return () => {
      reload.cancel();
      release();
    };
  }, [pendingId, load]);

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

  // ---- the round loop: every 500 ms while a round is playing (§3.1 step 3)
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

  // ---- intermission (§3.1 step 4, ADR-117)
  const status = data?.running ? data.session.status : null;
  const lastDone = data?.running && !roundId ? latestDoneRound(data.rounds) : null;
  const next = data && lastDone ? nextUpcomingRound(data.rounds, lastDone) : null;
  const inBetween =
    !!lastDone?.ended_at &&
    ((status === 'playing' && !!next) || (status === 'results' && !data?.session.day_board_shown_at));

  // After the last round the tick stops once the final board is over (H4 stays still).
  const [finalOverFor, setFinalOverFor] = useState<string | null>(null);
  const ticking = inBetween && !(status === 'results' && !!lastDone && finalOverFor === lastDone.id);
  useEffect(() => {
    if (!ticking) return;
    setTick(Date.now());
    const timer = window.setInterval(() => setTick(Date.now()), INTERMISSION_TICK_MS);
    return () => window.clearInterval(timer);
  }, [ticking]);

  const intermission = useMemo<IntermissionInfo | null>(() => {
    if (!inBetween || !lastDone?.ended_at || offset === null) return null;
    const nowMs = tick + offset;
    let seen = firstSeen.current.get(lastDone.id);
    if (seen === undefined) {
      // The real current time, not `tick`: on a slow (re)load the first render can carry a
      // tick from mount, seconds old, which would swallow the late-resume "Next" heads-up.
      seen = Math.max(nowMs, Date.now() + offset);
      firstSeen.current.set(lastDone.id, seen);
    }
    const state = intermissionState({
      endedAtMs: Date.parse(lastDone.ended_at),
      nowMs,
      firstSeenMs: seen,
      skipAtMs: skip?.roundId === lastDone.id ? skip.at : null,
      isLast: status === 'results',
    });
    return { round: lastDone, next, state };
  }, [inBetween, lastDone, next, offset, tick, skip, status]);

  const finalDoneId = status === 'results' && intermission?.state.step === 'done' ? intermission.round.id : null;
  useEffect(() => {
    if (finalDoneId) setFinalOverFor(finalDoneId);
  }, [finalDoneId]);

  // Start the next round once the intermission is over (idempotent; GD010 ignored).
  const starting = useRef<string | null>(null);
  const startNextId = intermission?.state.step === 'done' && intermission.next ? intermission.next.id : null;
  useEffect(() => {
    if (!startNextId || starting.current === startNextId) return;
    starting.current = startNextId;
    void act(() => adminStartRound(startNextId)).catch(() => {
      starting.current = null; // retried on the next tick
    });
  }, [startNextId, act]);

  const skipIntermission = useCallback(() => {
    if (!lastDone || offset === null) return;
    setSkip({ roundId: lastDone.id, at: Date.now() + offset });
  }, [lastDone, offset]);

  // ---- day boards (H5): the day channel re-queries on every score of the day
  const dayBoardShown = status === 'results' && !!data?.session.day_board_shown_at;
  useEffect(() => {
    if (!dayBoardShown || !eventDayId) return;
    const bump = throttle(() => setDayVersion((v) => v + 1), SCORES_THROTTLE_MS);
    const release = acquireChannel(hostDayChannel(eventDayId), (event) => {
      if (event.type === 'change') bump();
    });
    return () => {
      bump.cancel();
      release();
    };
  }, [dayBoardShown, eventDayId]);

  const finalBoardShowing = status === 'results' && !!intermission && intermission.state.step !== 'done';
  const screen: HostScreen | 'loading' = !data
    ? 'loading'
    : hostScreenFor(data.running ? data.session : null, data.rounds, finalBoardShowing);
  // Between rounds before the offset is known, keep the intermission screen (it renders a spinner).

  return {
    data,
    screen,
    dbDown,
    live,
    presentIds,
    scoresVersion,
    dayVersion,
    scoredCount,
    offset,
    intermission,
    reload: () => void load(),
    endRound,
    skipIntermission,
    act,
  };
}

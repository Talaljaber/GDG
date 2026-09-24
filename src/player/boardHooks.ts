/**
 * Polled leaderboards for the phone (ADR-112: phones never subscribe to
 * scores; they poll the views every 3 s while a board is visible, and the
 * day board every 10 s with hidden names every 3 s, so a hidden name leaves
 * every phone board within 3 s, AC2.9).
 */
import { useEffect, useRef, useState } from 'react';
import { BOARD_POLL_MS, DAY_BOARD_POLL_MS, HIDDEN_POLL_MS } from '../config';
import {
  fetchDayBoard,
  fetchHiddenKeys,
  fetchPlayers,
  fetchRoundBoard,
  fetchSessionBoard,
  type DayBoardPage,
  type GameId,
  type PlayerRow,
} from '../lib/api';
import { mergeBoard, withoutHidden, type RankedRow } from '../lib/boards';
import { usePolling } from './hooks';

/** Round board (top 10 + own row), polled while `active`; `refreshKey` forces a refetch (e.g. after submit). */
export function useRoundBoard(roundId: string | null, playerRowId: string, active: boolean, refreshKey?: unknown) {
  const [rows, setRows] = useState<RankedRow[] | null>(null);
  usePolling(
    async () => {
      if (!roundId) return;
      try {
        const page = await fetchRoundBoard(roundId, playerRowId);
        setRows(mergeBoard(page.top, page.own, playerRowId));
      } catch {
        // keep last board
      }
    },
    BOARD_POLL_MS,
    active && !!roundId,
    [roundId, refreshKey],
  );
  return rows;
}

/** Session board (top 10 + own row) with the board's row count, polled while `active`. */
export function useSessionBoard(sessionId: string, playerRowId: string, active: boolean) {
  const [board, setBoard] = useState<{ rows: RankedRow[]; total: number } | null>(null);
  usePolling(
    async () => {
      try {
        const page = await fetchSessionBoard(sessionId, playerRowId);
        setBoard({ rows: mergeBoard(page.top, page.own, playerRowId), total: page.total });
      } catch {
        // keep last
      }
    },
    BOARD_POLL_MS,
    active,
    [sessionId],
  );
  return board;
}

/** Polls the session's player rows (tiny: one per guest) for the counts on P3 and P7. */
export function usePlayerRows(sessionId: string, active: boolean) {
  const [players, setPlayers] = useState<PlayerRow[] | null>(null);
  usePolling(
    async () => {
      try {
        setPlayers(await fetchPlayers(sessionId));
      } catch {
        // keep last value
      }
    },
    BOARD_POLL_MS,
    active,
    [sessionId],
  );
  return players;
}

/**
 * Day boards for the session's games (P10): polled every 10 s; hidden names
 * polled every 3 s and filtered at once, with a refetch when they change.
 */
export function useDayBoards(eventDayId: string, games: readonly GameId[], ownNameKey: string | null, active: boolean) {
  const [pages, setPages] = useState<Partial<Record<GameId, DayBoardPage>>>({});
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [version, setVersion] = useState(0);
  const lastHidden = useRef('');
  const gamesKey = games.join(',');

  usePolling(
    async () => {
      try {
        const keys = await fetchHiddenKeys();
        const sig = [...keys].sort().join('\u0000');
        if (sig !== lastHidden.current) {
          lastHidden.current = sig;
          setHidden(keys);
          setVersion((v) => v + 1);
        }
      } catch {
        // keep last
      }
    },
    HIDDEN_POLL_MS,
    active,
  );

  usePolling(
    async () => {
      try {
        const list = gamesKey.split(',') as GameId[];
        const res = await Promise.all(list.map((g) => fetchDayBoard(eventDayId, g, ownNameKey)));
        const next: Partial<Record<GameId, DayBoardPage>> = {};
        list.forEach((g, i) => (next[g] = res[i]));
        setPages(next);
      } catch {
        // keep last
      }
    },
    DAY_BOARD_POLL_MS,
    active,
    [eventDayId, gamesKey, ownNameKey, version],
  );

  // Rows as a board renders them; hidden keys are dropped even before the next refetch.
  const [rows, setRows] = useState<Partial<Record<GameId, RankedRow[]>>>({});
  useEffect(() => {
    const out: Partial<Record<GameId, RankedRow[]>> = {};
    for (const g of gamesKey.split(',') as GameId[]) {
      const page = pages[g];
      if (!page) continue;
      const top = withoutHidden(page.top, hidden);
      const ranked: RankedRow[] = top.map((r, i) => ({
        playerRowId: r.nameKey,
        name: r.name,
        displaySuffix: null, // day boards show names without the suffix (SCORING §6 rule 5)
        value: r.score,
        rank: i + 1,
        isOwn: !!ownNameKey && r.nameKey === ownNameKey,
        detached: false,
      }));
      if (page.own && !hidden.has(page.own.row.nameKey) && !ranked.some((r) => r.isOwn)) {
        ranked.push({
          playerRowId: page.own.row.nameKey,
          name: page.own.row.name,
          displaySuffix: null,
          value: page.own.row.score,
          rank: page.own.rank,
          isOwn: true,
          detached: true,
        });
      }
      out[g] = ranked;
    }
    setRows(out);
  }, [pages, hidden, gamesKey, ownNameKey]);

  return rows;
}

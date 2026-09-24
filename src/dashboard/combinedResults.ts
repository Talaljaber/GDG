/**
 * Pure helpers for D4 combined results: the best-per-name reduction (must
 * match `v_day_board`'s semantics exactly, `DATA_MODEL.md` §7 / `SCORING.md`
 * §5: one row per (event day, game, name key), highest score wins, ties by
 * earliest `created_at`), column sorting, and the guard for D6 "New event
 * day". No DOM, no Supabase: fully unit-testable.
 */
import { displayName } from '../lib/boards';
import type { GameId, SessionRow, SessionStatus, CombinedScoreRow } from './api';

export type SortKey = 'name' | 'game' | 'score' | 'time' | 'session';
export type SortDir = 'asc' | 'desc';

/** Default order (SCORING §5): `score desc, created_at asc`. */
export function defaultSort(rows: readonly CombinedScoreRow[]): CombinedScoreRow[] {
  return sortCombined(rows, 'score', 'desc');
}

/** Stable sort by one column; `score`/`time` are numeric/chronological, others are locale-aware string compares. */
export function sortCombined(rows: readonly CombinedScoreRow[], key: SortKey, dir: SortDir): CombinedScoreRow[] {
  const factor = dir === 'asc' ? 1 : -1;
  const withIndex = rows.map((row, index) => ({ row, index }));
  withIndex.sort((a, b) => {
    const cmp = compareByKey(a.row, b.row, key);
    if (cmp !== 0) return cmp * factor;
    // Stable, deterministic tie-break: earliest submission first, then original order.
    const time = a.row.createdAt.localeCompare(b.row.createdAt);
    if (time !== 0) return time;
    return a.index - b.index;
  });
  return withIndex.map((w) => w.row);
}

function compareByKey(a: CombinedScoreRow, b: CombinedScoreRow, key: SortKey): number {
  switch (key) {
    case 'name':
      return a.name.localeCompare(b.name);
    case 'game':
      return a.game.localeCompare(b.game);
    case 'score':
      return a.score - b.score;
    case 'time':
      return a.createdAt.localeCompare(b.createdAt);
    case 'session':
      return (a.sessionCode ?? '').localeCompare(b.sessionCode ?? '');
    default:
      return 0;
  }
}

/**
 * One row per (event day, game, name key): the highest score, ties broken by
 * the earliest `created_at` — the exact rule `v_day_board` uses
 * (`distinct on (event_day_id, game, name_key) order by … score desc,
 * created_at asc`). When every input row shares one event day (the normal
 * "current day" filter) this equals `v_day_board` for that day (AC4.2).
 */
export function bestPerName(rows: readonly CombinedScoreRow[]): CombinedScoreRow[] {
  const best = new Map<string, CombinedScoreRow>();
  for (const row of rows) {
    const groupKey = `${row.eventDayId}\u0000${row.game}\u0000${row.nameKey}`;
    const current = best.get(groupKey);
    if (!current || isBetter(row, current)) {
      best.set(groupKey, row);
    }
  }
  return Array.from(best.values());
}

function isBetter(candidate: CombinedScoreRow, current: CombinedScoreRow): boolean {
  if (candidate.score !== current.score) return candidate.score > current.score;
  return candidate.createdAt < current.createdAt;
}

/** D6: a new event day can't start while a session is `playing` (mirrors `admin_start_new_day`'s GD010). */
export function isNewDayBlocked(playingSession: SessionRow | null): boolean {
  return playingSession !== null;
}

/** Locale date+time for a CSV export cell (`toLocaleString`-based, Western digits per ADR-123 come from formatNumber elsewhere; this is raw export text, not on-screen UI copy). */
export function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
}

/** Turns visible rows into CSV cells (exactly what D4 shows, AC4.3); `gameName` maps a game id to its display name. */
export function rowsToCsv(
  rows: readonly CombinedScoreRow[],
  gameName: (g: GameId) => string,
): { headers: string[]; body: string[][] } {
  return {
    headers: ['name', 'game', 'score', 'time', 'session'],
    body: rows.map((r) => [
      displayName(r.name, r.displaySuffix),
      gameName(r.game),
      String(r.score),
      formatTimestamp(r.createdAt),
      r.sessionCode ?? '',
    ]),
  };
}

export interface SessionSummary {
  session: SessionRow;
  playersJoined: number;
  winnerName: string | null;
}

/** D2 status badge key (`status.*`, COPY §7), from a session row. */
export function statusKey(status: SessionStatus): string {
  return `status.${status}`;
}

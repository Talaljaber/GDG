/**
 * Pure leaderboard helpers shared by the phone and the big screen.
 * Ordering is done by the view queries (`SCORING.md` §5); this file only
 * merges the "top 10 + own row" responses (`DATA_MODEL.md` §8) into the
 * rows a board renders.
 */

export interface BoardRow {
  playerRowId: string;
  name: string;
  displaySuffix: number | null;
  /** Round score (round board) or session total (session board). */
  value: number;
}

export interface RankedRow extends BoardRow {
  rank: number;
  isOwn: boolean;
  /** True for the own row appended below the top rows (it isn't in the top N). */
  detached: boolean;
}

/** "Sara" / "Sara 2": the display name with its duplicate suffix (SCORING §6, E11). */
export function displayName(name: string, displaySuffix: number | null | undefined): string {
  return displaySuffix && displaySuffix >= 2 ? `${name} ${displaySuffix}` : name;
}

/**
 * Merges the top rows (already in board order) with the caller's own row.
 * Top rows get ranks 1..n; the own row is flagged in place when it is in the
 * top, or appended (detached) with its server-computed rank when lower.
 */
export function mergeBoard(
  top: readonly BoardRow[],
  own: { row: BoardRow; rank: number } | null,
  ownPlayerRowId: string | null | undefined,
): RankedRow[] {
  const rows: RankedRow[] = top.map((row, i) => ({
    ...row,
    rank: i + 1,
    isOwn: !!ownPlayerRowId && row.playerRowId === ownPlayerRowId,
    detached: false,
  }));
  if (own && !rows.some((r) => r.playerRowId === own.row.playerRowId)) {
    rows.push({ ...own.row, rank: own.rank, isOwn: true, detached: true });
  }
  return rows;
}

/** The caller's rank from a merged board, or null if they have no row. */
export function ownRank(rows: readonly RankedRow[]): number | null {
  return rows.find((r) => r.isOwn)?.rank ?? null;
}

// ------------------------------------------------------------------ ordering (SCORING §5)
//
// The views are ordered by the queries that read them; these comparators are
// the same rules on the client, used to keep a board's order stable after a
// merge and to unit-test the tie-breaks. ISO timestamps from PostgREST share
// one format, so they are compared as parsed epoch ms.

function ms(iso: string): number {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
}

export interface RoundOrderRow {
  score: number;
  createdAt: string;
}

/** Round board: `score desc`, then `created_at asc` (earlier wins). */
export function compareRoundRows(a: RoundOrderRow, b: RoundOrderRow): number {
  return b.score - a.score || ms(a.createdAt) - ms(b.createdAt);
}

export interface SessionOrderRow {
  total: number;
  totalDurationMs: number;
  joinedAt: string;
}

/** Session board: `total desc`, then `total_duration_ms asc` (faster overall), then `joined_at asc`. */
export function compareSessionRows(a: SessionOrderRow, b: SessionOrderRow): number {
  return b.total - a.total || a.totalDurationMs - b.totalDurationMs || ms(a.joinedAt) - ms(b.joinedAt);
}

export interface DayOrderRow {
  score: number;
  achievedAt: string;
}

/** Day board: `score desc`, then `achieved_at asc` (the earlier of two equal bests wins, ADR-105). */
export function compareDayRows(a: DayOrderRow, b: DayOrderRow): number {
  return b.score - a.score || ms(a.achievedAt) - ms(b.achievedAt);
}

export interface ScoreForTotals {
  playerRowId: string;
  name: string;
  displaySuffix: number | null;
  score: number;
  durationMs: number;
  joinedAt: string;
}

export interface SessionTotal extends SessionOrderRow {
  playerRowId: string;
  name: string;
  displaySuffix: number | null;
  roundsScored: number;
}

/**
 * Session totals from round scores, in board order: the client mirror of
 * `v_session_board` (0–3000; a missing round counts 0 in the sum).
 */
export function sessionTotals(scores: readonly ScoreForTotals[]): SessionTotal[] {
  const byPlayer = new Map<string, SessionTotal>();
  for (const s of scores) {
    const cur = byPlayer.get(s.playerRowId);
    if (cur) {
      cur.total += s.score;
      cur.totalDurationMs += s.durationMs;
      cur.roundsScored += 1;
      if (ms(s.joinedAt) < ms(cur.joinedAt)) cur.joinedAt = s.joinedAt;
    } else {
      byPlayer.set(s.playerRowId, {
        playerRowId: s.playerRowId,
        name: s.name,
        displaySuffix: s.displaySuffix,
        total: s.score,
        totalDurationMs: s.durationMs,
        joinedAt: s.joinedAt,
        roundsScored: 1,
      });
    }
  }
  return [...byPlayer.values()].sort(compareSessionRows);
}

export interface ScoreForDay {
  game: string;
  nameKey: string;
  name: string;
  score: number;
  createdAt: string;
}

export interface DayBest {
  game: string;
  nameKey: string;
  /** The name as typed for the best score, without the display suffix (SCORING §6 rule 5). */
  name: string;
  score: number;
  achievedAt: string;
}

/**
 * Best per name key per game (ADR-105): the client mirror of `v_day_board`,
 * in board order per game. Two guests who typed "Sara" share one row.
 */
export function bestPerName(scores: readonly ScoreForDay[], hiddenKeys: ReadonlySet<string> = new Set()): DayBest[] {
  const best = new Map<string, DayBest>();
  for (const s of scores) {
    if (hiddenKeys.has(s.nameKey)) continue;
    const key = `${s.game}\u0000${s.nameKey}`;
    const cand: DayBest = { game: s.game, nameKey: s.nameKey, name: s.name, score: s.score, achievedAt: s.createdAt };
    const cur = best.get(key);
    if (!cur || compareDayRows(cand, cur) < 0) best.set(key, cand);
  }
  return [...best.values()].sort((a, b) => (a.game < b.game ? -1 : a.game > b.game ? 1 : compareDayRows(a, b)));
}

/**
 * Competition ranks (1, 2, 2, 4) for rows already in board order: a row
 * shares the previous rank only when `tied` says every tie-break is equal
 * (SCORING §5; in practice created_at always differs).
 */
export function competitionRanks<T>(rows: readonly T[], tied: (a: T, b: T) => boolean): number[] {
  const ranks: number[] = [];
  rows.forEach((row, i) => {
    ranks.push(i > 0 && tied(rows[i - 1], row) ? ranks[i - 1] : i + 1);
  });
  return ranks;
}

/** Drops rows whose name key is hidden (ADR-115); used where a board carries name keys (day boards). */
export function withoutHidden<T extends { nameKey: string }>(rows: readonly T[], hiddenKeys: ReadonlySet<string>): T[] {
  return rows.filter((r) => !hiddenKeys.has(r.nameKey));
}

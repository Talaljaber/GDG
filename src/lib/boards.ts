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

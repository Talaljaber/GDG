/**
 * A big-screen board as a table (DESIGN_SYSTEM §0.2): rank (muted, 1–3 in
 * ink), name in <bdi>, score at the inline end; 1 px row separators, no
 * zebra; the #1 row on the amber tint with an amber inline-start rule. At
 * most 10 rows (the boards are fetched top 10). `highlightIds` marks rows
 * that came from this session (H5).
 *
 * Effects (DESIGN_SYSTEM §6.2) as in the shared Leaderboard: rows assemble
 * from shards when the board appears and when a row first appears
 * (`reveal`), and `celebrateLeader` plays the celebrate shatter on the #1
 * row when a new player takes #1 (H2).
 *
 * Memoised: the screens around it re-render on the host's state changes, and
 * the boards keep their row arrays when a refetch returns the same rows
 * (`lib/equal.ts`), so an unchanged board is skipped (`TESTING.md` §9).
 */
import { memo } from 'react';
import { formatNumber, useT } from '../i18n';
import { displayName, type RankedRow } from '../lib/boards';
import { useRevealRows } from '../components/useRevealRows';
import styles from './host.module.css';

export const BoardTable = memo(function BoardTable({
  rows,
  testId,
  highlightIds,
  reveal = true,
  celebrateLeader = false,
}: {
  rows: readonly RankedRow[];
  testId?: string;
  highlightIds?: ReadonlySet<string>;
  reveal?: boolean;
  celebrateLeader?: boolean;
}) {
  const t = useT();
  const bodyRef = useRevealRows<HTMLTableSectionElement>(
    rows.map((r) => r.playerRowId),
    { enabled: reveal, leaderKey: celebrateLeader ? (rows[0]?.playerRowId ?? null) : undefined },
  );
  return (
    <table className={styles.table} data-testid={testId}>
      <thead>
        <tr>
          <th scope="col" className={styles.colRank}>
            {t('host.board.rank')}
          </th>
          <th scope="col" className={styles.colName}>
            {t('host.board.player')}
          </th>
          <th scope="col" className={styles.colScore}>
            {t('host.board.score')}
          </th>
        </tr>
      </thead>
      <tbody ref={bodyRef}>
        {rows.map((r) => {
          const highlighted = highlightIds?.has(r.playerRowId) ?? false;
          return (
            <tr
              key={r.playerRowId}
              className={[
                styles.row,
                r.rank === 1 ? styles.rowFirst : '',
                r.rank <= 3 ? styles.rowPodium : '',
                highlighted ? styles.rowHighlight : '',
              ].join(' ')}
              data-reveal-key={r.playerRowId}
              data-testid="board-row"
              data-own={r.isOwn ? 'true' : undefined}
              data-highlight={highlighted ? 'true' : undefined}
            >
              <td className={styles.colRank}>{formatNumber(r.rank)}</td>
              <td className={styles.colName}>
                <bdi data-testid="board-name">{displayName(r.name, r.displaySuffix)}</bdi>
              </td>
              <td className={styles.colScore} data-testid="board-score">
                {formatNumber(r.value)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
});

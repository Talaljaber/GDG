import { formatNumber } from '../i18n';
import { displayName, type RankedRow } from '../lib/boards';
import styles from './ui.module.css';

/**
 * A leaderboard: rank, name (in <bdi>, DESIGN_SYSTEM §8), score. The own row
 * is outlined; #1 gets the amber tint. `projector` switches to the big-screen
 * scale (max 10 rows, DESIGN_SYSTEM §3.2).
 */
export function Leaderboard({
  rows,
  projector = false,
  testId,
}: {
  rows: readonly RankedRow[];
  projector?: boolean;
  testId?: string;
}) {
  return (
    <ol className={`${styles.board} ${projector ? styles.boardProj : ''}`} data-testid={testId}>
      {rows.map((r) => (
        <li
          key={r.playerRowId}
          className={[
            styles.row,
            r.rank === 1 ? styles.rowFirst : '',
            r.isOwn ? styles.rowOwn : '',
            r.detached ? styles.rowDetached : '',
          ].join(' ')}
          data-testid="board-row"
          data-own={r.isOwn ? 'true' : undefined}
        >
          <span className={styles.rank}>{formatNumber(r.rank)}</span>
          <span className={styles.name}>
            <bdi data-testid="board-name">{displayName(r.name, r.displaySuffix)}</bdi>
          </span>
          <span className={styles.score} data-testid="board-score">
            {formatNumber(r.value)}
          </span>
        </li>
      ))}
    </ol>
  );
}

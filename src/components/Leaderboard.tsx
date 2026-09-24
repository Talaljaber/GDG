import { formatNumber } from '../i18n';
import { displayName, type RankedRow } from '../lib/boards';
import { useRevealRows } from './useRevealRows';
import styles from './ui.module.css';

/**
 * A leaderboard: rank, name (in <bdi>, DESIGN_SYSTEM §8), score. The own row
 * is outlined; #1 gets the amber tint. `projector` switches to the big-screen
 * scale (max 10 rows, DESIGN_SYSTEM §3.2). `highlightIds` marks rows that
 * entered or rose this session (H5).
 *
 * Effects (DESIGN_SYSTEM §6.2, via RevealIn.tsx), big screen only by default:
 * `reveal` (default = `projector`) assembles rows from shards when the board
 * appears and when a row first appears; `celebrateLeader` plays the
 * celebrate shatter on the #1 row whenever a new player takes #1 (H2).
 * Phones keep plain boards (lighter on low-end phones).
 */
export function Leaderboard({
  rows,
  projector = false,
  testId,
  highlightIds,
  reveal = projector,
  celebrateLeader = false,
}: {
  rows: readonly RankedRow[];
  projector?: boolean;
  testId?: string;
  highlightIds?: ReadonlySet<string>;
  reveal?: boolean;
  celebrateLeader?: boolean;
}) {
  const listRef = useRevealRows<HTMLOListElement>(
    rows.map((r) => r.playerRowId),
    { enabled: reveal, leaderKey: celebrateLeader ? (rows[0]?.playerRowId ?? null) : undefined },
  );
  return (
    <ol ref={listRef} className={`${styles.board} ${projector ? styles.boardProj : ''}`} data-testid={testId}>
      {rows.map((r) => {
        const highlighted = highlightIds?.has(r.playerRowId) ?? false;
        return (
          <li
            key={r.playerRowId}
            className={[
              styles.row,
              r.rank === 1 ? styles.rowFirst : '',
              r.isOwn ? styles.rowOwn : '',
              r.detached ? styles.rowDetached : '',
              highlighted ? styles.rowHighlight : '',
            ].join(' ')}
            data-reveal-key={r.playerRowId}
            data-testid="board-row"
            data-own={r.isOwn ? 'true' : undefined}
            data-highlight={highlighted ? 'true' : undefined}
          >
            <span className={styles.rank}>{formatNumber(r.rank)}</span>
            <span className={styles.name}>
              <bdi data-testid="board-name">{displayName(r.name, r.displaySuffix)}</bdi>
            </span>
            <span className={styles.score} data-testid="board-score">
              {formatNumber(r.value)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

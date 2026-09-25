import { memo } from 'react';
import { formatNumber } from '../i18n';
import { displayName, type RankedRow } from '../lib/boards';
import { useRevealRows } from './useRevealRows';
import styles from './ui.module.css';

/**
 * A leaderboard, drawn as a table (DESIGN_SYSTEM §0.2, §4): rank (muted, 1–3
 * in ink), name (in <bdi>, §8), score at the inline end, 1 px separators. #1
 * gets the amber tint, an amber inline-start rule and 700; the own row is
 * outlined in blue. It draws its own panel (don't wrap it in `.panel`).
 * `projector` switches to the big-screen scale (max 10 rows, §3.2).
 * `highlightIds` marks rows that entered or rose this session (H5).
 *
 * Effects (DESIGN_SYSTEM §6.2, via RevealIn.tsx), big screen only by default:
 * `reveal` (default = `projector`) assembles rows from shards when the board
 * appears and when a row first appears; `celebrateLeader` plays the
 * celebrate shatter on the #1 row whenever a new player takes #1 (H2).
 * Phones keep plain boards (lighter on low-end phones).
 *
 * Memoised: the polled boards keep their row arrays when nothing changed
 * (`lib/equal.ts`), so a screen re-rendering for other reasons (the "x/y
 * done" count, a state refetch) skips an unchanged board (`TESTING.md` §9).
 */
export const Leaderboard = memo(function Leaderboard({
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
            <span className={`${styles.rank} ${r.rank <= 3 ? styles.rankTop : ''}`}>{formatNumber(r.rank)}</span>
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
});

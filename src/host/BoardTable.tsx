/**
 * The big-screen board (host v3 "Stage and Rail", plan §2.1 principle 5, §4.3–§4.6,
 * ADR-135): a broadcast table of rank · name · score with exactly `slots` (10) fixed
 * rows, so it fills the stage the same way with 0, 3 or 10 scores. Filled rows come
 * first (rank muted, 1–3 in ink; name in <bdi>; tabular score at the inline end; 1 px
 * rules); the rest are calm empty slots (`data-slot="empty"`, lighter rule, no text),
 * with `emptyText` over them while there are no rows. The #1 row is on the amber tint
 * with the amber inline-start rule (`.first`); rows from this session (`highlightIds`,
 * H5) get the blue "live" rule only (`.highlight`). Column heads exist for screen
 * readers but are visually hidden, except the extra `columns` and the total when
 * `columns` are given (H4's per-round scores).
 *
 * Motion (no shards on rows any more):
 * - rows cascade in on mount and new rows fade + settle in (`--dur-enter`, `--stagger-row`);
 * - a reorder FLIPs (`--dur-reorder`) and rows that climbed pulse once (`--dur-pulse`),
 *   `celebrateLeader` pulses a new #1 the same way (flip.ts);
 * - with `countUp`, scores count up from the value they showed (0 on mount) and a row
 *   whose rank changed shows a ▲/▼ delta that fades after 1 s (countUp.ts).
 * All of it runs on refs (WAAPI / rAF), never through React state. `reveal={false}`
 * (the day-board merge owns the rows) and reduced motion: no entry, FLIP, pulse or
 * count-up; final values at once.
 *
 * Memoised: the screens around it re-render on the host's state changes, and the
 * boards keep their row arrays when a refetch returns the same rows (`lib/equal.ts`),
 * so an unchanged board is skipped (`TESTING.md` §9). Pass a stable `columns` array.
 */
import { memo, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import { formatNumber, useT } from '../i18n';
import { displayName, type RankedRow } from '../lib/boards';
import { useReducedMotion } from '../effects/shatter';
import { useCountUp } from './countUp';
import { FLIP_KEY_ATTR, motionReducedNow, pulseElement, tokenMs, useFlipRows } from './flip';
import styles from './board.module.css';

export interface BoardColumn {
  key: string;
  head: ReactNode;
  value(row: RankedRow): ReactNode;
  className?: string;
}

export interface BoardTableProps {
  rows: readonly RankedRow[];
  testId?: string;
  /** Rows from this session (H5): the live rule. */
  highlightIds?: ReadonlySet<string>;
  /** false: no entry/FLIP/count-up (the day-board merge owns the rows). */
  reveal?: boolean;
  /** Pulse the #1 row when a new player takes #1 (H2). */
  celebrateLeader?: boolean;
  /** Fixed number of rows drawn (filled + empty). */
  slots?: number;
  /** Scores count up; rank changes show a delta glyph. */
  countUp?: boolean;
  /** Extra numeric columns between the name and the total (H4 round scores); heads visible. */
  columns?: readonly BoardColumn[];
  /** Shown over the empty slots while there are no rows. */
  emptyText?: string;
}

const EMPTY: readonly BoardColumn[] = [];

/** Bumped for every new set of deltas, so each delta glyph replays its fade. */
let deltaSeq = 0;

const ScoreCell = memo(function ScoreCell({
  value,
  countUp,
  duration,
  delay,
}: {
  value: number;
  countUp: boolean;
  duration: number;
  delay: number;
}) {
  const ref = useRef<HTMLTableCellElement>(null);
  useCountUp(ref, value, { duration, delay, enabled: countUp });
  return (
    <td ref={ref} className={styles.score} data-testid="board-score">
      {formatNumber(value)}
    </td>
  );
});

function DeltaGlyph({ delta }: { delta: number }) {
  const t = useT();
  const up = delta > 0;
  return (
    <bdi
      dir="ltr"
      className={styles.delta}
      role="img"
      aria-label={t('host.board.delta', { n: Math.abs(delta) })}
      data-delta={up ? 'up' : 'down'}
    >
      <svg className={`${styles.deltaIcon} ${up ? '' : styles.deltaDown}`} viewBox="0 0 12 12" aria-hidden="true" focusable="false">
        <path d="M2.5 8 6 4.5 9.5 8" />
      </svg>
      {formatNumber(Math.abs(delta))}
    </bdi>
  );
}

export const BoardTable = memo(function BoardTable({
  rows,
  testId,
  highlightIds,
  reveal = true,
  celebrateLeader = false,
  slots = 10,
  countUp = false,
  columns = EMPTY,
  emptyText,
}: BoardTableProps) {
  const t = useT();
  const reduced = useReducedMotion();
  const motion = reveal && !reduced;
  const counting = countUp && motion;
  const bodyRef = useRef<HTMLTableSectionElement>(null);
  const keys = useMemo(() => rows.map((r) => r.playerRowId), [rows]);
  const stagger = tokenMs('--stagger-row', 60);
  const countMs = tokenMs('--dur-countup', 1200);

  useFlipRows(bodyRef, keys, {
    duration: tokenMs('--dur-reorder', 400),
    pulseClass: styles.pulse,
    enabled: motion,
    enter: { duration: tokenMs('--dur-enter', 240), stagger },
  });

  // Rank deltas (count-up boards): each row's rank change since the last committed rows.
  const committedRanks = useRef<Map<string, number> | null>(null);
  const deltas = useMemo(() => {
    const prev = committedRanks.current;
    const map = new Map<string, number>();
    if (prev) {
      for (const r of rows) {
        const before = prev.get(r.playerRowId);
        if (before !== undefined && before !== r.rank) map.set(r.playerRowId, before - r.rank);
      }
    }
    deltaSeq += map.size > 0 ? 1 : 0;
    return { map, seq: deltaSeq };
  }, [rows]);
  useLayoutEffect(() => {
    committedRanks.current = new Map(rows.map((r) => [r.playerRowId, r.rank]));
  }, [rows]);

  // A new #1 (H2): the same one-shot pulse as a climbing row (no celebrate shatter).
  const leaderKey = rows[0]?.rank === 1 ? rows[0].playerRowId : null;
  const leader = useRef<string | null | undefined>(undefined);
  useLayoutEffect(() => {
    if (!celebrateLeader) return;
    const before = leader.current;
    leader.current = leaderKey;
    if (before === undefined || !leaderKey || leaderKey === before || !motion || motionReducedNow()) return;
    const el = Array.from(bodyRef.current?.querySelectorAll(`[${FLIP_KEY_ATTR}]`) ?? []).find(
      (e) => e.getAttribute(FLIP_KEY_ATTR) === leaderKey,
    );
    const id = pulseElement(el, styles.pulse, tokenMs('--dur-pulse', 500));
    return () => {
      if (id !== undefined) window.clearTimeout(id);
    };
    // Only a change of leader pulses; `motion` is read when it happens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaderKey, celebrateLeader]);

  const withColumns = columns.length > 0;
  const empty = Math.max(0, slots - rows.length);
  const span = 3 + columns.length;

  return (
    <div className={styles.board}>
      <table
        className={`${styles.table} ${withColumns ? styles.withColumns : ''}`}
        data-testid={testId}
        data-rows={rows.length}
      >
        <colgroup>
          <col className={styles.colRank} />
          <col />
          {columns.map((c) => (
            <col key={c.key} className={styles.colExtra} />
          ))}
          <col className={styles.colScore} />
        </colgroup>
        <thead className={withColumns ? styles.heads : styles.headsHidden}>
          <tr>
            <th scope="col" className={styles.rank}>
              <span className="visually-hidden">{t('host.board.rank')}</span>
            </th>
            <th scope="col" className={styles.name}>
              <span className="visually-hidden">{t('host.board.player')}</span>
            </th>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={`${styles.extra} ${c.className ?? ''}`} data-column={c.key}>
                {c.head}
              </th>
            ))}
            <th scope="col" className={styles.score}>
              {withColumns ? t('host.results.total') : <span className="visually-hidden">{t('host.board.score')}</span>}
            </th>
          </tr>
        </thead>
        <tbody ref={bodyRef}>
          {rows.map((r, i) => {
            const highlighted = highlightIds?.has(r.playerRowId) ?? false;
            const delta = counting ? deltas.map.get(r.playerRowId) : undefined;
            return (
              <tr
                key={r.playerRowId}
                className={[
                  styles.row,
                  r.rank <= 3 ? styles.podium : '',
                  highlighted ? styles.highlight : '',
                  r.rank === 1 ? styles.first : '',
                ].join(' ')}
                data-reveal-key={r.playerRowId}
                data-testid="board-row"
                data-rank={r.rank}
                data-own={r.isOwn ? 'true' : undefined}
                data-highlight={highlighted ? 'true' : undefined}
              >
                <td className={styles.rank}>{formatNumber(r.rank)}</td>
                <td className={styles.name}>
                  <bdi data-testid="board-name">{displayName(r.name, r.displaySuffix)}</bdi>
                  {delta ? <DeltaGlyph key={deltas.seq} delta={delta} /> : null}
                </td>
                {columns.map((c) => (
                  <td key={c.key} className={`${styles.extra} ${c.className ?? ''}`} data-column={c.key}>
                    {c.value(r)}
                  </td>
                ))}
                <ScoreCell value={r.value} countUp={counting} duration={countMs} delay={i * stagger} />
              </tr>
            );
          })}
          {Array.from({ length: empty }, (_, i) => (
            <tr key={`slot-${i}`} className={styles.slot} data-slot="empty" aria-hidden="true">
              <td colSpan={span} />
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && emptyText ? <p className={styles.empty}>{emptyText}</p> : null}
    </div>
  );
});

/**
 * P8 intermission mirror and P10 day board (`SCREENS.md` §1.2), v2 layout
 * (DESIGN_SYSTEM §0.3). Containers poll; the `…View`s are pure (dev preview).
 *
 * P8 follows the big screen between rounds (ADR-117): round board 7 s →
 * total so far 5 s → "Next: <game>" until the next round starts (its 3-2-1
 * runs on P5). The own row is highlighted in both boards. P10 appears once
 * the host taps Show day board: one tab per game of the session, top 10
 * best per name + the own row.
 */
import { useState } from 'react';
import { useT } from '../i18n';
import type { GameId, PlayerRow, RoundRow, SessionRow } from '../lib/api';
import type { RankedRow } from '../lib/boards';
import { Leaderboard } from '../components/Leaderboard';
import styles from './player.module.css';
import { useDayBoards, useRoundBoard, useSessionBoard } from './boardHooks';
import type { PhoneIntermissionStep } from './playerFlow';
import { ChevronFrame, Eyebrow, ScreenHeader } from './chrome';
import { ctaClass } from './screens';

export function IntermissionScreen({
  session,
  round,
  next,
  step,
  playerRowId,
  totalRounds,
}: {
  session: SessionRow;
  round: RoundRow;
  next: RoundRow;
  step: PhoneIntermissionStep;
  playerRowId: string;
  totalRounds: number;
}) {
  const roundBoard = useRoundBoard(round.id, playerRowId, step === 'round_board');
  const totals = useSessionBoard(session.id, playerRowId, step === 'session_total');
  return (
    <IntermissionView
      round={round}
      next={next}
      step={step}
      totalRounds={totalRounds}
      roundBoard={roundBoard}
      totals={totals ? totals.rows : null}
    />
  );
}

type RoundInfo = Pick<RoundRow, 'game' | 'round_no'>;

export function IntermissionView({
  round,
  next,
  step,
  totalRounds,
  roundBoard,
  totals,
}: {
  round: RoundInfo;
  next: RoundInfo;
  step: PhoneIntermissionStep;
  totalRounds: number;
  /** Boards for the step on screen; null until the first poll. */
  roundBoard: readonly RankedRow[] | null;
  totals: readonly RankedRow[] | null;
}) {
  const t = useT();
  return (
    <section
      className={`${styles.screen} ${step === 'next_intro' ? styles.centerScreen : ''}`}
      data-testid="screen-intermission"
      data-step={step}
    >
      {step === 'next_intro' ? (
        <div className={styles.introBlock} data-testid="intermission-next">
          <Eyebrow>{t('round.label', { n: next.round_no, total: totalRounds })}</Eyebrow>
          <ChevronFrame size="title">
            <h1 className={styles.gameName}>{t('intermission.next', { game: t(`game.${next.game}.name`) })}</h1>
          </ChevronFrame>
          <p className={styles.lead}>{t(`game.${next.game}.pitch`)}</p>
          <p className={styles.caption}>{t('round.get_ready')}</p>
        </div>
      ) : step === 'session_total' ? (
        <>
          <ScreenHeader
            eyebrow={t('round.label', { n: round.round_no, total: totalRounds })}
            title={t('intermission.session_total')}
          />
          {totals && totals.length > 0 ? (
            <Leaderboard rows={totals} testId="intermission-total-board" />
          ) : totals ? (
            <p className={styles.empty}>{t('results.no_scores')}</p>
          ) : null}
        </>
      ) : (
        <>
          <ScreenHeader
            eyebrow={t(`game.${round.game}.name`)}
            title={t('intermission.round_board', { n: round.round_no })}
          />
          {roundBoard && roundBoard.length > 0 ? (
            <Leaderboard rows={roundBoard} testId="intermission-round-board" />
          ) : roundBoard ? (
            <p className={styles.empty}>{t('round.no_scores')}</p>
          ) : null}
        </>
      )}
    </section>
  );
}

export function DayBoardScreen({
  session,
  me,
  onJoinNext,
}: {
  session: SessionRow;
  me: PlayerRow;
  onJoinNext(): void;
}) {
  const games = session.lineup as GameId[];
  const boards = useDayBoards(session.event_day_id, games, me.name_key, true);
  return <DayBoardView games={games} boards={boards} onJoinNext={onJoinNext} />;
}

export function DayBoardView({
  games,
  boards,
  onJoinNext,
  initialTab = 0,
}: {
  games: readonly GameId[];
  /** Rows per game (top 10 best per name + own); a game is missing until loaded. */
  boards: Partial<Record<GameId, readonly RankedRow[]>>;
  onJoinNext(): void;
  initialTab?: number;
}) {
  const t = useT();
  const [tab, setTab] = useState(initialTab);
  const game = games[tab] ?? games[0];
  const rows = boards[game] ?? null;

  return (
    <section className={styles.screen} data-testid="screen-dayboard">
      <ScreenHeader eyebrow={t('results.eyebrow')} title={t('dayboard.title')} />
      <div
        className={styles.tabs}
        role="tablist"
        style={{ gridTemplateColumns: `repeat(${Math.max(1, games.length)}, minmax(0, 1fr))` }}
      >
        {games.map((g, i) => (
          <button
            key={g}
            type="button"
            role="tab"
            aria-selected={i === tab}
            className={`${styles.tab} ${i === tab ? styles.tabOn : ''}`}
            onClick={() => setTab(i)}
            data-testid={`dayboard-tab-${g}`}
          >
            {t(`game.${g}.name`)}
          </button>
        ))}
      </div>
      <div data-testid="dayboard-panel" data-game={game} role="tabpanel">
        {rows && rows.length > 0 ? (
          <Leaderboard rows={rows} testId="day-board" />
        ) : rows ? (
          <p className={styles.empty}>{t('dayboard.empty')}</p>
        ) : null}
      </div>
      <div className={styles.spacer} />
      <div className={styles.bottom}>
        <button type="button" className={ctaClass} onClick={onJoinNext} data-testid="join-next">
          {t('results.join_next')}
        </button>
      </div>
    </section>
  );
}

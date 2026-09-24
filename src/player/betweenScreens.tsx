/**
 * P8 intermission mirror and P10 day board (`SCREENS.md` §1.2).
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
import { Leaderboard } from '../components/Leaderboard';
import ui from '../components/ui.module.css';
import styles from './player.module.css';
import { useDayBoards, useRoundBoard, useSessionBoard } from './boardHooks';
import type { PhoneIntermissionStep } from './playerFlow';
import { Chevron } from './screens';

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
  const t = useT();
  const roundBoard = useRoundBoard(round.id, playerRowId, step === 'round_board');
  const totals = useSessionBoard(session.id, playerRowId, step === 'session_total');

  return (
    <section className={styles.screen} data-testid="screen-intermission" data-step={step}>
      {step === 'next_intro' ? (
        <div className={`${styles.stack} ${styles.center}`} data-testid="intermission-next">
          <p className={styles.caption}>{t('round.label', { n: next.round_no, total: totalRounds })}</p>
          <div className={styles.versus}>
            <Chevron />
            <h1 className={styles.gameName}>{t('intermission.next', { game: t(`game.${next.game}.name`) })}</h1>
            <Chevron end />
          </div>
          <p className={styles.body}>{t(`game.${next.game}.pitch`)}</p>
          <p className={styles.caption}>{t('round.get_ready')}</p>
        </div>
      ) : step === 'session_total' ? (
        <>
          <h1 className={styles.sectionTitle}>{t('intermission.session_total')}</h1>
          {totals && totals.rows.length > 0 ? (
            <Leaderboard rows={totals.rows} testId="intermission-total-board" />
          ) : totals ? (
            <p className={styles.caption}>{t('results.no_scores')}</p>
          ) : null}
        </>
      ) : (
        <>
          <h1 className={styles.sectionTitle}>
            {t('intermission.round_board', { n: round.round_no })} · {t(`game.${round.game}.name`)}
          </h1>
          {roundBoard && roundBoard.length > 0 ? (
            <Leaderboard rows={roundBoard} testId="intermission-round-board" />
          ) : roundBoard ? (
            <p className={styles.caption}>{t('round.no_scores')}</p>
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
  const t = useT();
  const games = session.lineup as GameId[];
  const [tab, setTab] = useState(0);
  const boards = useDayBoards(session.event_day_id, games, me.name_key, true);
  const game = games[tab] ?? games[0];
  const rows = boards[game] ?? null;

  return (
    <section className={styles.screen} data-testid="screen-dayboard">
      <h1 className={styles.title}>{t('dayboard.title')}</h1>
      <div className={styles.tabs} role="tablist">
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
      <div data-testid="dayboard-panel" data-game={game}>
        {rows && rows.length > 0 ? (
          <Leaderboard rows={rows} testId="day-board" />
        ) : rows ? (
          <p className={styles.caption}>{t('dayboard.empty')}</p>
        ) : null}
      </div>
      <div className={styles.spacer} />
      <div className={styles.bottom}>
        <button type="button" className={`${ui.button} ${ui.buttonBlock}`} onClick={onJoinNext} data-testid="join-next">
          {t('results.join_next')}
        </button>
      </div>
    </section>
  );
}


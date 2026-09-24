/**
 * H3 Intermission (`SCREENS.md` H3, ADR-117): round board 7 s (for Stop the
 * Clock: the guess reveal) → session total 5 s → "Next: <game>" 3 s with
 * 3-2-1, then the host loop starts the next round. After the last round only
 * the round board shows, then H4. "Next round now" skips to the "Next" step.
 * The pending code stays in the corner.
 */
import { useEffect, useState } from 'react';
import { formatNumber, useT } from '../i18n';
import { fetchRoundBoard, fetchSessionBoard } from '../lib/api';
import { mergeBoard, type RankedRow } from '../lib/boards';
import { Leaderboard } from '../components/Leaderboard';
import { Spinner } from '../components/Spinner';
import ui from '../components/ui.module.css';
import styles from './host.module.css';
import { CornerCode, CornerControls, NextGamesButton } from './common';
import { StcReveal } from './StcReveal';
import type { HostController, HostData } from './useHost';

function useBoard(fetcher: (() => Promise<RankedRow[]>) | null, deps: unknown[]): RankedRow[] | null {
  const [rows, setRows] = useState<RankedRow[] | null>(null);
  useEffect(() => {
    if (!fetcher) return;
    let alive = true;
    void fetcher()
      .then((r) => {
        if (alive) setRows(r);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return rows;
}

export function Versus({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.versus}>
      <svg className={`${styles.chevron} ${styles.chevronStart}`} viewBox="0 0 48 64" aria-hidden="true">
        <path d="M40 0 L0 32 L40 64 L48 56 L18 32 L48 8 Z" />
      </svg>
      {children}
      <svg className={`${styles.chevron} ${styles.chevronEnd}`} viewBox="0 0 48 64" aria-hidden="true">
        <path d="M8 0 L48 32 L8 64 L0 56 L30 32 L0 8 Z" />
      </svg>
    </div>
  );
}

export function HostIntermission({ host, data }: { host: HostController; data: HostData }) {
  const t = useT();
  const info = host.intermission;
  const roundId = info?.round.id ?? null;
  const step = info?.state.step ?? null;
  const showsRound = step === 'round_board' || (step === 'done' && !info?.next);

  // Late scores (≤ 15 s after ended_at, E22) and hidden names re-query via scoresVersion.
  const roundBoard = useBoard(
    roundId && showsRound ? async () => mergeBoard((await fetchRoundBoard(roundId)).top, null, null) : null,
    [roundId, showsRound, host.scoresVersion],
  );
  const showsTotal = step === 'session_total';
  const totalBoard = useBoard(
    showsTotal ? async () => mergeBoard((await fetchSessionBoard(data.session.id)).top, null, null) : null,
    [data.session.id, showsTotal, host.scoresVersion],
  );

  if (!info) return <Spinner />;
  const { round, next, state } = info;
  const serverNow = Date.now() + (host.offset ?? 0);
  const secondsLeft = Math.max(1, Math.ceil((state.stepEndsAtMs - serverNow) / 1000));

  let heading: React.ReactNode;
  let body: React.ReactNode;
  if (state.step === 'next_intro' && next) {
    heading = null;
    body = (
      <div className={styles.nextIntro} data-testid="host-next-intro" data-game={next.game}>
        <p className={styles.big}>{t('round.label', { n: next.round_no, total: data.rounds.length })}</p>
        <Versus>
          <h1 className={styles.nextGame}>{t('intermission.next', { game: t(`game.${next.game}.name`) })}</h1>
        </Versus>
        <p key={secondsLeft} className={styles.countdown} dir="ltr" aria-live="polite">
          {formatNumber(secondsLeft)}
        </p>
      </div>
    );
  } else if (state.step === 'session_total') {
    heading = t('intermission.session_total');
    body =
      totalBoard && totalBoard.length > 0 ? (
        <Leaderboard rows={totalBoard} projector testId="host-total-board" />
      ) : totalBoard ? (
        <p className={`${styles.big} ${styles.muted}`}>{t('results.no_scores')}</p>
      ) : null;
  } else {
    heading = `${t('intermission.round_board', { n: round.round_no })} · ${t(`game.${round.game}.name`)}`;
    body =
      round.game === 'stop_the_clock' ? (
        <StcReveal roundId={round.id} version={host.scoresVersion} />
      ) : roundBoard && roundBoard.length > 0 ? (
        <Leaderboard rows={roundBoard} projector testId="host-round-board" />
      ) : roundBoard ? (
        <p className={`${styles.big} ${styles.muted}`}>{t('round.no_scores')}</p>
      ) : null;
  }

  return (
    <>
      {heading ? (
        <header className={styles.header}>
          <h1 className={styles.heading} data-testid="host-intermission-title">
            {heading}
          </h1>
        </header>
      ) : null}
      <div className={styles.main} data-testid="host-intermission" data-step={state.step} data-round={round.round_no}>
        <div className={styles.boardWrap}>{body}</div>
      </div>
      <footer className={styles.footer}>
        <CornerCode pending={data.pending} joined={data.pendingPlayers} />
        <CornerControls>
          <NextGamesButton host={host} pending={data.pending} />
          {next && state.step !== 'next_intro' && state.step !== 'done' ? (
            <button
              type="button"
              className={`${ui.button} ${styles.control}`}
              onClick={host.skipIntermission}
              data-testid="host-skip"
            >
              {t('intermission.skip')}
            </button>
          ) : null}
        </CornerControls>
      </footer>
    </>
  );
}

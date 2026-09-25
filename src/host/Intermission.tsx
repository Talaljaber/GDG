/**
 * H3 Intermission (`SCREENS.md` H3, ADR-117): round board 7 s (for Stop the
 * Clock: the guess reveal) → session total 5 s → "Next: <game>" 3 s with
 * 3-2-1, then the host loop starts the next round. After the last round only
 * the round board shows, then H4. "Next round now" skips to the "Next" step.
 * The pending code stays at the header's inline end. Each step change plays
 * the screen shatter (HostApp's ScreenTransition); the boards shatter in
 * (BoardTable) and the Stop the Clock dots burst in (StcReveal).
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { formatNumber, useT } from '../i18n';
import { fetchRoundBoard, fetchSessionBoard, type RevealRow } from '../lib/api';
import { mergeBoard, type RankedRow } from '../lib/boards';
import { replaceEqualDeep } from '../lib/equal';
import { Spinner } from '../components/Spinner';
import { useSteppedNow } from '../components/useSteppedNow';
import styles from './host.module.css';
import { BoardTable } from './BoardTable';
import {
  CornerCode,
  Framed,
  HostHeader,
  LineupSummary,
  NextGamesButton,
  OperatorBar,
} from './common';
import { StcReveal } from './StcReveal';
import type { HostController, HostData } from './useHost';

function useBoard(
  fetcher: (() => Promise<RankedRow[]>) | null,
  deps: unknown[],
): RankedRow[] | null {
  const [rows, setRows] = useState<RankedRow[] | null>(null);
  useEffect(() => {
    if (!fetcher) return;
    let alive = true;
    void fetcher()
      .then((r) => {
        if (alive) setRows((prev) => replaceEqualDeep(prev, r));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return rows;
}

/**
 * The 3-2-1 of the "Next" step. Its own leaf with its own clock, so the second ticking over
 * re-renders this number only, not the whole intermission (`TESTING.md` §9).
 */
function StepCountdown({ endsAtMs, offset }: { endsAtMs: number; offset: number }) {
  const secondsAt = (localNow: number) => Math.max(1, Math.ceil((endsAtMs - (localNow + offset)) / 1000));
  const secondsLeft = secondsAt(useSteppedNow(secondsAt, COUNTDOWN_TICK_MS));
  return (
    <p key={secondsLeft} className={styles.countdown} dir="ltr" aria-live="polite">
      {formatNumber(secondsLeft)}
    </p>
  );
}

const COUNTDOWN_TICK_MS = 250;

/** Dev preview only: fixed boards / reveal rows instead of the database queries. */
export interface IntermissionPreview {
  roundBoard?: RankedRow[] | null;
  totalBoard?: RankedRow[] | null;
  reveal?: RevealRow[];
}

export function HostIntermission({
  host,
  data,
  preview,
}: {
  host: HostController;
  data: HostData;
  preview?: IntermissionPreview;
}) {
  const t = useT();
  const info = host.intermission;
  const roundId = info?.round.id ?? null;
  const step = info?.state.step ?? null;
  const showsRound = step === 'round_board' || (step === 'done' && !info?.next);
  const live = !preview;

  // Late scores (≤ 15 s after ended_at, E22) and hidden names re-query via scoresVersion.
  const fetchedRound = useBoard(
    live && roundId && showsRound
      ? async () => mergeBoard((await fetchRoundBoard(roundId)).top, null, null)
      : null,
    [roundId, showsRound, host.scoresVersion, live],
  );
  const showsTotal = step === 'session_total';
  const fetchedTotal = useBoard(
    live && showsTotal
      ? async () => mergeBoard((await fetchSessionBoard(data.session.id)).top, null, null)
      : null,
    [data.session.id, showsTotal, host.scoresVersion, live],
  );
  const roundBoard = preview ? (preview.roundBoard ?? null) : fetchedRound;
  const totalBoard = preview ? (preview.totalBoard ?? null) : fetchedTotal;

  const lineup = useMemo(() => [...data.rounds].sort((a, b) => a.round_no - b.round_no).map((r) => r.game), [data.rounds]);

  if (!info) return <Spinner />;
  const { round, next, state } = info;
  const total = data.rounds.length;

  const header = (
    <HostHeader
      withLogo={false}
      end={<CornerCode pending={data.pending} joined={data.pendingPlayers} />}
    />
  );
  const skip =
    next && state.step !== 'next_intro' && state.step !== 'done' ? (
      <button
        type="button"
        className={styles.primary}
        onClick={host.skipIntermission}
        data-testid="host-skip"
      >
        {t('intermission.skip')}
      </button>
    ) : null;
  const operator = (
    <OperatorBar start={<NextGamesButton host={host} pending={data.pending} />}>{skip}</OperatorBar>
  );

  // 'done' with a next round keeps the "Next" step until the round has started (no flash of the
  // round board, and one screen transition "Next" → H2, DESIGN_SYSTEM §6.2).
  if ((state.step === 'next_intro' || state.step === 'done') && next) {
    return (
      <>
        {header}
        <main
          className={styles.body}
          data-testid="host-intermission"
          data-step={state.step}
          data-round={round.round_no}
        >
          <div className={styles.nextIntro} data-testid="host-next-intro" data-game={next.game}>
            <p className={styles.eyebrow}>{t('round.label', { n: next.round_no, total })}</p>
            <Framed>
              <h1 className={styles.nextGame}>
                {t('intermission.next', { game: t(`game.${next.game}.name`) })}
              </h1>
            </Framed>
            <StepCountdown endsAtMs={state.stepEndsAtMs} offset={host.offset ?? 0} />
          </div>
        </main>
        {operator}
      </>
    );
  }

  const upNext = next ? (
    <p className={styles.upNext}>{t('intermission.next', { game: t(`game.${next.game}.name`) })}</p>
  ) : null;

  // Stop the Clock: the round board is the guess reveal, full width (three strips).
  if (state.step !== 'session_total' && round.game === 'stop_the_clock') {
    return (
      <>
        {header}
        <main
          className={`${styles.body} ${styles.stack}`}
          data-testid="host-intermission"
          data-step={state.step}
          data-round={round.round_no}
        >
          <div className={styles.revealHead}>
            <h1 className={styles.titleBlock} data-testid="host-intermission-title">
              <span className={styles.eyebrow}>
                {t('intermission.round_board', { n: round.round_no })}
              </span>
              <span className={styles.titleSep}>{' · '}</span>
              <span className={styles.title}>{t(`game.${round.game}.name`)}</span>
            </h1>
            {upNext}
          </div>
          {preview?.reveal ? (
            <StcReveal roundId={round.id} version={host.scoresVersion} rows={preview.reveal} />
          ) : (
            <StcReveal roundId={round.id} version={host.scoresVersion} />
          )}
        </main>
        {operator}
      </>
    );
  }

  let title: ReactNode;
  let eyebrow: string;
  let body: ReactNode;
  if (state.step === 'session_total') {
    eyebrow = t('round.label', { n: round.round_no, total });
    title = t('intermission.session_total');
    body =
      totalBoard && totalBoard.length > 0 ? (
        <BoardTable rows={totalBoard} testId="host-total-board" />
      ) : totalBoard ? (
        <p className={styles.emptyBoard}>{t('results.no_scores')}</p>
      ) : null;
  } else {
    eyebrow = t('intermission.round_board', { n: round.round_no });
    title = t(`game.${round.game}.name`);
    body =
      roundBoard && roundBoard.length > 0 ? (
        <BoardTable rows={roundBoard} testId="host-round-board" />
      ) : roundBoard ? (
        <p className={styles.emptyBoard}>{t('round.no_scores')}</p>
      ) : null;
  }

  return (
    <>
      {header}
      <main
        className={`${styles.body} ${styles.split}`}
        data-testid="host-intermission"
        data-step={state.step}
        data-round={round.round_no}
      >
        <aside className={styles.side}>
          <h1 className={styles.titleBlock} data-testid="host-intermission-title">
            <span className={styles.eyebrow}>{eyebrow}</span>
            <span className={styles.titleSep}>{' · '}</span>
            <span className={styles.title}>{title}</span>
          </h1>
          {upNext}
          {lineup.length > 1 ? (
            <LineupSummary games={lineup} current={next ? next.round_no : round.round_no + 1} />
          ) : null}
        </aside>
        <section className={styles.boardArea}>{body}</section>
      </main>
      {operator}
    </>
  );
}

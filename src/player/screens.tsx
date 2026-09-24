/**
 * Player screens P3–P9, P11 and the other-tab state (`SCREENS.md` §1, §4),
 * v2 "quiet scoreboard" layout (DESIGN_SYSTEM §0.3). Each screen with data
 * is a thin container (its own polling) around a pure `…View` that takes
 * everything as props, so the dev preview can render it from fixtures; the
 * flow between screens is decided by `derivePlayerView` in MemberFlow.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { BOARD_POLL_MS, COUNTDOWN_MS } from '../config';
import { formatNumber, useT } from '../i18n';
import {
  fetchOwnScores,
  fetchPreviousBest,
  type GameId,
  type OwnScore,
  type PlayerRow,
  type RoundRow,
  type SessionRow,
} from '../lib/api';
import { displayName, type RankedRow } from '../lib/boards';
import { games } from '../games/registry';
import type { GameResult } from '../games/types';
import { getCurrent, type PendingSubmit } from '../lib/storage';
import { Leaderboard } from '../components/Leaderboard';
import { RevealIn } from '../components/RevealIn';
import { Trans } from '../components/Trans';
import ui from '../components/ui.module.css';
import styles from './player.module.css';
import { usePolling, useNow } from './hooks';
import { usePlayerRows, useRoundBoard, useSessionBoard } from './boardHooks';
import type { SubmitState } from './submitter';
import { ResultDetail } from './resultDetail';
import { ChevronFrame, Eyebrow, ScreenHeader } from './chrome';

export { Chevron } from './chrome';

/** Full-width primary button (DESIGN_SYSTEM §0.3): --button-height, --r-control. */
export const ctaClass = `${ui.button} ${ui.buttonBlock} ${styles.cta}`;

// ------------------------------------------------------------------ P4

export function RemovedScreen({ onCta }: { onCta(): void }) {
  const t = useT();
  return (
    <section className={styles.screen} data-testid="screen-removed">
      <ScreenHeader eyebrow={t('app.name')} title={t('removed.title')} lead={t('removed.body')} />
      <div className={styles.spacer} />
      <div className={styles.bottom}>
        <button type="button" className={ctaClass} onClick={onCta} data-testid="removed-cta">
          {t('removed.cta')}
        </button>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ P3 / P3b

export interface PlayerCounts {
  joined: number;
  finishedRound: (roundNo: number) => number;
}

function countPlayers(players: readonly PlayerRow[]): PlayerCounts {
  const joined = players.filter((p) => p.status === 'joined');
  return {
    joined: joined.length,
    finishedRound: (n) => joined.filter((p) => p.progress === 'finished' && p.progress_round === n).length,
  };
}

const usePlayerCounts = usePlayerRows;

export function LobbyScreen({
  session,
  me,
  pending,
  onPoll,
}: {
  session: SessionRow;
  me: PlayerRow;
  pending: boolean;
  onPoll(players: PlayerRow[]): void;
}) {
  const players = usePlayerCounts(session.id, true);
  const onPollRef = useRef(onPoll);
  onPollRef.current = onPoll;
  useEffect(() => {
    if (players) onPollRef.current(players);
  }, [players]);
  const joined = players ? countPlayers(players).joined : null;
  return (
    <LobbyView
      code={session.code}
      lineup={session.lineup}
      name={displayName(me.name, me.display_suffix)}
      pending={pending}
      joined={joined}
    />
  );
}

export function LobbyView({
  code,
  lineup,
  name,
  pending,
  joined,
}: {
  code: string;
  lineup: readonly GameId[];
  name: string;
  pending: boolean;
  /** Joined players (polled); null until the first poll. */
  joined: number | null;
}) {
  const t = useT();
  return (
    <section className={styles.screen} data-testid="screen-lobby">
      <ScreenHeader
        eyebrow={
          <>
            {t('lobby.code')} <span className={styles.num}>{code}</span>
          </>
        }
        title={pending ? t('lobby.next_round') : t('lobby.in')}
        lead={pending ? t('lobby.next_round_sub') : undefined}
      />
      <div className={styles.panel}>
        <div className={`${styles.panelRow} ${styles.panelRowSplit}`}>
          <Eyebrow as="span">{t('lobby.playing_as')}</Eyebrow>
          <span className={styles.nameTag}>
            <bdi data-testid="lobby-name">{name}</bdi>
          </span>
        </div>
        <div className={styles.panelRow}>
          <Eyebrow as="h2">{t('lobby.lineup')}</Eyebrow>
          <ol className={styles.lineup} data-testid="lobby-lineup">
            {lineup.map((g, i) => (
              <li key={g} className={styles.lineupItem}>
                <span className={styles.lineupNo}>{formatNumber(i + 1)}</span>
                <span>{t(`game.${g}.name`)}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
      <div className={styles.lobbyFoot}>
        {joined !== null ? (
          <p className={styles.stat} data-testid="lobby-count">
            <Trans
              k="lobby.players_count"
              params={{ count: joined }}
              nodes={{ n: <span className={styles.statNum}>{formatNumber(joined)}</span> }}
            />
          </p>
        ) : null}
        {!pending ? (
          <p className={styles.live}>
            <span className={styles.liveDot} aria-hidden="true" />
            {t('lobby.waiting')}
          </p>
        ) : null}
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ P5

export function IntroScreen({
  round,
  roundStartEpoch,
  totalRounds,
}: {
  round: RoundRow;
  roundStartEpoch: number | null;
  totalRounds: number;
}) {
  const now = useNow(100);
  const remaining = roundStartEpoch === null ? COUNTDOWN_MS : Math.max(0, roundStartEpoch - now);
  const n = Math.max(1, Math.ceil(remaining / 1000));
  return <IntroView game={round.game} roundNo={round.round_no} totalRounds={totalRounds} count={n} />;
}

export function IntroView({
  game,
  roundNo,
  totalRounds,
  count,
}: {
  game: GameId;
  roundNo: number;
  totalRounds: number;
  /** The 3-2-1 number on screen. */
  count: number;
}) {
  const t = useT();
  return (
    <section className={`${styles.screen} ${styles.centerScreen}`} data-testid="screen-intro">
      <div className={styles.introBlock}>
        <Eyebrow>{t('round.label', { n: roundNo, total: totalRounds })}</Eyebrow>
        <ChevronFrame size="title">
          <h1 className={styles.gameName}>{t(`game.${game}.name`)}</h1>
        </ChevronFrame>
        <p className={styles.lead}>{t(`game.${game}.pitch`)}</p>
      </div>
      <div className={styles.countBlock}>
        <p key={count} className={styles.countdown} aria-live="polite" dir="ltr">
          {formatNumber(count)}
        </p>
        <p className={styles.caption}>{t('round.get_ready')}</p>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ P6

const GO_SHOW_MS = 700;

export function GameScreen({
  round,
  seed,
  roundStartEpoch,
  roundEnded,
  onProgress,
  onFinish,
}: {
  round: RoundRow;
  seed: string;
  roundStartEpoch: number;
  roundEnded: boolean;
  onProgress(snapshot: unknown): void;
  onFinish(result: GameResult): void;
}) {
  const t = useT();
  const mod = games[round.game as GameId];
  // The snapshot is read once, at mount (reload resume, ADR-018).
  const [snapshot] = useState(() => {
    const cur = getCurrent();
    return cur?.roundId === round.id ? (cur.gameSnapshot ?? null) : null;
  });
  const [showGo, setShowGo] = useState(() => Date.now() - roundStartEpoch < GO_SHOW_MS && snapshot === null);
  useEffect(() => {
    if (!showGo) return;
    const timer = window.setTimeout(() => setShowGo(false), GO_SHOW_MS);
    return () => window.clearTimeout(timer);
  }, [showGo]);

  const finished = useRef(false);
  const handleFinish = (result: GameResult) => {
    if (finished.current) return;
    finished.current = true;
    onFinish(result);
  };

  if (!mod) {
    return (
      <section className={styles.screen}>
        <p className={ui.error}>{t('sys.generic_error')}</p>
      </section>
    );
  }
  const Game = mod.Component;
  return (
    <GameFrame showGo={showGo}>
      <Game
        seed={seed}
        roundStartEpoch={roundStartEpoch}
        roundEnded={roundEnded}
        snapshot={snapshot}
        onProgress={onProgress}
        onFinish={handleFinish}
      />
    </GameFrame>
  );
}

/** P6 frame around a game: fills the column; "Go" shows briefly over the top at the start. */
export function GameFrame({ showGo = false, children }: { showGo?: boolean; children: ReactNode }) {
  const t = useT();
  return (
    <div className={styles.gameArea} data-testid="screen-game">
      {children}
      {showGo ? (
        <p className={styles.go} aria-hidden="true">
          {t('round.go')}
        </p>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------ P7

export function RoundResultScreen({
  session,
  round,
  me,
  result,
  submitState,
  totalRounds,
}: {
  session: SessionRow;
  round: RoundRow | null;
  me: PlayerRow;
  /** The phone's own result for this round, if it played. */
  result: PendingSubmit | null;
  submitState: SubmitState | null;
  totalRounds: number;
}) {
  const playerRowId = me.id;
  const roundPlaying = round?.status === 'playing';
  // Poll every 3 s while visible, and once right after the submit is acknowledged.
  const board = useRoundBoard(round?.id ?? null, playerRowId, true, submitState);
  const players = usePlayerCounts(session.id, roundPlaying);
  const counts = players ? countPlayers(players) : null;
  const newBest = useNewBest(session, round, me, result, submitState);
  return (
    <RoundResultView
      round={round}
      totalRounds={totalRounds}
      result={result}
      submitState={submitState}
      newBest={newBest}
      board={board}
      done={
        roundPlaying && round && counts
          ? { done: counts.finishedRound(round.round_no), total: counts.joined }
          : null
      }
    />
  );
}

export function RoundResultView({
  round,
  totalRounds,
  result,
  submitState,
  newBest,
  board,
  done,
}: {
  round: Pick<RoundRow, 'game' | 'round_no'> | null;
  totalRounds: number;
  result: Pick<PendingSubmit, 'score' | 'raw'> | null;
  submitState: SubmitState | null;
  newBest: boolean;
  /** Round board rows (top 10 + own); null until the first poll. */
  board: readonly RankedRow[] | null;
  /** "x/y done" while the round is still playing; null otherwise. */
  done: { done: number; total: number } | null;
}) {
  const t = useT();
  const eyebrow = round ? (
    <>
      {t('round.label', { n: round.round_no, total: totalRounds })} · {t(`game.${round.game}.name`)}
    </>
  ) : undefined;

  return (
    <section className={styles.screen} data-testid="screen-round-result">
      {result ? (
        <>
          <ScreenHeader eyebrow={eyebrow} title={t('round.your_score')} center />
          <div className={styles.heroBlock}>
            <ChevronFrame>
              <p className={styles.scoreHero} data-testid="own-score" dir="ltr">
                {formatNumber(result.score)}
              </p>
            </ChevronFrame>
            {newBest ? (
              // Celebrate shatter (DESIGN_SYSTEM §6.2): fragment & reassemble + amber glow; a static
              // amber ring with reduced motion. The round is over for this phone, so no game is covered.
              <RevealIn variant="celebrate" as="span" className={styles.newBest} data-testid="new-best">
                {t('results.new_best')}
              </RevealIn>
            ) : null}
            <p className={styles.saveState} data-testid="save-state" data-state={submitState ?? 'saved'} role="status">
              {submitState === 'saving' ? t('sys.saving') : submitState === 'failed' ? t('sys.save_failed') : null}
            </p>
          </div>
          <ResultDetail game={round?.game as GameId | undefined} raw={result.raw} />
        </>
      ) : (
        <ScreenHeader
          eyebrow={eyebrow}
          title={<span data-testid="round-missed">{t('round.missed')}</span>}
          lead={t('round.missed_sub')}
        />
      )}
      <section className={styles.section}>
        <Eyebrow as="h2">{t('round.board_title')}</Eyebrow>
        {board && board.length > 0 ? (
          <Leaderboard rows={board} testId="round-board" />
        ) : board ? (
          <p className={styles.empty}>{t('round.no_scores')}</p>
        ) : null}
        {done ? (
          <p className={styles.live} data-testid="waiting-others">
            <span className={styles.liveDot} aria-hidden="true" />
            {t('round.waiting_others', { done: formatNumber(done.done), total: formatNumber(done.total) })}
          </p>
        ) : null}
      </section>
    </section>
  );
}

/**
 * P7 `new_best`: the saved score beats this name's earlier best today in
 * this game (day boards are per name key, ADR-105). A first play isn't a
 * "new best": there's nothing to beat yet.
 */
function useNewBest(
  session: SessionRow,
  round: RoundRow | null,
  me: PlayerRow,
  result: PendingSubmit | null,
  submitState: SubmitState | null,
): boolean {
  const [best, setBest] = useState<{ roundId: string; value: boolean } | null>(null);
  const roundId = round?.id ?? null;
  const saved = submitState === 'saved' && !!result && result.roundId === roundId;
  useEffect(() => {
    if (!saved || !round || !result || best?.roundId === round.id) return;
    let alive = true;
    void fetchPreviousBest(session.event_day_id, round.game, me.name_key, round.id)
      .then((prev) => {
        if (alive) setBest({ roundId: round.id, value: prev !== null && result.score > prev });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved, roundId]);
  return best?.roundId === roundId && best.value;
}

// ------------------------------------------------------------------ P9

/**
 * Session results: own total (from the phone's own score rows, so a hidden
 * player still sees it, ADR-115), rank, round breakdown ("–" for a missing
 * round), then the session board. States: normal, no_scores, not_scored.
 */
export function ResultsScreen({
  session,
  rounds,
  playerRowId,
  onJoinNext,
}: {
  session: SessionRow;
  rounds: readonly RoundRow[];
  playerRowId: string;
  onJoinNext(): void;
}) {
  const board = useSessionBoard(session.id, playerRowId, true);
  const [own, setOwn] = useState<OwnScore[] | null>(null);
  usePolling(
    async () => {
      try {
        setOwn(await fetchOwnScores(session.id, playerRowId));
      } catch {
        // keep last
      }
    },
    BOARD_POLL_MS,
    true,
    [session.id],
  );
  const lineup: GameId[] =
    rounds.length > 0 ? [...rounds].sort((a, b) => a.round_no - b.round_no).map((r) => r.game) : [...session.lineup];
  return <ResultsView lineup={lineup} own={own} board={board} onJoinNext={onJoinNext} />;
}

export function ResultsView({
  lineup,
  own,
  board,
  onJoinNext,
}: {
  lineup: readonly GameId[];
  /** The phone's own score rows for the session; null until loaded. */
  own: readonly Pick<OwnScore, 'game' | 'score'>[] | null;
  /** Session board (top 10 + own) and its row count; null until loaded. */
  board: { rows: readonly RankedRow[]; total: number } | null;
  onJoinNext(): void;
}) {
  const t = useT();
  const ownRow = useMemo(() => board?.rows.find((r) => r.isOwn) ?? null, [board]);
  const scored = own !== null && own.length > 0;
  const total = own ? own.reduce((sum, s) => sum + s.score, 0) : 0;

  return (
    <section
      className={styles.screen}
      data-testid="screen-results"
      data-state={!board ? 'loading' : scored ? 'normal' : board.rows.length === 0 ? 'no_scores' : 'not_scored'}
    >
      <ScreenHeader eyebrow={t('results.eyebrow')} title={t('results.title')} center={scored} />
      {scored ? (
        <>
          <div className={styles.heroBlock}>
            <Eyebrow>{t('results.your_total')}</Eyebrow>
            <ChevronFrame>
              <p className={styles.scoreHero} data-testid="results-total" dir="ltr">
                {formatNumber(total)}
              </p>
            </ChevronFrame>
            {board && ownRow ? (
              <p className={styles.rank} data-testid="results-rank">
                {t('results.rank', { rank: formatNumber(ownRow.rank), n: formatNumber(board.total) })}
              </p>
            ) : null}
          </div>
          <ul className={styles.kv} data-testid="results-breakdown">
            {lineup.map((g) => {
              const s = own?.find((o) => o.game === g);
              return (
                <li key={g} className={styles.kvRow} data-testid="breakdown-row" data-game={g}>
                  <span className={styles.kvLabel}>{t(`game.${g}.name`)}</span>
                  <span className={styles.kvValue} dir="ltr">
                    {s ? formatNumber(s.score) : t('results.breakdown_missing')}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
      <section className={styles.section}>
        <Eyebrow as="h2">{t('results.board_title')}</Eyebrow>
        {board && board.rows.length > 0 ? (
          <Leaderboard rows={board.rows} testId="session-board" />
        ) : board ? (
          <p className={styles.empty}>{t('results.no_scores')}</p>
        ) : null}
      </section>
      <div className={styles.spacer} />
      <div className={styles.bottom}>
        <button type="button" className={ctaClass} onClick={onJoinNext} data-testid="join-next">
          {t('results.join_next')}
        </button>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ P11 / other tab

export function EndedScreen({ onJoinNext }: { onJoinNext(): void }) {
  const t = useT();
  return (
    <section className={styles.screen} data-testid="screen-ended">
      <ScreenHeader eyebrow={t('app.name')} title={t('results.session_ended')} lead={t('results.session_ended_body')} />
      <div className={styles.spacer} />
      <div className={styles.bottom}>
        <button type="button" className={ctaClass} onClick={onJoinNext}>
          {t('results.join_next')}
        </button>
      </div>
    </section>
  );
}

export function OtherTabScreen() {
  const t = useT();
  return (
    <section className={styles.screen} data-testid="screen-other-tab">
      <ScreenHeader eyebrow={t('app.name')} title={t('sys.other_tab')} lead={t('sys.other_tab_body')} />
    </section>
  );
}

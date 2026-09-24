/**
 * Player screens P3–P9, P11 and the other-tab state (`SCREENS.md` §1, §4).
 * Screens are presentational plus their own polling; the flow between them
 * is decided by `derivePlayerView` in MemberFlow.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
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
import { displayName } from '../lib/boards';
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

// ------------------------------------------------------------------ P4

export function RemovedScreen({ onCta }: { onCta(): void }) {
  const t = useT();
  return (
    <section className={`${styles.screen} ${styles.center}`} data-testid="screen-removed">
      <h1 className={styles.title}>{t('removed.title')}</h1>
      <p className={styles.body}>{t('removed.body')}</p>
      <button type="button" className={`${ui.button} ${ui.buttonBlock}`} onClick={onCta} data-testid="removed-cta">
        {t('removed.cta')}
      </button>
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
  const t = useT();
  const players = usePlayerCounts(session.id, true);
  const onPollRef = useRef(onPoll);
  onPollRef.current = onPoll;
  useEffect(() => {
    if (players) onPollRef.current(players);
  }, [players]);
  const joined = players ? countPlayers(players).joined : null;

  return (
    <section className={`${styles.screen} ${styles.center}`} data-testid="screen-lobby">
      <h1 className={styles.hero}>{pending ? t('lobby.next_round') : t('lobby.in')}</h1>
      <p className={styles.body}>
        <Trans k="lobby.you_are" nodes={{ name: <bdi data-testid="lobby-name">{displayName(me.name, me.display_suffix)}</bdi> }} />
      </p>
      {pending ? <p className={styles.caption}>{t('lobby.next_round_sub')}</p> : null}
      <div className={styles.stack}>
        <h2 className={styles.caption}>{t('lobby.lineup')}</h2>
        <ol className={styles.lineup} data-testid="lobby-lineup">
          {session.lineup.map((g, i) => (
            <li key={g} className={styles.lineupItem}>
              <span className={styles.lineupNo}>{formatNumber(i + 1)}</span>
              {t(`game.${g}.name`)}
            </li>
          ))}
        </ol>
      </div>
      {joined !== null ? (
        <p className={styles.count} data-testid="lobby-count">
          {t('lobby.players_count', { n: formatNumber(joined), count: joined })}
        </p>
      ) : null}
      {!pending ? <p className={styles.caption}>{t('lobby.waiting')}</p> : null}
    </section>
  );
}

// ------------------------------------------------------------------ P5

export function Chevron({ end }: { end?: boolean }) {
  return (
    <svg
      className={`${styles.chevron} ${end ? styles.chevronEnd : styles.chevronStart}`}
      viewBox="0 0 48 64"
      aria-hidden="true"
    >
      {end ? <path d="M8 0 L48 32 L8 64 L0 56 L30 32 L0 8 Z" /> : <path d="M40 0 L0 32 L40 64 L48 56 L18 32 L48 8 Z" />}
    </svg>
  );
}

export function IntroScreen({
  round,
  roundStartEpoch,
  totalRounds,
}: {
  round: RoundRow;
  roundStartEpoch: number | null;
  totalRounds: number;
}) {
  const t = useT();
  const now = useNow(100);
  const remaining = roundStartEpoch === null ? COUNTDOWN_MS : Math.max(0, roundStartEpoch - now);
  const n = Math.max(1, Math.ceil(remaining / 1000));
  return (
    <section className={`${styles.screen} ${styles.center}`} data-testid="screen-intro">
      <p className={styles.caption}>{t('round.label', { n: round.round_no, total: totalRounds })}</p>
      <div className={styles.versus}>
        <Chevron />
        <h1 className={styles.gameName}>{t(`game.${round.game}.name`)}</h1>
        <Chevron end />
      </div>
      <p className={styles.body}>{t(`game.${round.game}.pitch`)}</p>
      <p className={styles.caption}>{t('round.get_ready')}</p>
      <p key={n} className={styles.countdown} aria-live="polite" dir="ltr">
        {formatNumber(n)}
      </p>
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
      <section className={`${styles.screen} ${styles.center}`}>
        <p className={ui.error}>{t('sys.generic_error')}</p>
      </section>
    );
  }
  const Game = mod.Component;
  return (
    <div className={styles.gameArea} data-testid="screen-game">
      <Game
        seed={seed}
        roundStartEpoch={roundStartEpoch}
        roundEnded={roundEnded}
        snapshot={snapshot}
        onProgress={onProgress}
        onFinish={handleFinish}
      />
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
}: {
  session: SessionRow;
  round: RoundRow | null;
  me: PlayerRow;
  /** The phone's own result for this round, if it played. */
  result: PendingSubmit | null;
  submitState: SubmitState | null;
}) {
  const t = useT();
  const playerRowId = me.id;
  const roundPlaying = round?.status === 'playing';
  // Poll every 3 s while visible, and once right after the submit is acknowledged.
  const board = useRoundBoard(round?.id ?? null, playerRowId, true, submitState);
  const players = usePlayerCounts(session.id, roundPlaying);
  const counts = players ? countPlayers(players) : null;
  const newBest = useNewBest(session, round, me, result, submitState);

  return (
    <section className={styles.screen} data-testid="screen-round-result">
      {result ? (
        <div className={`${styles.stack} ${styles.center}`}>
          <h1 className={styles.caption}>{t('round.your_score')}</h1>
          <p className={styles.scoreHero} data-testid="own-score" dir="ltr">
            {formatNumber(result.score)}
          </p>
          {newBest ? (
            // SHATTER HOOK (Phase 5): the celebrate shatter plays on this line (DESIGN_SYSTEM §6).
            <RevealIn as="span" className={styles.newBest} data-testid="new-best">
              {t('results.new_best')}
            </RevealIn>
          ) : null}
          <ResultDetail game={round?.game as GameId | undefined} raw={result.raw} />
          <p className={styles.saveState} data-testid="save-state" data-state={submitState ?? 'saved'} role="status">
            {submitState === 'saving' ? t('sys.saving') : submitState === 'failed' ? t('sys.save_failed') : null}
          </p>
        </div>
      ) : (
        <p className={`${styles.body} ${styles.center}`} data-testid="round-missed">
          {t('round.missed')}
        </p>
      )}
      <hr className={styles.divider} />
      <h2 className={styles.sectionTitle}>{t('round.board_title')}</h2>
      {board && board.length > 0 ? (
        <Leaderboard rows={board} testId="round-board" />
      ) : board ? (
        <p className={styles.caption}>{t('round.no_scores')}</p>
      ) : null}
      {roundPlaying && counts ? (
        <p className={styles.caption} data-testid="waiting-others">
          {t('round.waiting_others', {
            done: formatNumber(counts.finishedRound(round.round_no)),
            total: formatNumber(counts.joined),
          })}
        </p>
      ) : null}
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
  const t = useT();
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

  const ownRow = useMemo(() => board?.rows.find((r) => r.isOwn) ?? null, [board]);
  const lineup: GameId[] =
    rounds.length > 0 ? [...rounds].sort((a, b) => a.round_no - b.round_no).map((r) => r.game) : [...session.lineup];
  const scored = own !== null && own.length > 0;
  const total = own ? own.reduce((sum, s) => sum + s.score, 0) : 0;

  return (
    <section className={styles.screen} data-testid="screen-results" data-state={!board ? 'loading' : scored ? 'normal' : board.rows.length === 0 ? 'no_scores' : 'not_scored'}>
      <h1 className={styles.title}>{t('results.title')}</h1>
      {scored ? (
        <div className={styles.stack}>
          <div className={styles.totalRow}>
            <span className={styles.body}>{t('results.your_total')}</span>
            <span className={styles.totalValue} data-testid="results-total" dir="ltr">
              {formatNumber(total)}
            </span>
          </div>
          {board && ownRow ? (
            <p className={styles.body} data-testid="results-rank">
              {t('results.rank', { rank: formatNumber(ownRow.rank), n: formatNumber(board.total) })}
            </p>
          ) : null}
          <ul className={styles.breakdown} data-testid="results-breakdown">
            {lineup.map((g) => {
              const s = own?.find((o) => o.game === g);
              return (
                <li key={g} className={styles.breakdownRow} data-testid="breakdown-row" data-game={g}>
                  <span>{t(`game.${g}.name`)}</span>
                  <span dir="ltr">{s ? formatNumber(s.score) : t('results.breakdown_missing')}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      <hr className={styles.divider} />
      {board && board.rows.length > 0 ? (
        <Leaderboard rows={board.rows} testId="session-board" />
      ) : board ? (
        <p className={styles.caption}>{t('results.no_scores')}</p>
      ) : null}
      <div className={styles.spacer} />
      <div className={styles.bottom}>
        <button type="button" className={`${ui.button} ${ui.buttonBlock}`} onClick={onJoinNext} data-testid="join-next">
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
    <section className={`${styles.screen} ${styles.center}`} data-testid="screen-ended">
      <h1 className={styles.title}>{t('results.session_ended')}</h1>
      <button type="button" className={`${ui.button} ${ui.buttonBlock}`} onClick={onJoinNext}>
        {t('results.join_next')}
      </button>
    </section>
  );
}

export function OtherTabScreen() {
  const t = useT();
  return (
    <section className={`${styles.screen} ${styles.center}`} data-testid="screen-other-tab">
      <h1 className={styles.title}>{t('sys.other_tab')}</h1>
    </section>
  );
}

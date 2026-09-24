/**
 * H4 Session results and H5 Day boards (`SCREENS.md` H4, H5; ADR-010,
 * ADR-022). H4: winner card, then the session board (top 10 by total) with
 * each player's round scores ("–" for a missing round). Show day board →
 * H5: one tab per game of the lineup, auto-rotating every 8 s, top 10 best
 * per name today; rows from this session highlighted for one rotation.
 * New session (from either) turns the pending session into the lobby.
 */
import { useEffect, useMemo, useState } from 'react';
import { BOARD_POLL_MS, DAYBOARD_ROTATE_MS } from '../config';
import { formatNumber, useT } from '../i18n';
import {
  adminNewSession,
  adminShowDayBoard,
  fetchDayBoard,
  fetchSessionBoard,
  fetchSessionRoundScores,
  fetchSessionScores,
  type DayBoardRow,
  type GameId,
  type RoundScoreRow,
  type SessionScoreRow,
} from '../lib/api';
import { displayName, mergeBoard, type RankedRow } from '../lib/boards';
import logo from '../assets/logo.png';
import { Leaderboard } from '../components/Leaderboard';
import ui from '../components/ui.module.css';
import styles from './host.module.css';
import { CornerCode, CornerControls, NextGamesButton } from './common';
import { Versus } from './Intermission';
import type { HostController, HostData } from './useHost';

function useNewSession(host: HostController) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      await host.act(() => adminNewSession());
    } catch {
      // re-read either way
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}

/** The session's games in round order (the lineup the rounds were created from). */
function roundGames(data: HostData): GameId[] {
  const fromRounds = [...data.rounds].sort((a, b) => a.round_no - b.round_no).map((r) => r.game);
  return fromRounds.length > 0 ? fromRounds : [...data.session.lineup];
}

// ------------------------------------------------------------------ H4

export function HostResults({ host, data }: { host: HostController; data: HostData }) {
  const t = useT();
  const { session } = data;
  const [board, setBoard] = useState<RankedRow[] | null>(null);
  const [breakdown, setBreakdown] = useState<RoundScoreRow[]>([]);
  const [showing, setShowing] = useState(false);
  const newSession = useNewSession(host);
  const lineup = roundGames(data);

  // Late scores (≤ 15 s after the round ended, E22) still arrive: re-query on inserts and every 3 s.
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const [page, rows] = await Promise.all([fetchSessionBoard(session.id), fetchSessionRoundScores(session.id)]);
        if (!alive) return;
        setBoard(mergeBoard(page.top, null, null));
        setBreakdown(rows);
      } catch {
        // keep last
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), BOARD_POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [session.id, host.scoresVersion]);

  const winner = board?.[0] ?? null;
  const showDayBoard = async () => {
    setShowing(true);
    try {
      await host.act(() => adminShowDayBoard(session.id));
    } catch {
      // re-read either way
    } finally {
      setShowing(false);
    }
  };

  return (
    <>
      <header className={styles.header}>
        <h1 className={styles.heading}>{t('results.title')}</h1>
        <img src={logo} alt={t('app.name')} className={ui.projLogo} />
      </header>
      <div className={styles.main} data-testid="host-results">
        <div className={styles.boardWrap}>
          {winner ? (
            <Versus>
              <div className={styles.winner} data-testid="host-winner">
                <span className={styles.winnerLabel}>{t('host.results.winner')}</span>
                <bdi>{displayName(winner.name, winner.displaySuffix)}</bdi>
                <span className={styles.winnerScore}>{formatNumber(winner.value)}</span>
              </div>
            </Versus>
          ) : null}
          {board && board.length > 0 ? (
            <table className={styles.sessionTable} data-testid="host-session-board">
              <thead>
                <tr>
                  <th scope="col" className={styles.colRank} />
                  <th scope="col" className={styles.colName} />
                  {lineup.map((g) => (
                    <th key={g} scope="col" className={styles.colScore}>
                      {t(`game.${g}.name`)}
                    </th>
                  ))}
                  <th scope="col" className={styles.colScore}>
                    {t('host.results.total')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {board.map((r) => (
                  <tr
                    key={r.playerRowId}
                    className={`${styles.sessionRow} ${r.rank === 1 ? styles.sessionRowFirst : ''}`}
                    data-testid="board-row"
                  >
                    <td className={styles.colRank}>{formatNumber(r.rank)}</td>
                    <td className={styles.colName}>
                      <bdi data-testid="board-name">{displayName(r.name, r.displaySuffix)}</bdi>
                    </td>
                    {lineup.map((g) => {
                      const s = breakdown.find((b) => b.playerRowId === r.playerRowId && b.game === g);
                      return (
                        <td key={g} className={styles.colScore} data-testid="board-round-score" data-game={g}>
                          {s ? formatNumber(s.score) : t('results.breakdown_missing')}
                        </td>
                      );
                    })}
                    <td className={`${styles.colScore} ${styles.colTotal}`} data-testid="board-score">
                      {formatNumber(r.value)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : board ? (
            <p className={`${styles.big} ${styles.muted}`} data-testid="host-no-scores">
              {t('results.no_scores')}
            </p>
          ) : null}
        </div>
      </div>
      <footer className={styles.footer}>
        <CornerCode pending={data.pending} joined={data.pendingPlayers} />
        <CornerControls>
          <NextGamesButton host={host} pending={data.pending} />
          <button
            type="button"
            className={`${ui.button} ${ui.buttonSecondary} ${styles.control}`}
            onClick={() => void showDayBoard()}
            disabled={showing}
            data-testid="host-show-day-board"
          >
            {t('host.results.show_day_board')}
          </button>
          <button
            type="button"
            className={`${ui.button} ${styles.control}`}
            onClick={() => void newSession.run()}
            disabled={newSession.busy}
            data-testid="host-new-session"
          >
            {t('host.new_session')}
          </button>
        </CornerControls>
      </footer>
    </>
  );
}

// ------------------------------------------------------------------ H5

/** A day-board row came from this session if one of its scores is that row's best (same game, score, time). */
function fromSession(row: DayBoardRow, game: GameId, scores: readonly SessionScoreRow[]): boolean {
  return scores.some(
    (s) => s.game === game && s.score === row.score && Date.parse(s.createdAt) === Date.parse(row.achievedAt),
  );
}

export function HostDayBoards({ host, data }: { host: HostController; data: HostData }) {
  const t = useT();
  const { session } = data;
  const lineup = roundGames(data);
  const newSession = useNewSession(host);
  const [tab, setTab] = useState(0);
  const [rotations, setRotations] = useState(0);
  const [rows, setRows] = useState<Record<string, DayBoardRow[]>>({});
  const [sessionScores, setSessionScores] = useState<SessionScoreRow[]>([]);

  // SHATTER HOOK (Phase 5): the ~15 s merge of the session board into the day boards
  // (DESIGN_SYSTEM §6.2) plays here before the tabs appear; today the tabs reveal in with RevealIn.
  useEffect(() => {
    const timer = window.setInterval(() => {
      setTab((i) => (i + 1) % Math.max(1, lineup.length));
      setRotations((n) => n + 1);
    }, DAYBOARD_ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [lineup.length]);

  // Every game's board, re-queried on each score of the day and each hidden-name change.
  const lineupKey = lineup.join(',');
  useEffect(() => {
    let alive = true;
    const games = lineupKey.split(',') as GameId[];
    void Promise.all(games.map((g) => fetchDayBoard(session.event_day_id, g)))
      .then((pages) => {
        if (!alive) return;
        const next: Record<string, DayBoardRow[]> = {};
        games.forEach((g, i) => (next[g] = pages[i].top));
        setRows(next);
      })
      .catch(() => {});
    void fetchSessionScores(session.id)
      .then((s) => {
        if (alive) setSessionScores(s);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [lineupKey, session.event_day_id, session.id, host.dayVersion, host.scoresVersion]);

  const game = lineup[tab] ?? lineup[0];
  const current = rows[game] ?? null;
  const firstCycle = rotations < lineup.length;
  const ranked: RankedRow[] = useMemo(
    () =>
      (current ?? []).map((r, i) => ({
        playerRowId: r.nameKey,
        name: r.name,
        displaySuffix: null, // day boards show the name without the suffix (SCORING §6 rule 5)
        value: r.score,
        rank: i + 1,
        isOwn: false,
        detached: false,
      })),
    [current],
  );
  const highlight = useMemo(
    () => new Set(firstCycle && current ? current.filter((r) => fromSession(r, game, sessionScores)).map((r) => r.nameKey) : []),
    [firstCycle, current, game, sessionScores],
  );

  return (
    <>
      <header className={styles.header}>
        <h1 className={styles.heading}>{t('dayboard.title')}</h1>
        <img src={logo} alt={t('app.name')} className={ui.projLogo} />
      </header>
      <nav className={styles.tabs} role="tablist" data-testid="host-dayboard-tabs">
        {lineup.map((g, i) => (
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
      </nav>
      <div className={styles.main} data-testid="host-dayboard" data-game={game}>
        <div className={styles.boardWrap} key={game}>
          {ranked.length > 0 ? (
            <Leaderboard rows={ranked} projector testId="host-day-board" highlightIds={highlight} />
          ) : current ? (
            <p className={`${styles.big} ${styles.muted}`}>{t('dayboard.empty')}</p>
          ) : null}
        </div>
      </div>
      <footer className={styles.footer}>
        <CornerCode pending={data.pending} joined={data.pendingPlayers} />
        <CornerControls>
          <NextGamesButton host={host} pending={data.pending} />
          <button
            type="button"
            className={`${ui.button} ${styles.control}`}
            onClick={() => void newSession.run()}
            disabled={newSession.busy}
            data-testid="host-new-session"
          >
            {t('host.new_session')}
          </button>
        </CornerControls>
      </footer>
    </>
  );
}

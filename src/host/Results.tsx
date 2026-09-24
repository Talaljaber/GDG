/**
 * H4 Session results and H5 Day boards (`SCREENS.md` H4, H5; ADR-010,
 * ADR-022), one screen for both so the day-board merge can play between
 * them. H4: winner card, then the session board (top 10 by total) with
 * each player's round scores ("–" for a missing round). It stays until the
 * host taps Show day board. Then the ~15 s merge (DESIGN_SYSTEM §6.2):
 * the session board fragments, each game's day-board tab appears in turn
 * and shards stream into the rows that came from this session, then the
 * first tab settles and the tabs auto-rotate every 8 s, top 10 best per
 * name today; rows from this session stay highlighted for one rotation.
 * A reload onto H5 shows the day boards at once (no merge). New session
 * (from either, even mid-merge, E21) turns the pending session into the lobby.
 *
 * The merge stage is the board area only: the header (with the logo, §5)
 * and the host controls are never hidden or covered.
 */
import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
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
import { DayBoardMerge, SHATTER_LOGO_CLASS } from '../effects/shatter';
import { Leaderboard } from '../components/Leaderboard';
import { useRevealRows } from '../components/useRevealRows';
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

/** A day-board row came from this session if one of its scores is that row's best (same game, score, time). */
function fromSession(row: DayBoardRow, game: GameId, scores: readonly SessionScoreRow[]): boolean {
  return scores.some(
    (s) => s.game === game && s.score === row.score && Date.parse(s.createdAt) === Date.parse(row.achievedAt),
  );
}

/** H4 data: the session board and per-round scores. Late scores (≤ 15 s after the round ended, E22) still arrive. */
function useSessionResults(sessionId: string, scoresVersion: number, enabled: boolean) {
  const [board, setBoard] = useState<RankedRow[] | null>(null);
  const [breakdown, setBreakdown] = useState<RoundScoreRow[]>([]);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const load = async () => {
      try {
        const [page, rows] = await Promise.all([fetchSessionBoard(sessionId), fetchSessionRoundScores(sessionId)]);
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
  }, [sessionId, scoresVersion, enabled]);
  return { board, breakdown };
}

/**
 * H5 data: every game's day board, re-queried on each score of the day and
 * each hidden-name change. Loaded from the moment Show day board lands, so
 * the rows are there when the merge streams into them 1.7 s later.
 */
function useDayBoardData(host: HostController, data: HostData, lineup: readonly GameId[], enabled: boolean) {
  const { session } = data;
  const [rows, setRows] = useState<Record<string, DayBoardRow[]>>({});
  const [sessionScores, setSessionScores] = useState<SessionScoreRow[]>([]);
  const lineupKey = lineup.join(',');
  useEffect(() => {
    if (!enabled) return;
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
  }, [enabled, lineupKey, session.event_day_id, session.id, host.dayVersion, host.scoresVersion]);
  return { rows, sessionScores };
}

type View = 'results' | 'dayboard';

export function HostSessionEnd({ host, data }: { host: HostController; data: HostData }) {
  const t = useT();
  const { session } = data;
  const lineup = roundGames(data);
  const newSession = useNewSession(host);
  const onDayBoard = host.screen === 'dayboard';

  // H4 → H5 while this screen is up plays the merge; a reload onto H5 doesn't (derived state).
  const [seenDayBoard, setSeenDayBoard] = useState(onDayBoard);
  const [mergeRun, setMergeRun] = useState(0);
  const [merging, setMerging] = useState(false);
  const [view, setView] = useState<View>(onDayBoard ? 'dayboard' : 'results');
  if (onDayBoard !== seenDayBoard) {
    setSeenDayBoard(onDayBoard);
    if (onDayBoard) {
      setMergeRun((n) => n + 1);
      setMerging(true);
    } else {
      setMerging(false);
      setView('results');
    }
  }

  const results = useSessionResults(session.id, host.scoresVersion, view === 'results');
  const day = useDayBoardData(host, data, lineup, onDayBoard);

  const [tab, setTab] = useState(0);
  const [rotations, setRotations] = useState(0);
  // Tabs auto-rotate every 8 s once the merge is over (the merge drives the tabs while it plays).
  const rotating = view === 'dayboard' && !merging;
  useEffect(() => {
    if (!rotating) return;
    const timer = window.setInterval(() => {
      setTab((i) => (i + 1) % Math.max(1, lineup.length));
      setRotations((n) => n + 1);
    }, DAYBOARD_ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [rotating, lineup.length]);

  const [showing, setShowing] = useState(false);
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

  // Merge targets: the rows of the shown tab that came from this session (highlighted).
  const dayBoardArea = useRef<HTMLDivElement>(null);
  const targets = () => Array.from(dayBoardArea.current?.querySelectorAll('[data-highlight="true"]') ?? []);

  return (
    <>
      <header className={styles.header}>
        <h1 className={styles.heading}>{t(view === 'results' ? 'results.title' : 'dayboard.title')}</h1>
        <img src={logo} alt={t('app.name')} className={`${ui.projLogo} ${SHATTER_LOGO_CLASS}`} data-testid="logo" />
      </header>
      {view === 'dayboard' ? (
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
      ) : null}
      <DayBoardMerge
        trigger={mergeRun}
        games={lineup.map((id) => ({ id, targets }))}
        className={styles.mergeStage}
        data-testid="host-merge-stage"
        onFragmented={() => setView('dayboard')}
        onGameStart={(_, i) => setTab(i)}
        onSettle={() => setTab(0)}
        onDone={() => {
          setMerging(false);
          setRotations(0);
        }}
      >
        {view === 'results' ? (
          <SessionResultsBoard lineup={lineup} board={results.board} breakdown={results.breakdown} />
        ) : (
          <DayBoardPanel
            ref={dayBoardArea}
            game={lineup[tab] ?? lineup[0]}
            rows={day.rows}
            sessionScores={day.sessionScores}
            firstCycle={rotations < lineup.length}
            reveal={!merging}
          />
        )}
      </DayBoardMerge>
      <footer className={styles.footer}>
        <CornerCode pending={data.pending} joined={data.pendingPlayers} />
        <CornerControls>
          <NextGamesButton host={host} pending={data.pending} />
          {!onDayBoard ? (
            <button
              type="button"
              className={`${ui.button} ${ui.buttonSecondary} ${styles.control}`}
              onClick={() => void showDayBoard()}
              disabled={showing}
              data-testid="host-show-day-board"
            >
              {t('host.results.show_day_board')}
            </button>
          ) : null}
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

// ------------------------------------------------------------------ H4 board

function SessionResultsBoard({
  lineup,
  board,
  breakdown,
}: {
  lineup: readonly GameId[];
  board: RankedRow[] | null;
  breakdown: readonly RoundScoreRow[];
}) {
  const t = useT();
  const winner = board?.[0] ?? null;
  // Rows shatter in top to bottom as the board appears (DESIGN_SYSTEM §6.2).
  const bodyRef = useRevealRows<HTMLTableSectionElement>((board ?? []).map((r) => r.playerRowId));
  return (
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
            <tbody ref={bodyRef}>
              {board.map((r) => (
                <tr
                  key={r.playerRowId}
                  className={`${styles.sessionRow} ${r.rank === 1 ? styles.sessionRowFirst : ''}`}
                  data-testid="board-row"
                  data-reveal-key={r.playerRowId}
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
  );
}

// ------------------------------------------------------------------ H5 board

const DayBoardPanel = forwardRef<
  HTMLDivElement,
  {
    game: GameId;
    rows: Record<string, DayBoardRow[]>;
    sessionScores: readonly SessionScoreRow[];
    /** Rows from this session are highlighted during the merge and the first rotation. */
    firstCycle: boolean;
    /** false while the merge owns the rows (it hides and reassembles them itself). */
    reveal: boolean;
  }
>(function DayBoardPanel({ game, rows, sessionScores, firstCycle, reveal }, ref) {
  const t = useT();
  const current = rows[game] ?? null;
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
    () =>
      new Set(firstCycle && current ? current.filter((r) => fromSession(r, game, sessionScores)).map((r) => r.nameKey) : []),
    [firstCycle, current, game, sessionScores],
  );
  return (
    <div ref={ref} className={styles.main} data-testid="host-dayboard" data-game={game}>
      <div className={styles.boardWrap} key={game}>
        {ranked.length > 0 ? (
          <Leaderboard rows={ranked} projector reveal={reveal} testId="host-day-board" highlightIds={highlight} />
        ) : current ? (
          <p className={`${styles.big} ${styles.muted}`}>{t('dayboard.empty')}</p>
        ) : null}
      </div>
    </div>
  );
});

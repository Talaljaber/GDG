/**
 * H4 Session results and H5 Day boards, host v3 "Stage and Rail" (ADR-135,
 * `docs/plans/host-v3.md` §4.5–§4.6; ADR-010, ADR-022). One screen for both.
 *
 * H4, the podium moment: the side column holds the winner (name at t5, then the
 * total as the screen's one hero number at t7, framed by the facing chevrons
 * like the lobby code, with an amber rule under the digits), then #2 and #3 as
 * two plain lines; the session table (top 10 by total, one visible
 * column per round, "–" for a missing round) fills the other columns in ten
 * fixed slots. When H4 first appears every row appears together (no cascade,
 * `--stagger-row` is 0) and counts up together, then the winner's total counts
 * up, then the celebrate shatter plays on the winner once: the session's one
 * celebration. A 3 s poll refresh or a reload onto H4 (remembered for this
 * tab) never replays it. It stays until the host taps Show day board.
 *
 * Show day board switches straight to H5 (no merge, no shatter tiles, no
 * per-game stepping — user feedback 2026-09-25 called the old merge "so bad"):
 * the whole stage crossfades once (`--dur-step`, ~300 ms) from the results to
 * "Today's best" and the game tabs across the top of the board; the active tab
 * is underlined in blue ("live"), the underline filling over the 8 s until the
 * next tab. Ten slots, best per name today, every row appears together; rows
 * from this session keep a blue inline-start rule for the first rotation. A
 * tab change crossfades the whole board at once (never row by row). Reduced
 * motion: an instant swap. New session (from either) turns the pending
 * session into the lobby.
 *
 * Render budget (`TESTING.md` §9): an idle H4 commits nothing (polls keep equal
 * rows, count-ups write the DOM from rAF, the celebrate and the tab underline
 * run imperatively); H5 commits once per rotation.
 */
import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { BOARD_POLL_MS, DAYBOARD_ROTATE_MS } from '../config';
import { formatNumber, translate, useLang, useT } from '../i18n';
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
import { replaceEqualDeep } from '../lib/equal';
import { playCelebrate, useDensity, useReducedMotion, type ShatterHandle } from '../effects/shatter';
import hostStyles from './host.module.css';
import styles from './results.module.css';
import { BoardTable } from './BoardTable';
import { useCountUp } from './countUp';
import { CornerCode, Framed, HostHeader, NextGamesButton, OperatorBar } from './common';
import type { HostController, HostData } from './useHost';

// ------------------------------------------------------------------ timing

/** A duration token from tokens.css in ms; the reduced-motion rules zero them. Fallback where no stylesheet is loaded (unit tests). */
function tokenMs(name: string, fallback: number): number {
  try {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const n = parseFloat(raw);
    if (Number.isFinite(n)) return raw.endsWith('ms') ? n : raw.endsWith('s') ? n * 1000 : fallback;
  } catch {
    // no DOM styles
  }
  return fallback;
}

/** Mirrors tokens.css (§3.4): used only where the tokens can't be read. */
const FALLBACK = { countup: 1200, countupHero: 1600, stagger: 60, step: 300 } as const;

/** The pause between the table settling and the winner's count-up (plan §4.5). */
const HERO_AFTER_ROWS_MS = 300;

/** Board slots on the projector (plan §2.1 rule 5). */
const SLOTS = 10;

/**
 * When the winner's total starts counting: after the table's rows have cascaded in
 * and counted up (the last row starts `(n − 1) · stagger` after the first).
 */
function heroDelayMs(rows: number): number {
  const n = Math.min(Math.max(rows, 1), SLOTS);
  return (
    (n - 1) * tokenMs('--stagger-row', FALLBACK.stagger) +
    tokenMs('--dur-countup', FALLBACK.countup) +
    HERO_AFTER_ROWS_MS
  );
}

// A reload onto H4 shows the podium settled (no count-up, no celebrate): the session whose
// podium this tab has already played is remembered for the tab (sessionStorage survives a reload).
const PODIUM_PLAYED_KEY = 'gdg.v1.host-podium-played';

function podiumPlayed(sessionId: string): boolean {
  try {
    return sessionStorage.getItem(PODIUM_PLAYED_KEY) === sessionId;
  } catch {
    return false;
  }
}

function markPodiumPlayed(sessionId: string): void {
  try {
    sessionStorage.setItem(PODIUM_PLAYED_KEY, sessionId);
  } catch {
    // private mode / blocked storage: a reload just plays it again
  }
}

// ------------------------------------------------------------------ data

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
    (s) =>
      s.game === game &&
      s.score === row.score &&
      Date.parse(s.createdAt) === Date.parse(row.achievedAt),
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
        const [page, rows] = await Promise.all([
          fetchSessionBoard(sessionId),
          fetchSessionRoundScores(sessionId),
        ]);
        if (!alive) return;
        // Polled every 3 s and nearly always unchanged: keep the old rows so H4 doesn't re-render.
        const next = mergeBoard(page.top, null, null);
        setBoard((prev) => replaceEqualDeep(prev, next));
        setBreakdown((prev) => replaceEqualDeep(prev, rows));
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
 * each hidden-name change. Loaded from the moment Show day board lands;
 * `ready` once both queries have answered, so the merge can wait for them.
 */
function useDayBoardData(
  host: HostController,
  data: HostData,
  lineup: readonly GameId[],
  enabled: boolean,
) {
  const { session } = data;
  const [rows, setRows] = useState<Record<string, DayBoardRow[]>>({});
  const [sessionScores, setSessionScores] = useState<SessionScoreRow[]>([]);
  const [loaded, setLoaded] = useState({ rows: false, scores: false });
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
        setRows((prev) => replaceEqualDeep(prev, next));
        setLoaded((l) => (l.rows ? l : { ...l, rows: true }));
      })
      .catch(() => {});
    void fetchSessionScores(session.id)
      .then((s) => {
        if (!alive) return;
        setSessionScores((prev) => replaceEqualDeep(prev, s));
        setLoaded((l) => (l.scores ? l : { ...l, scores: true }));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [enabled, lineupKey, session.event_day_id, session.id, host.dayVersion, host.scoresVersion]);
  return { rows, sessionScores, ready: loaded.rows && loaded.scores };
}

/** Dev preview only: fixed data instead of the database queries. */
export interface SessionEndPreview {
  board?: RankedRow[] | null;
  breakdown?: RoundScoreRow[];
  dayRows?: Record<string, DayBoardRow[]>;
  sessionScores?: SessionScoreRow[];
}

const NO_ROWS: readonly RankedRow[] = [];
const NO_BREAKDOWN: readonly RoundScoreRow[] = [];

// ------------------------------------------------------------------ the screen

export function HostSessionEnd({
  host,
  data,
  preview,
}: {
  host: HostController;
  data: HostData;
  preview?: SessionEndPreview;
}) {
  const t = useT();
  const { session } = data;
  // Stable across re-renders (the boards below are memoised on it).
  const lineupKey = roundGames(data).join(',');
  const lineup = useMemo(() => lineupKey.split(',') as GameId[], [lineupKey]);
  const newSession = useNewSession(host);
  const onDayBoard = host.screen === 'dayboard';
  const reduced = useReducedMotion();

  // Show day board switches the screen at once (no merge, no data wait): the day boards
  // simply pop in as their queries answer, same as any other board. `dayBoardArea` only
  // backs the tab-change crossfade below.
  const live = !preview;
  const fetchedResults = useSessionResults(session.id, host.scoresVersion, live && !onDayBoard);
  const fetchedDay = useDayBoardData(host, data, lineup, live && onDayBoard);
  const results = preview
    ? { board: preview.board ?? null, breakdown: preview.breakdown ?? NO_BREAKDOWN }
    : fetchedResults;
  const day = preview
    ? { rows: preview.dayRows ?? {}, sessionScores: preview.sessionScores ?? [] }
    : fetchedDay;

  // Tab changes crossfade the whole board at once (never row by row): the outgoing board is
  // copied and fades out over the incoming one (DOM only, no extra commit).
  const dayBoardArea = useRef<HTMLDivElement>(null);
  const fades = useRef(new Set<HTMLElement>());
  const fadeOutBoard = useCallback(() => {
    const el = dayBoardArea.current;
    const parent = el?.parentElement;
    const ms = tokenMs('--dur-step', FALLBACK.step);
    if (!el || !parent || reduced || ms <= 0 || typeof el.animate !== 'function') return;
    const ghost = el.cloneNode(true) as HTMLElement;
    for (const node of [ghost, ...Array.from(ghost.querySelectorAll('*'))]) {
      node.removeAttribute('data-testid');
      node.removeAttribute('data-highlight');
      node.removeAttribute('data-reveal-key');
      node.removeAttribute('id');
    }
    ghost.setAttribute('aria-hidden', 'true');
    ghost.setAttribute('inert', '');
    ghost.classList.add(styles.ghost);
    Object.assign(ghost.style, {
      top: `${el.offsetTop}px`,
      left: `${el.offsetLeft}px`,
      width: `${el.offsetWidth}px`,
      height: `${el.offsetHeight}px`,
    });
    parent.appendChild(ghost);
    fades.current.add(ghost);
    const remove = () => {
      ghost.remove();
      fades.current.delete(ghost);
    };
    const anim = ghost.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: ms,
      easing: 'ease-out',
      fill: 'forwards',
    });
    anim.onfinish = remove;
    window.setTimeout(remove, ms + 100);
  }, [reduced]);
  useEffect(() => {
    const set = fades.current;
    return () => {
      set.forEach((g) => g.remove());
      set.clear();
    };
  }, []);

  const [tab, setTab] = useState(0);
  const [rotations, setRotations] = useState(0);
  // Tabs auto-rotate every 8 s. The wait restarts on every tab change, so a tapped tab also
  // gets its full 8 s.
  const rotating = onDayBoard;
  useEffect(() => {
    if (!rotating) return;
    const timer = window.setTimeout(() => {
      fadeOutBoard();
      setTab((i) => (i + 1) % Math.max(1, lineup.length));
      setRotations((n) => n + 1);
    }, DAYBOARD_ROTATE_MS);
    return () => window.clearTimeout(timer);
  }, [rotating, tab, rotations, lineup.length, fadeOutBoard]);
  const pickTab = (i: number) => {
    if (i === tab) return;
    fadeOutBoard();
    setTab(i);
  };

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

  const newSessionButton = (primary: boolean) => (
    <button
      type="button"
      className={primary ? hostStyles.primary : hostStyles.textButton}
      onClick={() => void newSession.run()}
      disabled={newSession.busy}
      data-testid="host-new-session"
    >
      {t('host.new_session')}
    </button>
  );

  return (
    <>
      <HostHeader
        withLogo
        end={<CornerCode pending={data.pending} joined={data.pendingPlayers} />}
      />
      <main className={styles.stage}>
        {/* Keyed on the screen: Show day board / a reload crossfades the whole stage once
            (`--dur-step`, ~300 ms; instant under reduced motion) — no merge, no per-row cascade. */}
        <div key={onDayBoard ? 'dayboard' : 'results'} className={styles.crossfade}>
          {onDayBoard ? (
            <DayBoardTabs
              lineup={lineup}
              tab={tab}
              onPick={pickTab}
              progress={rotating && !reduced ? `${tab}:${rotations}` : null}
            />
          ) : null}
          {!onDayBoard ? (
            <SessionResults
              sessionId={session.id}
              lineup={lineup}
              board={results.board}
              breakdown={results.breakdown}
            />
          ) : (
            <DayBoardPanel
              key={lineup[tab] ?? lineup[0]}
              ref={dayBoardArea}
              game={lineup[tab] ?? lineup[0]}
              rows={day.rows}
              sessionScores={day.sessionScores}
              firstCycle={rotations < lineup.length}
              reveal
            />
          )}
        </div>
      </main>
      <OperatorBar start={<NextGamesButton host={host} pending={data.pending} />}>
        {!onDayBoard ? (
          <>
            {newSessionButton(false)}
            <button
              type="button"
              className={hostStyles.primary}
              onClick={() => void showDayBoard()}
              disabled={showing}
              data-testid="host-show-day-board"
            >
              {t('host.results.show_day_board')}
            </button>
          </>
        ) : (
          newSessionButton(true)
        )}
      </OperatorBar>
    </>
  );
}

// ------------------------------------------------------------------ H4

/** The winner's total: the screen's hero number, counting up once, with an amber rule under the digits. */
function HeroTotal({ value, delay, animate }: { value: number; delay: number; animate: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  // Only the first count waits for the table; a late score (E22) counts on at once.
  const first = useRef(true);
  useCountUp(ref, value, {
    duration: tokenMs('--dur-countup-hero', FALLBACK.countupHero),
    delay: first.current ? delay : 0,
    enabled: animate,
  });
  useLayoutEffect(() => {
    first.current = false;
  }, []);
  const final = formatNumber(value);
  // Reserve the final width so the count-up never reflows the podium (tabular digits are 1ch).
  const digits = final.replace(/\D/g, '').length;
  const width = `${digits + (final.length - digits) * 0.5}ch`;
  return (
    <span className={styles.heroTotal} dir="ltr" style={{ minInlineSize: width }}>
      <span ref={ref} data-testid="host-winner-total">
        {final}
      </span>
    </span>
  );
}

/** H4. Memoised (its props are stable across the host's re-renders), like the boards in it. */
const SessionResults = memo(
  forwardRef<
    HTMLDivElement,
    {
      sessionId: string;
      lineup: readonly GameId[];
      board: RankedRow[] | null;
      breakdown: readonly RoundScoreRow[];
    }
  >(function SessionResults({ sessionId, lineup, board, breakdown }, ref) {
    const t = useT();
    // The columns depend on the language, not on `t` (a new function every render).
    const { lang } = useLang();
    const reduced = useReducedMotion();
    const density = useDensity('projector');
    // The entry plays once per session on this tab (not after a reload, never on a poll).
    const [animate] = useState(() => !podiumPlayed(sessionId));
    const winner = board?.[0] ?? null;
    const hasWinner = winner !== null;
    // Read when a count-up or the celebrate starts, so a later value doesn't reschedule them.
    const heroDelay = heroDelayMs(board?.length ?? 0);

    // The celebrate shatter on the winner, once, when the hero count-up has landed (the
    // reduced-motion fallback is a static amber ring). Imperative: no React state.
    const hero = useRef<HTMLDivElement>(null);
    const celebrated = useRef(false);
    const latest = useRef({ reduced, density });
    latest.current = { reduced, density };
    useEffect(() => {
      if (!hasWinner || celebrated.current) return;
      if (!animate) {
        celebrated.current = true;
        return;
      }
      markPodiumPlayed(sessionId);
      let handle: ShatterHandle | null = null;
      const at = reduced ? 0 : heroDelay + tokenMs('--dur-countup-hero', FALLBACK.countupHero);
      const timer = window.setTimeout(() => {
        celebrated.current = true;
        const el = hero.current;
        if (el)
          handle = playCelebrate(el, {
            density: latest.current.density,
            reducedMotion: latest.current.reduced,
          });
      }, at);
      return () => {
        window.clearTimeout(timer);
        handle?.cancel();
      };
      // Once per mount: late scores and poll refreshes never replay it.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasWinner]);

    const scoreOf = useMemo(() => {
      const m = new Map<string, number>();
      for (const b of breakdown) m.set(`${b.playerRowId}|${b.game}`, b.score);
      return m;
    }, [breakdown]);
    const columns = useMemo(
      () =>
        lineup.map((g) => ({
          key: g,
          head: translate(lang, `game.${g}.name`),
          className: styles.roundCol,
          value: (row: RankedRow): ReactNode => {
            const s = scoreOf.get(`${row.playerRowId}|${g}`);
            return (
              <span data-testid="board-round-score" data-game={g}>
                {s === undefined ? translate(lang, 'results.breakdown_missing') : formatNumber(s)}
              </span>
            );
          },
        })),
      [lineup, scoreOf, lang],
    );

    const runnersUp = board ? board.slice(1, 3) : NO_ROWS;
    return (
      <div ref={ref} className={styles.results} data-testid="host-results">
        <aside className={styles.podium}>
          <div className={styles.eyebrows}>
            <h1 className={styles.eyebrow}>{t('results.eyebrow')}</h1>
            {winner ? <p className={styles.eyebrow}>{t('host.results.winner')}</p> : null}
          </div>
          {winner ? (
            <>
              {/* The name, then the hero number framed by the chevrons like the lobby code. */}
              <div ref={hero} className={styles.winner} data-testid="host-winner">
                <div className={styles.winnerName}>
                  <bdi>{displayName(winner.name, winner.displaySuffix)}</bdi>
                </div>
                <Framed className={styles.frame}>
                  <HeroTotal value={winner.value} delay={heroDelay} animate={animate} />
                </Framed>
              </div>
              {runnersUp.length > 0 ? (
                <ol className={styles.runnersUp}>
                  {runnersUp.map((r) => (
                    <li key={r.playerRowId} className={styles.runnerUp}>
                      <span className={styles.runnerRank}>{formatNumber(r.rank)}</span>
                      <span className={styles.runnerName}>
                        <bdi>{displayName(r.name, r.displaySuffix)}</bdi>
                      </span>
                      <span className={styles.runnerScore}>{formatNumber(r.value)}</span>
                    </li>
                  ))}
                </ol>
              ) : null}
            </>
          ) : board ? (
            <p className={styles.sideEmpty}>{t('results.no_scores')}</p>
          ) : null}
        </aside>
        <section
          className={styles.sessionArea}
          data-testid={board && board.length === 0 ? 'host-no-scores' : undefined}
        >
          <BoardTable
            rows={board ?? NO_ROWS}
            testId="host-session-board"
            columns={columns}
            slots={SLOTS}
            countUp={animate}
          />
        </section>
      </div>
    );
  }),
);

// ------------------------------------------------------------------ H5

/**
 * "Today's best" and one tab per game of the session, across the top of the board.
 * `progress` (a new value per rotation, null while the merge plays or under reduced
 * motion) runs the active tab's underline from 0 to full over DAYBOARD_ROTATE_MS.
 */
function DayBoardTabs({
  lineup,
  tab,
  onPick,
  progress,
}: {
  lineup: readonly GameId[];
  tab: number;
  onPick(i: number): void;
  progress: string | null;
}) {
  const t = useT();
  const hintId = useId();
  return (
    <div className={styles.dayHead}>
      <h1 className={styles.eyebrow}>{t('dayboard.title')}</h1>
      <span className={styles.dayRule} aria-hidden="true" />
      <nav
        className={styles.tabs}
        role="tablist"
        aria-label={t('dayboard.title')}
        data-testid="host-dayboard-tabs"
      >
        {lineup.map((g, i) => (
          <button
            key={g}
            type="button"
            role="tab"
            aria-selected={i === tab}
            aria-describedby={i === tab && progress !== null ? hintId : undefined}
            className={`${styles.tab} ${i === tab ? styles.tabOn : ''}`}
            onClick={() => onPick(i)}
            data-testid={`dayboard-tab-${g}`}
          >
            {t(`game.${g}.name`)}
            {i === tab ? (
              <TabUnderline key={progress ?? 'still'} running={progress !== null} />
            ) : null}
          </button>
        ))}
      </nav>
      {progress !== null ? (
        <span id={hintId} className="visually-hidden">
          {t('host.dayboard.next_in', { s: formatNumber(DAYBOARD_ROTATE_MS / 1000) })}
        </span>
      ) : null}
    </div>
  );
}

/** The active tab's blue underline; while `running` it fills toward the inline end over the rotation (WAAPI, no commits). */
function TabUnderline({ running }: { running: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!running || !el || typeof el.animate !== 'function') return;
    const anim = el.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], {
      duration: DAYBOARD_ROTATE_MS,
      easing: 'linear',
      fill: 'both',
    });
    return () => anim.cancel();
  }, [running]);
  return <span ref={ref} className={styles.tabUnderline} aria-hidden="true" />;
}

/** One game's day board (keyed per game by the caller, so a tab change cascades its rows in). */
const DayBoardPanel = memo(
  forwardRef<
    HTMLDivElement,
    {
      game: GameId;
      rows: Record<string, DayBoardRow[]>;
      sessionScores: readonly SessionScoreRow[];
      /** Rows from this session are marked during the merge and the first rotation. */
      firstCycle: boolean;
      /** false while the merge owns the rows: no entry animation (it hides and reassembles them itself). */
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
        new Set(
          firstCycle && current
            ? current.filter((r) => fromSession(r, game, sessionScores)).map((r) => r.nameKey)
            : [],
        ),
      [firstCycle, current, game, sessionScores],
    );
    return (
      <div ref={ref} className={styles.dayboard} data-testid="host-dayboard" data-game={game}>
        <BoardTable
          rows={ranked}
          reveal={reveal}
          testId="host-day-board"
          highlightIds={highlight}
          slots={SLOTS}
          countUp={false}
          emptyText={current && current.length === 0 ? t('host.dayboard.empty') : undefined}
        />
      </div>
    );
  }),
);

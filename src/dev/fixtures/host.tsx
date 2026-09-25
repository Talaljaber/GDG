/* eslint-disable react-refresh/only-export-components -- dev fixtures export data, not a component module */
/**
 * Dev-only fixtures for the big screen (src/host/*, SCREENS.md §2, DESIGN_SYSTEM §0.2).
 * Screens get a fake HostController / HostData and their `preview` data, so nothing
 * here calls Supabase (admin calls go through the fake `act`, which never runs them).
 */
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import type { Fixture } from '../Preview';
import type { DayBoardRow, PlayerRow, RevealRow, RoundRow, RoundScoreRow, SessionRow, SessionScoreRow } from '../../lib/api';
import type { RankedRow } from '../../lib/boards';
import type { GameId } from '../../games/types';
import { HostMotionProvider } from '../../host/motion';
import { HostShell } from '../../host/common';
import { HostLobby, HostRound } from '../../host/screens';
import { HostIntermission } from '../../host/Intermission';
import { HostSessionEnd } from '../../host/Results';
import { SignIn } from '../../host/HostApp';
import type { HostController, HostData, IntermissionInfo } from '../../host/useHost';
import type { IntermissionStep } from '../../host/schedule';
import { STC_TARGETS_MS } from '../../games/stop-the-clock/scoring';

const noop = () => {};
const LINEUP: GameId[] = ['stop_the_clock', 'odd_one_out', 'simon'];
const NEXT_LINEUP: GameId[] = ['simon', 'perfect_circle', 'odd_one_out'];
const AT = '2026-09-25T10:00:00.000Z';

const NAMES = [
  'عبدالرحمن سا',
  'Maximilian R',
  'Sara',
  'Sara',
  'ليان',
  'Omar 99',
  'محمد الخطيب',
  'Lina',
  'Yazan',
  'نور',
  'Christopher',
  'رهف العمري',
  'Ahmad',
  'Dana',
  'Kareem Saleh',
  'جود',
  'Tala',
  'Mohammad Ali',
  'ريم',
  'Hamza',
  'Zaid',
  'سلمى',
  'Leen',
  'فرح الزعبي',
  'Rashed',
  'Bashar',
  'يزن',
  'Noor',
  'Aws',
  'تيم',
];

function session(over: Partial<SessionRow> = {}): SessionRow {
  return {
    id: 's1',
    code: '4821',
    status: 'lobby',
    lineup: LINEUP,
    event_day_id: 'd1',
    day_board_shown_at: null,
    ...over,
  } as unknown as SessionRow;
}

const pending = session({ id: 's2', code: '5307', status: 'pending', lineup: NEXT_LINEUP });

function players(n: number): PlayerRow[] {
  const seen = new Map<string, number>();
  return NAMES.slice(0, n).map((name, i) => {
    const count = (seen.get(name) ?? 0) + 1;
    seen.set(name, count);
    return {
      id: `p${i}`,
      player_id: `u${i}`,
      name,
      display_suffix: count >= 2 ? count : null,
      status: 'joined',
      session_id: 's1',
    } as unknown as PlayerRow;
  });
}

function rounds(playing: number | null, doneUpTo: number): RoundRow[] {
  const started = new Date(Date.now() - 54_000).toISOString();
  return LINEUP.map(
    (game, i) =>
      ({
        id: `r${i + 1}`,
        round_no: i + 1,
        game,
        status: i + 1 === playing ? 'playing' : i + 1 <= doneUpTo ? 'done' : 'upcoming',
        started_at: i + 1 === playing ? started : null,
        ended_at: i + 1 <= doneUpTo ? AT : null,
      }) as unknown as RoundRow,
  );
}

function data(over: Partial<HostData> = {}): HostData {
  return { session: session(), running: false, rounds: [], players: players(0), pending: null, pendingPlayers: 0, ...over };
}

function host(over: Partial<HostController> & { data: HostData }): HostController {
  return {
    screen: 'lobby',
    dbDown: false,
    live: true,
    presentIds: new Set<string>(),
    scoresVersion: 0,
    dayVersion: 0,
    scoredCount: null,
    offset: 0,
    intermission: null,
    reload: noop,
    endRound: async () => {},
    skipIntermission: noop,
    act: async () => {},
    ...over,
  };
}

/** Present ids for the first n players (the others go grey after 10 s). */
function present(n: number, of: number, grey: number[] = []): Set<string> {
  return new Set(
    Array.from({ length: Math.min(n, of) }, (_, i) => i)
      .filter((i) => !grey.includes(i))
      .map((i) => `u${i}`),
  );
}

function board(n: number, top = 980, tie = false): RankedRow[] {
  return NAMES.slice(0, n).map((name, i) => ({
    playerRowId: `p${i}`,
    name,
    displaySuffix: name === 'Sara' && i === 3 ? 2 : null,
    value: tie && i === 2 ? top - 37 : Math.max(0, top - i * 37 - (i > 4 ? 11 : 0)),
    rank: i + 1,
    isOwn: false,
    detached: false,
  }));
}

const screenCell: CSSProperties = { display: 'flex', flexDirection: 'column', flex: 1, minBlockSize: 0 };

function Frame({ screen, banner, children }: { screen: string; banner?: string; children: ReactNode }) {
  return (
    <HostMotionProvider>
      <HostShell screen={screen} banner={banner}>
        <div style={screenCell}>{children}</div>
      </HostShell>
    </HostMotionProvider>
  );
}

/** Clicks an element once after mount (menus and pickers that open on a tap). */
function AutoClick({ testId, children }: { testId: string; children: ReactNode }) {
  useEffect(() => {
    const id = window.setTimeout(() => (document.querySelector(`[data-testid="${testId}"]`) as HTMLElement | null)?.click(), 50);
    return () => window.clearTimeout(id);
  }, [testId]);
  return <>{children}</>;
}

// ------------------------------------------------------------------ H1

function Lobby({ n, lineup = LINEUP, grey = [] }: { n: number; lineup?: GameId[]; grey?: number[] }) {
  const d = data({ players: players(n), session: session({ lineup }) });
  return (
    <Frame screen="lobby">
      <HostLobby host={host({ data: d, presentIds: present(n, n, grey) })} data={d} />
    </Frame>
  );
}

// ------------------------------------------------------------------ H2

function Round({ scored = 12, n = 18 }: { scored?: number; n?: number }) {
  const d = data({
    session: session({ status: 'playing' }),
    running: true,
    rounds: rounds(2, 1),
    players: players(n),
    pending,
    pendingPlayers: 2,
  });
  return (
    <Frame screen="round">
      <HostRound host={host({ data: d, screen: 'round', scoredCount: scored })} data={d} preview={{ board: board(10, 940) }} />
    </Frame>
  );
}

// ------------------------------------------------------------------ H3

function stcRaw(i: number): unknown {
  // Spread guesses around each target, a couple beyond ±5 s (pinned).
  const offsets = [
    [120, -340, 60],
    [-610, 900, -220],
    [1400, -1800, 700],
    [-2300, 2600, -1500],
    [3100, -3900, 2400],
  ];
  const o = offsets[i % offsets.length];
  const spread = 1 + Math.floor(i / 5) * 0.35;
  return {
    attempts: STC_TARGETS_MS.map((target, k) => ({
      target_ms: target,
      measured_ms: i === 19 && k === 2 ? null : target + Math.round(o[k] * spread * (i % 2 ? -1 : 1)) + (i === 18 ? 6200 : 0),
    })),
  };
}

function reveal(n: number): RevealRow[] {
  return board(n, 990).map((r, i) => ({
    playerRowId: r.playerRowId,
    name: r.name,
    displaySuffix: r.displaySuffix,
    score: r.value,
    raw: stcRaw(i),
  }));
}

function Intermission({ step, roundNo, last = false }: { step: IntermissionStep; roundNo: number; last?: boolean }) {
  const rs = rounds(null, roundNo);
  const d = data({
    session: session({ status: last ? 'results' : 'playing' }),
    running: true,
    rounds: rs,
    players: players(20),
    pending,
    pendingPlayers: 3,
  });
  const info: IntermissionInfo = {
    round: rs[roundNo - 1],
    next: last ? null : rs[roundNo],
    state: { step, stepEndsAtMs: Date.now() + (step === 'next_intro' ? 2400 : 5000) },
  };
  return (
    <Frame screen="intermission">
      <HostIntermission
        host={host({ data: d, screen: 'intermission', intermission: info })}
        data={d}
        preview={{ roundBoard: board(10, 960), totalBoard: board(10, 1890, true), reveal: reveal(20) }}
      />
    </Frame>
  );
}

// ------------------------------------------------------------------ H4 / H5

function breakdown(rows: RankedRow[]): RoundScoreRow[] {
  return rows.flatMap((r, i) =>
    LINEUP.flatMap((game, k) =>
      i === 9 && k === 2 ? [] : [{ playerRowId: r.playerRowId, game, score: Math.round(r.value / 3) + (k - 1) * 17 }],
    ),
  );
}

function dayRows(): Record<string, DayBoardRow[]> {
  const out: Record<string, DayBoardRow[]> = {};
  LINEUP.forEach((game, g) => {
    out[game] = NAMES.slice(g * 3, g * 3 + 10).map((name, i) => ({
      nameKey: `${game}-${i}`,
      name,
      score: 990 - i * 41 - g * 7,
      achievedAt: i % 3 === 1 ? AT : '2026-09-25T08:00:00.000Z',
    }));
  });
  return out;
}

function sessionScores(rows: Record<string, DayBoardRow[]>): SessionScoreRow[] {
  return Object.entries(rows).flatMap(([game, list]) =>
    list
      .filter((r) => r.achievedAt === AT)
      .map((r) => ({ playerRowId: r.nameKey, game: game as GameId, score: r.score, createdAt: AT, name: r.name })),
  );
}

function SessionEnd({ day }: { day: boolean }) {
  const d = data({
    session: session({ status: 'results', day_board_shown_at: day ? AT : null }),
    running: true,
    rounds: rounds(null, 3),
    players: players(20),
    pending,
    pendingPlayers: 4,
  });
  const top = board(10, 2890, true);
  const rows = dayRows();
  return (
    <Frame screen={day ? 'dayboard' : 'results'}>
      <HostSessionEnd
        host={host({ data: d, screen: day ? 'dayboard' : 'results' })}
        data={d}
        preview={{ board: top, breakdown: breakdown(top), dayRows: rows, sessionScores: sessionScores(rows) }}
      />
    </Frame>
  );
}

/**
 * H4 → H5 with the day-board merge: "Show day board" really switches the screen (the fake
 * `act`), and `?auto=1` taps it 500 ms after load. `staged`: the day boards arrive the way
 * the live host gets them, in several steps after the tap (one game at a time, then this
 * session's scores), plus a refetch mid-merge, as `useDayBoardData` does on a score or hide.
 */
function SessionEndMerge({ staged = false }: { staged?: boolean }) {
  const [screen, setScreen] = useState<'results' | 'dayboard'>('results');
  const all = useMemo(dayRows, []);
  const [rows, setRows] = useState<Record<string, DayBoardRow[]>>(staged ? {} : all);
  const [scores, setScores] = useState<SessionScoreRow[]>(staged ? [] : sessionScores(all));
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('auto')) return;
    const id = window.setTimeout(() => (document.querySelector('[data-testid="host-show-day-board"]') as HTMLElement | null)?.click(), 500);
    return () => window.clearTimeout(id);
  }, []);
  useEffect(() => {
    if (!staged || screen !== 'dayboard') return;
    const steps: Array<[number, () => void]> = LINEUP.map((game, i) => [
      300 + i * 600,
      () => setRows((r) => ({ ...r, [game]: all[game] })),
    ]);
    steps.push([2200, () => setScores(sessionScores(all))], [6000, () => setRows({ ...all })]);
    const ids = steps.map(([ms, fn]) => window.setTimeout(fn, ms));
    return () => ids.forEach((id) => window.clearTimeout(id));
  }, [staged, screen, all]);
  const d = data({
    session: session({ status: 'results', day_board_shown_at: screen === 'dayboard' ? AT : null }),
    running: true,
    rounds: rounds(null, 3),
    players: players(20),
    pending,
    pendingPlayers: 4,
  });
  const top = useMemo(() => board(10, 2890, true), []);
  return (
    <Frame screen={screen}>
      <HostSessionEnd
        host={host({ data: d, screen, act: async () => setScreen('dayboard') })}
        data={d}
        preview={{ board: top, breakdown: breakdown(top), dayRows: rows, sessionScores: scores }}
      />
    </Frame>
  );
}

// ------------------------------------------------------------------ fixtures

export const fixtures: Fixture[] = [
  { name: 'host.signin', frame: 'desktop', render: () => <SignIn notice={null} onNotAdmin={noop} onSignedIn={noop} /> },
  {
    name: 'host.signin-error',
    frame: 'desktop',
    render: () => <SignIn notice="host.signin.not_admin" onNotAdmin={noop} onSignedIn={noop} />,
  },
  { name: 'host.lobby-empty', frame: 'projector', render: () => <Lobby n={0} /> },
  { name: 'host.lobby-3', frame: 'projector', render: () => <Lobby n={3} /> },
  { name: 'host.lobby-30', frame: 'projector', render: () => <Lobby n={30} grey={[4, 11, 17, 26]} /> },
  { name: 'host.lobby-invalid', frame: 'projector', render: () => <Lobby n={3} lineup={['stop_the_clock', 'simon']} /> },
  {
    name: 'host.lobby-settings',
    frame: 'projector',
    render: () => (
      <AutoClick testId="host-settings">
        <Lobby n={3} />
      </AutoClick>
    ),
  },
  { name: 'host.round', frame: 'projector', render: () => <Round /> },
  {
    name: 'host.round-next-games',
    frame: 'projector',
    render: () => (
      <AutoClick testId="host-next-games">
        <Round />
      </AutoClick>
    ),
  },
  { name: 'host.intermission-board', frame: 'projector', render: () => <Intermission step="round_board" roundNo={2} /> },
  { name: 'host.intermission-stc', frame: 'projector', render: () => <Intermission step="round_board" roundNo={1} /> },
  { name: 'host.intermission-total', frame: 'projector', render: () => <Intermission step="session_total" roundNo={2} /> },
  { name: 'host.intermission-next', frame: 'projector', render: () => <Intermission step="next_intro" roundNo={1} /> },
  { name: 'host.results', frame: 'projector', render: () => <SessionEnd day={false} /> },
  { name: 'host.dayboard', frame: 'projector', render: () => <SessionEnd day /> },
  { name: 'host.merge', frame: 'projector', render: () => <SessionEndMerge /> },
  { name: 'host.merge-staged', frame: 'projector', render: () => <SessionEndMerge staged /> },
];

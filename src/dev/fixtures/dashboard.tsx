/**
 * Dev-only fixtures for the admin dashboard (src/dashboard/*, DESIGN_SYSTEM §0.4).
 * Every page renders through the real components with a fake api passed via
 * DashApiProvider (src/dashboard/apiContext.tsx); nothing here calls Supabase.
 */
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import type { Fixture } from '../Preview';
import { DashApiProvider } from '../../dashboard/apiContext';
import type { DashApi } from '../../dashboard/dashApi';
import { DashboardMain, SignIn, type DashTab } from '../../dashboard/DashboardApp';
import type {
  BlockedTermRow,
  CombinedScoreRow,
  DayBoardRow,
  EventDayRow,
  GameId,
  HiddenNameRow,
  PlayerRow,
  RoundRow,
  ScoreRow,
  SessionRow,
  SessionWinner,
} from '../../dashboard/api';

// ------------------------------------------------------------------ data

const DAY2: EventDayRow = { id: 'day-2', label: 'Day 2 · Sep 25', started_at: '2026-09-25T07:30:00.000Z', ended_at: null, is_current: true };
const DAY1: EventDayRow = {
  id: 'day-1',
  label: 'Day 1 · Sep 24',
  started_at: '2026-09-24T07:45:00.000Z',
  ended_at: '2026-09-24T16:10:00.000Z',
  is_current: false,
};
const DAYS = [DAY2, DAY1];

const LINEUPS: GameId[][] = [
  ['odd_one_out', 'stop_the_clock', 'simon'],
  ['trivia', 'perfect_circle', 'odd_one_out'],
  ['simon', 'trivia', 'stop_the_clock'],
  ['perfect_circle', 'odd_one_out', 'trivia'],
  ['stop_the_clock', 'simon', 'perfect_circle'],
];
const CODES = ['4821', '7305', '1964', '5530', '8217'];
const STATUSES: SessionRow['status'][] = ['closed', 'closed', 'closed', 'closed', 'playing'];

const SESSIONS: SessionRow[] = CODES.map((code, i) => {
  const start = new Date(Date.UTC(2026, 8, 25, 8, 5 + i * 11)).toISOString();
  return {
    id: `s${i + 1}`,
    event_day_id: 'day-2',
    code,
    status: STATUSES[i],
    lineup: LINEUPS[i],
    current_round: STATUSES[i] === 'playing' ? 2 : null,
    created_at: start,
    opened_at: start,
    started_at: start,
    ended_at: STATUSES[i] === 'closed' ? start : null,
    day_board_shown_at: null,
    closed_at: null,
  };
});
const PLAYER_COUNTS = [8, 12, 6, 15, 9];
const WINNERS: (SessionWinner | null)[] = [
  { name: 'عبدالله محمد', displaySuffix: null, total: 2604 },
  { name: 'Lina', displaySuffix: null, total: 2481 },
  { name: 'Sara', displaySuffix: 2, total: 2377 },
  { name: 'Maximilian K', displaySuffix: null, total: 2712 },
  null,
];

const NAMES: Array<[string, number | null]> = [
  ['عبدالله محمد', null],
  ['Maximilian K', null],
  ['Sara', null],
  ['Sara', 2],
  ['ليان', null],
  ['Omar 99', null],
  ['محمد الخطيب', null],
  ['Lina', null],
  ['Yazan', null],
  ['نور', null],
];
const GAMES: GameId[] = ['odd_one_out', 'stop_the_clock', 'simon', 'perfect_circle', 'trivia'];

const RESULTS: CombinedScoreRow[] = Array.from({ length: 40 }, (_, i) => {
  const [name, suffix] = NAMES[i % NAMES.length];
  const s = SESSIONS[i % 4];
  return {
    id: `r${i}`,
    name,
    nameKey: name.toLowerCase(),
    displaySuffix: suffix,
    game: GAMES[(i * 3) % GAMES.length],
    score: 180 + ((i * 373) % 820),
    createdAt: new Date(Date.UTC(2026, 8, 25, 8, 9 + i * 2, (i * 17) % 60)).toISOString(),
    sessionId: s.id,
    sessionCode: s.code,
    eventDayId: 'day-2',
  };
});

const DETAIL_ROUNDS: RoundRow[] = SESSIONS[0].lineup.map((game, i) => ({
  id: `rd${i + 1}`,
  session_id: 's1',
  round_no: i + 1,
  game,
  status: 'done',
  started_at: SESSIONS[0].started_at,
  ended_at: SESSIONS[0].started_at,
  end_reason: (['all_finished', 'time_cap', 'force_end'] as const)[i],
}));

const DETAIL_PLAYERS: PlayerRow[] = NAMES.slice(0, 8).map(([name, suffix], i) => ({
  id: `p${i + 1}`,
  session_id: 's1',
  player_id: `u${i + 1}`,
  name,
  name_key: name.toLowerCase(),
  display_suffix: suffix,
  status: i === 6 ? 'removed' : 'joined',
  progress: 'finished',
  progress_round: 3,
  joined_at: SESSIONS[0].created_at,
  removed_at: i === 6 ? SESSIONS[0].created_at : null,
}));

const DETAIL_SCORES: ScoreRow[] = DETAIL_PLAYERS.flatMap((p, pi) =>
  pi === 6
    ? []
    : DETAIL_ROUNDS.filter((_, ri) => !(pi === 5 && ri === 2)).map((r, ri) => ({
        id: `sc${pi}-${ri}`,
        round_id: r.id,
        player_id: p.player_id,
        score: 960 - pi * 83 - ri * 41 + ((pi * 7 + ri * 13) % 50),
        duration_ms: 30000,
        raw: {},
        client_version: null,
        session_id: 's1',
        event_day_id: 'day-2',
        player_row_id: p.id,
        game: r.game,
        name: p.name,
        name_key: p.name_key,
        display_suffix: p.display_suffix,
        created_at: SESSIONS[0].started_at ?? '',
      })),
);

const HIDDEN: HiddenNameRow[] = [
  { name_key: 'qwerty', note: null, hidden_at: '2026-09-25T09:12:00.000Z' },
  { name_key: 'test 123', note: null, hidden_at: '2026-09-25T10:40:00.000Z' },
  { name_key: 'مجهول', note: null, hidden_at: '2026-09-25T11:05:00.000Z' },
];

const BLOCKED: BlockedTermRow[] = [
  { term_key: 'admin', match: 'word', lang: 'any', added_at: '2026-09-24T07:00:00.000Z' },
  { term_key: 'host', match: 'word', lang: 'any', added_at: '2026-09-24T07:00:00.000Z' },
  { term_key: 'spam', match: 'substring', lang: 'en', added_at: '2026-09-24T07:00:00.000Z' },
  { term_key: 'مشرف', match: 'word', lang: 'ar', added_at: '2026-09-24T07:00:00.000Z' },
];

const DAY_BOARD: DayBoardRow[] = [
  { eventDayId: 'day-2', game: 'trivia', nameKey: 'sara', name: 'Sara', score: 835, achievedAt: '2026-09-25T10:00:00.000Z' },
  { eventDayId: 'day-2', game: 'simon', nameKey: 'sara', name: 'Sara', score: 612, achievedAt: '2026-09-25T10:20:00.000Z' },
];

// ------------------------------------------------------------------ fake apis

const ok = <T,>(v: T) => () => Promise.resolve(v);
const never = () => new Promise<never>(() => {});

const full: DashApi = {
  adminAddBlockedTerm: ok(undefined),
  adminHideName: ok(undefined),
  adminRemoveBlockedTerm: ok(undefined),
  adminStartNewDay: ok(DAY2),
  adminUnhideName: ok(undefined),
  countJoinedPlayers: ok(50),
  countJoinedPlayersForSession: (id: string) => Promise.resolve(PLAYER_COUNTS[SESSIONS.findIndex((s) => s.id === id)] ?? 0),
  countScores: ok(138),
  fetchBlockedTerms: ok(BLOCKED),
  fetchCombinedResults: ok(RESULTS),
  fetchCurrentEventDay: ok(DAY2),
  fetchDayBoard: ok(DAY_BOARD),
  fetchEventDays: ok(DAYS),
  fetchHiddenNames: ok(HIDDEN),
  fetchPlayersForSession: ok(DETAIL_PLAYERS),
  fetchPlayingSession: ok(null),
  fetchRoundsForSession: ok(DETAIL_ROUNDS),
  fetchScoresForSession: ok(DETAIL_SCORES),
  fetchSessionById: ok(SESSIONS[0]),
  fetchSessionWinner: (id: string) => Promise.resolve(WINNERS[SESSIONS.findIndex((s) => s.id === id)] ?? null),
  fetchSessionsForDay: ok(SESSIONS),
};

const empty: DashApi = {
  ...full,
  countJoinedPlayers: ok(0),
  countScores: ok(0),
  fetchBlockedTerms: ok([]),
  fetchCombinedResults: ok([]),
  fetchEventDays: ok([DAY2]),
  fetchHiddenNames: ok([]),
  fetchSessionsForDay: ok([]),
};

const loading: DashApi = Object.fromEntries(Object.keys(full).map((k) => [k, never])) as unknown as DashApi;

const blockedDay: DashApi = { ...full, fetchPlayingSession: ok(SESSIONS[4]) };

// ------------------------------------------------------------------ helpers

/** Drives the real form after mount (fill an input, click a button) to open a confirm dialog. */
function Drive({ steps, children }: { steps: Array<{ fill?: string; value?: string; click?: string }>; children: ReactNode }) {
  useEffect(() => {
    const timers = steps.map((s, i) =>
      window.setTimeout(() => {
        if (s.fill) {
          const el = document.querySelector<HTMLInputElement>(`[data-testid="${s.fill}"]`);
          if (!el) return;
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, s.value ?? '');
          el.dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (s.click) document.querySelector<HTMLElement>(`[data-testid="${s.click}"]`)?.click();
      }, 200 + i * 150),
    );
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [steps]);
  return <>{children}</>;
}

function page(api: DashApi, tab: DashTab, sessionId: string | null = null) {
  return () => (
    <DashApiProvider value={api}>
      <DashboardMain adminEmail="booth@gdg-campus.example" initialTab={tab} initialSessionId={sessionId} />
    </DashApiProvider>
  );
}

const noop = () => {};
const HIDE_STEPS = [{ fill: 'hide-name-input', value: 'Sara' }, { click: 'hide-name-preview-btn' }];
const DAY_STEPS = [{ fill: 'new-day-input', value: 'Day 3 · Sep 26' }, { click: 'new-day-submit' }];

export const fixtures: Fixture[] = [
  { name: 'dashboard.signin', frame: 'desktop', render: () => <SignIn notice={null} onNotAdmin={noop} onSignedIn={noop} /> },
  {
    name: 'dashboard.signin-error',
    frame: 'desktop',
    render: () => <SignIn notice="host.signin.not_admin" onNotAdmin={noop} onSignedIn={noop} />,
  },
  { name: 'dashboard.today', frame: 'desktop', render: page(full, 'today') },
  { name: 'dashboard.today-empty', frame: 'desktop', render: page(empty, 'today') },
  { name: 'dashboard.today-loading', frame: 'desktop', render: page(loading, 'today') },
  { name: 'dashboard.sessions', frame: 'desktop', render: page(full, 'sessions') },
  { name: 'dashboard.sessions-empty', frame: 'desktop', render: page(empty, 'sessions') },
  { name: 'dashboard.sessions-loading', frame: 'desktop', render: page(loading, 'sessions') },
  { name: 'dashboard.session-detail', frame: 'desktop', render: page(full, 'sessions', 's1') },
  { name: 'dashboard.results', frame: 'desktop', render: page(full, 'results') },
  { name: 'dashboard.results-empty', frame: 'desktop', render: page(empty, 'results') },
  { name: 'dashboard.results-loading', frame: 'desktop', render: page(loading, 'results') },
  { name: 'dashboard.names', frame: 'desktop', render: page(full, 'names') },
  { name: 'dashboard.names-empty', frame: 'desktop', render: page(empty, 'names') },
  {
    name: 'dashboard.names-hide-confirm',
    frame: 'desktop',
    render: () => <Drive steps={HIDE_STEPS}>{page(full, 'names')()}</Drive>,
  },
  { name: 'dashboard.days', frame: 'desktop', render: page(full, 'days') },
  { name: 'dashboard.days-blocked', frame: 'desktop', render: page(blockedDay, 'days') },
  {
    name: 'dashboard.days-confirm',
    frame: 'desktop',
    render: () => <Drive steps={DAY_STEPS}>{page(full, 'days')()}</Drive>,
  },
];

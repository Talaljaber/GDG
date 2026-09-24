/**
 * Dev-only fixtures for the player phone (SCREENS §1, DESIGN_SYSTEM §0.3).
 * Every P-screen and state from fake props: the pure `…View` components,
 * the join screens with a starting error, and the games from snapshots.
 * Never calls Supabase. Screenshots freeze the clock so game timers hold.
 */
import type { ComponentType, ReactNode } from 'react';
import type { Fixture } from '../Preview';
import type { GameId } from '../../lib/api';
import type { RankedRow } from '../../lib/boards';
import type { GameProps } from '../../games/types';
import { games } from '../../games/registry';
import { Shell } from '../../player/PlayerApp';
import { CodeScreen, NameScreen } from '../../player/JoinFlow';
import {
  EndedScreen,
  GameFrame,
  IntroView,
  LobbyView,
  OtherTabScreen,
  RemovedScreen,
  ResultsView,
  RoundResultView,
} from '../../player/screens';
import { DayBoardView, IntermissionView } from '../../player/betweenScreens';
import { drawTriviaQuestions, type TriviaPoolQuestion } from '../../games/trivia/draw';
import { triviaPoolFile } from '../../games/trivia/pool';

const noop = () => {};
const LINEUP: GameId[] = ['stop_the_clock', 'odd_one_out', 'trivia'];
const ALL_GAMES: GameId[] = ['stop_the_clock', 'odd_one_out', 'simon', 'perfect_circle', 'trivia'];

// ---- boards

const NAMES: Array<[string, number | null]> = [
  ['عبدالرحمن محمد', null],
  ['Alexandrina K', null],
  ['Sara', null],
  ['Sara', 2],
  ['ليان', null],
  ['Omar 99', null],
  ['محمد الخطيب', null],
  ['Lina', null],
  ['Yazan', null],
  ['نور', null],
];

function board(scale: number, own: number | 'detached' | null): RankedRow[] {
  const rows: RankedRow[] = NAMES.map(([name, suffix], i) => ({
    playerRowId: `p${i}`,
    name,
    displaySuffix: suffix,
    value: Math.round(scale * (1 - i * 0.07)),
    rank: i + 1,
    isOwn: own === i,
    detached: false,
  }));
  if (own === 'detached') {
    rows.push({ playerRowId: 'own', name: 'Hamza', displaySuffix: null, value: Math.round(scale * 0.21), rank: 17, isOwn: true, detached: true });
  }
  return rows;
}

// ---- raw results per game (P7 breakdowns)

const RAW: Record<GameId, { score: number; raw: unknown }> = {
  stop_the_clock: {
    score: 617,
    raw: {
      attempts: [
        { target_ms: 5000, measured_ms: 5230, missed_start: false },
        { target_ms: 10000, measured_ms: 9610, missed_start: false },
        { target_ms: 7000, measured_ms: null, missed_start: true },
      ],
    },
  },
  odd_one_out: {
    score: 684,
    raw: {
      grids: [
        { size: 4, find_ms: 1480, wrong_taps: 0, timed_out: false },
        { size: 5, find_ms: 2890, wrong_taps: 1, timed_out: false },
        { size: 6, find_ms: 20000, wrong_taps: 0, timed_out: true },
      ],
    },
  },
  simon: { score: 473, raw: { level: 7, avg_gap_ms: 610, taps: 45, ended: 'mistake' } },
  perfect_circle: {
    score: 845,
    raw: { epsilon: 0.021, sweep_deg: 356, diameter_px: 212, stroke_ms: 1400, invalid_strokes: 0, timed_out: false },
  },
  trivia: {
    score: 706,
    raw: {
      questions: [
        { id: 'a', correct: true, answer_ms: 2100, timed_out: false },
        { id: 'b', correct: true, answer_ms: 3900, timed_out: false },
        { id: 'c', correct: false, answer_ms: 5200, timed_out: false },
        { id: 'd', correct: true, answer_ms: 1700, timed_out: false },
        { id: 'e', correct: false, answer_ms: null, timed_out: true },
      ],
    },
  },
};

// ---- helpers

function phone(name: string, render: () => ReactNode): Fixture {
  return { name: `player.${name}`, frame: 'phone', render };
}

function inShell(body: ReactNode, opts: { lang?: boolean; inRound?: boolean; offline?: boolean } = {}) {
  return (
    <Shell showLangToggle={opts.lang ?? true} inRound={opts.inRound ?? false} forceOffline={opts.offline ?? false}>
      {body}
    </Shell>
  );
}

function game(id: GameId, snapshot: unknown, seed = 'preview-seed') {
  const mod = games[id];
  if (!mod) return <p>{id} not registered</p>;
  const Game = mod.Component as ComponentType<GameProps<unknown>>;
  return inShell(
    <GameFrame>
      <Game
        seed={seed}
        roundStartEpoch={Date.now()}
        roundEnded={false}
        snapshot={snapshot}
        onProgress={noop}
        onFinish={noop}
      />
    </GameFrame>,
    { lang: false, inRound: true },
  );
}

const TRIVIA_SEED = 'preview-seed';
const drawn = () => drawTriviaQuestions(triviaPoolFile.questions as TriviaPoolQuestion[], TRIVIA_SEED);

function triviaAnswers(n: number) {
  return drawn()
    .slice(0, n)
    .map((q, i) => ({
      id: q.id,
      correct: i !== 2,
      answer_ms: i === 4 ? null : 2400 + i * 600,
      timed_out: i === 4,
      chosenIndex: i === 2 ? (q.correctIndex + 1) % 4 : i === 4 ? null : q.correctIndex,
    }));
}

// ---- fixtures

export const fixtures: Fixture[] = [
  // P1 / P2
  phone('p1-code', () => inShell(<CodeScreen initialError={null} onSubmit={noop} />)),
  phone('p1-code-error-format', () => inShell(<CodeScreen initialError="join.code.error_format" onSubmit={noop} />)),
  phone('p1-code-error-invalid', () => inShell(<CodeScreen initialError="join.code.error_invalid" onSubmit={noop} />)),
  ...(
    [
      ['p2-name', null, 'Sara'],
      ['p2-name-empty', 'join.name.error_empty', ''],
      ['p2-name-invalid', 'join.name.error_invalid', 'Bob!'],
      ['p2-name-blocked', 'join.name.error_blocked', 'badword'],
      ['p2-name-rate', 'join.error_rate', 'عبدالله خالد'],
      ['p2-name-network', 'join.error_network', 'Sara'],
      ['p2-name-warming', 'join.error_warming', 'Sara'],
    ] as const
  ).map(([n, err, name]) =>
    phone(n, () =>
      inShell(
        <NameScreen
          code="4821"
          name={name}
          onNameChange={noop}
          onBack={noop}
          onCodeInvalid={noop}
          onRemoved={noop}
          waitUntil={null}
          onWait={noop}
          onJoined={noop}
          initialError={err}
        />,
      ),
    ),
  ),
  phone('p2-name-wait', () =>
    inShell(
      <NameScreen
        code="4821"
        name="Alexandrina"
        onNameChange={noop}
        onBack={noop}
        onCodeInvalid={noop}
        onRemoved={noop}
        waitUntil={Date.now() + 27_000}
        onWait={noop}
        onJoined={noop}
      />,
    ),
  ),

  // P3 / P3b
  phone('p3-lobby-3', () => inShell(<LobbyView code="4821" lineup={LINEUP} name="Sara 2" pending={false} joined={3} />)),
  phone('p3-lobby-25', () =>
    inShell(<LobbyView code="4821" lineup={['perfect_circle', 'odd_one_out', 'stop_the_clock']} name="عبدالله خالد" pending={false} joined={25} />),
  ),
  phone('p3-lobby-1', () => inShell(<LobbyView code="4821" lineup={LINEUP} name="Alexandrina K" pending={false} joined={1} />)),
  phone('p3b-pending', () => inShell(<LobbyView code="5307" lineup={LINEUP} name="Lina" pending joined={4} />)),

  // P4 / P11 / other tab / system
  phone('p4-removed', () => inShell(<RemovedScreen onCta={noop} />)),
  phone('p11-ended', () => inShell(<EndedScreen onJoinNext={noop} />)),
  phone('sys-other-tab', () => inShell(<OtherTabScreen />, { lang: false })),
  phone('sys-offline', () => inShell(<LobbyView code="4821" lineup={LINEUP} name="Sara" pending={false} joined={9} />, { offline: true })),
  phone('sys-rotate', () => game('stop_the_clock', { phase: 'ready', attempts: [], readyStartEpoch: Date.now(), attemptStartEpoch: null })),

  // P5 intro per game
  ...ALL_GAMES.map((g, i) =>
    phone(`p5-intro-${g}`, () =>
      inShell(<IntroView game={g} roundNo={(i % 3) + 1} totalRounds={3} count={3 - (i % 3)} />, { lang: false, inRound: true }),
    ),
  ),

  // P6 games: intro card, a mid-game frame, the in-game result block
  ...ALL_GAMES.map((g) => phone(`p6-${g}-intro`, () => game(g, null))),
  phone('p6-stop_the_clock-ready', () =>
    game('stop_the_clock', {
      phase: 'ready',
      attempts: [{ target_ms: 5000, measured_ms: 5230, missed_start: false }],
      readyStartEpoch: Date.now(),
      attemptStartEpoch: null,
    }),
  ),
  phone('p6-stop_the_clock-locked', () =>
    game('stop_the_clock', {
      phase: 'locked',
      attempts: [{ target_ms: 5000, measured_ms: 5230, missed_start: false }],
      readyStartEpoch: null,
      attemptStartEpoch: null,
    }),
  ),
  phone('p6-odd_one_out-grid', () =>
    game('odd_one_out', { phase: 'grid', grids: [], gridStartEpoch: Date.now(), wrongTapsCurrent: 0, transitionType: null }),
  ),
  phone('p6-odd_one_out-grid3', () =>
    game('odd_one_out', {
      phase: 'grid',
      grids: [
        { size: 4, find_ms: 1480, wrong_taps: 0, timed_out: false },
        { size: 5, find_ms: 2890, wrong_taps: 1, timed_out: false },
      ],
      gridStartEpoch: Date.now(),
      wrongTapsCurrent: 0,
      transitionType: null,
    }),
  ),
  phone('p6-odd_one_out-found', () =>
    game('odd_one_out', {
      phase: 'transition',
      grids: [{ size: 4, find_ms: 1480, wrong_taps: 0, timed_out: false }],
      gridStartEpoch: null,
      wrongTapsCurrent: 0,
      transitionType: 'found',
    }),
  ),
  phone('p6-simon-watch', () => game('simon', { phase: 'input', level: 5, completedLevel: 4, gaps: [500, 480, 520, 450] })),
  phone('p6-perfect_circle-canvas', () =>
    game('perfect_circle', { phase: 'playing', attemptStartEpoch: Date.now(), invalidStrokes: 1, result: null }),
  ),
  phone('p6-perfect_circle-scored', () =>
    game('perfect_circle', {
      phase: 'scored',
      attemptStartEpoch: Date.now(),
      invalidStrokes: 0,
      result: RAW.perfect_circle,
    }),
  ),
  phone('p6-trivia-question', () => game('trivia', { phase: 'question', answers: [], questionStartEpoch: Date.now() - 2000 })),
  phone('p6-trivia-feedback', () =>
    game('trivia', { phase: 'feedback', answers: triviaAnswers(1), questionStartEpoch: null }),
  ),
  phone('p6-trivia-feedback-wrong', () =>
    game('trivia', { phase: 'feedback', answers: triviaAnswers(3), questionStartEpoch: null }),
  ),
  phone('p6-trivia-result', () => game('trivia', { phase: 'result', answers: triviaAnswers(5), questionStartEpoch: null })),

  // P7 round result, per game; new best; saving; failed; missed; waiting
  ...ALL_GAMES.map((g, i) =>
    phone(`p7-result-${g}`, () =>
      inShell(
        <RoundResultView
          round={{ game: g, round_no: (i % 3) + 1 }}
          totalRounds={3}
          result={RAW[g]}
          submitState="saved"
          newBest={false}
          board={board(RAW[g].score * 1.3, 3)}
          done={null}
        />,
      ),
    ),
  ),
  phone('p7-result-new-best', () =>
    inShell(
      <RoundResultView
        round={{ game: 'odd_one_out', round_no: 2 }}
        totalRounds={3}
        result={RAW.odd_one_out}
        submitState="saved"
        newBest
        board={board(900, 'detached')}
        done={{ done: 9, total: 14 }}
      />,
      { lang: false },
    ),
  ),
  phone('p7-result-saving', () =>
    inShell(
      <RoundResultView
        round={{ game: 'stop_the_clock', round_no: 1 }}
        totalRounds={3}
        result={RAW.stop_the_clock}
        submitState="saving"
        newBest={false}
        board={null}
        done={{ done: 2, total: 14 }}
      />,
      { lang: false },
    ),
  ),
  phone('p7-result-failed', () =>
    inShell(
      <RoundResultView
        round={{ game: 'trivia', round_no: 3 }}
        totalRounds={3}
        result={RAW.trivia}
        submitState="failed"
        newBest={false}
        board={[]}
        done={null}
      />,
    ),
  ),
  phone('p7-missed', () =>
    inShell(
      <RoundResultView
        round={{ game: 'simon', round_no: 2 }}
        totalRounds={3}
        result={null}
        submitState={null}
        newBest={false}
        board={board(800, null)}
        done={{ done: 11, total: 25 }}
      />,
      { lang: false },
    ),
  ),

  // P8 intermission steps
  phone('p8-round-board', () =>
    inShell(
      <IntermissionView
        round={{ game: 'stop_the_clock', round_no: 1 }}
        next={{ game: 'odd_one_out', round_no: 2 }}
        step="round_board"
        totalRounds={3}
        roundBoard={board(940, 2)}
        totals={null}
      />,
    ),
  ),
  phone('p8-round-board-empty', () =>
    inShell(
      <IntermissionView
        round={{ game: 'simon', round_no: 2 }}
        next={{ game: 'trivia', round_no: 3 }}
        step="round_board"
        totalRounds={3}
        roundBoard={[]}
        totals={null}
      />,
    ),
  ),
  phone('p8-session-total', () =>
    inShell(
      <IntermissionView
        round={{ game: 'odd_one_out', round_no: 2 }}
        next={{ game: 'trivia', round_no: 3 }}
        step="session_total"
        totalRounds={3}
        roundBoard={null}
        totals={board(1850, 'detached')}
      />,
    ),
  ),
  phone('p8-next', () =>
    inShell(
      <IntermissionView
        round={{ game: 'odd_one_out', round_no: 2 }}
        next={{ game: 'perfect_circle', round_no: 3 }}
        step="next_intro"
        totalRounds={3}
        roundBoard={null}
        totals={null}
      />,
    ),
  ),

  // P9 session results
  phone('p9-results', () =>
    inShell(
      <ResultsView
        lineup={LINEUP}
        own={[
          { game: 'stop_the_clock', score: 617 },
          { game: 'odd_one_out', score: 684 },
          { game: 'trivia', score: 706 },
        ]}
        board={{ rows: board(2400, 3), total: 14 }}
        onJoinNext={noop}
      />,
    ),
  ),
  phone('p9-results-missing-round', () =>
    inShell(
      <ResultsView
        lineup={LINEUP}
        own={[
          { game: 'stop_the_clock', score: 617 },
          { game: 'trivia', score: 706 },
        ]}
        board={{ rows: board(2400, 'detached'), total: 25 }}
        onJoinNext={noop}
      />,
    ),
  ),
  phone('p9-results-not-scored', () =>
    inShell(<ResultsView lineup={LINEUP} own={[]} board={{ rows: board(2400, null), total: 10 }} onJoinNext={noop} />),
  ),
  phone('p9-results-no-scores', () =>
    inShell(<ResultsView lineup={LINEUP} own={[]} board={{ rows: [], total: 0 }} onJoinNext={noop} />),
  ),

  // P10 day boards
  phone('p10-dayboard', () =>
    inShell(
      <DayBoardView
        games={['stop_the_clock', 'odd_one_out', 'perfect_circle']}
        boards={{ stop_the_clock: board(980, 4), odd_one_out: board(930, 'detached'), perfect_circle: [] }}
        onJoinNext={noop}
      />,
    ),
  ),
  phone('p10-dayboard-empty', () =>
    inShell(
      <DayBoardView
        games={['stop_the_clock', 'odd_one_out', 'perfect_circle']}
        boards={{ perfect_circle: [] }}
        initialTab={2}
        onJoinNext={noop}
      />,
    ),
  ),
];

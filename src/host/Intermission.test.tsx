import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HM_REVEAL_MEAN_MS } from '../config';
import { clearMatchMedia, mockBoxes, mockReducedMotion, stubAnimate } from '../effects/shatter/test-utils';
import type { GameId } from '../games/types';
import { LangProvider } from '../i18n';
import type { RevealRow, RoundRow, SessionRow } from '../lib/api';
import type { RankedRow } from '../lib/boards';
import type { IntermissionStep } from './schedule';
import { HostIntermission, type IntermissionPreview } from './Intermission';
import type { HostController, HostData } from './useHost';

const GAMES = ['odd_one_out', 'stop_the_clock', 'simon'] as const;
const rounds = GAMES.map(
  (game, i) => ({ id: `r${i + 1}`, round_no: i + 1, game, status: i < 2 ? 'done' : 'upcoming', ended_at: null }) as unknown as RoundRow,
);
const data = {
  session: { id: 's1', code: '4821', status: 'playing', lineup: GAMES } as unknown as SessionRow,
  running: true,
  rounds,
  players: [],
  pending: null,
  pendingPlayers: 0,
} as HostData;

function board(names: string[], top: number): RankedRow[] {
  return names.map((name, i) => ({
    playerRowId: `p-${name}`,
    name,
    displaySuffix: null,
    value: top - i * 40,
    rank: i + 1,
    isOwn: false,
    detached: false,
  }));
}

const preview: IntermissionPreview = {
  roundBoard: board(['Omar', 'Lina', 'Sara'], 900),
  totalBoard: board(['Sara', 'Omar', 'Lina'], 1800),
  reveal: [],
};

function host(roundNo: number, step: IntermissionStep): HostController {
  return {
    screen: 'intermission',
    data,
    dbDown: false,
    live: true,
    presentIds: new Set(),
    scoresVersion: 0,
    dayVersion: 0,
    scoredCount: null,
    offset: 0,
    intermission: { round: rounds[roundNo - 1], next: rounds[roundNo], state: { step, stepEndsAtMs: Date.now() + 3000 } },
    reload: () => {},
    endRound: async () => {},
    skipIntermission: () => {},
    act: async () => {},
  } as HostController;
}

const view = (roundNo: number, step: IntermissionStep) => (
  <LangProvider initial="en">
    <HostIntermission host={host(roundNo, step)} data={data} preview={preview} />
  </LangProvider>
);

function hmRow(i: number, guesses: number[]): RevealRow {
  return {
    playerRowId: `h${i}`,
    name: ['Sara', 'Omar', 'Lina'][i] ?? `P${i}`,
    displaySuffix: null,
    score: 800 - i * 100,
    raw: {
      rounds: [6, 11, 16].map((true_count, k) => ({ true_count, guess: guesses[k], answer_ms: 2500, timed_out: false })),
    },
  };
}

/** A session whose lineup contains How Many?, every round before `ended_at`'s done; `offset` = server − local. */
function hmSetup(games: readonly GameId[], endedAt: string, offset = 0) {
  const hmRounds = games.map(
    (game, i) => ({ id: `hm${i + 1}`, round_no: i + 1, game, status: 'done', ended_at: endedAt }) as unknown as RoundRow,
  );
  const hmData = { ...data, session: { ...data.session, lineup: games }, rounds: hmRounds } as HostData;
  const hmPreview: IntermissionPreview = {
    ...preview,
    reveal: [hmRow(0, [6, 10, 14]), hmRow(1, [5, 9, 13]), hmRow(2, [4, 13, 18])],
  };
  const hostFor = (roundNo: number, step: IntermissionStep): HostController =>
    ({
      ...host(roundNo, step),
      data: hmData,
      offset,
      intermission: {
        round: hmRounds[roundNo - 1],
        next: hmRounds[roundNo] ?? null,
        state: { step, stepEndsAtMs: Date.now() + 3000 },
      },
    }) as HostController;
  return {
    view: (roundNo: number, step: IntermissionStep) => (
      <LangProvider initial="en">
        <HostIntermission host={hostFor(roundNo, step)} data={hmData} preview={hmPreview} />
      </LangProvider>
    ),
  };
}

let anim: ReturnType<typeof stubAnimate>;
let boxes: ReturnType<typeof mockBoxes>;
beforeEach(() => {
  vi.useFakeTimers();
  mockReducedMotion(false);
  anim = stubAnimate();
  boxes = mockBoxes();
});

afterEach(() => {
  boxes.mockRestore();
  anim.restore();
  vi.useRealTimers();
  clearMatchMedia();
  document.body.innerHTML = '';
});

describe('H3 steps inside one shell (host-v3 §4.4)', () => {
  it('keeps one board from the round board to the total (so its rows FLIP) and crossfades the side', () => {
    const { rerender } = render(view(1, 'round_board'));
    const table = screen.getByTestId('host-round-board');
    expect(screen.getByTestId('host-intermission-title')).toHaveTextContent('Round 1 results · Odd One Out');

    rerender(view(1, 'session_total'));
    expect(screen.getByTestId('host-intermission')).toHaveAttribute('data-step', 'session_total');
    expect(screen.getByTestId('host-total-board')).toBe(table); // same element, new rows
    expect(screen.queryByTestId('host-round-board')).toBeNull();
    // the outgoing side is a snapshot without test ids, hidden from assistive tech
    expect(screen.getAllByTestId('host-intermission-title')).toHaveLength(1);
    const ghost = document.querySelector('[aria-hidden="true"][inert]');
    expect(ghost).toHaveTextContent('Round 1 results');
    expect(ghost?.querySelector('[data-testid]')).toBeNull();
    expect(anim.calls.some((c) => c.el === ghost && c.keyframes[0].opacity === 1)).toBe(true);

    rerender(view(1, 'next_intro'));
    expect(screen.getByTestId('host-next-intro')).toHaveAttribute('data-game', 'stop_the_clock');
    expect(screen.getByTestId('host-next-intro')).toHaveTextContent('Next: Stop the Clock');
    expect(screen.queryByTestId('host-skip')).toBeNull();
  });

  it('after a Stop the Clock round the board step is the reveal; skip shows on steps 1–2 only', () => {
    const { rerender } = render(view(2, 'round_board'));
    expect(screen.getByTestId('stc-reveal')).toBeInTheDocument();
    expect(screen.getByTestId('host-skip')).toBeInTheDocument();
    rerender(view(2, 'session_total'));
    expect(screen.queryByTestId('stc-reveal')).toBeNull();
    expect(screen.getByTestId('host-total-board')).toBeInTheDocument();
    expect(screen.getByTestId('host-skip')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
  });

  it('after a How Many? round the board step is the count reveal (layout reveal, skip shown)', () => {
    const hm = hmSetup(['how_many', 'odd_one_out', 'simon'], new Date(Date.now() - 1000).toISOString());
    const { rerender } = render(hm.view(1, 'round_board'));
    const stage = screen.getByTestId('host-intermission');
    expect(stage).toHaveAttribute('data-step', 'round_board');
    expect(stage).toHaveAttribute('data-layout', 'reveal');
    expect(screen.getByTestId('hm-reveal')).toBeInTheDocument();
    expect(screen.getAllByTestId('hm-strip')).toHaveLength(3);
    expect(screen.queryByTestId('host-round-board')).toBeNull();
    expect(screen.getByTestId('host-intermission-title')).toHaveTextContent('Round 1 results · How Many?');
    expect(screen.getByTestId('host-skip')).toBeInTheDocument();
    rerender(hm.view(1, 'session_total'));
    expect(screen.queryByTestId('hm-reveal')).toBeNull();
    expect(screen.getByTestId('host-total-board')).toBeInTheDocument();
  });

  it('How Many? as the last round: the reveal, no skip, and it stays on "done" until H4', () => {
    const hm = hmSetup(['odd_one_out', 'simon', 'how_many'], new Date(Date.now() - 1000).toISOString());
    const { rerender } = render(hm.view(3, 'round_board'));
    expect(screen.getByTestId('host-intermission')).toHaveAttribute('data-layout', 'reveal');
    expect(screen.getByTestId('hm-reveal')).toBeInTheDocument();
    expect(screen.queryByTestId('host-skip')).toBeNull();
    expect(screen.queryByTestId('host-next-intro')).toBeNull();
    rerender(hm.view(3, 'done'));
    expect(screen.getByTestId('host-intermission')).toHaveAttribute('data-layout', 'reveal');
    expect(screen.getByTestId('hm-reveal')).toBeInTheDocument();
  });

  it('times the reveal from ended_at on the local clock (server time minus the offset)', () => {
    // the server is 2 s ahead of the laptop; the round ended 1 s ago in server time
    const offset = 2000;
    const hm = hmSetup(['how_many', 'odd_one_out', 'simon'], new Date(Date.now() + offset - 1000).toISOString(), offset);
    render(hm.view(1, 'round_board'));
    const means = screen.getAllByTestId('hm-mean');
    expect(means.length).toBeGreaterThan(0);
    act(() => {
      vi.advanceTimersByTime(HM_REVEAL_MEAN_MS - 1000 - 1);
    });
    expect(means.every((m) => m.style.opacity === '0')).toBe(true);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(means.some((m) => m.style.opacity === '0')).toBe(false);
  });

  it('a host reopened late in the step shows the whole How Many? reveal at once', () => {
    const hm = hmSetup(['how_many', 'odd_one_out', 'simon'], new Date(Date.now() - 6000).toISOString());
    render(hm.view(1, 'round_board'));
    expect(screen.getAllByTestId('hm-dot').some((d) => d.style.opacity === '0')).toBe(false);
    expect(screen.getAllByTestId('hm-mean').some((m) => m.style.opacity === '0')).toBe(false);
  });

  it('with reduced motion the steps swap at once (no snapshot)', () => {
    mockReducedMotion(true);
    const { rerender } = render(view(1, 'round_board'));
    rerender(view(1, 'session_total'));
    expect(document.querySelector('[inert]')).toBeNull();
  });
});

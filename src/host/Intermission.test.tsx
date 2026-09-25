import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearMatchMedia, mockBoxes, mockReducedMotion, stubAnimate } from '../effects/shatter/test-utils';
import { LangProvider } from '../i18n';
import type { RoundRow, SessionRow } from '../lib/api';
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

  it('with reduced motion the steps swap at once (no snapshot)', () => {
    mockReducedMotion(true);
    const { rerender } = render(view(1, 'round_board'));
    rerender(view(1, 'session_total'));
    expect(document.querySelector('[inert]')).toBeNull();
  });
});

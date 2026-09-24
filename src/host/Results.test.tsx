import { act, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SHATTER_LOGO_CLASS } from '../effects/shatter';
import { clearMatchMedia, layers, mockBoxes, mockReducedMotion, shardCount, stubAnimate } from '../effects/shatter/test-utils';
import { LangProvider } from '../i18n';
import type { HostController, HostData } from './useHost';

const fetchSessionBoard = vi.fn();
const fetchSessionRoundScores = vi.fn();
const fetchDayBoard = vi.fn();
const fetchSessionScores = vi.fn();

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    fetchSessionBoard: (...a: unknown[]) => fetchSessionBoard(...a),
    fetchSessionRoundScores: (...a: unknown[]) => fetchSessionRoundScores(...a),
    fetchDayBoard: (...a: unknown[]) => fetchDayBoard(...a),
    fetchSessionScores: (...a: unknown[]) => fetchSessionScores(...a),
  };
});

import { HostSessionEnd } from './Results';
import { HostMotionProvider } from './motion';

const GAMES = ['stop_the_clock', 'odd_one_out', 'simon'] as const;
const AT = '2026-09-24T14:02:00.000Z';

const data = {
  session: { id: 's1', event_day_id: 'd1', lineup: [...GAMES] },
  rounds: GAMES.map((game, i) => ({ id: `r${i + 1}`, round_no: i + 1, game, status: 'done' })),
  pending: null,
  pendingPlayers: 0,
} as unknown as HostData;

function hostOn(screenName: 'results' | 'dayboard'): HostController {
  return { screen: screenName, act: vi.fn(), scoresVersion: 0, dayVersion: 0 } as unknown as HostController;
}

function Wrap({ children }: { children: ReactNode }) {
  return (
    <LangProvider>
      <HostMotionProvider>{children}</HostMotionProvider>
    </LangProvider>
  );
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

const shownGame = () => screen.queryByTestId('host-dayboard')?.getAttribute('data-game') ?? null;

let anim: ReturnType<typeof stubAnimate>;
let boxes: ReturnType<typeof mockBoxes>;
beforeEach(() => {
  vi.useFakeTimers();
  mockReducedMotion(false);
  anim = stubAnimate();
  boxes = mockBoxes();
  localStorage.clear();
  fetchSessionBoard.mockResolvedValue({
    top: [
      { playerRowId: 'p1', name: 'Omar', displaySuffix: null, value: 2400 },
      { playerRowId: 'p2', name: 'Lina', displaySuffix: null, value: 2100 },
    ],
    own: null,
    total: 2,
  });
  fetchSessionRoundScores.mockResolvedValue([]);
  // Omar's best today in every game came from this session (highlighted); Rami's is older.
  fetchDayBoard.mockImplementation(async () => ({
    top: [
      { nameKey: 'omar', name: 'Omar', score: 900, achievedAt: AT },
      { nameKey: 'rami', name: 'Rami', score: 850, achievedAt: '2026-09-24T10:00:00.000Z' },
    ],
    own: null,
    total: 2,
  }));
  fetchSessionScores.mockResolvedValue(GAMES.map((game) => ({ playerRowId: 'p1', game, score: 900, createdAt: AT, name: 'Omar' })));
});

afterEach(() => {
  boxes.mockRestore();
  anim.restore();
  vi.useRealTimers();
  clearMatchMedia();
  document.body.innerHTML = '';
  delete document.documentElement.dataset.motion;
});

describe('H4 → H5 day-board merge (ADR-010, DESIGN_SYSTEM §6.2)', () => {
  it('results stay until Show day board; then the ~15 s merge walks the tabs and settles', async () => {
    const { rerender } = render(<HostSessionEnd host={hostOn('results')} data={data} />, { wrapper: Wrap });
    await flush();
    expect(screen.getByTestId('host-results')).toBeInTheDocument();
    advance(60_000); // nothing moves on by itself
    expect(screen.getByTestId('host-results')).toBeInTheDocument();
    expect(screen.getByTestId('host-show-day-board')).toBeInTheDocument();

    // The host tapped Show day board and the database says so.
    rerender(<HostSessionEnd host={hostOn('dayboard')} data={data} />);
    await flush();
    expect(screen.queryByTestId('host-show-day-board')).toBeNull();
    expect(screen.getByTestId('host-results')).toBeInTheDocument(); // fragmenting
    expect(layers('merge')).toHaveLength(1);
    expect(shardCount('merge')).toBeLessThanOrEqual(48);

    advance(1500);
    expect(screen.queryByTestId('host-results')).toBeNull();
    expect(shownGame()).toBe(GAMES[0]);
    const omarRow = () => screen.getAllByTestId('board-row').find((r) => r.textContent?.includes('Omar'));
    expect(omarRow()).toHaveAttribute('data-highlight', 'true');
    advance(200); // targets read: the new rows wait for their shards
    expect(omarRow()?.style.opacity).toBe('0');
    advance(2400);
    expect(omarRow()?.style.opacity).not.toBe('0');

    advance(5500 - 4100);
    expect(shownGame()).toBe(GAMES[1]);
    advance(4000);
    expect(shownGame()).toBe(GAMES[2]);
    advance(4000); // 13.5 s: settle on the first tab
    expect(shownGame()).toBe(GAMES[0]);
    advance(1500); // 15 s: done
    expect(layers()).toHaveLength(0);
    expect(screen.getAllByTestId('board-row').every((r) => r.style.opacity !== '0')).toBe(true);

    advance(8000); // then the tabs auto-rotate every 8 s
    expect(shownGame()).toBe(GAMES[1]);
  });

  it('reduced motion: a crossfade straight to the first day board, then the normal rotation', async () => {
    mockReducedMotion(true);
    const { rerender } = render(<HostSessionEnd host={hostOn('results')} data={data} />, { wrapper: Wrap });
    await flush();
    rerender(<HostSessionEnd host={hostOn('dayboard')} data={data} />);
    await flush();
    expect(shardCount()).toBe(0);
    advance(100);
    expect(shownGame()).toBe(GAMES[0]);
    advance(100);
    expect(layers()).toHaveLength(0);
    advance(8000);
    expect(shownGame()).toBe(GAMES[1]);
  });

  it('a reload onto H5 shows the day boards at once (no merge)', async () => {
    render(<HostSessionEnd host={hostOn('dayboard')} data={data} />, { wrapper: Wrap });
    await flush();
    expect(shownGame()).toBe(GAMES[0]);
    expect(layers('merge')).toHaveLength(0);
  });

  it('the logo is shatter-safe and outside the merge stage (never hidden or covered)', async () => {
    const { rerender } = render(<HostSessionEnd host={hostOn('results')} data={data} />, { wrapper: Wrap });
    await flush();
    const logo = screen.getByTestId('logo');
    expect(logo).toHaveClass(SHATTER_LOGO_CLASS);
    expect(logo.closest('[data-shatter]')).toBeNull();
    rerender(<HostSessionEnd host={hostOn('dayboard')} data={data} />);
    await flush();
    for (let t = 0; t < 16_000; t += 500) {
      advance(500);
      expect(screen.getByTestId('logo').style.opacity).toBe('');
    }
    expect(anim.calls.some((c) => (c.el as HTMLElement).dataset?.testid === 'logo')).toBe(false);
  });
});

describe('host "Reduce motion" toggle (SCREENS H6)', () => {
  it('switches the effects to their fallbacks, sets data-motion and is remembered', async () => {
    const { rerender } = render(<HostSessionEnd host={hostOn('results')} data={data} />, { wrapper: Wrap });
    await flush();
    advance(2000); // the H4 rows have shattered in (full motion so far)
    expect(layers()).toHaveLength(0);
    const toggle = screen.getByTestId('host-reduced-motion');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    act(() => toggle.click());
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(document.documentElement.dataset.motion).toBe('reduced');
    expect(localStorage.getItem('gdg.v1.host-reduced-motion')).toBe('1');

    rerender(<HostSessionEnd host={hostOn('dayboard')} data={data} />);
    await flush();
    expect(shardCount()).toBe(0);
    advance(100);
    expect(shownGame()).toBe(GAMES[0]);
  });
});

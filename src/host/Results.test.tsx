import { act, render, screen } from '@testing-library/react';
import { Profiler, StrictMode, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SHATTER_LOGO_CLASS } from '../effects/shatter';
import {
  clearMatchMedia,
  layers,
  mockBoxes,
  mockReducedMotion,
  shardCount,
  stubAnimate,
} from '../effects/shatter/test-utils';
import { formatNumber, LangProvider } from '../i18n';
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

// Counts celebrate plays (the real one still runs).
const celebratePlays = vi.fn();
vi.mock('../effects/shatter/plays', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../effects/shatter/plays')>();
  return {
    ...actual,
    playCelebrate: (...a: Parameters<typeof actual.playCelebrate>) => {
      celebratePlays();
      return actual.playCelebrate(...a);
    },
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

function hostOn(
  screenName: 'results' | 'dayboard',
  versions = { scoresVersion: 0, dayVersion: 0 },
): HostController {
  return { screen: screenName, act: vi.fn(), ...versions } as unknown as HostController;
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
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
  sessionStorage.clear();
  celebratePlays.mockClear();
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
  fetchSessionScores.mockResolvedValue(
    GAMES.map((game) => ({ playerRowId: 'p1', game, score: 900, createdAt: AT, name: 'Omar' })),
  );
});

afterEach(() => {
  boxes.mockRestore();
  anim.restore();
  vi.useRealTimers();
  clearMatchMedia();
  document.body.innerHTML = '';
  delete document.documentElement.dataset.motion;
});

describe('H4 → H5 (ADR-010 superseded 2026-09-25: instant crossfade, no merge, no per-row cascade)', () => {
  it('Show day board shows H5 at once: no merge layer, tabs and board render in the same frame', async () => {
    const { rerender } = render(<HostSessionEnd host={hostOn('results')} data={data} />, {
      wrapper: Wrap,
    });
    await flush();
    expect(screen.getByTestId('host-results')).toBeInTheDocument();
    advance(60_000); // nothing moves on by itself
    expect(screen.getByTestId('host-results')).toBeInTheDocument();
    expect(screen.getByTestId('host-show-day-board')).toBeInTheDocument();

    // The host tapped Show day board and the database says so.
    rerender(<HostSessionEnd host={hostOn('dayboard')} data={data} />);
    await flush();
    expect(screen.queryByTestId('host-show-day-board')).toBeNull();
    expect(screen.queryByTestId('host-results')).toBeNull(); // no fragmenting stage: gone at once
    expect(layers('merge')).toHaveLength(0);
    expect(shardCount('merge')).toBe(0);
    expect(shownGame()).toBe(GAMES[0]);
    expect(screen.getByTestId('host-dayboard-tabs')).toBeInTheDocument();

    advance(8000); // the tabs still auto-rotate every 8 s
    expect(shownGame()).toBe(GAMES[1]);
  });

  it('all rows are in the DOM and visible in the first frame (no cascade, no per-row delay)', async () => {
    render(<HostSessionEnd host={hostOn('dayboard')} data={data} />, { wrapper: Wrap });
    await flush();
    const rows = screen.getAllByTestId('board-row');
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.style.opacity).not.toBe('0');
    // Omar's row is highlighted from the first frame too (no waiting for a merge tile).
    const omarRow = rows.find((r) => r.textContent?.includes('Omar'));
    expect(omarRow).toHaveAttribute('data-highlight', 'true');
  });

  it('reduced motion: an instant swap, then the normal rotation', async () => {
    mockReducedMotion(true);
    const { rerender } = render(<HostSessionEnd host={hostOn('results')} data={data} />, {
      wrapper: Wrap,
    });
    await flush();
    rerender(<HostSessionEnd host={hostOn('dayboard')} data={data} />);
    await flush();
    expect(shardCount()).toBe(0);
    expect(shownGame()).toBe(GAMES[0]);
    advance(8000);
    expect(shownGame()).toBe(GAMES[1]);
  });

  it('a reload onto H5 shows the day boards at once (no merge)', async () => {
    render(<HostSessionEnd host={hostOn('dayboard')} data={data} />, { wrapper: Wrap });
    await flush();
    expect(shownGame()).toBe(GAMES[0]);
    expect(layers('merge')).toHaveLength(0);
  });

  it('the day boards populate as their queries answer; there is nothing to wait for (no merge gate)', async () => {
    const StrictWrap = ({ children }: { children: ReactNode }) => (
      <StrictMode>
        <Wrap>{children}</Wrap>
      </StrictMode>
    );
    const pages = GAMES.map(() => deferred<unknown>());
    fetchDayBoard.mockImplementation(
      (_day: string, game: string) => pages[GAMES.indexOf(game as never)].promise,
    );
    const page = {
      top: [{ nameKey: 'omar', name: 'Omar', score: 900, achievedAt: AT }],
      own: null,
      total: 1,
    };
    const { rerender } = render(<HostSessionEnd host={hostOn('results')} data={data} />, {
      wrapper: StrictWrap,
    });
    await flush();
    rerender(<HostSessionEnd host={hostOn('dayboard')} data={data} />);
    await flush();
    // The screen is already H5 (empty slots) while the day boards are still in flight
    // (`useDayBoardData` waits for every game's query, not just the shown tab's).
    expect(screen.queryByTestId('host-results')).toBeNull();
    expect(screen.queryAllByTestId('board-row')).toHaveLength(0);
    pages.forEach((p) => p.resolve(page));
    await flush();
    expect(screen.getAllByTestId('board-row')).toHaveLength(1);
    expect(layers('merge')).toHaveLength(0);
  });

  it('the logo is shatter-safe (never hidden or covered by the crossfade)', async () => {
    const { rerender } = render(<HostSessionEnd host={hostOn('results')} data={data} />, {
      wrapper: Wrap,
    });
    await flush();
    const logo = screen.getByTestId('logo');
    expect(logo).toHaveClass(SHATTER_LOGO_CLASS);
    expect(logo.closest('[data-shatter]')).toBeNull();
    rerender(<HostSessionEnd host={hostOn('dayboard')} data={data} />);
    await flush();
    expect(screen.getByTestId('logo').style.opacity).toBe('');
    advance(8000);
    expect(screen.getByTestId('logo').style.opacity).toBe('');
  });
});

describe('host "Reduce motion" toggle (SCREENS H6)', () => {
  it('switches the effects to their fallbacks, sets data-motion and is remembered', async () => {
    const { rerender } = render(<HostSessionEnd host={hostOn('results')} data={data} />, {
      wrapper: Wrap,
    });
    await flush();
    advance(2000); // the H4 rows have cascaded in (full motion so far; no shards on rows)
    expect(layers()).toHaveLength(0);
    act(() => screen.getByTestId('host-settings').click()); // the toggle lives in the Settings menu
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

describe('H4 podium (host v3 plan §4.5)', () => {
  // The count-ups run on requestAnimationFrame + performance.now(): fake those too.
  beforeEach(() => {
    vi.useRealTimers();
    vi.useFakeTimers({
      toFake: [
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'clearInterval',
        'Date',
        'performance',
        'requestAnimationFrame',
        'cancelAnimationFrame',
      ],
    });
  });

  const total = () => screen.getByTestId('host-winner-total').textContent ?? '';
  const board = (omar: number) => ({
    top: [
      { playerRowId: 'p1', name: 'Omar', displaySuffix: null, value: omar },
      { playerRowId: 'p2', name: 'Lina', displaySuffix: null, value: 2100 },
    ],
    own: null,
    total: 2,
  });

  it('the winner total counts up after the rows, ends on the formatted total, then the celebrate plays once and never on a poll refresh', async () => {
    render(<HostSessionEnd host={hostOn('results')} data={data} />, { wrapper: Wrap });
    await flush();
    expect(screen.getByTestId('host-winner')).toHaveTextContent('Omar');
    // The hero holds while the table's rows cascade in and count up.
    expect(total()).toBe('0');
    advance(1000);
    expect(total()).toBe('0');
    advance(1500); // mid-count
    const mid = Number(total().replace(/,/g, ''));
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(2400);
    expect(celebratePlays).not.toHaveBeenCalled();
    advance(700); // the hero has landed: exactly the formatted total, then the celebrate
    expect(total()).toBe(formatNumber(2400));
    expect(celebratePlays).toHaveBeenCalledTimes(1);
    expect(layers('celebrate')).toHaveLength(1);
    expect(shardCount('celebrate')).toBeLessThanOrEqual(48);
    advance(2000);
    expect(layers()).toHaveLength(0);

    // 3 s polls with the same rows, then a late score (E22): the total counts on in place,
    // nothing replays.
    for (let i = 0; i < 3; i++) {
      advance(3000);
      await flush();
    }
    fetchSessionBoard.mockResolvedValue(board(2450));
    advance(3000);
    await flush();
    advance(2000);
    expect(total()).toBe(formatNumber(2450));
    advance(10_000);
    await flush();
    expect(celebratePlays).toHaveBeenCalledTimes(1);
    expect(layers()).toHaveLength(0);
  });

  it('a reload onto H4 (same tab) shows the podium settled: no count-up, no celebrate', async () => {
    const first = render(<HostSessionEnd host={hostOn('results')} data={data} />, {
      wrapper: Wrap,
    });
    await flush();
    first.unmount(); // the page reloads before the podium has finished
    render(<HostSessionEnd host={hostOn('results')} data={data} />, { wrapper: Wrap });
    await flush();
    expect(total()).toBe(formatNumber(2400));
    advance(10_000);
    expect(celebratePlays).not.toHaveBeenCalled();
  });

  it('reduced motion: the final total at once and the static ring instead of shards', async () => {
    mockReducedMotion(true);
    render(<HostSessionEnd host={hostOn('results')} data={data} />, { wrapper: Wrap });
    await flush();
    expect(total()).toBe(formatNumber(2400));
    advance(1);
    expect(celebratePlays).toHaveBeenCalledTimes(1);
    expect(shardCount()).toBe(0);
  });

  it('with no scores: the side says so and the table area shows its ten empty slots', async () => {
    fetchSessionBoard.mockResolvedValue({ top: [], own: null, total: 0 });
    render(<HostSessionEnd host={hostOn('results')} data={data} />, { wrapper: Wrap });
    await flush();
    expect(screen.queryByTestId('host-winner')).toBeNull();
    expect(screen.getByTestId('host-results')).toHaveTextContent('No scores this session');
    expect(
      screen.getByTestId('host-no-scores').querySelectorAll('tr[data-slot="empty"]'),
    ).toHaveLength(10);
    expect(screen.queryAllByTestId('board-row')).toHaveLength(0);
  });

  it('the session table: one visible head and one score per round, "–" for a missing round', async () => {
    fetchSessionRoundScores.mockResolvedValue([
      { playerRowId: 'p1', game: 'stop_the_clock', score: 800 },
      { playerRowId: 'p1', game: 'odd_one_out', score: 800 },
      { playerRowId: 'p1', game: 'simon', score: 800 },
      { playerRowId: 'p2', game: 'stop_the_clock', score: 1000 },
      { playerRowId: 'p2', game: 'simon', score: 1000 },
    ]);
    render(<HostSessionEnd host={hostOn('results')} data={data} />, { wrapper: Wrap });
    await flush();
    const table = screen.getByTestId('host-session-board');
    expect(table.querySelectorAll('thead th[data-column]')).toHaveLength(3);
    const [omar, lina] = screen.getAllByTestId('board-row');
    const cells = (row: HTMLElement) =>
      Array.from(row.querySelectorAll('[data-testid="board-round-score"]')).map(
        (c) => c.textContent,
      );
    expect(cells(omar)).toEqual(['800', '800', '800']);
    expect(cells(lina)).toEqual(['1,000', '–', '1,000']);
  });
});

describe('H5 tabs after the merge', () => {
  it('rotate every 8 s with the underline filling over the wait; each change crossfades from a copy without test ids', async () => {
    render(<HostSessionEnd host={hostOn('dayboard')} data={data} />, { wrapper: Wrap });
    await flush();
    const underline = () =>
      anim.calls.filter(
        (c) =>
          (c.keyframes as Keyframe[])[0]?.transform === 'scaleX(0)' && c.options.duration === 8000,
      );
    expect(underline()).toHaveLength(1);
    expect(screen.getByTestId(`dayboard-tab-${GAMES[0]}`)).toHaveAttribute('aria-selected', 'true');
    advance(8000);
    expect(shownGame()).toBe(GAMES[1]);
    expect(screen.getByTestId(`dayboard-tab-${GAMES[1]}`)).toHaveAttribute('aria-selected', 'true');
    expect(underline()).toHaveLength(2);
    // The outgoing board fades out over the incoming one: a copy, inert and without test ids.
    const ghosts = document.querySelectorAll('[inert]');
    expect(ghosts).toHaveLength(1);
    expect(ghosts[0].querySelector('[data-testid]')).toBeNull();
    expect(screen.getAllByTestId('host-dayboard')).toHaveLength(1);
    advance(500);
    expect(document.querySelectorAll('[inert]')).toHaveLength(0);
    // A tapped tab gets its full 8 s too.
    act(() => screen.getByTestId(`dayboard-tab-${GAMES[0]}`).click());
    expect(shownGame()).toBe(GAMES[0]);
    advance(7999);
    expect(shownGame()).toBe(GAMES[0]);
    advance(1);
    expect(shownGame()).toBe(GAMES[1]);
  });

  it('reduced motion: no underline animation and no crossfade copy', async () => {
    mockReducedMotion(true);
    render(<HostSessionEnd host={hostOn('dayboard')} data={data} />, { wrapper: Wrap });
    await flush();
    advance(8000);
    expect(shownGame()).toBe(GAMES[1]);
    expect(document.querySelectorAll('[inert]')).toHaveLength(0);
    expect(anim.calls.some((c) => (c.keyframes as Keyframe[])[0]?.transform === 'scaleX(0)')).toBe(
      false,
    );
  });
});

describe('render budget (TESTING.md §9)', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.useFakeTimers({
      toFake: [
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'clearInterval',
        'Date',
        'performance',
        'requestAnimationFrame',
        'cancelAnimationFrame',
      ],
    });
  });

  it('an idle H4 commits nothing over 15 s once the podium has played (3 s polls return the same rows)', async () => {
    let commits = 0;
    render(
      <Profiler id="h4" onRender={() => (commits += 1)}>
        <HostSessionEnd host={hostOn('results')} data={data} />
      </Profiler>,
      { wrapper: Wrap },
    );
    await flush();
    advance(6000); // count-ups and the celebrate are over
    await flush();
    commits = 0;
    for (let i = 0; i < 5; i++) {
      advance(3000);
      await flush();
    }
    expect(commits).toBe(0);
  });

  it('H5 commits once per rotation and nothing in between', async () => {
    let commits = 0;
    render(
      <Profiler id="h5" onRender={() => (commits += 1)}>
        <HostSessionEnd host={hostOn('dayboard')} data={data} />
      </Profiler>,
      { wrapper: Wrap },
    );
    await flush();
    advance(8000);
    commits = 0;
    advance(7999);
    await flush();
    expect(commits).toBe(0);
    advance(1);
    expect(commits).toBe(1);
  });
});

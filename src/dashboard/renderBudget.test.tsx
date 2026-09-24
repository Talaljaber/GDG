/**
 * Dashboard render budget (`TESTING.md`, "Render budget"): commit counts per
 * component over fixed scenarios, through the dev fixtures' fake api (no
 * Supabase). `useRenderCount` (./renderCount) counts one per commit in which a
 * component rendered. A missing key means 0 renders.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LangProvider } from '../i18n';

vi.mock('../lib/supabase', () => ({
  supabase: { auth: { signOut: vi.fn(), getSession: vi.fn(), onAuthStateChange: vi.fn() } },
}));

import { fixtures } from '../dev/fixtures/dashboard';
import { dashRenderCounts, resetDashRenderCounts } from './renderCount';

function show(name: string) {
  const f = fixtures.find((x) => x.name === name);
  if (!f) throw new Error(`no fixture ${name}`);
  return render(<LangProvider initial="en">{f.render()}</LangProvider>);
}

/** Lets the fake api's resolved promises and the renders they cause finish. */
async function settle() {
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
}

/** Renders `fixture`, waits for `ready`, then resets the counts. */
async function start(fixture: string, ready: string) {
  show(fixture);
  await screen.findAllByTestId(ready);
  await settle();
  resetDashRenderCounts();
}

const n = (name: string) => dashRenderCounts()[name] ?? 0;

beforeEach(() => resetDashRenderCounts());

describe('dashboard render budget', () => {
  it('idle on Today for 30 s: nothing renders (no polling, no timers)', async () => {
    await start('dashboard.today', 'today-running');
    vi.useFakeTimers();
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    vi.useRealTimers();
    expect(dashRenderCounts()).toEqual({});
  });

  it('switching every tab: one shell render per click, each page mounts and loads once', async () => {
    await start('dashboard.today', 'today-running');
    for (const [tab, row] of [
      ['sessions', 'session-row'],
      ['results', 'results-row'],
      ['names', 'hidden-row'],
      ['days', 'day-row'],
      ['today', 'today-running'],
    ]) {
      fireEvent.click(screen.getByTestId(`nav-${tab}`));
      await screen.findAllByTestId(row);
      await settle();
    }
    expect(n('DashboardMain')).toBe(5);
    expect(n('SessionsPanel')).toBe(3);
    expect(n('ResultsPanel')).toBe(3);
    expect(n('ResultRow')).toBe(40);
    expect(n('NamesPanel')).toBe(2);
    expect(n('HideNameField')).toBe(2);
    expect(n('HiddenTable')).toBe(1);
    expect(n('BlockedTable')).toBe(1);
    expect(n('DaysPanel')).toBe(2);
    expect(n('DaysTable')).toBe(1);
    expect(n('TodayPanel')).toBe(2);
  });

  it('sorting Results: rows are reordered, never re-rendered', async () => {
    await start('dashboard.results', 'results-row');
    for (const k of ['name', 'name', 'score', 'time']) {
      fireEvent.click(screen.getByTestId(`sort-${k}`));
      await settle();
    }
    expect(n('ResultsPanel')).toBe(4);
    expect(n('ResultRow')).toBe(0);
  });

  it('filtering Results: one render to the skeleton, one with the new rows; old rows are not re-rendered', async () => {
    await start('dashboard.results', 'results-row');
    fireEvent.change(screen.getByTestId('results-game-select'), { target: { value: 'simon' } });
    await screen.findAllByTestId('results-row');
    await settle();
    fireEvent.change(screen.getByTestId('results-day-select'), { target: { value: 'all' } });
    await screen.findAllByTestId('results-row');
    await settle();
    expect(n('ResultsPanel')).toBe(4);
    expect(n('ResultRow')).toBe(80); // 40 fresh rows mounted per filter change
  });

  it('best-per-name on and off: kept rows are not re-rendered, only dropped rows remount', async () => {
    await start('dashboard.results', 'results-row');
    fireEvent.click(screen.getByTestId('best-toggle'));
    await settle();
    const kept = screen.getAllByTestId('results-row').length;
    fireEvent.click(screen.getByTestId('best-toggle'));
    await settle();
    expect(kept).toBeLessThan(40);
    expect(n('ResultsPanel')).toBe(2);
    expect(n('ResultRow')).toBe(40 - kept);
  });

  it('opening a session detail: mount + one render with the data', async () => {
    await start('dashboard.sessions', 'session-row');
    fireEvent.click(screen.getAllByTestId('session-row')[0]);
    await screen.findAllByTestId('session-player-row');
    await settle();
    expect(n('DashboardMain')).toBe(1);
    expect(n('SessionDetailPanel')).toBe(2);
  });

  it('toggling the language: every component renders exactly once', async () => {
    await start('dashboard.results', 'results-row');
    fireEvent.click(screen.getByTestId('lang-toggle'));
    await settle();
    expect(n('DashboardMain')).toBe(1);
    expect(n('ResultsPanel')).toBe(1);
    expect(n('ResultRow')).toBe(40);
  });

  it('typing in the blocked-word field re-renders only the Names panel', async () => {
    await start('dashboard.names', 'blocked-row');
    const input = screen.getByTestId('blocked-input');
    for (const v of ['s', 'sp', 'spa', 'spam', 'spamm', 'spammy']) fireEvent.change(input, { target: { value: v } });
    await settle();
    expect(n('NamesPanel')).toBe(6);
    expect(n('HideNameField')).toBe(0);
    expect(n('HiddenTable')).toBe(0);
    expect(n('BlockedTable')).toBe(0);
  });

  it('unhiding a name does not re-render the hide field', async () => {
    await start('dashboard.names', 'hidden-row');
    fireEvent.click(screen.getAllByTestId('unhide-btn')[0]);
    await settle();
    expect(n('HideNameField')).toBe(0);
    expect(n('HiddenTable')).toBe(2); // busy on, then the reloaded list with busy off
  });

  it('typing the new-day label does not re-render the days table', async () => {
    await start('dashboard.days', 'day-row');
    const input = screen.getByTestId('new-day-input');
    for (const v of ['D', 'Da', 'Day', 'Day ', 'Day 3', 'Day 3!']) fireEvent.change(input, { target: { value: v } });
    await settle();
    expect(n('DaysPanel')).toBe(6);
    expect(n('DaysTable')).toBe(0);
  });

  it('hiding a name on Today: an unchanged reload does not re-render the page', async () => {
    await start('dashboard.today', 'today-running');
    fireEvent.change(screen.getByTestId('hide-name-input'), { target: { value: 'Sara' } });
    await settle();
    resetDashRenderCounts();
    fireEvent.click(screen.getByTestId('hide-name-preview-btn'));
    const dialog = await screen.findByTestId('confirm-dialog');
    fireEvent.click(within(dialog).getByTestId('confirm-yes'));
    await settle();
    expect(screen.queryByTestId('confirm-dialog')).toBeNull();
    expect(n('TodayPanel')).toBe(0);
    expect(n('HideNameField')).toBe(4);
  });
});

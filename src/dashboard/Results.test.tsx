import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LangProvider } from '../i18n';

const fetchEventDays = vi.fn();
const fetchCurrentEventDay = vi.fn();
const fetchCombinedResults = vi.fn();

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return {
    ...actual,
    fetchEventDays: (...a: unknown[]) => fetchEventDays(...a),
    fetchCurrentEventDay: (...a: unknown[]) => fetchCurrentEventDay(...a),
    fetchCombinedResults: (...a: unknown[]) => fetchCombinedResults(...a),
  };
});

const downloadCsv = vi.fn();
vi.mock('./csv', async () => {
  const actual = await vi.importActual<typeof import('./csv')>('./csv');
  return { ...actual, downloadCsv: (...a: unknown[]) => downloadCsv(...a) };
});

import { ResultsPanel } from './Results';

const day1 = { id: 'day-1', label: 'Day 1', started_at: '', ended_at: null, is_current: true };

const rows = [
  {
    id: 'r1',
    name: 'Omar',
    nameKey: 'omar',
    displaySuffix: null,
    game: 'simon',
    score: 801,
    createdAt: '2026-09-24T14:02:00.000Z',
    sessionId: 's1',
    sessionCode: '4821',
    eventDayId: 'day-1',
  },
  {
    id: 'r2',
    name: 'Lina',
    nameKey: 'lina',
    displaySuffix: null,
    game: 'trivia',
    score: 835,
    createdAt: '2026-09-24T14:10:00.000Z',
    sessionId: 's1',
    sessionCode: '4821',
    eventDayId: 'day-1',
  },
];

beforeEach(() => {
  fetchEventDays.mockReset().mockResolvedValue([day1]);
  fetchCurrentEventDay.mockReset().mockResolvedValue(day1);
  fetchCombinedResults.mockReset().mockResolvedValue(rows);
  downloadCsv.mockReset();
});

function renderPanel() {
  render(
    <LangProvider initial="en">
      <ResultsPanel />
    </LangProvider>,
  );
}

describe('ResultsPanel (D4)', () => {
  it('shows every visible score row, defaulting to score desc', async () => {
    renderPanel();
    await waitFor(() => expect(screen.getAllByTestId('results-row')).toHaveLength(2));
    const cells = screen.getAllByTestId('results-row').map((r) => within(r).getAllByRole('cell')[0].textContent);
    expect(cells).toEqual(['Lina', 'Omar']); // 835 before 801
  });

  it('sorting by name toggles order on repeated clicks', async () => {
    renderPanel();
    await waitFor(() => expect(screen.getAllByTestId('results-row')).toHaveLength(2));

    fireEvent.click(screen.getByTestId('sort-name'));
    let names = screen.getAllByTestId('results-row').map((r) => within(r).getAllByRole('cell')[0].textContent);
    expect(names).toEqual(['Lina', 'Omar']);

    fireEvent.click(screen.getByTestId('sort-name'));
    names = screen.getAllByTestId('results-row').map((r) => within(r).getAllByRole('cell')[0].textContent);
    expect(names).toEqual(['Omar', 'Lina']);
  });

  it('re-queries the server when the day or game filter changes', async () => {
    renderPanel();
    await waitFor(() => expect(fetchCombinedResults).toHaveBeenCalledWith({ eventDayId: 'day-1', game: null }));

    fireEvent.change(screen.getByTestId('results-game-select'), { target: { value: 'simon' } });
    await waitFor(() => expect(fetchCombinedResults).toHaveBeenLastCalledWith({ eventDayId: 'day-1', game: 'simon' }));

    fireEvent.change(screen.getByTestId('results-day-select'), { target: { value: 'all' } });
    await waitFor(() => expect(fetchCombinedResults).toHaveBeenLastCalledWith({ eventDayId: null, game: 'simon' }));
  });

  it('exports exactly the shown rows as CSV (best-per-name toggle included)', async () => {
    renderPanel();
    await waitFor(() => expect(screen.getAllByTestId('results-row')).toHaveLength(2));

    await act(async () => {
      fireEvent.click(screen.getByTestId('export-csv'));
    });

    expect(downloadCsv).toHaveBeenCalledTimes(1);
    const [filename, content] = downloadCsv.mock.calls[0] as [string, string];
    expect(filename).toMatch(/^results-day-1-all-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(content.charCodeAt(0)).toBe(0xfeff);
    expect(content).toContain('Lina');
    expect(content).toContain('Omar');
  });

  it('names the export file "-best-" when Best per name is checked', async () => {
    renderPanel();
    await waitFor(() => expect(screen.getAllByTestId('results-row')).toHaveLength(2));
    fireEvent.click(screen.getByTestId('best-toggle'));

    await act(async () => {
      fireEvent.click(screen.getByTestId('export-csv'));
    });

    const [filename] = downloadCsv.mock.calls[0] as [string, string];
    expect(filename).toMatch(/-best-\d{4}-\d{2}-\d{2}\.csv$/);
  });
});

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LangProvider } from '../i18n';

const fetchEventDays = vi.fn();
const fetchPlayingSession = vi.fn();
const fetchSessionsForDay = vi.fn();
const adminStartNewDay = vi.fn();

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return {
    ...actual,
    fetchEventDays: (...a: unknown[]) => fetchEventDays(...a),
    fetchPlayingSession: (...a: unknown[]) => fetchPlayingSession(...a),
    fetchSessionsForDay: (...a: unknown[]) => fetchSessionsForDay(...a),
    adminStartNewDay: (...a: unknown[]) => adminStartNewDay(...a),
  };
});

import { DaysPanel } from './Days';

const day1 = { id: 'day-1', label: 'Day 1', started_at: '2026-09-24T08:00:00.000Z', ended_at: null, is_current: true };

beforeEach(() => {
  fetchEventDays.mockReset().mockResolvedValue([day1]);
  fetchSessionsForDay.mockReset().mockResolvedValue([]);
  adminStartNewDay.mockReset().mockResolvedValue({ ...day1, id: 'day-2', label: 'Day 2' });
});

function renderDays() {
  render(
    <LangProvider initial="en">
      <DaysPanel />
    </LangProvider>,
  );
}

describe('DaysPanel new-day guard (AC4.6)', () => {
  it('allows starting a new day when nothing is playing', async () => {
    fetchPlayingSession.mockResolvedValue(null);
    renderDays();
    await waitFor(() => expect(screen.queryByTestId('new-day-blocked')).not.toBeInTheDocument());

    fireEvent.change(screen.getByTestId('new-day-input'), { target: { value: 'Day 2' } });
    expect(screen.getByTestId('new-day-submit')).not.toBeDisabled();
    fireEvent.click(screen.getByTestId('new-day-submit'));

    await waitFor(() => expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByTestId('confirm-yes'));
    });
    expect(adminStartNewDay).toHaveBeenCalledWith('Day 2');
  });

  it('disables the form and shows the blocked message while a session is playing', async () => {
    fetchPlayingSession.mockResolvedValue({
      id: 's1',
      event_day_id: 'day-1',
      code: '4821',
      status: 'playing',
      lineup: ['trivia'],
      current_round: 1,
      created_at: '',
      opened_at: '',
      started_at: '',
      ended_at: null,
      day_board_shown_at: null,
      closed_at: null,
    });
    renderDays();

    await waitFor(() => expect(screen.getByTestId('new-day-blocked')).toBeInTheDocument());
    expect(screen.getByTestId('new-day-input')).toBeDisabled();

    fireEvent.change(screen.getByTestId('new-day-input'), { target: { value: 'Day 2' } });
    expect(screen.getByTestId('new-day-submit')).toBeDisabled();
    fireEvent.click(screen.getByTestId('new-day-submit'));
    expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument();
    expect(adminStartNewDay).not.toHaveBeenCalled();
  });

  it('lists existing days with their session counts', async () => {
    fetchPlayingSession.mockResolvedValue(null);
    fetchSessionsForDay.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
    renderDays();
    await waitFor(() => expect(screen.getByTestId('day-row')).toBeInTheDocument());
    expect(screen.getByTestId('days-table')).toHaveTextContent('Day 1');
    expect(screen.getByTestId('days-table')).toHaveTextContent('2');
  });
});

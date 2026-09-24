import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LangProvider } from '../i18n';

const fetchEventDays = vi.fn();
const fetchCurrentEventDay = vi.fn();
const fetchSessionsForDay = vi.fn();
const countJoinedPlayersForSession = vi.fn();
const fetchSessionWinner = vi.fn();
const fetchSessionById = vi.fn();
const fetchPlayersForSession = vi.fn();
const fetchRoundsForSession = vi.fn();
const fetchScoresForSession = vi.fn();

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return {
    ...actual,
    fetchEventDays: (...a: unknown[]) => fetchEventDays(...a),
    fetchCurrentEventDay: (...a: unknown[]) => fetchCurrentEventDay(...a),
    fetchSessionsForDay: (...a: unknown[]) => fetchSessionsForDay(...a),
    countJoinedPlayersForSession: (...a: unknown[]) => countJoinedPlayersForSession(...a),
    fetchSessionWinner: (...a: unknown[]) => fetchSessionWinner(...a),
    fetchSessionById: (...a: unknown[]) => fetchSessionById(...a),
    fetchPlayersForSession: (...a: unknown[]) => fetchPlayersForSession(...a),
    fetchRoundsForSession: (...a: unknown[]) => fetchRoundsForSession(...a),
    fetchScoresForSession: (...a: unknown[]) => fetchScoresForSession(...a),
  };
});

import { SessionDetailPanel, SessionsPanel } from './Sessions';

const day1 = { id: 'day-1', label: 'Day 1', started_at: '', ended_at: null, is_current: true };

const session1 = {
  id: 's1',
  event_day_id: 'day-1',
  code: '4821',
  status: 'results' as const,
  lineup: ['trivia' as const],
  current_round: null,
  created_at: '2026-09-24T14:00:00.000Z',
  opened_at: '2026-09-24T14:00:00.000Z',
  started_at: '2026-09-24T14:01:00.000Z',
  ended_at: '2026-09-24T14:05:00.000Z',
  day_board_shown_at: null,
  closed_at: null,
};

beforeEach(() => {
  fetchEventDays.mockReset().mockResolvedValue([day1]);
  fetchCurrentEventDay.mockReset().mockResolvedValue(day1);
  fetchSessionsForDay.mockReset().mockResolvedValue([session1]);
  countJoinedPlayersForSession.mockReset().mockResolvedValue(3);
  fetchSessionWinner.mockReset().mockResolvedValue({ name: 'Omar', displaySuffix: null, total: 2604 });
});

describe('SessionsPanel (D2)', () => {
  it('lists the day\'s sessions with lineup, players and winner, and opens one on click', async () => {
    const onOpenSession = vi.fn();
    render(
      <LangProvider initial="en">
        <SessionsPanel onOpenSession={onOpenSession} />
      </LangProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('session-row')).toBeInTheDocument());
    const row = screen.getByTestId('session-row');
    expect(row).toHaveTextContent('4821');
    expect(row).toHaveTextContent('Trivia');
    expect(row).toHaveTextContent('3');
    expect(row).toHaveTextContent('Omar');

    fireEvent.click(row);
    expect(onOpenSession).toHaveBeenCalledWith('s1');
  });

  it('shows the empty state when the day has no sessions', async () => {
    fetchSessionsForDay.mockResolvedValue([]);
    render(
      <LangProvider initial="en">
        <SessionsPanel onOpenSession={vi.fn()} />
      </LangProvider>,
    );
    await waitFor(() => expect(screen.getByText(/no sessions yet/i)).toBeInTheDocument());
  });
});

describe('SessionDetailPanel (D3)', () => {
  it('shows each player\'s per-round scores, total, and the removed flag', async () => {
    fetchSessionById.mockResolvedValue(session1);
    fetchPlayersForSession.mockResolvedValue([
      { id: 'p1', session_id: 's1', player_id: 'u1', name: 'Omar', name_key: 'omar', display_suffix: null, status: 'joined', progress: 'finished', progress_round: 1, joined_at: '', removed_at: null },
      { id: 'p2', session_id: 's1', player_id: 'u2', name: 'Lina', name_key: 'lina', display_suffix: null, status: 'removed', progress: 'waiting', progress_round: null, joined_at: '', removed_at: '2026-09-24T14:02:00.000Z' },
    ]);
    fetchRoundsForSession.mockResolvedValue([
      { id: 'r1', session_id: 's1', round_no: 1, game: 'trivia', status: 'done', started_at: '', ended_at: '', end_reason: 'all_finished' },
    ]);
    fetchScoresForSession.mockResolvedValue([
      { id: 'sc1', round_id: 'r1', player_id: 'u1', score: 706, duration_ms: 1000, raw: {}, client_version: null, session_id: 's1', event_day_id: 'day-1', player_row_id: 'p1', game: 'trivia', name: 'Omar', name_key: 'omar', display_suffix: null, created_at: '' },
    ]);

    render(
      <LangProvider initial="en">
        <SessionDetailPanel sessionId="s1" onBack={vi.fn()} />
      </LangProvider>,
    );

    await waitFor(() => expect(screen.getAllByTestId('session-player-row')).toHaveLength(2));
    const rows = screen.getAllByTestId('session-player-row');
    expect(rows[0]).toHaveTextContent('Omar');
    expect(rows[0]).toHaveTextContent('706');
    expect(rows[1]).toHaveTextContent('Lina');
    expect(rows[1]).toHaveTextContent('Removed');
    expect(rows[1]).toHaveTextContent('–'); // no score for the removed player
  });
});

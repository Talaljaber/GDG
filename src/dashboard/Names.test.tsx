import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LangProvider } from '../i18n';

const fetchCurrentEventDay = vi.fn();
const fetchDayBoard = vi.fn();
const adminHideName = vi.fn();
const adminUnhideName = vi.fn();
const fetchHiddenNames = vi.fn();
const fetchBlockedTerms = vi.fn();
const adminAddBlockedTerm = vi.fn();
const adminRemoveBlockedTerm = vi.fn();

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return {
    ...actual,
    fetchCurrentEventDay: (...a: unknown[]) => fetchCurrentEventDay(...a),
    fetchDayBoard: (...a: unknown[]) => fetchDayBoard(...a),
    adminHideName: (...a: unknown[]) => adminHideName(...a),
    adminUnhideName: (...a: unknown[]) => adminUnhideName(...a),
    fetchHiddenNames: (...a: unknown[]) => fetchHiddenNames(...a),
    fetchBlockedTerms: (...a: unknown[]) => fetchBlockedTerms(...a),
    adminAddBlockedTerm: (...a: unknown[]) => adminAddBlockedTerm(...a),
    adminRemoveBlockedTerm: (...a: unknown[]) => adminRemoveBlockedTerm(...a),
  };
});

import { HideNameField, NamesPanel } from './Names';

beforeEach(() => {
  fetchCurrentEventDay.mockReset().mockResolvedValue({ id: 'day-1', label: 'Day 1', started_at: '', ended_at: null, is_current: true });
  fetchDayBoard.mockReset().mockResolvedValue([
    { eventDayId: 'day-1', game: 'trivia', nameKey: 'sara', name: 'Sara', score: 835, achievedAt: '2026-09-24T10:00:00.000Z' },
    { eventDayId: 'day-1', game: 'simon', nameKey: 'omar', name: 'Omar', score: 700, achievedAt: '2026-09-24T10:00:00.000Z' },
  ]);
  adminHideName.mockReset().mockResolvedValue(undefined);
  adminUnhideName.mockReset().mockResolvedValue(undefined);
  fetchHiddenNames.mockReset().mockResolvedValue([]);
  fetchBlockedTerms.mockReset().mockResolvedValue([]);
  adminAddBlockedTerm.mockReset().mockResolvedValue(undefined);
  adminRemoveBlockedTerm.mockReset().mockResolvedValue(undefined);
});

function renderField() {
  const onHidden = vi.fn();
  render(
    <LangProvider initial="en">
      <HideNameField onHidden={onHidden} />
    </LangProvider>,
  );
  return { onHidden };
}

describe('HideNameField (D1 quick hide / D5)', () => {
  it('previews the boards a typed name currently appears on, then hides it on confirm', async () => {
    const { onHidden } = renderField();

    fireEvent.change(screen.getByTestId('hide-name-input'), { target: { value: 'Sara' } });
    fireEvent.click(screen.getByTestId('hide-name-preview-btn'));

    await waitFor(() => expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument());
    expect(fetchDayBoard).toHaveBeenCalledWith('day-1');
    // Only the "sara" row from the mocked day board should be in the preview.
    expect(screen.getByTestId('hide-name-preview')).toHaveTextContent('835');
    expect(screen.getByTestId('hide-name-preview')).not.toHaveTextContent('700');

    await act(async () => {
      fireEvent.click(screen.getByTestId('confirm-yes'));
    });

    expect(adminHideName).toHaveBeenCalledWith('sara');
    expect(onHidden).toHaveBeenCalled();
  });

  it('shows "no names match" when the typed name has no current board entry', async () => {
    fetchDayBoard.mockResolvedValue([]);
    renderField();

    fireEvent.change(screen.getByTestId('hide-name-input'), { target: { value: 'Nobody' } });
    fireEvent.click(screen.getByTestId('hide-name-preview-btn'));

    await waitFor(() => expect(screen.getByTestId('hide-name-preview')).toBeInTheDocument());
    expect(screen.getByTestId('hide-name-preview').textContent).toMatch(/no names match/i);
  });

  it('cancel does not call admin_hide_name', async () => {
    renderField();
    fireEvent.change(screen.getByTestId('hide-name-input'), { target: { value: 'Sara' } });
    fireEvent.click(screen.getByTestId('hide-name-preview-btn'));
    await waitFor(() => expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(adminHideName).not.toHaveBeenCalled();
  });

  it('disables the preview button until a valid name is typed', () => {
    renderField();
    expect(screen.getByTestId('hide-name-preview-btn')).toBeDisabled();
    fireEvent.change(screen.getByTestId('hide-name-input'), { target: { value: 'Sara' } });
    expect(screen.getByTestId('hide-name-preview-btn')).not.toBeDisabled();
  });
});

describe('NamesPanel (D5): unhide and blocked words', () => {
  it('lists hidden names and unhides one', async () => {
    fetchHiddenNames.mockResolvedValue([{ name_key: 'ali', note: null, hidden_at: '2026-09-24T10:00:00.000Z' }]);
    render(
      <LangProvider initial="en">
        <NamesPanel />
      </LangProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('hidden-row')).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByTestId('unhide-btn'));
    });
    expect(adminUnhideName).toHaveBeenCalledWith('ali');
  });

  it('adds a blocked word with the selected match type', async () => {
    render(
      <LangProvider initial="en">
        <NamesPanel />
      </LangProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('blocked-form')).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('blocked-input'), { target: { value: 'badword' } });
    fireEvent.click(screen.getByLabelText(/anywhere in the name/i));
    await act(async () => {
      fireEvent.click(screen.getByTestId('blocked-add-btn'));
    });
    expect(adminAddBlockedTerm).toHaveBeenCalledWith('badword', 'substring');
  });

  it('removes a blocked word', async () => {
    fetchBlockedTerms.mockResolvedValue([{ term_key: 'badword', match: 'word', lang: 'any', added_at: '2026-09-24T10:00:00.000Z' }]);
    render(
      <LangProvider initial="en">
        <NamesPanel />
      </LangProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('blocked-row')).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByTestId('blocked-remove-btn'));
    });
    expect(adminRemoveBlockedTerm).toHaveBeenCalledWith('badword');
  });
});

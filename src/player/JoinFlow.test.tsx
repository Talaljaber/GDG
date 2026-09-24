import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LangProvider } from '../i18n';
import en from '../i18n/en.json';

const joinSession = vi.fn();
vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return { ...actual, joinSession: (...args: unknown[]) => joinSession(...args) };
});

import { JoinFlow } from './JoinFlow';
import { ApiError } from '../lib/api';

function renderFlow() {
  const onJoined = vi.fn();
  render(
    <LangProvider initial="en">
      <JoinFlow onJoined={onJoined} />
    </LangProvider>,
  );
  return { onJoined };
}

function apiError(kind: string, copyKey = 'x') {
  return new ApiError({ kind: kind as never, copyKey });
}

beforeEach(() => {
  localStorage.clear();
  joinSession.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('JoinFlow P1 (code)', () => {
  it('shows the format error for fewer than 4 digits, and sends nothing', () => {
    renderFlow();
    fireEvent.change(screen.getByTestId('code-input'), { target: { value: '48' } });
    fireEvent.click(screen.getByTestId('code-next'));
    expect(screen.getByTestId('code-error')).toHaveTextContent(en['join.code.error_format']);
    expect(joinSession).not.toHaveBeenCalled();
  });

  it('accepts Arabic-Indic digits and auto-advances at 4 digits (US-G1 AC5)', () => {
    renderFlow();
    fireEvent.change(screen.getByTestId('code-input'), { target: { value: '٤٨٢١' } });
    expect(screen.getByTestId('screen-name')).toBeInTheDocument();
    expect(screen.getByText('4821')).toBeInTheDocument();
  });
});

describe('JoinFlow P2 (name)', () => {
  function toName() {
    const utils = renderFlow();
    fireEvent.change(screen.getByTestId('code-input'), { target: { value: '4821' } });
    return utils;
  }

  it('prefills the last name used on this phone', () => {
    localStorage.setItem('gdg.v1.lastName', 'Sara');
    toName();
    expect(screen.getByTestId('name-input')).toHaveValue('Sara');
  });

  it('rejects empty and invalid names inline without calling the server (E28)', () => {
    toName();
    fireEvent.click(screen.getByTestId('name-submit'));
    expect(screen.getByTestId('name-error')).toHaveTextContent(en['join.name.error_empty']);
    fireEvent.change(screen.getByTestId('name-input'), { target: { value: 'Bob!' } });
    fireEvent.click(screen.getByTestId('name-submit'));
    expect(screen.getByTestId('name-error')).toHaveTextContent(en['join.name.error_invalid']);
    expect(joinSession).not.toHaveBeenCalled();
  });

  it('refuses input beyond 12 cleaned characters (US-G1 AC4)', () => {
    toName();
    const input = screen.getByTestId('name-input');
    fireEvent.change(input, { target: { value: 'Abcdefghijkl' } });
    fireEvent.change(input, { target: { value: 'Abcdefghijklm' } });
    expect(input).toHaveValue('Abcdefghijkl');
  });

  it('goes back to P1 with the "isn\'t active" error on GD001, keeping the name', async () => {
    joinSession.mockRejectedValueOnce(apiError('code_invalid', 'join.code.error_invalid'));
    toName();
    fireEvent.change(screen.getByTestId('name-input'), { target: { value: 'Sara' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('name-submit'));
    });
    expect(screen.getByTestId('code-error')).toHaveTextContent(en['join.code.error_invalid']);
    fireEvent.change(screen.getByTestId('code-input'), { target: { value: '5307' } });
    expect(screen.getByTestId('name-input')).toHaveValue('Sara');
  });

  it('maps GD003 to the blocked-name message and GD004 to the removed screen', async () => {
    joinSession.mockRejectedValueOnce(apiError('name_blocked'));
    toName();
    fireEvent.change(screen.getByTestId('name-input'), { target: { value: 'Sara' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('name-submit'));
    });
    expect(screen.getByTestId('name-error')).toHaveTextContent(en['join.name.error_blocked']);

    joinSession.mockRejectedValueOnce(apiError('removed'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('name-submit'));
    });
    expect(screen.getByTestId('screen-removed')).toBeInTheDocument();
  });

  it('after too many wrong codes (GD013) counts down with Join disabled, keeping name and code (ADR-130)', async () => {
    vi.useFakeTimers();
    joinSession
      .mockRejectedValueOnce(new ApiError({ kind: 'too_many_tries', copyKey: 'join.error_wait' }, 'GD013', 'GD013', 3))
      .mockResolvedValueOnce({
        session_id: 's1',
        player_row_id: 'p1',
        name: 'Sara',
        display_suffix: null,
        session_status: 'lobby',
      });
    const { onJoined } = toName();
    fireEvent.change(screen.getByTestId('name-input'), { target: { value: 'Sara' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('name-submit'));
    });
    expect(screen.getByTestId('name-wait')).toHaveTextContent(en['join.error_wait'].replace('{s}', '3'));
    expect(screen.getByTestId('name-submit')).toBeDisabled();
    expect(screen.getByTestId('name-input')).toHaveValue('Sara');
    expect(screen.getByText('4821')).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(screen.getByTestId('name-wait')).toHaveTextContent(en['join.error_wait'].replace('{s}', '2'));
    // Enter on the form does nothing while waiting.
    fireEvent.submit(screen.getByTestId('screen-name'));
    expect(joinSession).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(screen.queryByTestId('name-wait')).not.toBeInTheDocument();
    expect(screen.getByTestId('name-submit')).toBeEnabled();
    await act(async () => {
      fireEvent.click(screen.getByTestId('name-submit'));
    });
    expect(joinSession).toHaveBeenCalledTimes(2);
    expect(joinSession).toHaveBeenLastCalledWith('4821', 'Sara');
    expect(onJoined).toHaveBeenCalledTimes(1);
  });

  it('keeps the wait when going back to change the code', async () => {
    vi.useFakeTimers();
    joinSession.mockRejectedValueOnce(
      new ApiError({ kind: 'too_many_tries', copyKey: 'join.error_wait' }, 'GD013', 'GD013', 10),
    );
    toName();
    fireEvent.change(screen.getByTestId('name-input'), { target: { value: 'Sara' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('name-submit'));
    });
    fireEvent.click(screen.getByTestId('name-back'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    fireEvent.change(screen.getByTestId('code-input'), { target: { value: '5307' } });
    expect(screen.getByTestId('name-wait')).toHaveTextContent(en['join.error_wait'].replace('{s}', '6'));
    expect(screen.getByTestId('name-submit')).toBeDisabled();
    expect(screen.getByTestId('name-input')).toHaveValue('Sara');
  });

  it('retries once after 5 s when rate-limited (E29)', async () => {
    vi.useFakeTimers();
    joinSession.mockRejectedValueOnce(apiError('rate_limited')).mockResolvedValueOnce({
      session_id: 's1',
      player_row_id: 'p1',
      name: 'Sara',
      display_suffix: null,
      session_status: 'lobby',
    });
    const { onJoined } = toName();
    fireEvent.change(screen.getByTestId('name-input'), { target: { value: 'Sara' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('name-submit'));
    });
    expect(screen.getByTestId('name-error')).toHaveTextContent(en['join.error_rate']);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(joinSession).toHaveBeenCalledTimes(2);
    expect(onJoined).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('gdg.v1.lastName')).toBe('Sara');
  });
});

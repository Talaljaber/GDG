import { act, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOARD_POLL_MS } from '../config';

const fetchRoundBoard = vi.fn();
const fetchPlayers = vi.fn();

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    fetchRoundBoard: (...a: unknown[]) => fetchRoundBoard(...a),
    fetchPlayers: (...a: unknown[]) => fetchPlayers(...a),
  };
});

import { usePlayerRows, useRoundBoard } from './boardHooks';

const row = (id: string, value: number) => ({ playerRowId: id, name: id, displaySuffix: null, value });
/** A fresh response object each poll, as the network gives it. */
const page = (a: number) => ({ top: [row('a', a), row('b', 400)], own: null, total: 2 });

// Committed renders (an effect per commit), as the dev render counter counts them: a same-value
// setState may call the component once more, but React bails out without committing.
let renders = 0;
function Board() {
  useEffect(() => {
    renders += 1;
  });
  const rows = useRoundBoard('r1', 'b', true);
  return <p data-testid="rows">{rows ? rows.map((r) => `${r.name}:${r.value}`).join(' ') : 'none'}</p>;
}

let playerRenders = 0;
function Count() {
  useEffect(() => {
    playerRenders += 1;
  });
  const players = usePlayerRows('s1', true);
  return <p data-testid="n">{players?.length ?? 'none'}</p>;
}

async function poll() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(BOARD_POLL_MS);
  });
}

describe('polled boards keep their rows when a poll returns the same data', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    renders = 0;
    playerRenders = 0;
    fetchRoundBoard.mockReset();
    fetchPlayers.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it('does not re-render the board for identical polls, and does for a change', async () => {
    fetchRoundBoard.mockImplementation(async () => page(900));
    render(<Board />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByTestId('rows')).toHaveTextContent('a:900 b:400');
    const loaded = renders;

    await poll();
    await poll();
    await poll();
    expect(fetchRoundBoard).toHaveBeenCalledTimes(4);
    expect(renders).toBe(loaded);

    fetchRoundBoard.mockImplementation(async () => page(950));
    await poll();
    expect(screen.getByTestId('rows')).toHaveTextContent('a:950 b:400');
    expect(renders).toBe(loaded + 1);
  });

  it('does not re-render the player count for identical player rows', async () => {
    const players = () => [
      { id: 'p1', status: 'joined', progress: 'lobby', progress_round: null },
      { id: 'p2', status: 'joined', progress: 'lobby', progress_round: null },
    ];
    fetchPlayers.mockImplementation(async () => players());
    render(<Count />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByTestId('n')).toHaveTextContent('2');
    const loaded = playerRenders;
    for (let i = 0; i < 10; i++) await poll(); // 30 s idle in the lobby
    expect(playerRenders).toBe(loaded);
  });
});

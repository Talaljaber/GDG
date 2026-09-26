import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchSession = vi.fn();
const fetchRounds = vi.fn();
const fetchPlayer = vi.fn();
const fetchEventDay = vi.fn();

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    fetchSession: (...a: unknown[]) => fetchSession(...a),
    fetchRounds: (...a: unknown[]) => fetchRounds(...a),
    fetchPlayer: (...a: unknown[]) => fetchPlayer(...a),
    fetchEventDay: (...a: unknown[]) => fetchEventDay(...a),
  };
});

// No socket in tests: the channel never reports, so only the timers refetch.
vi.mock('../lib/realtime', () => ({
  acquireChannel: () => () => {},
  phoneSessionChannel: () => ({}),
  phonePresenceChannel: () => ({}),
}));

import { ROUND_SAFETY_REFETCH_MS, STATE_SAFETY_REFETCH_MS, useSessionSync } from './hooks';
import { LATE_ACCEPT_MS } from '../config';

function Sync({ inRound }: { inRound: boolean }) {
  useSessionSync('s1', 'p1', inRound);
  return null;
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe('useSessionSync round-row safety refetch (missed round-end event)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fetchSession.mockResolvedValue({ id: 's1', status: 'playing' });
    fetchRounds.mockResolvedValue([]);
    fetchPlayer.mockResolvedValue({ id: 'p1', status: 'joined' });
    fetchEventDay.mockResolvedValue(null);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('stays well inside the late-accept window', () => {
    expect(ROUND_SAFETY_REFETCH_MS).toBeLessThanOrEqual(LATE_ACCEPT_MS / 3);
  });

  it('refetches the round rows within 5 s while a round is on the phone', async () => {
    render(<Sync inRound />);
    await advance(0);
    expect(fetchRounds).toHaveBeenCalledTimes(1); // the initial load
    await advance(ROUND_SAFETY_REFETCH_MS);
    expect(fetchRounds).toHaveBeenCalledTimes(2);
    // Only the rounds: no session/player refetch until the 15 s safety net.
    expect(fetchSession).toHaveBeenCalledTimes(1);
    expect(fetchPlayer).toHaveBeenCalledTimes(1);
  });

  it('does not refetch before 15 s when no round is on the phone', async () => {
    render(<Sync inRound={false} />);
    await advance(0);
    expect(fetchRounds).toHaveBeenCalledTimes(1);
    await advance(STATE_SAFETY_REFETCH_MS - 1);
    expect(fetchRounds).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(fetchRounds).toHaveBeenCalledTimes(2);
  });

  it('stops the extra refetch once the round is off the phone', async () => {
    const view = render(<Sync inRound />);
    await advance(ROUND_SAFETY_REFETCH_MS);
    expect(fetchRounds).toHaveBeenCalledTimes(2);
    view.rerender(<Sync inRound={false} />);
    // Up to just before the 15 s full refetch: nothing more.
    await advance(STATE_SAFETY_REFETCH_MS - ROUND_SAFETY_REFETCH_MS - 1);
    expect(fetchRounds).toHaveBeenCalledTimes(2);
  });
});

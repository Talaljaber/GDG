import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const getSession = vi.fn();
const signInAnonymously = vi.fn();
vi.mock('./supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    auth: {
      getSession: () => getSession(),
      signInAnonymously: () => signInAnonymously(),
    },
  },
}));

import { ApiError, joinSession } from './api';

const payload = {
  session_id: 's1',
  player_row_id: 'p1',
  name: 'Sara',
  display_suffix: null,
  session_status: 'lobby',
};

async function joinError(): Promise<ApiError> {
  try {
    await joinSession('4821', 'Sara');
  } catch (err) {
    if (err instanceof ApiError) return err;
    throw err;
  }
  throw new Error('joinSession resolved');
}

beforeEach(() => {
  rpc.mockReset();
  getSession.mockReset().mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
  signInAnonymously.mockReset();
});

describe('joinSession: join_session results (DATA_MODEL.md §6, ADR-130)', () => {
  it('resolves with the membership payload', async () => {
    rpc.mockResolvedValueOnce({ data: payload, error: null, status: 200 });
    await expect(joinSession('4821', 'Sara')).resolves.toEqual(payload);
    expect(rpc).toHaveBeenCalledWith('join_session', { p_code: '4821', p_name: 'Sara' });
    expect(signInAnonymously).not.toHaveBeenCalled();
  });

  it('signs in anonymously first when this phone has no session (ADR-102)', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    signInAnonymously.mockResolvedValueOnce({ data: { user: { id: 'u2' } }, error: null });
    rpc.mockResolvedValueOnce({ data: payload, error: null, status: 200 });
    await joinSession('4821', 'Sara');
    expect(signInAnonymously).toHaveBeenCalledTimes(1);
  });

  it('throws code_invalid for {"error":"GD001"} returned as data', async () => {
    rpc.mockResolvedValueOnce({ data: { error: 'GD001' }, error: null, status: 200 });
    const err = await joinError();
    expect(err.mapped).toMatchObject({ kind: 'code_invalid', copyKey: 'join.code.error_invalid' });
    expect(err.code).toBe('GD001');
    expect(err.retryAfterS).toBeUndefined();
  });

  it('throws too_many_tries with the seconds left for {"error":"GD013","retry_after_s":27}', async () => {
    rpc.mockResolvedValueOnce({ data: { error: 'GD013', retry_after_s: 27 }, error: null, status: 200 });
    const err = await joinError();
    expect(err.mapped).toMatchObject({ kind: 'too_many_tries', copyKey: 'join.error_wait' });
    expect(err.code).toBe('GD013');
    expect(err.retryAfterS).toBe(27);
  });

  it('still maps raised errors (GD003) as before', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'GD003', message: 'name_blocked' }, status: 400 });
    const err = await joinError();
    expect(err.mapped.kind).toBe('name_blocked');
    expect(err.retryAfterS).toBeUndefined();
  });

  it('treats an empty result as an unknown error', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null, status: 200 });
    expect((await joinError()).mapped.kind).toBe('unknown');
  });
});

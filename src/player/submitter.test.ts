import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { classifySubmitError, createSubmitter, type SubmitState } from './submitter';
import type { PendingSubmit } from '../lib/storage';
import type { ErrorKind } from '../lib/errors';

const payload: PendingSubmit = { roundId: 'r1', score: 750, durationMs: 30000, raw: { attempts: [] } };

function fail(kind: ErrorKind) {
  return Object.assign(new Error(kind), { mapped: { kind, copyKey: 'x' } });
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

async function flush() {
  // let the send() promise settle
  await vi.advanceTimersByTimeAsync(0);
}

describe('classifySubmitError', () => {
  it('treats a unique violation (23505) as success', () => {
    expect(classifySubmitError('already_saved')).toBe('saved');
  });
  it('stops on permanent refusals', () => {
    expect(classifySubmitError('round_closed')).toBe('failed');
    expect(classifySubmitError('impossible_score')).toBe('failed');
    expect(classifySubmitError('not_in_session')).toBe('failed');
  });
  it('retries network and unknown failures', () => {
    expect(classifySubmitError('network')).toBe('retry');
    expect(classifySubmitError('unknown')).toBe('retry');
    expect(classifySubmitError('rate_limited')).toBe('retry');
  });
});

describe('createSubmitter', () => {
  it('reports saving then saved on first success', async () => {
    const states: SubmitState[] = [];
    const send = vi.fn().mockResolvedValue(undefined);
    const s = createSubmitter({ send, retryMs: 2000, onState: (st) => states.push(st) });
    s.submit(payload);
    await flush();
    expect(send).toHaveBeenCalledTimes(1);
    expect(states).toEqual(['saving', 'saved']);
  });

  it('retries every retryMs after network failures until it succeeds', async () => {
    const states: SubmitState[] = [];
    const send = vi
      .fn()
      .mockRejectedValueOnce(fail('network'))
      .mockRejectedValueOnce(fail('network'))
      .mockResolvedValue(undefined);
    const s = createSubmitter({ send, retryMs: 2000, onState: (st) => states.push(st) });
    s.submit(payload);
    await flush();
    expect(send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1999);
    expect(send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(send).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(2000);
    expect(send).toHaveBeenCalledTimes(3);
    expect(states).toEqual(['saving', 'saved']);
  });

  it('treats a 23505 on a retry as saved (the first insert landed)', async () => {
    const states: SubmitState[] = [];
    const send = vi.fn().mockRejectedValueOnce(fail('network')).mockRejectedValueOnce(fail('already_saved'));
    const s = createSubmitter({ send, retryMs: 2000, onState: (st) => states.push(st) });
    s.submit(payload);
    await flush();
    await vi.advanceTimersByTimeAsync(2000);
    expect(send).toHaveBeenCalledTimes(2);
    expect(states).toEqual(['saving', 'saved']);
    await vi.advanceTimersByTimeAsync(10000);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('stops with failed on GD007 (round closed) and reports the kind', async () => {
    const onState = vi.fn();
    const send = vi.fn().mockRejectedValue(fail('round_closed'));
    const s = createSubmitter({ send, retryMs: 2000, onState });
    s.submit(payload);
    await flush();
    await vi.advanceTimersByTimeAsync(10000);
    expect(send).toHaveBeenCalledTimes(1);
    expect(onState).toHaveBeenLastCalledWith('failed', payload, 'round_closed');
  });

  it('cancel stops pending retries', async () => {
    const send = vi.fn().mockRejectedValue(fail('network'));
    const onState = vi.fn();
    const s = createSubmitter({ send, retryMs: 2000, onState });
    s.submit(payload);
    await flush();
    s.cancel();
    await vi.advanceTimersByTimeAsync(10000);
    expect(send).toHaveBeenCalledTimes(1);
    expect(onState).toHaveBeenCalledTimes(1); // only 'saving'
  });

  it('ignores the outcome of an abandoned attempt after cancel', async () => {
    let resolve: () => void = () => {};
    const send = vi.fn(() => new Promise<void>((r) => (resolve = r)));
    const onState = vi.fn();
    const s = createSubmitter({ send, retryMs: 2000, onState });
    s.submit(payload);
    s.cancel();
    resolve();
    await flush();
    expect(onState).toHaveBeenCalledTimes(1);
  });
});

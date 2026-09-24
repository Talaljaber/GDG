import { describe, expect, it } from 'vitest';
import { mapDbError } from './errors';

describe('mapDbError: SQLSTATEs from DATA_MODEL.md §5', () => {
  it('GD001 -> code_invalid / join.code.error_invalid', () => {
    expect(mapDbError({ code: 'GD001', message: 'code_invalid' })).toEqual({
      kind: 'code_invalid',
      copyKey: 'join.code.error_invalid',
      detail: undefined,
    });
  });

  it('GD002 -> name_invalid / join.name.error_invalid', () => {
    expect(mapDbError({ code: 'GD002', message: 'name_invalid' })).toMatchObject({
      kind: 'name_invalid',
      copyKey: 'join.name.error_invalid',
    });
  });

  it('GD003 -> name_blocked / join.name.error_blocked', () => {
    expect(mapDbError({ code: 'GD003', message: 'name_blocked' })).toMatchObject({
      kind: 'name_blocked',
      copyKey: 'join.name.error_blocked',
    });
  });

  it('GD004 -> removed / removed.title', () => {
    expect(mapDbError({ code: 'GD004', message: 'removed' })).toMatchObject({
      kind: 'removed',
      copyKey: 'removed.title',
    });
  });

  it('GD005 -> not_in_session', () => {
    expect(mapDbError({ code: 'GD005', message: 'not_in_session' })).toMatchObject({
      kind: 'not_in_session',
    });
  });

  it('GD006 -> round_not_open', () => {
    expect(mapDbError({ code: 'GD006', message: 'round_not_open' })).toMatchObject({
      kind: 'round_not_open',
    });
  });

  it('GD007 -> round_closed / sys.save_failed', () => {
    expect(mapDbError({ code: 'GD007', message: 'round_closed' })).toMatchObject({
      kind: 'round_closed',
      copyKey: 'sys.save_failed',
    });
  });

  it('GD008 -> impossible_score, carries the detail (failed bound)', () => {
    expect(
      mapDbError({ code: 'GD008', message: 'impossible_score', details: 'duration_ms too low' }),
    ).toEqual({
      kind: 'impossible_score',
      copyKey: 'sys.generic_error',
      detail: 'duration_ms too low',
    });
  });

  it('GD009 -> not_admin / host.signin.not_admin', () => {
    expect(mapDbError({ code: 'GD009', message: 'not_admin' })).toMatchObject({
      kind: 'not_admin',
      copyKey: 'host.signin.not_admin',
    });
  });

  it('GD010 -> invalid_state', () => {
    expect(mapDbError({ code: 'GD010', message: 'invalid_state' })).toMatchObject({
      kind: 'invalid_state',
    });
  });

  it('GD011 -> lineup_invalid', () => {
    expect(mapDbError({ code: 'GD011', message: 'lineup_invalid' })).toMatchObject({
      kind: 'lineup_invalid',
    });
  });

  it('GD012 -> not_signed_in', () => {
    expect(mapDbError({ code: 'GD012', message: 'not_signed_in' })).toMatchObject({
      kind: 'not_signed_in',
    });
  });
});

describe('mapDbError: other cases', () => {
  it('23505 (unique violation) -> already_saved', () => {
    expect(mapDbError({ code: '23505', message: 'duplicate key value' })).toMatchObject({
      kind: 'already_saved',
    });
  });

  it('HTTP 429 -> rate_limited / join.error_rate', () => {
    expect(mapDbError({ code: '429', message: 'Too Many Requests' })).toMatchObject({
      kind: 'rate_limited',
      copyKey: 'join.error_rate',
    });
  });

  it('auth "rate limit" message -> rate_limited', () => {
    expect(mapDbError({ message: 'email rate limit exceeded' })).toMatchObject({
      kind: 'rate_limited',
      copyKey: 'join.error_rate',
    });
  });

  it('fetch/network failure message -> network / join.error_network', () => {
    expect(mapDbError({ message: 'Failed to fetch' })).toMatchObject({
      kind: 'network',
      copyKey: 'join.error_network',
    });
    expect(mapDbError({ message: 'NetworkError when attempting to fetch resource' })).toMatchObject(
      {
        kind: 'network',
        copyKey: 'join.error_network',
      },
    );
  });

  it('null input -> unknown / sys.generic_error', () => {
    expect(mapDbError(null)).toEqual({ kind: 'unknown', copyKey: 'sys.generic_error' });
  });

  it('unrecognised error -> unknown / sys.generic_error, keeps message as detail', () => {
    expect(mapDbError({ code: 'XX000', message: 'something exploded' })).toEqual({
      kind: 'unknown',
      copyKey: 'sys.generic_error',
      detail: 'something exploded',
    });
  });

  it('unrecognised error with no message or details -> unknown, no detail', () => {
    expect(mapDbError({})).toEqual({ kind: 'unknown', copyKey: 'sys.generic_error', detail: undefined });
  });
});

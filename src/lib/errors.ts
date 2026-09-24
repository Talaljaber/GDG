/**
 * Maps a Supabase/Postgres error (or a network/auth failure) to a stable
 * error kind and an i18n copy key from `docs/COPY.md`, so UI code never
 * branches on raw SQLSTATEs or message strings. SQLSTATE table:
 * `DATA_MODEL.md` §5.
 */

export type ErrorKind =
  | 'code_invalid'
  | 'name_invalid'
  | 'name_blocked'
  | 'removed'
  | 'not_in_session'
  | 'round_not_open'
  | 'round_closed'
  | 'impossible_score'
  | 'not_admin'
  | 'invalid_state'
  | 'lineup_invalid'
  | 'not_signed_in'
  | 'too_many_tries'
  | 'already_saved'
  | 'rate_limited'
  | 'network'
  | 'unknown';

export interface MappedError {
  kind: ErrorKind;
  copyKey: string;
  detail?: string;
}

export interface DbErrorLike {
  code?: string;
  message?: string;
  details?: string;
}

/** SQLSTATE (`GD0xx`, `DATA_MODEL.md` §5) -> error kind + copy key. */
const SQLSTATE_MAP: Record<string, { kind: ErrorKind; copyKey: string }> = {
  GD001: { kind: 'code_invalid', copyKey: 'join.code.error_invalid' },
  GD002: { kind: 'name_invalid', copyKey: 'join.name.error_invalid' },
  GD003: { kind: 'name_blocked', copyKey: 'join.name.error_blocked' },
  GD004: { kind: 'removed', copyKey: 'removed.title' },
  GD005: { kind: 'not_in_session', copyKey: 'sys.generic_error' },
  GD006: { kind: 'round_not_open', copyKey: 'sys.generic_error' },
  GD007: { kind: 'round_closed', copyKey: 'sys.save_failed' },
  GD008: { kind: 'impossible_score', copyKey: 'sys.generic_error' },
  GD009: { kind: 'not_admin', copyKey: 'host.signin.not_admin' },
  GD010: { kind: 'invalid_state', copyKey: 'sys.generic_error' },
  GD011: { kind: 'lineup_invalid', copyKey: 'sys.generic_error' },
  GD012: { kind: 'not_signed_in', copyKey: 'sys.generic_error' },
  // GD001 and GD013 come back from join_session as data, not raised (ADR-130); api.ts maps them here too.
  GD013: { kind: 'too_many_tries', copyKey: 'join.error_wait' },
};

/** Postgres unique-violation: a retried score insert that already landed (E14) — treated as success. */
const UNIQUE_VIOLATION_SQLSTATE = '23505';

function messageIncludes(message: string | undefined, needle: string): boolean {
  return typeof message === 'string' && message.toLowerCase().includes(needle);
}

/**
 * Maps a DB/RPC error, or a network/rate-limit failure, to `{ kind, copyKey, detail? }`.
 * Pass `null` (e.g. a caught non-Error value normalised upstream) for an unknown failure.
 */
export function mapDbError(err: DbErrorLike | null): MappedError {
  if (!err) {
    return { kind: 'unknown', copyKey: 'sys.generic_error' };
  }

  const { code, message, details } = err;
  const detail = details || undefined;

  if (code && SQLSTATE_MAP[code]) {
    const mapped = SQLSTATE_MAP[code];
    return { kind: mapped.kind, copyKey: mapped.copyKey, detail };
  }

  if (code === UNIQUE_VIOLATION_SQLSTATE) {
    return { kind: 'already_saved', copyKey: 'sys.saving', detail };
  }

  if (code === '429' || messageIncludes(message, 'rate limit')) {
    return { kind: 'rate_limited', copyKey: 'join.error_rate', detail };
  }

  if (
    messageIncludes(message, 'network') ||
    messageIncludes(message, 'fetch') ||
    code === 'network'
  ) {
    return { kind: 'network', copyKey: 'join.error_network', detail };
  }

  return { kind: 'unknown', copyKey: 'sys.generic_error', detail: detail || message };
}

/**
 * Typed wrappers around every Supabase call the admin dashboard makes:
 * reads across event days/sessions/players/scores (admin sees every day,
 * `DATA_MODEL.md` §4.3), the `v_day_board` view, and the admin RPCs for
 * hiding names, the blocklist and starting a new event day
 * (`DATA_MODEL.md` §6). Owned by the dashboard only; the host/player data
 * layer is `src/lib/api.ts` (not edited here).
 *
 * Every function resolves with data or throws the shared `ApiError` so
 * screens can use `err.mapped.kind` / `err.mapped.copyKey` (`src/lib/errors.ts`).
 */
import type { Database } from '../lib/database.types';
import { supabase } from '../lib/supabase';
import { mapDbError, type DbErrorLike } from '../lib/errors';

type Tables = Database['public']['Tables'];
export type GameId = Database['public']['Enums']['game_id'];
export type SessionStatus = Database['public']['Enums']['session_status'];
export type RoundEndReason = Database['public']['Enums']['round_end_reason'];
export type TermMatch = Database['public']['Enums']['term_match'];

export type EventDayRow = Tables['event_days']['Row'];
export type SessionRow = Tables['sessions']['Row'];
export type RoundRow = Tables['rounds']['Row'];
export type PlayerRow = Tables['players']['Row'];
export type ScoreRow = Tables['scores']['Row'];
export type HiddenNameRow = Tables['hidden_names']['Row'];
export type BlockedTermRow = Tables['blocked_terms']['Row'];

export class ApiError extends Error {
  readonly mapped: ReturnType<typeof mapDbError>;
  readonly code: string | undefined;
  constructor(mapped: ReturnType<typeof mapDbError>, code?: string, message?: string) {
    super(message ?? mapped.kind);
    this.name = 'ApiError';
    this.mapped = mapped;
    this.code = code;
  }
}

interface ErrorWithStatus extends DbErrorLike {
  status?: number;
}

function toApiError(err: unknown, status?: number): ApiError {
  if (err instanceof ApiError) return err;
  const e = (err ?? {}) as ErrorWithStatus;
  const code = typeof e.code === 'string' && e.code !== '' ? e.code : undefined;
  const message = typeof e.message === 'string' ? e.message : String(err);
  const httpStatus = status ?? e.status;
  if (!code?.startsWith('GD') && code !== '23505') {
    if (httpStatus === 0 || /failed to fetch|networkerror|load failed|network/i.test(message)) {
      return new ApiError(mapDbError({ code: 'network', message }), 'network', message);
    }
  }
  return new ApiError(mapDbError({ code, message, details: e.details }), code, message);
}

async function run<T>(fn: () => PromiseLike<{ data: T; error: unknown; status?: number }>): Promise<T> {
  try {
    const res = await fn();
    if (res.error) throw toApiError(res.error, res.status);
    return res.data;
  } catch (err) {
    throw toApiError(err);
  }
}

function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new ApiError(mapDbError(null));
  return value;
}

// ---------------------------------------------------------------- event days

/** Every event day, newest first (D6 list). */
export async function fetchEventDays(): Promise<EventDayRow[]> {
  return (await run(() => supabase.from('event_days').select('*').order('started_at', { ascending: false }))) ?? [];
}

export async function fetchCurrentEventDay(): Promise<EventDayRow | null> {
  return run(() => supabase.from('event_days').select('*').eq('is_current', true).maybeSingle());
}

export async function adminStartNewDay(label: string): Promise<EventDayRow> {
  return required(await run(() => supabase.rpc('admin_start_new_day', { p_label: label })));
}

// ---------------------------------------------------------------- sessions

/** Every session of one event day, oldest first (D2 history; D1 uses the last one). */
export async function fetchSessionsForDay(eventDayId: string): Promise<SessionRow[]> {
  return (
    (await run(() =>
      supabase.from('sessions').select('*').eq('event_day_id', eventDayId).order('created_at', { ascending: true }),
    )) ?? []
  );
}

/** Any session currently `playing` (blocks a new event day, D6). */
export async function fetchPlayingSession(): Promise<SessionRow | null> {
  return run(() => supabase.from('sessions').select('*').eq('status', 'playing').maybeSingle());
}

export async function fetchSessionById(sessionId: string): Promise<SessionRow | null> {
  return run(() => supabase.from('sessions').select('*').eq('id', sessionId).maybeSingle());
}

export async function fetchPlayersForSession(sessionId: string): Promise<PlayerRow[]> {
  return (
    (await run(() =>
      supabase.from('players').select('*').eq('session_id', sessionId).order('joined_at', { ascending: true }),
    )) ?? []
  );
}

export async function fetchRoundsForSession(sessionId: string): Promise<RoundRow[]> {
  return (
    (await run(() =>
      supabase.from('rounds').select('*').eq('session_id', sessionId).order('round_no', { ascending: true }),
    )) ?? []
  );
}

/** Every score of a session (all players, all rounds; admin sees hidden names too), for D3's per-round breakdown. */
export async function fetchScoresForSession(sessionId: string): Promise<ScoreRow[]> {
  return (await run(() => supabase.from('scores').select('*').eq('session_id', sessionId))) ?? [];
}

export async function countJoinedPlayersForSession(sessionId: string): Promise<number> {
  const res = await supabase
    .from('players')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', sessionId)
    .eq('status', 'joined');
  if (res.error) throw toApiError(res.error, res.status);
  return res.count ?? 0;
}

export interface SessionWinner {
  name: string;
  displaySuffix: number | null;
  total: number;
}

/** D2/D3 winner: `v_session_board` top row (`total desc, total_duration_ms asc, joined_at asc`, SCORING §5). */
export async function fetchSessionWinner(sessionId: string): Promise<SessionWinner | null> {
  const row = await run(() =>
    supabase
      .from('v_session_board')
      .select('name, display_suffix, total, total_duration_ms, joined_at')
      .eq('session_id', sessionId)
      .order('total', { ascending: false })
      .order('total_duration_ms', { ascending: true })
      .order('joined_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
  );
  if (!row || row.name === null || row.total === null) return null;
  return { name: row.name, displaySuffix: row.display_suffix, total: row.total };
}

// ---------------------------------------------------------------- stats (D1)

export async function countJoinedPlayers(eventDayId: string): Promise<number> {
  const sessions = await fetchSessionsForDay(eventDayId);
  if (sessions.length === 0) return 0;
  const ids = sessions.map((s) => s.id);
  const res = await supabase
    .from('players')
    .select('id', { count: 'exact', head: true })
    .in('session_id', ids)
    .eq('status', 'joined');
  if (res.error) throw toApiError(res.error, res.status);
  return res.count ?? 0;
}

export async function countScores(eventDayId: string): Promise<number> {
  const res = await supabase
    .from('scores')
    .select('id', { count: 'exact', head: true })
    .eq('event_day_id', eventDayId);
  if (res.error) throw toApiError(res.error, res.status);
  return res.count ?? 0;
}

// ---------------------------------------------------------------- combined results (D4)

export interface CombinedScoreRow {
  id: string;
  name: string;
  nameKey: string;
  displaySuffix: number | null;
  game: GameId;
  score: number;
  createdAt: string;
  sessionId: string;
  sessionCode: string | null;
  eventDayId: string;
}

/** All hidden name keys, for client-side filtering (mirrors `not exists hidden_names`, DATA_MODEL §7). */
export async function fetchHiddenNameKeys(): Promise<Set<string>> {
  const rows = (await run(() => supabase.from('hidden_names').select('name_key'))) ?? [];
  return new Set(rows.map((r) => r.name_key));
}

/**
 * Every visible score for a day (or every day, when `eventDayId` is null),
 * optionally filtered to one game. Hidden name keys are excluded (ADR-115),
 * so the raw rows already match what every leaderboard/day-board shows.
 */
export async function fetchCombinedResults(params: {
  eventDayId: string | null;
  game?: GameId | null;
}): Promise<CombinedScoreRow[]> {
  let query = supabase
    .from('scores')
    .select('id, name, name_key, display_suffix, game, score, created_at, session_id, event_day_id, sessions(code)');
  if (params.eventDayId) query = query.eq('event_day_id', params.eventDayId);
  if (params.game) query = query.eq('game', params.game);
  const rows = (await run(() => query)) ?? [];
  const hidden = await fetchHiddenNameKeys();
  return rows
    .filter((r) => !hidden.has(r.name_key))
    .map((r) => ({
      id: r.id,
      name: r.name,
      nameKey: r.name_key,
      displaySuffix: r.display_suffix,
      game: r.game,
      score: r.score,
      createdAt: r.created_at,
      sessionId: r.session_id,
      sessionCode: (r.sessions as { code: string } | null)?.code ?? null,
      eventDayId: r.event_day_id,
    }));
}

export interface DayBoardRow {
  eventDayId: string;
  game: GameId;
  nameKey: string;
  name: string;
  score: number;
  achievedAt: string;
}

/** `v_day_board` rows (best per name key per game, today; DATA_MODEL §7), used to verify the best-per-name toggle (AC4.2). */
export async function fetchDayBoard(eventDayId: string, game?: GameId | null): Promise<DayBoardRow[]> {
  let query = supabase.from('v_day_board').select('*').eq('event_day_id', eventDayId);
  if (game) query = query.eq('game', game);
  const rows = (await run(() => query)) ?? [];
  return rows
    .filter((r): r is Required<typeof r> => r.name_key !== null && r.name !== null && r.score !== null)
    .map((r) => ({
      eventDayId: r.event_day_id as string,
      game: r.game as GameId,
      nameKey: r.name_key as string,
      name: r.name as string,
      score: r.score as number,
      achievedAt: r.achieved_at as string,
    }));
}

// ---------------------------------------------------------------- names (D5)

export async function fetchHiddenNames(): Promise<HiddenNameRow[]> {
  return (
    (await run(() => supabase.from('hidden_names').select('*').order('hidden_at', { ascending: false }))) ?? []
  );
}

export async function adminHideName(nameKeyOrName: string, note?: string): Promise<void> {
  await run(() => supabase.rpc('admin_hide_name', { p_name_key: nameKeyOrName, p_note: note }));
}

export async function adminUnhideName(nameKey: string): Promise<void> {
  await run(() => supabase.rpc('admin_unhide_name', { p_name_key: nameKey }));
}

export async function fetchBlockedTerms(): Promise<BlockedTermRow[]> {
  return (
    (await run(() => supabase.from('blocked_terms').select('*').order('added_at', { ascending: false }))) ?? []
  );
}

export async function adminAddBlockedTerm(term: string, match: TermMatch): Promise<void> {
  await run(() => supabase.rpc('admin_add_blocked_term', { p_term: term, p_match: match }));
}

export async function adminRemoveBlockedTerm(termKey: string): Promise<void> {
  await run(() => supabase.rpc('admin_remove_blocked_term', { p_term_key: termKey }));
}

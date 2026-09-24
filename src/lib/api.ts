/**
 * Typed wrappers around every Supabase call the player and host apps make:
 * RPCs (`DATA_MODEL.md` §6), state-row reads, the score insert and the
 * leaderboard view queries (`DATA_MODEL.md` §7, `SCORING.md` §5).
 *
 * Every function either resolves with data or throws an `ApiError` whose
 * `mapped` field is the `mapDbError` result, so screens never branch on raw
 * SQLSTATEs or message strings.
 */
import type { Database, Json } from './database.types';
import { supabase } from './supabase';
import { mapDbError, type DbErrorLike, type MappedError } from './errors';
import { BOARD_TOP_N } from '../config';
import type { BoardRow } from './boards';

type Tables = Database['public']['Tables'];
export type GameId = Database['public']['Enums']['game_id'];
export type SessionRow = Tables['sessions']['Row'];
export type RoundRow = Tables['rounds']['Row'];
export type PlayerRow = Tables['players']['Row'];
export type RoundEndReason = Database['public']['Enums']['round_end_reason'];

export class ApiError extends Error {
  readonly mapped: MappedError;
  readonly code: string | undefined;
  /** `too_many_tries` only: whole seconds until `join_session` accepts a code again (ADR-130). */
  readonly retryAfterS: number | undefined;

  constructor(mapped: MappedError, code?: string, message?: string, retryAfterS?: number) {
    super(message ?? mapped.kind);
    this.name = 'ApiError';
    this.mapped = mapped;
    this.code = code;
    this.retryAfterS = retryAfterS;
  }
}

interface ErrorWithStatus extends DbErrorLike {
  status?: number;
  name?: string;
}

/**
 * Normalises any failure (PostgREST error, auth error, thrown fetch error)
 * into an ApiError. A 5xx from the gateway means the project is waking up or
 * down (E18) and maps to `join.error_warming`.
 */
export function toApiError(err: unknown, status?: number): ApiError {
  if (err instanceof ApiError) return err;
  const e = (err ?? {}) as ErrorWithStatus;
  const httpStatus = status ?? e.status;
  const code = typeof e.code === 'string' && e.code !== '' ? e.code : undefined;
  const message = typeof e.message === 'string' ? e.message : String(err);

  if (!code?.startsWith('GD') && code !== '23505') {
    if (httpStatus === 429 || e.code === 'over_request_rate_limit') {
      return new ApiError(mapDbError({ code: '429', message }), '429', message);
    }
    if (typeof httpStatus === 'number' && httpStatus >= 500) {
      return new ApiError({ kind: 'network', copyKey: 'join.error_warming' }, code, message);
    }
    if (httpStatus === 0 || /failed to fetch|networkerror|load failed|network/i.test(message)) {
      return new ApiError(mapDbError({ code: 'network', message }), 'network', message);
    }
  }
  return new ApiError(mapDbError({ code, message, details: e.details }), code, message);
}

function check<T>(res: { data: T; error: unknown; status?: number }): T {
  if (res.error) throw toApiError(res.error, res.status);
  return res.data;
}

async function run<T>(fn: () => PromiseLike<{ data: T; error: unknown; status?: number }>): Promise<T> {
  try {
    return check(await fn());
  } catch (err) {
    throw toApiError(err);
  }
}

/** For calls that must return a value: a null result is an unknown error. */
function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new ApiError(mapDbError(null));
  return value;
}

// ---------------------------------------------------------------- auth

/** The signed-in user's id (auth.uid()), or null. Reads the persisted session only; never signs in. */
export async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

/**
 * Anonymous sign-in, only if this phone has no Supabase session yet
 * (ADR-007, ADR-102). Called on name submit, never on page load.
 */
export async function ensureAnonymousSession(): Promise<string> {
  const existing = await currentUserId();
  if (existing) return existing;
  try {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) throw toApiError(error, error.status);
    if (!data.user) throw new ApiError(mapDbError(null));
    return data.user.id;
  } catch (err) {
    throw toApiError(err);
  }
}

export interface JoinPayload {
  session_id: string;
  player_row_id: string;
  name: string;
  display_suffix: number | null;
  session_status: SessionRow['status'];
}

/**
 * `join_session`'s refusals that come back as data instead of a raise, so the
 * wrong-code log commits (ADR-130, `DATA_MODEL.md` §6): `GD001` wrong code,
 * `GD013` too many wrong codes (with the seconds left).
 */
interface JoinRefusal {
  error: string;
  retry_after_s?: number;
}

function isJoinRefusal(data: unknown): data is JoinRefusal {
  return typeof data === 'object' && data !== null && typeof (data as { error?: unknown }).error === 'string';
}

/**
 * Signs in anonymously if needed, then `join_session(code, name)`. A wrong
 * code or the wrong-code lock throws an ApiError like any raised error;
 * for the lock (`too_many_tries`) `retryAfterS` holds the seconds left.
 */
export async function joinSession(code: string, name: string): Promise<JoinPayload> {
  await ensureAnonymousSession();
  const data: unknown = await run(() => supabase.rpc('join_session', { p_code: code, p_name: name }));
  if (isJoinRefusal(data)) {
    const retry = data.retry_after_s;
    const retryAfterS = typeof retry === 'number' && Number.isFinite(retry) ? Math.max(1, Math.ceil(retry)) : undefined;
    throw new ApiError(mapDbError({ code: data.error, message: data.error }), data.error, data.error, retryAfterS);
  }
  return required(data as JoinPayload | null);
}

// ---------------------------------------------------------------- state rows

export async function fetchSession(sessionId: string): Promise<SessionRow | null> {
  return run(() => supabase.from('sessions').select('*').eq('id', sessionId).maybeSingle());
}

export async function fetchRounds(sessionId: string): Promise<RoundRow[]> {
  return (await run(() => supabase.from('rounds').select('*').eq('session_id', sessionId).order('round_no'))) ?? [];
}

export async function fetchPlayer(playerRowId: string): Promise<PlayerRow | null> {
  return run(() => supabase.from('players').select('*').eq('id', playerRowId).maybeSingle());
}

/** Every player row of a session (removed ones too), in join order. Small: one row per guest. */
export async function fetchPlayers(sessionId: string): Promise<PlayerRow[]> {
  return (await run(() => supabase.from('players').select('*').eq('session_id', sessionId).order('joined_at'))) ?? [];
}

/** Phone: mark own row as playing round n when its round starts (SESSION_LIFECYCLE §5). */
export async function setProgressPlaying(playerRowId: string, roundNo: number): Promise<void> {
  await run(() =>
    supabase.from('players').update({ progress: 'playing', progress_round: roundNo }).eq('id', playerRowId),
  );
}

export interface ScoreInsert {
  roundId: string;
  playerId: string;
  score: number;
  durationMs: number;
  raw: unknown;
}

/**
 * Inserts the phone's score. Trusted columns are filled by the trigger, so
 * only the client columns are sent. A 23505 surfaces as `already_saved`
 * (the caller treats it as success, E14).
 */
export async function insertScore(p: ScoreInsert): Promise<void> {
  const row = {
    round_id: p.roundId,
    player_id: p.playerId,
    score: p.score,
    duration_ms: p.durationMs,
    raw: p.raw as Json,
    client_version: (import.meta.env.VITE_APP_VERSION || 'dev').slice(0, 40),
  } as unknown as Tables['scores']['Insert'];
  await run(() => supabase.from('scores').insert(row));
}

// ---------------------------------------------------------------- admin

export async function serverNow(): Promise<string> {
  return required(await run(() => supabase.rpc('server_now')));
}

export async function adminOpenLobby(lineup: GameId[]): Promise<SessionRow> {
  return required(await run(() => supabase.rpc('admin_open_lobby', { p_lineup: lineup })));
}

export async function adminSetLineup(sessionId: string, lineup: GameId[]): Promise<void> {
  await run(() => supabase.rpc('admin_set_lineup', { p_session: sessionId, p_lineup: lineup }));
}

export async function adminRemovePlayer(playerRowId: string): Promise<void> {
  await run(() => supabase.rpc('admin_remove_player', { p_player_row: playerRowId }));
}

export interface StartSessionResult {
  round_id: string;
  pending_session_id: string;
  pending_code: string;
}

export async function adminStartSession(sessionId: string): Promise<StartSessionResult> {
  const data = await run(() => supabase.rpc('admin_start_session', { p_session: sessionId }));
  return data as unknown as StartSessionResult;
}

export async function adminEndRound(roundId: string, reason: RoundEndReason): Promise<void> {
  await run(() => supabase.rpc('admin_end_round', { p_round: roundId, p_reason: reason }));
}

export async function adminNewSession(): Promise<SessionRow> {
  return required(await run(() => supabase.rpc('admin_new_session')));
}

/** Host: the running session (`playing`/`results`), if any. At most one exists (unique index). */
export async function fetchRunningSession(): Promise<SessionRow | null> {
  return run(() =>
    supabase.from('sessions').select('*').in('status', ['playing', 'results']).limit(1).maybeSingle(),
  );
}

/** Host: number of score rows for a round (hidden names included: it drives all-finished detection). */
export async function countRoundScores(roundId: string): Promise<number> {
  try {
    const res = await supabase.from('scores').select('id', { count: 'exact', head: true }).eq('round_id', roundId);
    if (res.error) throw toApiError(res.error, res.status);
    return res.count ?? 0;
  } catch (err) {
    throw toApiError(err);
  }
}

// ---------------------------------------------------------------- boards

export interface BoardPage {
  /** Top rows in board order (at most BOARD_TOP_N). */
  top: BoardRow[];
  /** The caller's own row with its rank, when it is not in `top` (null if absent or already in top). */
  own: { row: BoardRow; rank: number } | null;
  /** Number of rows on the whole board. */
  total: number;
}

/** PostgREST `or` values containing reserved characters must be double-quoted. */
function q(value: string | number): string {
  return `"${String(value).replace(/"/g, '\\"')}"`;
}

/**
 * Round board: `score desc, created_at asc` (SCORING §5). Top 10, plus the
 * caller's own row (and its rank) if it is lower.
 */
export async function fetchRoundBoard(roundId: string, ownPlayerRowId?: string | null): Promise<BoardPage> {
  try {
    const topRes = await supabase
      .from('v_round_board')
      .select('player_row_id, name, display_suffix, score, created_at', { count: 'exact' })
      .eq('round_id', roundId)
      .order('score', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(BOARD_TOP_N);
    if (topRes.error) throw toApiError(topRes.error, topRes.status);
    const top: BoardRow[] = (topRes.data ?? []).map((r) => ({
      playerRowId: r.player_row_id ?? '',
      name: r.name ?? '',
      displaySuffix: r.display_suffix,
      value: r.score ?? 0,
    }));
    const total = topRes.count ?? top.length;
    let own: BoardPage['own'] = null;
    if (ownPlayerRowId && !top.some((r) => r.playerRowId === ownPlayerRowId)) {
      const ownRes = await supabase
        .from('v_round_board')
        .select('player_row_id, name, display_suffix, score, created_at')
        .eq('round_id', roundId)
        .eq('player_row_id', ownPlayerRowId)
        .maybeSingle();
      if (ownRes.error) throw toApiError(ownRes.error, ownRes.status);
      if (ownRes.data && ownRes.data.score !== null && ownRes.data.created_at) {
        const s = ownRes.data.score;
        const c = ownRes.data.created_at;
        const aheadRes = await supabase
          .from('v_round_board')
          .select('player_row_id', { count: 'exact', head: true })
          .eq('round_id', roundId)
          .or(`score.gt.${s},and(score.eq.${s},created_at.lt.${q(c)})`);
        if (aheadRes.error) throw toApiError(aheadRes.error, aheadRes.status);
        own = {
          row: {
            playerRowId: ownPlayerRowId,
            name: ownRes.data.name ?? '',
            displaySuffix: ownRes.data.display_suffix,
            value: s,
          },
          rank: (aheadRes.count ?? 0) + 1,
        };
      }
    }
    return { top, own, total };
  } catch (err) {
    throw toApiError(err);
  }
}

/**
 * Session board: `total desc, total_duration_ms asc, joined_at asc`
 * (SCORING §5). Top 10, plus the caller's own row (and rank) if lower.
 */
export async function fetchSessionBoard(sessionId: string, ownPlayerRowId?: string | null): Promise<BoardPage> {
  try {
    const cols = 'player_row_id, name, display_suffix, total, total_duration_ms, joined_at';
    const topRes = await supabase
      .from('v_session_board')
      .select(cols, { count: 'exact' })
      .eq('session_id', sessionId)
      .order('total', { ascending: false })
      .order('total_duration_ms', { ascending: true })
      .order('joined_at', { ascending: true })
      .limit(BOARD_TOP_N);
    if (topRes.error) throw toApiError(topRes.error, topRes.status);
    const top: BoardRow[] = (topRes.data ?? []).map((r) => ({
      playerRowId: r.player_row_id ?? '',
      name: r.name ?? '',
      displaySuffix: r.display_suffix,
      value: r.total ?? 0,
    }));
    const total = topRes.count ?? top.length;
    let own: BoardPage['own'] = null;
    if (ownPlayerRowId && !top.some((r) => r.playerRowId === ownPlayerRowId)) {
      const ownRes = await supabase
        .from('v_session_board')
        .select(cols)
        .eq('session_id', sessionId)
        .eq('player_row_id', ownPlayerRowId)
        .maybeSingle();
      if (ownRes.error) throw toApiError(ownRes.error, ownRes.status);
      const o = ownRes.data;
      if (o && o.total !== null && o.total_duration_ms !== null && o.joined_at) {
        const aheadRes = await supabase
          .from('v_session_board')
          .select('player_row_id', { count: 'exact', head: true })
          .eq('session_id', sessionId)
          .or(
            `total.gt.${o.total},` +
              `and(total.eq.${o.total},total_duration_ms.lt.${o.total_duration_ms}),` +
              `and(total.eq.${o.total},total_duration_ms.eq.${o.total_duration_ms},joined_at.lt.${q(o.joined_at)})`,
          );
        if (aheadRes.error) throw toApiError(aheadRes.error, aheadRes.status);
        own = {
          row: { playerRowId: ownPlayerRowId, name: o.name ?? '', displaySuffix: o.display_suffix, value: o.total },
          rank: (aheadRes.count ?? 0) + 1,
        };
      }
    }
    return { top, own, total };
  } catch (err) {
    throw toApiError(err);
  }
}

/** Host: the joinable session (`pending`/`lobby`), if any. At most one exists (unique index). */
export async function fetchJoinableSession(): Promise<SessionRow | null> {
  return run(() =>
    supabase.from('sessions').select('*').in('status', ['pending', 'lobby']).limit(1).maybeSingle(),
  );
}

export interface RoundScoreRow {
  playerRowId: string;
  game: GameId;
  score: number;
}

/** Host results: every visible round score of a session (≤ players × rounds rows), for the breakdown. */
export async function fetchSessionRoundScores(sessionId: string): Promise<RoundScoreRow[]> {
  const rows = await run(() =>
    supabase.from('v_round_board').select('player_row_id, game, score').eq('session_id', sessionId),
  );
  return (rows ?? [])
    .filter((r) => r.player_row_id && r.game && r.score !== null)
    .map((r) => ({ playerRowId: r.player_row_id as string, game: r.game as GameId, score: r.score as number }));
}

// ---------------------------------------------------------------- Phase 2: rounds, day boards, hidden names

export type EventDayRow = Tables['event_days']['Row'];

export async function adminStartRound(roundId: string): Promise<void> {
  await run(() => supabase.rpc('admin_start_round', { p_round: roundId }));
}

export async function adminShowDayBoard(sessionId: string): Promise<void> {
  await run(() => supabase.rpc('admin_show_day_board', { p_session: sessionId }));
}

/** The event day a session belongs to (phones: is it still current? E25). Any signed-in user can read days. */
export async function fetchEventDay(eventDayId: string): Promise<EventDayRow | null> {
  return run(() => supabase.from('event_days').select('*').eq('id', eventDayId).maybeSingle());
}

/** Hidden name keys (tiny table; readable by any signed-in user). Phones poll it on the day board (AC2.9). */
export async function fetchHiddenKeys(): Promise<Set<string>> {
  const rows = await run(() => supabase.from('hidden_names').select('name_key'));
  return new Set((rows ?? []).map((r) => r.name_key));
}

export interface DayBoardRow {
  nameKey: string;
  /** Name without the display suffix (SCORING §6 rule 5). */
  name: string;
  score: number;
  achievedAt: string;
}

export interface DayBoardPage {
  top: DayBoardRow[];
  /** The caller's best (by name key) with its rank, when it is not in `top`. */
  own: { row: DayBoardRow; rank: number } | null;
  total: number;
}

function toDayRow(r: { name_key: string | null; name: string | null; score: number | null; achieved_at: string | null }): DayBoardRow {
  return { nameKey: r.name_key ?? '', name: r.name ?? '', score: r.score ?? 0, achievedAt: r.achieved_at ?? '' };
}

/**
 * Day board for one game: best per name key today (`v_day_board`), ordered
 * `score desc, achieved_at asc` (SCORING §5). Top 10, plus the caller's own
 * row (matched by name key) and its rank if lower.
 */
export async function fetchDayBoard(eventDayId: string, game: GameId, ownNameKey?: string | null): Promise<DayBoardPage> {
  try {
    const cols = 'name_key, name, score, achieved_at';
    const topRes = await supabase
      .from('v_day_board')
      .select(cols, { count: 'exact' })
      .eq('event_day_id', eventDayId)
      .eq('game', game)
      .order('score', { ascending: false })
      .order('achieved_at', { ascending: true })
      .limit(BOARD_TOP_N);
    if (topRes.error) throw toApiError(topRes.error, topRes.status);
    const top = (topRes.data ?? []).map(toDayRow);
    let own: DayBoardPage['own'] = null;
    if (ownNameKey && !top.some((r) => r.nameKey === ownNameKey)) {
      const ownRes = await supabase
        .from('v_day_board')
        .select(cols)
        .eq('event_day_id', eventDayId)
        .eq('game', game)
        .eq('name_key', ownNameKey)
        .maybeSingle();
      if (ownRes.error) throw toApiError(ownRes.error, ownRes.status);
      if (ownRes.data && ownRes.data.score !== null && ownRes.data.achieved_at) {
        const row = toDayRow(ownRes.data);
        const aheadRes = await supabase
          .from('v_day_board')
          .select('name_key', { count: 'exact', head: true })
          .eq('event_day_id', eventDayId)
          .eq('game', game)
          .or(`score.gt.${row.score},and(score.eq.${row.score},achieved_at.lt.${q(row.achievedAt)})`);
        if (aheadRes.error) throw toApiError(aheadRes.error, aheadRes.status);
        own = { row, rank: (aheadRes.count ?? 0) + 1 };
      }
    }
    return { top, own, total: topRes.count ?? top.length };
  } catch (err) {
    throw toApiError(err);
  }
}

export interface OwnScore {
  roundId: string;
  game: GameId;
  score: number;
}

/**
 * The phone's own score rows in a session, read from `scores` (today's rows
 * are readable by any signed-in user), so a hidden player still sees their
 * own total (ADR-115).
 */
export async function fetchOwnScores(sessionId: string, playerRowId: string): Promise<OwnScore[]> {
  const rows = await run(() =>
    supabase.from('scores').select('round_id, game, score').eq('session_id', sessionId).eq('player_row_id', playerRowId),
  );
  return (rows ?? []).map((r) => ({ roundId: r.round_id, game: r.game, score: r.score }));
}

/**
 * The best earlier score today for a name key in a game, excluding one round
 * (P7 `new_best`: did this round beat the player's day best?). Null if none.
 */
export async function fetchPreviousBest(
  eventDayId: string,
  game: GameId,
  nameKey: string,
  excludeRoundId: string,
): Promise<number | null> {
  const rows = await run(() =>
    supabase
      .from('scores')
      .select('score')
      .eq('event_day_id', eventDayId)
      .eq('game', game)
      .eq('name_key', nameKey)
      .neq('round_id', excludeRoundId)
      .order('score', { ascending: false })
      .limit(1),
  );
  return rows && rows.length > 0 ? rows[0].score : null;
}

export interface RevealRow {
  playerRowId: string;
  name: string;
  displaySuffix: number | null;
  score: number;
  raw: unknown;
}

/**
 * Host: every visible score of a round with its raw evidence, in round-board
 * order (the Stop the Clock guess reveal). Visibility comes from
 * `v_round_board` (hidden names excluded); `raw` from `scores` (admin read).
 */
export async function fetchRoundReveal(roundId: string): Promise<RevealRow[]> {
  const [board, raws] = await Promise.all([
    run(() =>
      supabase
        .from('v_round_board')
        .select('player_row_id, name, display_suffix, score, created_at')
        .eq('round_id', roundId)
        .order('score', { ascending: false })
        .order('created_at', { ascending: true }),
    ),
    run(() => supabase.from('scores').select('player_row_id, raw').eq('round_id', roundId)),
  ]);
  const rawBy = new Map((raws ?? []).map((r) => [r.player_row_id, r.raw as unknown]));
  return (board ?? [])
    .filter((r) => r.player_row_id && rawBy.has(r.player_row_id))
    .map((r) => ({
      playerRowId: r.player_row_id as string,
      name: r.name ?? '',
      displaySuffix: r.display_suffix,
      score: r.score ?? 0,
      raw: rawBy.get(r.player_row_id as string),
    }));
}

export interface SessionScoreRow {
  playerRowId: string;
  game: GameId;
  score: number;
  createdAt: string;
  name: string;
}

/** Host H5: this session's visible scores (to highlight day-board rows that came from this session). */
export async function fetchSessionScores(sessionId: string): Promise<SessionScoreRow[]> {
  const rows = await run(() =>
    supabase.from('v_round_board').select('player_row_id, game, score, created_at, name').eq('session_id', sessionId),
  );
  return (rows ?? [])
    .filter((r) => r.player_row_id && r.game && r.score !== null && r.created_at)
    .map((r) => ({
      playerRowId: r.player_row_id as string,
      game: r.game as GameId,
      score: r.score as number,
      createdAt: r.created_at as string,
      name: r.name ?? '',
    }));
}

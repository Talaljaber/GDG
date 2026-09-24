// SimPhone: a headless client that behaves like a real guest phone (docs/SESSION_LIFECYCLE.md §3-5,
// docs/DATA_MODEL.md §5-§8, docs/games/stop-the-clock.md §5), for the load test in docs/TESTING.md §5.
//
// Each phone owns its own supabase-js client with an isolated in-memory storage adapter (so N phones
// in one Node process behave like N separate browser tabs, never sharing a session).

import { createClient, type SupabaseClient, type RealtimeChannel } from "@supabase/supabase-js";
import { scoreStopTheClock } from "../../src/games/stop-the-clock/scoring.ts";

// ---------- isolated per-phone storage (stands in for a browser's localStorage) ----------
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
}

export type ErrorTally = Record<string, number>;

export interface PhoneMetrics {
  index: number;
  joinOk: boolean;
  joinLatencyMs: number | null;
  joinError: string | null;
  roundStartLatencyMs: number | null; // client receipt of "round playing" - server started_at
  submitLatencyMs: number | null; // rpc/insert round-trip for the score insert
  submitOk: boolean;
  submitAttempts: number;
  duplicateInsertsIgnored: number; // 23505 treated as success
  errorsByCode: ErrorTally;
  realtimeErrorsByType: ErrorTally;
  reconnects: number;
  presenceRecoveredAfterDropMs: number | null;
  boardPolls: number;
  boardPollErrors: number;
  score: number | null;
  /** Date.now() when this phone's initial presence `track()` resolved (for join-burst msg/s). */
  presenceTrackedAt: number | null;
  /** Date.now() when this phone received the round-start Postgres Changes event (for fan-out msg/s). */
  roundStartReceivedAt: number | null;
  /** Date.now() when this phone's presence re-`track()` resolved after simulateDisconnect (L5). */
  presenceRetrackedAt: number | null;
}

export interface SimPhoneOptions {
  url: string;
  publishableKey: string;
  index: number;
  name: string;
  code: string;
  delayMinMs: number;
  delayMaxMs: number;
  /** how long to keep polling boards after submitting, ms */
  boardPollWindowMs?: number;
  boardPollIntervalMs?: number;
  log?: (msg: string) => void;
}

interface RoundRow {
  id: string;
  session_id: string;
  round_no: number;
  game: string;
  status: string;
  started_at: string | null;
  ended_at: string | null;
}

/** A plausible-but-not-superhuman Stop the Clock raw payload (docs/games/stop-the-clock.md §5, §4). */
function buildStopTheClockRaw(rng: () => number) {
  const targets = [5000, 10000, 7000];
  const attempts = targets.map((target_ms) => {
    // Human-plausible error: 80-2500ms off target, occasionally larger. Never a "bot-perfect" 0 error
    // (would be rejected by score <= 990) and never triggers stc.range (measured within [0, target+10000]).
    const errorMs = Math.round(80 + rng() * 2400);
    const sign = rng() < 0.5 ? -1 : 1;
    const measured_ms = Math.max(0, Math.min(target_ms + 10000, target_ms + sign * errorMs));
    return { target_ms, measured_ms, missed_start: false };
  });
  const score = Math.min(990, scoreStopTheClock({ attempts }));
  // duration_ms: sum of measured attempt times + the two 1.5s "locked in" transitions (docs/games/stop-the-clock.md §2)
  const duration_ms = Math.min(
    120000,
    attempts.reduce((s, a) => s + a.measured_ms, 0) + 3000,
  );
  return { raw: { attempts }, score, duration_ms };
}

function mulberry32(seed: number) {
  let a = seed;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class SimPhone {
  readonly index: number;
  private opts: SimPhoneOptions;
  private client: SupabaseClient;
  private rng: () => number;
  private log: (msg: string) => void;

  private sessionId: string | null = null;
  private playerRowId: string | null = null;
  private playerId: string | null = null;

  private sessionChannel: RealtimeChannel | null = null;
  private presenceChannel: RealtimeChannel | null = null;

  private roundPlayingResolvers: Array<(row: RoundRow) => void> = [];
  private latestRound: RoundRow | null = null;
  private roundDoneResolvers: Array<(row: RoundRow) => void> = [];

  metrics: PhoneMetrics;

  constructor(opts: SimPhoneOptions) {
    this.index = opts.index;
    this.opts = opts;
    this.log = opts.log ?? (() => {});
    this.rng = mulberry32(0x9e3779b9 ^ opts.index);
    this.client = createClient(opts.url, opts.publishableKey, {
      auth: {
        storage: new MemoryStorage() as unknown as Storage,
        persistSession: false,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
    this.metrics = {
      index: opts.index,
      joinOk: false,
      joinLatencyMs: null,
      joinError: null,
      roundStartLatencyMs: null,
      submitLatencyMs: null,
      submitOk: false,
      submitAttempts: 0,
      duplicateInsertsIgnored: 0,
      errorsByCode: {},
      realtimeErrorsByType: {},
      reconnects: 0,
      presenceRecoveredAfterDropMs: null,
      boardPolls: 0,
      boardPollErrors: 0,
      score: null,
      presenceTrackedAt: null,
      roundStartReceivedAt: null,
      presenceRetrackedAt: null,
    };
  }

  private bumpError(bucket: ErrorTally, key: string) {
    bucket[key] = (bucket[key] ?? 0) + 1;
  }

  /** anonymous sign-in, matching "nothing written until join" (join happens separately). */
  async signIn(): Promise<void> {
    const { data, error } = await this.client.auth.signInAnonymously();
    if (error) throw new Error(`signInAnonymously failed: ${error.message}`);
    this.playerId = data.user?.id ?? null;
  }

  /**
   * join_session(code, name) RPC, per docs/DATA_MODEL.md §6. Since ADR-130 (join throttle, migration
   * 20260925000400) a wrong/locked code is not a raised error: the call still succeeds and returns
   * `{error: "GD001"}` (wrong/unknown code) or `{error: "GD013", retry_after_s}` (identity locked out
   * after 5 wrong codes in 60s) as ordinary data, so it must be checked explicitly. The load test
   * always uses a real, freshly-opened code, so this path isn't expected to fire — but a phone must
   * still treat it as a failed join (never as success, and never retried in a tight loop: it's logged
   * and thrown like any other join failure, one attempt per phone).
   */
  async join(): Promise<void> {
    const t0 = performance.now();
    const { data, error } = await this.client.rpc("join_session", {
      p_code: this.opts.code,
      p_name: this.opts.name,
    });
    const latency = performance.now() - t0;
    if (error) {
      this.metrics.joinOk = false;
      this.metrics.joinError = `${error.code ?? "?"}:${error.message}`;
      this.bumpError(this.metrics.errorsByCode, error.code ?? "unknown");
      throw new Error(`join_session failed for phone ${this.index}: ${error.message}`);
    }
    const row = data as {
      session_id?: string;
      player_row_id?: string;
      error?: string;
      retry_after_s?: number;
    };
    if (row?.error) {
      this.metrics.joinOk = false;
      this.metrics.joinError = row.retry_after_s ? `${row.error}:retry_after_s=${row.retry_after_s}` : row.error;
      this.bumpError(this.metrics.errorsByCode, row.error);
      throw new Error(
        `join_session for phone ${this.index} returned ${row.error}` +
          (row.retry_after_s ? ` (retry_after_s=${row.retry_after_s})` : ""),
      );
    }
    this.metrics.joinOk = true;
    this.metrics.joinLatencyMs = latency;
    this.sessionId = row.session_id!;
    this.playerRowId = row.player_row_id!;
  }

  /**
   * Subscribe like a real phone (docs/DATA_MODEL.md §8): `session:<id>` channel with Postgres Changes on
   * sessions UPDATE id=eq, rounds * session_id=eq, own players row; presence track on `presence:<id>`.
   */
  async subscribe(): Promise<void> {
    if (!this.sessionId || !this.playerRowId || !this.playerId) {
      throw new Error("subscribe() called before join()");
    }
    const sid = this.sessionId;

    await new Promise<void>((resolveSub, rejectSub) => {
      const channel = this.client
        .channel(`session:${sid}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "sessions", filter: `id=eq.${sid}` },
          () => {
            /* session status changes observed but not required by the metrics we track */
          },
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "rounds", filter: `session_id=eq.${sid}` },
          (payload) => {
            const row = payload.new as RoundRow;
            this.latestRound = row;
            if (row.status === "playing") {
              this.metrics.roundStartReceivedAt = Date.now();
              const resolvers = this.roundPlayingResolvers.splice(0);
              resolvers.forEach((r) => r(row));
            } else if (row.status === "done") {
              const resolvers = this.roundDoneResolvers.splice(0);
              resolvers.forEach((r) => r(row));
            }
          },
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "players",
            filter: `id=eq.${this.playerRowId}`,
          },
          () => {
            /* e.g. removed_at; not exercised by the load test */
          },
        )
        .subscribe((status, err) => {
          if (status === "SUBSCRIBED") {
            resolveSub();
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            const type = err?.message?.match(/too_many_\w+|tenant_events/)?.[0] ?? status;
            this.bumpError(this.metrics.realtimeErrorsByType, type);
            this.log(`phone ${this.index}: session channel ${status} ${err?.message ?? ""}`);
            rejectSub(new Error(`session channel ${status}: ${err?.message ?? ""}`));
          }
        });
      this.sessionChannel = channel;
    });

    await this.trackPresence();
  }

  private async trackPresence(): Promise<void> {
    if (!this.sessionId || !this.playerId) return;
    const sid = this.sessionId;
    await new Promise<void>((resolvePresence, rejectPresence) => {
      const channel = this.client.channel(`presence:${sid}`, {
        config: { presence: { key: this.playerId! } },
      });
      channel.subscribe(async (status, err) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ player_id: this.playerId });
          if (this.metrics.presenceTrackedAt === null) {
            this.metrics.presenceTrackedAt = Date.now();
          } else {
            this.metrics.presenceRetrackedAt = Date.now();
          }
          resolvePresence();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          const type = err?.message?.match(/too_many_\w+|tenant_events/)?.[0] ?? status;
          this.bumpError(this.metrics.realtimeErrorsByType, type);
          rejectPresence(new Error(`presence channel ${status}: ${err?.message ?? ""}`));
        }
      });
      this.presenceChannel = channel;
    });
  }

  /** Waits for a `rounds` row to become 'playing' (round_no 1, single-round lobby in this test). */
  waitForRoundPlaying(timeoutMs = 60000): Promise<RoundRow> {
    if (this.latestRound?.status === "playing") return Promise.resolve(this.latestRound);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timed out waiting for round to start")), timeoutMs);
      this.roundPlayingResolvers.push((row) => {
        clearTimeout(timer);
        resolve(row);
      });
    });
  }

  waitForRoundDone(timeoutMs = 130000): Promise<RoundRow> {
    if (this.latestRound?.status === "done") return Promise.resolve(this.latestRound);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timed out waiting for round to end")), timeoutMs);
      this.roundDoneResolvers.push((row) => {
        clearTimeout(timer);
        resolve(row);
      });
    });
  }

  /**
   * Full round flow: wait for round start, record start latency, mark progress='playing', wait a random
   * delay, submit a plausible score, poll boards for a while. Mirrors docs/SESSION_LIFECYCLE.md §5.
   */
  async playRound(): Promise<void> {
    const clientReceiptEpoch = { t: 0 };
    const round = await this.waitForRoundPlaying().then((r) => {
      clientReceiptEpoch.t = Date.now();
      return r;
    });
    if (round.started_at) {
      this.metrics.roundStartLatencyMs = clientReceiptEpoch.t - Date.parse(round.started_at);
    }

    // "on round start: update own progress"
    await this.client
      .from("players")
      .update({ progress: "playing", progress_round: round.round_no })
      .eq("id", this.playerRowId!);

    const span = Math.max(0, this.opts.delayMaxMs - this.opts.delayMinMs);
    const delayMs = this.opts.delayMinMs + this.rng() * span;
    await sleep(delayMs);

    const { raw, score, duration_ms } = buildStopTheClockRaw(this.rng);
    this.metrics.score = score;
    await this.submitScore(round.id, raw, score, duration_ms);

    await this.pollBoards(round.id, this.opts.boardPollWindowMs ?? 9000, this.opts.boardPollIntervalMs ?? 3000);
  }

  private async submitScore(roundId: string, raw: unknown, score: number, duration_ms: number): Promise<void> {
    this.metrics.submitAttempts += 1;
    const t0 = performance.now();
    const { error } = await this.client.from("scores").insert({
      round_id: roundId,
      player_id: this.playerId,
      score,
      duration_ms,
      raw,
      client_version: "loadtest-1.0",
    });
    const latency = performance.now() - t0;
    this.metrics.submitLatencyMs = latency;
    if (!error) {
      this.metrics.submitOk = true;
      return;
    }
    if (error.code === "23505") {
      // "already saved" - client treats as success (docs/DATA_MODEL.md §5)
      this.metrics.submitOk = true;
      this.metrics.duplicateInsertsIgnored += 1;
      return;
    }
    this.metrics.submitOk = false;
    this.bumpError(this.metrics.errorsByCode, error.code ?? "unknown");
    this.log(
      `phone ${this.index}: score insert failed ${error.code} ${error.message} (detail=${error.details ?? "n/a"}, hint=${error.hint ?? "n/a"})`,
    );
  }

  /** Poll v_round_board / v_session_board every N ms while "on a board" (docs/DATA_MODEL.md §8). */
  private async pollBoards(roundId: string, windowMs: number, intervalMs: number): Promise<void> {
    const deadline = Date.now() + windowMs;
    while (Date.now() < deadline) {
      this.metrics.boardPolls += 1;
      const [roundBoard, sessionBoard] = await Promise.all([
        this.client.from("v_round_board").select("*").eq("round_id", roundId).order("score", { ascending: false }).limit(10),
        this.client.from("v_session_board").select("*").eq("session_id", this.sessionId!).order("total", { ascending: false }).limit(10),
      ]);
      if (roundBoard.error || sessionBoard.error) {
        this.metrics.boardPollErrors += 1;
      }
      await sleep(intervalMs);
    }
  }

  /**
   * L5: drop the socket for `ms` then reconnect (remove all channels, wait, resubscribe + retrack).
   * Verifies presence recovers by tracking again and measuring the round trip.
   */
  async simulateDisconnect(ms: number): Promise<void> {
    this.metrics.reconnects += 1;
    await this.client.removeAllChannels();
    await sleep(ms);
    const t0 = performance.now();
    try {
      await this.subscribe();
      this.metrics.presenceRecoveredAfterDropMs = performance.now() - t0;
    } catch (err) {
      this.log(`phone ${this.index}: reconnect failed: ${(err as Error).message}`);
    }
  }

  async close(): Promise<void> {
    try {
      for (const ch of [this.sessionChannel, this.presenceChannel]) {
        if (ch) await this.client.removeChannel(ch);
      }
      this.sessionChannel = null;
      this.presenceChannel = null;
      await this.client.removeAllChannels();
    } catch {
      /* best effort */
    }
  }

  getSessionId(): string | null {
    return this.sessionId;
  }
  getPlayerId(): string | null {
    return this.playerId;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// SimHost: an admin-driven "big screen" host for headless load test runs (docs/SESSION_LIFECYCLE.md §3.1,
// docs/DATA_MODEL.md §6, docs/TESTING.md §5). Signs in as the local admin, opens a lobby for exactly the
// `stop_the_clock` game (ROUNDS_PER_SESSION = 1 during Phases 1-2, docs/DATA_MODEL.md note under §3),
// waits for players, starts the session, watches scores arrive in real time, and ends the round.

import { createClient, type SupabaseClient, type RealtimeChannel } from "@supabase/supabase-js";

export interface HostEvent {
  at: number; // Date.now()
  label: string;
  detail?: Record<string, unknown>;
}

export interface ScoreArrival {
  playerRowId: string;
  insertReceivedAt: number; // Date.now() when the Postgres Changes event arrived
  boardVisibleAt: number | null; // Date.now() when a re-query of v_round_board first showed the row
}

export interface HostResult {
  sessionId: string;
  code: string;
  roundId: string;
  roundStartedAt: string; // server timestamptz
  events: HostEvent[];
  scoreArrivals: ScoreArrival[];
  endReason: "all_finished" | "time_cap" | "force_end";
}

const ROUND_DEADLINE_MS = 128_000; // started_at + 3s countdown + 120s cap + 5s grace (SESSION_LIFECYCLE §1)
const POLL_INTERVAL_MS = 500; // host loop tick (SESSION_LIFECYCLE §3.1)

export class SimHost {
  private client: SupabaseClient;
  private log: (msg: string) => void;
  events: HostEvent[] = [];
  scoreArrivals: ScoreArrival[] = [];

  private scoresChannel: RealtimeChannel | null = null;

  constructor(url: string, publishableKey: string, log?: (msg: string) => void) {
    this.client = createClient(url, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false },
    });
    this.log = log ?? (() => {});
  }

  private record(label: string, detail?: Record<string, unknown>) {
    const evt = { at: Date.now(), label, detail };
    this.events.push(evt);
    this.log(`host: ${label} ${detail ? JSON.stringify(detail) : ""}`);
  }

  async signIn(email: string, password: string): Promise<void> {
    const { error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) throw new Error(`admin sign-in failed: ${error.message}`);
    this.record("signed_in");
  }

  async openLobby(lineup: string[]): Promise<{ sessionId: string; code: string }> {
    const { data, error } = await this.client.rpc("admin_open_lobby", { p_lineup: lineup });
    if (error) throw new Error(`admin_open_lobby failed: ${error.message}`);
    const row = data as { id: string; code: string };
    this.record("lobby_opened", { sessionId: row.id, code: row.code });
    return { sessionId: row.id, code: row.code };
  }

  /**
   * Removes any already-joined players from a lobby before a scenario run starts (e.g. leftover bots
   * from a previous aborted load-test run), so the expected-finisher count for this run is exact.
   * Only valid while the session is 'lobby' (admin_remove_player's own state check).
   */
  async resetLobbyPlayers(sessionId: string): Promise<number> {
    const { data, error } = await this.client
      .from("players")
      .select("id")
      .eq("session_id", sessionId)
      .eq("status", "joined");
    if (error) throw new Error(`resetLobbyPlayers query failed: ${error.message}`);
    for (const row of data ?? []) {
      const { error: rmErr } = await this.client.rpc("admin_remove_player", { p_player_row: (row as { id: string }).id });
      if (rmErr) throw new Error(`admin_remove_player failed: ${rmErr.message}`);
    }
    const removed = data?.length ?? 0;
    if (removed > 0) this.record("lobby_reset", { removed });
    return removed;
  }

  /** Polls players table until >= n joined players or timeout. */
  async waitForPlayers(sessionId: string, n: number, timeoutMs = 60000): Promise<number> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const { count, error } = await this.client
        .from("players")
        .select("id", { count: "exact", head: true })
        .eq("session_id", sessionId)
        .eq("status", "joined");
      if (error) throw new Error(`waitForPlayers query failed: ${error.message}`);
      if ((count ?? 0) >= n) {
        this.record("players_ready", { count });
        return count ?? 0;
      }
      if (Date.now() > deadline) {
        this.record("players_wait_timeout", { count });
        return count ?? 0;
      }
      await sleep(300);
    }
  }

  async getRoundStartedAt(roundId: string): Promise<string> {
    const { data, error } = await this.client.from("rounds").select("started_at").eq("id", roundId).single();
    if (error || !data?.started_at) throw new Error(`could not read round.started_at: ${error?.message}`);
    return data.started_at;
  }

  async startSession(sessionId: string): Promise<{ roundId: string }> {
    const { data, error } = await this.client.rpc("admin_start_session", { p_session: sessionId });
    if (error) throw new Error(`admin_start_session failed: ${error.message}`);
    const row = data as { round_id: string; pending_session_id: string; pending_code: string };
    this.record("session_started", { roundId: row.round_id });
    return { roundId: row.round_id };
  }

  /** Subscribes to scores INSERT for this session and re-queries the round board on each event (debounced). */
  async watchScores(sessionId: string, roundId: string): Promise<void> {
    let debounceTimer: NodeJS.Timeout | null = null;
    await new Promise<void>((resolveSub, rejectSub) => {
      const channel = this.client
        .channel(`session:${sessionId}:host`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "scores", filter: `session_id=eq.${sessionId}` },
          (payload) => {
            const row = payload.new as { player_row_id: string };
            const arrival: ScoreArrival = {
              playerRowId: row.player_row_id,
              insertReceivedAt: Date.now(),
              boardVisibleAt: null,
            };
            this.scoreArrivals.push(arrival);
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => void this.refreshBoard(roundId), 500);
          },
        )
        .subscribe((status, err) => {
          if (status === "SUBSCRIBED") resolveSub();
          else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            rejectSub(new Error(`host scores channel ${status}: ${err?.message ?? ""}`));
          }
        });
      this.scoresChannel = channel;
    });
    this.record("watching_scores");
  }

  private async refreshBoard(roundId: string): Promise<void> {
    const { data, error } = await this.client.from("v_round_board").select("player_row_id").eq("round_id", roundId);
    if (error) return;
    const now = Date.now();
    const visibleIds = new Set((data ?? []).map((r) => (r as { player_row_id: string }).player_row_id));
    for (const arrival of this.scoreArrivals) {
      if (arrival.boardVisibleAt === null && visibleIds.has(arrival.playerRowId)) {
        arrival.boardVisibleAt = now;
      }
    }
  }

  /** Host loop (SESSION_LIFECYCLE §3.1 step 3): poll for all-finished, or the 128s deadline. */
  async runRoundUntilDone(
    roundId: string,
    roundStartedAt: string,
    expectedPlayers: number,
  ): Promise<"all_finished" | "time_cap"> {
    const startedAtMs = Date.parse(roundStartedAt);
    for (;;) {
      const { count, error } = await this.client
        .from("scores")
        .select("id", { count: "exact", head: true })
        .eq("round_id", roundId);
      if (error) throw new Error(`score count query failed: ${error.message}`);
      if ((count ?? 0) >= expectedPlayers) {
        this.record("all_finished_detected", { count });
        return "all_finished";
      }
      if (Date.now() - startedAtMs >= ROUND_DEADLINE_MS) {
        this.record("deadline_reached");
        return "time_cap";
      }
      await sleep(POLL_INTERVAL_MS);
    }
  }

  async endRound(roundId: string, reason: "all_finished" | "time_cap" | "force_end"): Promise<void> {
    const { error } = await this.client.rpc("admin_end_round", { p_round: roundId, p_reason: reason });
    if (error) throw new Error(`admin_end_round failed: ${error.message}`);
    this.record("round_ended", { reason });
  }

  async newSession(): Promise<void> {
    const { error } = await this.client.rpc("admin_new_session");
    if (error) throw new Error(`admin_new_session failed: ${error.message}`);
    this.record("new_session");
  }

  /**
   * Best-effort cleanup so back-to-back scenario runs start from a clean lobby: closes a leftover
   * 'results' session from a previous run (admin_new_session), ignoring GD010 ("nothing to close").
   * Never touches a session that is actually 'playing' (a real run in progress).
   */
  async tryNewSession(): Promise<void> {
    const { error } = await this.client.rpc("admin_new_session");
    if (error && error.code !== "GD010") {
      throw new Error(`admin_new_session (cleanup) failed: ${error.message}`);
    }
    if (!error) this.record("new_session_cleanup");
  }

  async close(): Promise<void> {
    try {
      if (this.scoresChannel) await this.client.removeChannel(this.scoresChannel);
      this.scoresChannel = null;
      await this.client.removeAllChannels();
    } catch {
      /* best effort */
    }
  }

  /** Full orchestration for one scenario run: open lobby -> wait for N -> start -> watch -> end. */
  async runScenario(
    lineup: string[],
    expectedPlayers: number,
    waitPlayersTimeoutMs: number,
  ): Promise<HostResult> {
    const { sessionId, code } = await this.openLobby(lineup);
    await this.waitForPlayers(sessionId, expectedPlayers, waitPlayersTimeoutMs);
    const { roundId } = await this.startSession(sessionId);
    const { data: roundRow, error } = await this.client.from("rounds").select("started_at").eq("id", roundId).single();
    if (error || !roundRow?.started_at) throw new Error(`could not read round.started_at: ${error?.message}`);
    await this.watchScores(sessionId, roundId);
    const reason = await this.runRoundUntilDone(roundId, roundRow.started_at, expectedPlayers);
    await this.endRound(roundId, reason);
    return {
      sessionId,
      code,
      roundId,
      roundStartedAt: roundRow.started_at,
      events: this.events,
      scoreArrivals: this.scoreArrivals,
      endReason: reason,
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

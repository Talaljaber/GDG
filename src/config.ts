/**
 * App-wide config constants.
 *
 * Source of truth: docs/SESSION_LIFECYCLE.md §1 (timing constants) and
 * docs/DECISIONS.md ADR-120 (round count for the vertical slice).
 */

/**
 * Number of distinct games per session (ADR-012). The data model supports N;
 * this is a single config constant. It was 1 during the Phase 1 slice and is 3
 * from Phase 3 on (three games pass their acceptance criteria), and never
 * changes after that (ADR-120). The database enforces exactly 3 distinct
 * games from migration 20260925000300.
 */
export const ROUNDS_PER_SESSION = 3;

/** Round start countdown (3-2-1), on phone and big screen. */
export const COUNTDOWN_MS = 3000;

/** Round cap: max round duration after the countdown ends, measured on each phone. */
export const ROUND_CAP_MS = 120_000;

/**
 * Host deadline grace period, added on top of countdown + round cap, before
 * the host client force-ends a round: started_at + COUNTDOWN_MS + ROUND_CAP_MS + HOST_GRACE_MS.
 */
export const HOST_GRACE_MS = 5000;

/** Late score acceptance window after rounds.ended_at. */
export const LATE_ACCEPT_MS = 15_000;

/** Intermission phase durations: round board -> session total -> "Next: <game>". */
export const INTERMISSION_ROUND_BOARD_MS = 7000;
export const INTERMISSION_SESSION_TOTAL_MS = 5000;
export const INTERMISSION_NEXT_GAME_MS = 3000;

/** Day-board tabs on the big screen (H5) auto-rotate every this many ms. */
export const DAYBOARD_ROTATE_MS = 8000;

/** Phones poll hidden names this often on the day board (P10), so a hidden name goes within 3 s (AC2.9). */
export const HIDDEN_POLL_MS = 3000;

/** Top rows labelled with names on the Stop the Clock guess reveal (games/stop-the-clock.md §6). */
export const STC_REVEAL_LABELLED = 5;

/** Reveal window around each target: dots further than this are pinned to the strip's edge. */
export const STC_REVEAL_WINDOW_MS = 5000;

/** Top rows labelled with names on the How Many? count reveal (games-v3 §5, ADR-136). */
export const HM_REVEAL_LABELLED = 5;

/** How Many? reveal window: ±50 % relative error around the true count; dots beyond are pinned. */
export const HM_REVEAL_WINDOW = 0.5;

/** The crowd-average marker fades in this long into the 7 s board step (after the 5 s of dots). */
export const HM_REVEAL_MEAN_MS = 5200;

/** Presence grey-out: time without presence before a player is shown greyed out. */
export const PRESENCE_GREY_MS = 10_000;

/** Score submit retry interval on the phone, up to the late-acceptance window. */
export const SUBMIT_RETRY_MS = 2000;

/** Board polling interval (round/session boards). */
export const BOARD_POLL_MS = 3000;

/** Day-board polling interval (big screen, lower frequency). */
export const DAY_BOARD_POLL_MS = 10_000;

/** Max rows shown on any leaderboard/board. */
export const BOARD_TOP_N = 10;

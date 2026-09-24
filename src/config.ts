/**
 * App-wide config constants.
 *
 * Source of truth: docs/SESSION_LIFECYCLE.md §1 (timing constants) and
 * docs/DECISIONS.md ADR-120 (round count for the vertical slice).
 */

/**
 * Number of distinct games per session. The data model supports N; this is a
 * single config constant. 1 during Phases 1-2 (only Stop the Clock exists),
 * becomes 3 the moment three games pass their acceptance criteria and never
 * changes after Phase 3 (ADR-120).
 */
export const ROUNDS_PER_SESSION = 1;

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

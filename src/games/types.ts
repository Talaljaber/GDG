/**
 * Game module contract. Source of truth: docs/ARCHITECTURE.md §7.
 *
 * Every game is a self-contained module under src/games/<game-id>/ and is
 * registered in src/games/registry.ts. The shell (player app) owns the round
 * lifecycle (3-2-1, the 120 s cap, submission); the game owns only its
 * screen and its maths.
 */

import type React from 'react';

/**
 * Every game id the database knows (`public.game_id`, ADR-134 added the last two).
 * The pool order used wherever all games are listed (dashboard filters, fixtures).
 */
export const GAME_IDS = [
  'odd_one_out',
  'stop_the_clock',
  'simon',
  'perfect_circle',
  'trivia',
  'close_brackets',
  'color_clash',
] as const;

export type GameId = (typeof GAME_IDS)[number];

/** What a game module hands back to the shell exactly once per round. */
export interface GameResult {
  /** Integer 0-1000, computed on the phone (docs/SCORING.md §1). */
  score: number;
  /** Per-game evidence object, matching the game doc's JSON Schema exactly. */
  raw: unknown;
  /** Date.now() at finish minus roundStartEpoch, capped at 120000. */
  durationMs: number;
}

export interface GameProps<S = unknown> {
  /** Per-round seed (reload-stable); feeds src/lib/rng.ts for any randomness. */
  seed: string;
  /** Date.now() at the end of the 3-2-1 countdown. */
  roundStartEpoch: number;
  /**
   * Becomes true when the round is over (cap / force-end / all others
   * finished): the game must finish NOW, applying its own timeout rule to
   * whatever attempt is in progress.
   */
  roundEnded: boolean;
  /** Restores state after a reload; null on a fresh start. */
  snapshot: S | null;
  /**
   * Called after every start event and every attempt with a
   * JSON-serialisable snapshot (epochs only, never performance.now()
   * values), so the shell can persist it and hand it back on reload
   * (docs/SESSION_LIFECYCLE.md §4.1, ADR-018).
   */
  onProgress(snapshot: S): void;
  /** Called exactly once, when the round is scored. The shell submits it. */
  onFinish(result: GameResult): void;
}

export interface GameModule<S = unknown> {
  id: GameId;
  Component: React.ComponentType<GameProps<S>>;
  /** Pure function raw -> score. No DOM, time or randomness. */
  score(raw: unknown): number;
  /** Documented worst-case round length in ms (docs/SCORING.md §2). Never exceeded. */
  worstCaseMs: number;
}

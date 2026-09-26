import type { GameModule } from '../types';
import { Trivia, type TriviaSnapshot } from './Trivia';
import { scoreTrivia } from './scoring';

/**
 * Worst-case round length per docs/SCORING.md §2 / docs/games/trivia.md §3:
 * 1.5 intro + 5 x (10 + 1.5 feedback) = 59 s, well inside the 120 s cap.
 */
export const TRIVIA_WORST_CASE_MS = 59_000;

export const trivia: GameModule<TriviaSnapshot> = {
  id: 'trivia',
  Component: Trivia,
  score: scoreTrivia,
  worstCaseMs: TRIVIA_WORST_CASE_MS,
  // Each player draws their own five and their own option order (ADR-027, games/trivia.md §2).
  seedScope: 'player',
};

export default trivia;
export type { TriviaSnapshot };

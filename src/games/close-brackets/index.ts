import type { GameModule } from '../types';
import { CloseBrackets, type CloseBracketsSnapshot } from './CloseBrackets';
import { scoreCloseBrackets } from './scoring';

/**
 * Worst-case round length per docs/SCORING.md §2 / docs/games/close-brackets.md §3:
 * 1.5 s intro + the 30 s game clock (transitions run inside it) = 31.5 s,
 * rounded up; well inside the 120 s cap.
 */
export const CLOSE_BRACKETS_WORST_CASE_MS = 32_000;

export const closeBrackets: GameModule<CloseBracketsSnapshot> = {
  id: 'close_brackets',
  Component: CloseBrackets,
  score: scoreCloseBrackets,
  worstCaseMs: CLOSE_BRACKETS_WORST_CASE_MS,
};

export default closeBrackets;
export type { CloseBracketsSnapshot };

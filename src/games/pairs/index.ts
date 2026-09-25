import type { GameModule } from '../types';
import { Pairs, type PairsSnapshot } from './Pairs';
import { scorePairs } from './scoring';

/**
 * Worst-case round length per docs/SCORING.md §2 / docs/games/pairs.md §3:
 * 1.5 s intro + the 60 s game clock (the 0.7 s mismatch locks run inside
 * it) = 61.5 s, rounded up; well inside the 120 s cap.
 */
export const PAIRS_WORST_CASE_MS = 62_000;

export const pairs: GameModule<PairsSnapshot> = {
  id: 'pairs',
  Component: Pairs,
  score: scorePairs,
  worstCaseMs: PAIRS_WORST_CASE_MS,
};

export default pairs;
export type { PairsSnapshot };

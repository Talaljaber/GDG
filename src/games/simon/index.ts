import type { GameModule } from '../types';
import { Simon, type SimonSnapshot } from './Simon';
import { scoreSimon } from './scoring';

/**
 * Worst-case round length per docs/SCORING.md §2: "sequences of length
 * 3...15, 5 s per tap: capped by the 120 s round cap (a perfect run to
 * length 15 takes ~117 s)". The round cap itself is the true ceiling.
 */
export const SIMON_WORST_CASE_MS = 120_000;

export const simon: GameModule<SimonSnapshot> = {
  id: 'simon',
  Component: Simon,
  score: scoreSimon,
  worstCaseMs: SIMON_WORST_CASE_MS,
};

export default simon;
export type { SimonSnapshot };

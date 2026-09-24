import type { GameModule } from '../types';
import { PerfectCircle, type PerfectCircleSnapshot } from './PerfectCircle';
import { scorePerfectCircle } from './scoring';

/**
 * Worst-case round length per docs/SCORING.md §2: one 30 s attempt (the
 * canvas appears after the 1.5 s intro; the scored ring never holds the
 * finish past the attempt deadline).
 */
export const PERFECT_CIRCLE_WORST_CASE_MS = 31_500;

export const perfectCircle: GameModule<PerfectCircleSnapshot> = {
  id: 'perfect_circle',
  Component: PerfectCircle,
  score: scorePerfectCircle,
  worstCaseMs: PERFECT_CIRCLE_WORST_CASE_MS,
};

export default perfectCircle;
export type { PerfectCircleSnapshot };

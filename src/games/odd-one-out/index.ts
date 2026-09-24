import type { GameModule } from '../types';
import { GRID3_ROTATION_DEG, OddOneOut, type OddOneOutSnapshot } from './OddOneOut';
import { scoreOddOneOut } from './scoring';

export { GRID3_ROTATION_DEG };

/**
 * Worst-case round length per docs/SCORING.md §2:
 * 1.5 s intro + 3 x 20 s + 3 x 0.6 s transitions = 63.3 s, rounded up; well
 * inside the 120 s cap (an idle player measures 63.6 s with frame pacing).
 */
export const ODD_ONE_OUT_WORST_CASE_MS = 64_000;

export const oddOneOut: GameModule<OddOneOutSnapshot> = {
  id: 'odd_one_out',
  Component: OddOneOut,
  score: scoreOddOneOut,
  worstCaseMs: ODD_ONE_OUT_WORST_CASE_MS,
};

export default oddOneOut;
export type { OddOneOutSnapshot };
export { Chevron } from './Chevron';
export type { ChevronProps } from './Chevron';

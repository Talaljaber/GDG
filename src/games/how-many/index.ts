import type { GameModule } from '../types';
import { HowMany, type HowManySnapshot } from './HowMany';
import { scoreHowMany } from './scoring';

/**
 * Worst-case round length per docs/SCORING.md §2 / docs/games/how-many.md §3:
 * 1.5 s intro + 3 x (1 s look + 2.5 s flash + 15 s answer + 0.5 s locked) = 58.5 s,
 * rounded up (ADR-138); well inside the 120 s cap.
 */
export const HOW_MANY_WORST_CASE_MS = 60_000;

export const howMany: GameModule<HowManySnapshot> = {
  id: 'how_many',
  Component: HowMany,
  score: scoreHowMany,
  worstCaseMs: HOW_MANY_WORST_CASE_MS,
};

export default howMany;
export type { HowManySnapshot };

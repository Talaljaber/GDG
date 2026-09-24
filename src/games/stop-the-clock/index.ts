import type { GameModule } from '../types';
import { StopTheClock, type StopTheClockSnapshot } from './StopTheClock';
import { scoreStopTheClock } from './scoring';

/**
 * Worst-case round length per docs/SCORING.md §2:
 * (10 + 15) + (10 + 20) + (10 + 17) + 2 x 1.5 = 85 s, well inside the 120 s cap.
 */
export const STOP_THE_CLOCK_WORST_CASE_MS = 85_000;

export const stopTheClock: GameModule<StopTheClockSnapshot> = {
  id: 'stop_the_clock',
  Component: StopTheClock,
  score: scoreStopTheClock,
  worstCaseMs: STOP_THE_CLOCK_WORST_CASE_MS,
};

export default stopTheClock;
export type { StopTheClockSnapshot };

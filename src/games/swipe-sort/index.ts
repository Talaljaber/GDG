import type { GameModule } from '../types';
import { SwipeSort, type SwipeSortSnapshot } from './SwipeSort';
import { scoreSwipeSort } from './scoring';

/**
 * Worst-case round length per docs/SCORING.md §2 / docs/games/swipe-sort.md §3:
 * 1.5 s intro + the 30 s game clock (the 0.15 s gaps run inside it) = 31.5 s,
 * rounded up; well inside the 120 s cap.
 */
export const SWIPE_SORT_WORST_CASE_MS = 32_000;

export const swipeSort: GameModule<SwipeSortSnapshot> = {
  id: 'swipe_sort',
  Component: SwipeSort,
  score: scoreSwipeSort,
  worstCaseMs: SWIPE_SORT_WORST_CASE_MS,
};

export default swipeSort;
export type { SwipeSortSnapshot };

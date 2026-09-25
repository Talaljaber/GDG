/**
 * Swipe Sort's resumable timeline: the snapshot the shell persists, and the
 * pure catch-up step that applies every item window and gap that has
 * elapsed on the epochs (docs/games/swipe-sort.md §3, §9).
 *
 * The timeline is epoch-exact: item k + 1's onset is item k's gap end, a
 * missed item's gap starts at its deadline. So a reload, a late timer or a
 * screen lock all land on the same sequence an idle player would get, and
 * the game still ends at gameStartEpoch + 30 s (ADR-018).
 */
import type { SwipeSide } from './items';
import { itemWindowMs, SS_GAME_MS, SS_GAP_MS } from './scoring';

export type SwipeSortPhase = 'intro' | 'play' | 'done';
export type SwipeSortFeedback = 'correct' | 'wrong' | 'missed' | null;

export interface SwipeSortSnapshot {
  phase: SwipeSortPhase;
  /** Date.now() when the first chevron appeared (the 30 s game clock); null in `intro`. */
  gameStartEpoch: number | null;
  /** k of the current item (the one just sorted or missed, during a gap). */
  itemIndex: number;
  /** Date.now() at the current item's onset; null during a gap or the intro. */
  itemStartEpoch: number | null;
  /** Date.now() at which the current gap ends; null outside a gap. */
  gapEndEpoch: number | null;
  correct: number;
  wrong: number;
  missed: number;
  /** Sum of the swipe times (onset -> registration) of the correct items, ms. */
  swipeSumMs: number;
  /** What the gap shows; null outside a gap. */
  feedback: SwipeSortFeedback;
  /** The side swiped to in the last item (for the gap's ring or shake); null after a miss. */
  side: SwipeSide | null;
}

export function initialSnapshot(): SwipeSortSnapshot {
  return {
    phase: 'intro',
    gameStartEpoch: null,
    itemIndex: 0,
    itemStartEpoch: null,
    gapEndEpoch: null,
    correct: 0,
    wrong: 0,
    missed: 0,
    swipeSumMs: 0,
    feedback: null,
    side: null,
  };
}

/** The current item's window I(t), from its onset on the game clock. */
export function currentWindowMs(s: SwipeSortSnapshot): number {
  if (s.itemStartEpoch === null || s.gameStartEpoch === null) return itemWindowMs(0);
  return itemWindowMs(s.itemStartEpoch - s.gameStartEpoch);
}

/** Epoch at which the current item becomes a miss; null outside an item. */
export function itemDeadline(s: SwipeSortSnapshot): number | null {
  if (s.itemStartEpoch === null) return null;
  return s.itemStartEpoch + currentWindowMs(s);
}

/** Epoch at which the game clock runs out; null before the first chevron. */
export function gameEndEpoch(s: SwipeSortSnapshot): number | null {
  return s.gameStartEpoch === null ? null : s.gameStartEpoch + SS_GAME_MS;
}

/**
 * Applies, in order, every item deadline (a miss, then a 150 ms gap) and
 * every gap end (the next item) that is due at `now` and falls strictly
 * inside the game clock. Returns the same object when nothing is due. An
 * item or gap still open at the 30 s mark is left for the caller to finish
 * (the open item doesn't count).
 */
export function catchUp(s: SwipeSortSnapshot, now: number): SwipeSortSnapshot {
  const gameEnd = gameEndEpoch(s);
  if (s.phase !== 'play' || gameEnd === null) return s;
  let cur = s;
  // Bounded: at most ~70 items fit in 30 s even at the 450 ms floor.
  for (let guard = 0; guard < 1000; guard++) {
    if (cur.gapEndEpoch !== null) {
      if (cur.gapEndEpoch > now || cur.gapEndEpoch >= gameEnd) break;
      cur = {
        ...cur,
        itemIndex: cur.itemIndex + 1,
        itemStartEpoch: cur.gapEndEpoch,
        gapEndEpoch: null,
        feedback: null,
        side: null,
      };
      continue;
    }
    const deadline = itemDeadline(cur);
    if (deadline === null || deadline > now || deadline >= gameEnd) break;
    cur = {
      ...cur,
      missed: cur.missed + 1,
      itemStartEpoch: null,
      gapEndEpoch: deadline + SS_GAP_MS,
      feedback: 'missed',
      side: null,
    };
  }
  return cur;
}

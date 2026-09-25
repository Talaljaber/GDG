/**
 * Seeded items for Swipe Sort. Source of truth: docs/games/swipe-sort.md §2.
 * Item k's colour (50/50) and tilt come from Rng("<seed>:ss:item<k>"), so
 * everyone in a round sees the same sequence and a reload shows the same
 * item again. Only the pace differs: a faster player sees more items.
 */
import { Rng } from '../../lib/rng';

export const SWIPE_COLORS = ['blue', 'amber'] as const;
export type SwipeColor = (typeof SWIPE_COLORS)[number];

/** Physical screen sides (game geometry: the same in Arabic and English). */
export type SwipeSide = 'left' | 'right';

/** Blue goes left, amber goes right; the chevron points the same way (the shape cue). */
export const SIDE_FOR: Readonly<Record<SwipeColor, SwipeSide>> = { blue: 'left', amber: 'right' };

/** Tilt range for variety, degrees (-12..+12). */
export const SS_TILT_MAX_DEG = 12;

export interface SwipeItem {
  color: SwipeColor;
  /** The side this item must be swiped to (= the way its chevron points). */
  side: SwipeSide;
  /** Integer tilt in degrees, -12..+12. */
  tiltDeg: number;
}

/** Item k (0-based) of the round. */
export function itemFor(seed: string, k: number): SwipeItem {
  const rng = new Rng(`${seed}:ss:item${k}`);
  const color: SwipeColor = rng.float() < 0.5 ? 'blue' : 'amber';
  const tiltDeg = rng.int(2 * SS_TILT_MAX_DEG + 1) - SS_TILT_MAX_DEG;
  return { color, side: SIDE_FOR[color], tiltDeg };
}

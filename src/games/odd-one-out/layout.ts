/**
 * Grid layout for small screens under bright light. Source of truth:
 * docs/games/odd-one-out.md §2. Pure function of viewport width and grid
 * size, no DOM reads, so it can be unit-tested (OOO-T6).
 */

/** Gutter on each side of the square grid. */
const GUTTER_PX = 16;

/** The square grid never exceeds this side length. */
const MAX_SIDE_PX = 480;

/** Normal tile gap for the 4x4 and 5x5 grids. */
const GAP_NORMAL_PX = 8;

/** Tile gap for the 6x6 grid on ordinary phones. */
const GAP_6X6_PX = 6;

/** Tile gap for the 6x6 grid on very small phones, to keep tiles >= 44px. */
const GAP_6X6_FALLBACK_PX = 4;

/** Below this viewport width, the 6x6 grid uses the smaller fallback gap. */
const SMALL_PHONE_BREAKPOINT_PX = 340;

/** The floor touch-target size the 6x6 grid must stay at or above. */
export const TOUCH_TARGET_FLOOR_PX = 44;

export interface GridLayout {
  /** The square grid's side length, in CSS px. */
  side: number;
  /** The gap between tiles, in CSS px. */
  gap: number;
  /** Each tile's side length, in CSS px. */
  tileSize: number;
}

/** Computes the square grid's side, tile gap and tile size for a given viewport width and grid size. */
export function computeGridLayout(viewportWidth: number, size: number): GridLayout {
  const side = Math.min(viewportWidth - 2 * GUTTER_PX, MAX_SIDE_PX);
  const gap =
    size === 6 ? (viewportWidth < SMALL_PHONE_BREAKPOINT_PX ? GAP_6X6_FALLBACK_PX : GAP_6X6_PX) : GAP_NORMAL_PX;
  const tileSize = (side - gap * (size - 1)) / size;
  return { side, gap, tileSize };
}

/**
 * Grid geometry and the seeded odd-tile position. Source of truth:
 * docs/games/odd-one-out.md §2. No DOM, time or randomness beyond the
 * per-round seed (src/lib/rng.ts), so a reload reproduces the same layout
 * (OOO-T5).
 */
import { Rng } from '../../lib/rng';
import { OOO_GRID_SIZES } from './scoring';

export { OOO_GRID_SIZES as GRID_SIZES };

/** Grid 3's odd tile is the same shape as normal, just rotated by this many degrees (§2). */
export const GRID3_ROTATION_DEG = 15;

/** The uniformly-random odd-tile index for a given grid, stable across reloads for a given seed. */
export function oddTileIndex(seed: string, gridIndex: number, size: number): number {
  return new Rng(`${seed}:ooo:grid${gridIndex}`).int(size * size);
}

export interface TileTheme {
  color: 'blue' | 'amber';
  mirrored: boolean;
  rotationDeg: number;
}

/**
 * The visual treatment for a tile, per the difficulty curve (§2):
 * grid 1 odd = amber; grid 2 odd = mirrored blue; grid 3 odd = rotated blue.
 * All normal tiles are identical blue `<` chevrons.
 */
export function tileTheme(gridIndex: number, isOdd: boolean): TileTheme {
  if (!isOdd) {
    return { color: 'blue', mirrored: false, rotationDeg: 0 };
  }
  switch (gridIndex) {
    case 0:
      return { color: 'amber', mirrored: false, rotationDeg: 0 };
    case 1:
      return { color: 'blue', mirrored: true, rotationDeg: 0 };
    default:
      return { color: 'blue', mirrored: false, rotationDeg: GRID3_ROTATION_DEG };
  }
}

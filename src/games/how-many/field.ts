/**
 * Seeded chevron fields for How Many?. Source of truth: docs/games/how-many.md §2.
 *
 * Flash i uses a fixed g_i x g_i cell grid (HM_GRID; fixed per flash so the
 * cell size never hints at the count). Rng("<seed>:hm:round<i>") draws, in
 * this order: the count N_i uniformly from the flash's band excluding
 * multiples of 10, then N_i distinct cells, then per chevron jitter-x,
 * jitter-y, rotation and colour. Each glyph is 70 % of a cell, jittered by at
 * most ±15 % of a cell, so 0.7 + 2 x 0.15 = 1.0: a glyph never leaves its cell,
 * chevrons never overlap and never leave the field. Everyone in a round sees
 * the same field; a reload computes the same one again.
 */
import { Rng } from '../../lib/rng';
import { HM_BANDS } from './scoring';

/** Grid side per flash (25 / 49 / 100 cells >= the band maxima 15 / 35 / 70). */
export const HM_GRID: readonly number[] = [5, 7, 10];

/** Glyph box side, in cells. */
export const HM_GLYPH = 0.7;

/** Maximum centre offset from the cell centre, in cells, per axis. */
export const HM_JITTER = 0.15;

export type HmColor = 'blue' | 'amber';

export interface HmChevron {
  /** Cell index, row-major from the top-left (game geometry: never mirrored in RTL). */
  cell: number;
  col: number;
  row: number;
  /** Glyph centre from the field's top-left, in cells. */
  cx: number;
  cy: number;
  rotationDeg: number;
  color: HmColor;
}

export interface HmField {
  index: number;
  grid: number;
  count: number;
  chevrons: HmChevron[];
}

/** The counts flash i can draw: its band minus multiples of 10. */
export function countsFor(index: number): number[] {
  const [lo, hi] = HM_BANDS[index];
  const out: number[] = [];
  for (let n = lo; n <= hi; n++) if (n % 10 !== 0) out.push(n);
  return out;
}

function draw(seed: string, index: number): HmField {
  const rng = new Rng(`${seed}:hm:round${index}`);
  const grid = HM_GRID[index];
  const count = rng.pick(countsFor(index));
  const cells = rng.sampleWithoutReplacement(
    Array.from({ length: grid * grid }, (_, k) => k),
    count,
  );
  const chevrons = cells.map((cell): HmChevron => {
    const col = cell % grid;
    const row = Math.floor(cell / grid);
    const jx = (rng.float() * 2 - 1) * HM_JITTER;
    const jy = (rng.float() * 2 - 1) * HM_JITTER;
    const rotationDeg = rng.int(360);
    const color: HmColor = rng.float() < 0.5 ? 'blue' : 'amber';
    return { cell, col, row, cx: col + 0.5 + jx, cy: row + 0.5 + jy, rotationDeg, color };
  });
  return { index, grid, count, chevrons };
}

const cache = new Map<string, HmField>();

/** Flash i (0-based) of the round; pure and memoised (the same object for the same seed and flash). */
export function fieldFor(seed: string, index: number): HmField {
  const key = `${seed}\u0000${index}`;
  let field = cache.get(key);
  if (!field) {
    if (cache.size > 30) cache.clear();
    field = draw(seed, index);
    cache.set(key, field);
  }
  return field;
}

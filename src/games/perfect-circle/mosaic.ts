/**
 * The Perfect Circle stroke texture: a seamless tile of small mosaic shards
 * in the brand blues and ambers (docs/games/perfect-circle.md §8,
 * docs/DESIGN_SYSTEM.md §6.2), used as a canvas pattern for the 10 px stroke.
 *
 * Colours are read from the design tokens at runtime, never hard-coded. All
 * canvas calls are guarded: jsdom (tests) and very old browsers have no 2D
 * context, and the game must still play there.
 */
import { Rng } from '../../lib/rng';
import type { Point } from './metric';

/** Shard fills with their DESIGN_SYSTEM §6.2 weights (tint and paper left out: the stroke sits on paper). */
export const MOSAIC_FILLS = [
  { token: '--gdg-blue', weight: 25 },
  { token: '--gdg-blue-deep', weight: 20 },
  { token: '--gdg-amber', weight: 15 },
  { token: '--gdg-amber-deep', weight: 10 },
] as const;

export type MosaicToken = (typeof MOSAIC_FILLS)[number]['token'];

/** The shard edge colour (1 px, §6.2). */
export const MOSAIC_EDGE_TOKEN = '--gdg-paper';
/** The best-fit reference circle is thin ink (§7). */
export const REFERENCE_TOKEN = '--gdg-ink';

/** Tile side in CSS px and the grid of jittered points it is cut from. */
export const MOSAIC_TILE_PX = 36;
const GRID = 3;
const JITTER = 0.3;

/** Stroke width in CSS px (§8). */
export const STROKE_WIDTH_PX = 10;
/** Thin reference circle, CSS px. */
export const REFERENCE_WIDTH_PX = 1.5;

export interface Shard {
  points: [Point, Point, Point];
  token: MosaicToken;
}

function pickFill(rng: Rng): MosaicToken {
  const total = MOSAIC_FILLS.reduce((s, f) => s + f.weight, 0);
  let roll = rng.float() * total;
  for (const fill of MOSAIC_FILLS) {
    roll -= fill.weight;
    if (roll < 0) return fill.token;
  }
  return MOSAIC_FILLS[0].token;
}

/**
 * Seeded shards covering one tile: a jittered GRID × GRID point lattice whose
 * jitter wraps at the tile edge (so the tile repeats seamlessly), each cell
 * cut into two triangles. Pure and deterministic for a given seed.
 */
export function mosaicShards(seed: string): Shard[] {
  const rng = new Rng(`${seed}:pc-mosaic`);
  const cell = MOSAIC_TILE_PX / GRID;
  const jitter: Point[][] = Array.from({ length: GRID }, () =>
    Array.from({ length: GRID }, () => ({
      x: (rng.float() * 2 - 1) * JITTER * cell,
      y: (rng.float() * 2 - 1) * JITTER * cell,
    })),
  );
  const at = (i: number, j: number): Point => {
    const d = jitter[i % GRID][j % GRID];
    return { x: i * cell + d.x, y: j * cell + d.y };
  };
  const shards: Shard[] = [];
  for (let i = 0; i < GRID; i++) {
    for (let j = 0; j < GRID; j++) {
      const a = at(i, j);
      const b = at(i + 1, j);
      const c = at(i + 1, j + 1);
      const d = at(i, j + 1);
      const flip = (i + j) % 2 === 0;
      shards.push({ points: flip ? [a, b, c] : [a, b, d], token: pickFill(rng) });
      shards.push({ points: flip ? [a, c, d] : [b, c, d], token: pickFill(rng) });
    }
  }
  return shards;
}

/** Reads a colour token from :root; '' when unavailable (tests, SSR). */
export function readToken(name: string): string {
  try {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  } catch {
    return '';
  }
}

export function get2d(canvas: HTMLCanvasElement | null): CanvasRenderingContext2D | null {
  if (!canvas) return null;
  try {
    return canvas.getContext('2d');
  } catch {
    return null;
  }
}

/**
 * Paints the shard tile (drawn 3 times: at its origin and wrapped by one tile
 * on each axis, so shards crossing the edge tile seamlessly) and returns it
 * as a repeating pattern. Falls back to the plain blue token when patterns
 * aren't available.
 */
export function createMosaicStyle(target: CanvasRenderingContext2D, seed: string): CanvasPattern | string {
  const fallback = readToken('--gdg-blue');
  try {
    const tile = document.createElement('canvas');
    tile.width = MOSAIC_TILE_PX;
    tile.height = MOSAIC_TILE_PX;
    const ctx = get2d(tile);
    if (!ctx) return fallback;
    const edge = readToken(MOSAIC_EDGE_TOKEN);
    const colours = new Map<string, string>(MOSAIC_FILLS.map((f) => [f.token, readToken(f.token)]));
    ctx.lineWidth = 1;
    ctx.lineJoin = 'round';
    for (const ox of [0, -MOSAIC_TILE_PX]) {
      for (const oy of [0, -MOSAIC_TILE_PX]) {
        for (const shard of mosaicShards(seed)) {
          const [a, b, c] = shard.points;
          ctx.beginPath();
          ctx.moveTo(a.x + ox, a.y + oy);
          ctx.lineTo(b.x + ox, b.y + oy);
          ctx.lineTo(c.x + ox, c.y + oy);
          ctx.closePath();
          ctx.fillStyle = colours.get(shard.token) ?? fallback;
          ctx.fill();
          if (edge) {
            ctx.strokeStyle = edge;
            ctx.stroke();
          }
        }
      }
    }
    return target.createPattern(tile, 'repeat') ?? fallback;
  } catch {
    return fallback;
  }
}

/** Prepares a context for the live stroke. */
export function applyStrokeStyle(ctx: CanvasRenderingContext2D, style: CanvasPattern | string): void {
  ctx.strokeStyle = style;
  ctx.lineWidth = STROKE_WIDTH_PX;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}

/** Draws a polyline (or a dot for a single point), scaled by `scale`. */
export function drawPolyline(
  ctx: CanvasRenderingContext2D,
  style: CanvasPattern | string,
  points: readonly Point[],
  scale = 1,
): void {
  if (points.length === 0) return;
  applyStrokeStyle(ctx, style);
  ctx.beginPath();
  ctx.moveTo(points[0].x * scale, points[0].y * scale);
  if (points.length === 1) {
    ctx.lineTo(points[0].x * scale + 0.01, points[0].y * scale);
  }
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x * scale, points[i].y * scale);
  }
  ctx.stroke();
}

/** The thin ink best-fit circle drawn over the stroke once scored (§7). */
export function drawReferenceCircle(
  ctx: CanvasRenderingContext2D,
  center: Point,
  radius: number,
  scale = 1,
): void {
  ctx.save();
  ctx.strokeStyle = readToken(REFERENCE_TOKEN);
  ctx.lineWidth = REFERENCE_WIDTH_PX;
  ctx.beginPath();
  ctx.arc(center.x * scale, center.y * scale, radius * scale, 0, 2 * Math.PI);
  ctx.stroke();
  ctx.restore();
}

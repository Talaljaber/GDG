/**
 * Shard geometry for the mosaic shatter (docs/DESIGN_SYSTEM.md §6.2).
 *
 * A jittered point grid covering a rectangle is triangulated with
 * Bowyer–Watson (Delaunay); every shard gets a fill token (with the §6.2
 * weights) and seeded flight parameters. Pure and deterministic for a given
 * seed: no DOM, no clocks, no Math.random.
 *
 * Hard caps: 24 shards on phones, 48 on the big screen. For a grid of
 * `cols × rows` cells the triangulation always has exactly `2 · cols · rows`
 * triangles (Euler: 2n − 2 − h), so the caps are enforced by the grid size.
 */
import { Rng } from '../../lib/rng';

export type Density = 'phone' | 'projector';

/** Hard caps per density (§6.2). */
export const SHARD_CAPS: Readonly<Record<Density, number>> = { phone: 24, projector: 48 };

export interface Vec {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Shard fills and their §6.2 weights (percent). Colours are tokens, resolved by CSS. */
export const SHARD_FILLS = [
  { token: '--gdg-blue', weight: 25 },
  { token: '--gdg-blue-deep', weight: 20 },
  { token: '--gdg-amber', weight: 15 },
  { token: '--gdg-amber-deep', weight: 10 },
  { token: '--gdg-blue-tint', weight: 20 },
  { token: '--gdg-paper', weight: 10 },
] as const;

export type ShardFill = (typeof SHARD_FILLS)[number]['token'];

/** The 1 px shard edge colour (§6.2). */
export const SHARD_EDGE_TOKEN = '--gdg-paper';

/**
 * How far and how much a shard travels. Distances are in the same unit as
 * the rect (CSS px); the flight direction is outward from the rect's centre
 * with a random spread, so "fly in from random directions" and "burst
 * outward" use the same vector.
 */
export interface FlightProfile {
  minDistance: number;
  maxDistance: number;
  /** Rotation is uniform in [−maxRotateDeg, +maxRotateDeg]. */
  maxRotateDeg: number;
  /** Random spread around the outward direction, degrees (default 50). */
  spreadDeg?: number;
}

export interface ShardFlight {
  /** Offset from the rest position at full flight, px. */
  dx: number;
  dy: number;
  /** |(dx, dy)|, px. */
  distance: number;
  rotateDeg: number;
}

export interface Shard {
  /** 0-based, shards are ordered top-to-bottom then start-to-end by centroid. */
  id: number;
  points: readonly [Vec, Vec, Vec];
  centroid: Vec;
  /** Axis-aligned bounding box of the triangle. */
  bounds: Rect;
  area: number;
  fill: ShardFill;
  flight: ShardFlight;
}

export interface ShardOptions {
  seed: string | number;
  density: Density;
  flight: FlightProfile;
  /** Ask for fewer shards than the density cap (clamped to [2, cap]). */
  maxShards?: number;
}

/** Transition flight: 30–60 % of the viewport's longer side, ±40° (§6.2). */
export function transitionFlight(viewport: { width: number; height: number }): FlightProfile {
  const side = Math.max(viewport.width, viewport.height);
  return { minDistance: 0.3 * side, maxDistance: 0.6 * side, maxRotateDeg: 40 };
}

/** Celebrate flight: 18–40 px outward, ±25° (§6.2). */
export const CELEBRATE_FLIGHT: FlightProfile = { minDistance: 18, maxDistance: 40, maxRotateDeg: 25 };

// ---------------------------------------------------------------------------
// Small geometry helpers
// ---------------------------------------------------------------------------

export function triangleArea(a: Vec, b: Vec, c: Vec): number {
  return Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2;
}

/** True when p lies inside (or on an edge of) triangle abc, with tolerance eps. */
export function pointInTriangle(p: Vec, a: Vec, b: Vec, c: Vec, eps = 1e-9): boolean {
  const d1 = (p.x - b.x) * (a.y - b.y) - (a.x - b.x) * (p.y - b.y);
  const d2 = (p.x - c.x) * (b.y - c.y) - (b.x - c.x) * (p.y - c.y);
  const d3 = (p.x - a.x) * (c.y - a.y) - (c.x - a.x) * (p.y - a.y);
  const hasNeg = d1 < -eps || d2 < -eps || d3 < -eps;
  const hasPos = d1 > eps || d2 > eps || d3 > eps;
  return !(hasNeg && hasPos);
}

// ---------------------------------------------------------------------------
// Bowyer–Watson Delaunay triangulation
// ---------------------------------------------------------------------------

export type TriangleIndices = [number, number, number];

interface WorkTriangle {
  v: TriangleIndices;
  cx: number;
  cy: number;
  r2: number;
}

function circumcircle(p: readonly Vec[], v: TriangleIndices): WorkTriangle {
  const [a, b, c] = [p[v[0]], p[v[1]], p[v[2]]];
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-12) {
    // Degenerate (collinear) triangle: a circle that contains everything, so
    // it is always replaced by the next insertion.
    return { v, cx: 0, cy: 0, r2: Infinity };
  }
  const a2 = a.x * a.x + a.y * a.y;
  const b2 = b.x * b.x + b.y * b.y;
  const c2 = c.x * c.x + c.y * c.y;
  const cx = (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d;
  const cy = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d;
  return { v, cx, cy, r2: (a.x - cx) ** 2 + (a.y - cy) ** 2 };
}

/**
 * Delaunay triangulation (Bowyer–Watson with a super-triangle). Returns
 * triangles as index triples into `points`. O(n²), fine for the ≤ 35 points
 * a 48-shard grid needs.
 */
export function delaunay(points: readonly Vec[]): TriangleIndices[] {
  const n = points.length;
  if (n < 3) return [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const size = Math.max(maxX - minX, maxY - minY, 1);
  const mx = (minX + maxX) / 2;
  const my = (minY + maxY) / 2;
  // A super-triangle far away: circumcircles through two hull points and a
  // super vertex then bulge into the hull by far less than the grid jitter.
  const far = 50 * size;
  const all: Vec[] = points.concat([
    { x: mx - far, y: my - far },
    { x: mx, y: my + far },
    { x: mx + far, y: my - far },
  ]);
  let tris: WorkTriangle[] = [circumcircle(all, [n, n + 1, n + 2])];

  for (let i = 0; i < n; i++) {
    const p = all[i];
    const bad: WorkTriangle[] = [];
    const keep: WorkTriangle[] = [];
    for (const t of tris) {
      if ((p.x - t.cx) ** 2 + (p.y - t.cy) ** 2 < t.r2) bad.push(t);
      else keep.push(t);
    }
    // Boundary of the cavity = edges used by exactly one bad triangle.
    const edgeCount = new Map<string, [number, number, number]>();
    for (const t of bad) {
      for (let e = 0; e < 3; e++) {
        const u = t.v[e];
        const w = t.v[(e + 1) % 3];
        const key = u < w ? `${u},${w}` : `${w},${u}`;
        const seen = edgeCount.get(key);
        if (seen) seen[2]++;
        else edgeCount.set(key, [u, w, 1]);
      }
    }
    for (const [u, w, count] of edgeCount.values()) {
      if (count === 1) keep.push(circumcircle(all, [u, w, i]));
    }
    tris = keep;
  }
  return tris.filter((t) => t.v[0] < n && t.v[1] < n && t.v[2] < n).map((t) => t.v);
}

// ---------------------------------------------------------------------------
// Grid, colours, flights
// ---------------------------------------------------------------------------

/**
 * Picks the grid (cols × rows ≤ maxCells) whose cells are closest to square.
 * Ties go to more cells.
 */
export function chooseGrid(rect: Rect, maxCells: number): { cols: number; rows: number } {
  let best = { cols: 1, rows: 1 };
  let bestScore = Infinity;
  for (let rows = 1; rows <= maxCells; rows++) {
    const cols = Math.floor(maxCells / rows);
    if (cols < 1) break;
    const cellAspect = rect.width / cols / (rect.height / rows);
    const score = Math.abs(Math.log(cellAspect)) - 1e-6 * cols * rows;
    if (score < bestScore) {
      bestScore = score;
      best = { cols, rows };
    }
  }
  return best;
}

const JITTER = 0.35;

/**
 * (cols+1) × (rows+1) points: corners fixed, edge points jitter along their
 * edge only, interior points jitter on both axes (±35 % of a cell). Returned
 * row-major.
 */
export function jitteredGrid(rect: Rect, cols: number, rows: number, rng: Rng): Vec[] {
  const cw = rect.width / cols;
  const ch = rect.height / rows;
  const pts: Vec[] = [];
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= cols; i++) {
      const edgeX = i === 0 || i === cols;
      const edgeY = j === 0 || j === rows;
      const jx = edgeX ? 0 : (rng.float() * 2 - 1) * JITTER * cw;
      const jy = edgeY ? 0 : (rng.float() * 2 - 1) * JITTER * ch;
      pts.push({ x: rect.x + i * cw + jx, y: rect.y + j * ch + jy });
    }
  }
  return pts;
}

/** Fallback triangulation: each grid cell split along an alternating diagonal. */
export function gridSplit(cols: number, rows: number): TriangleIndices[] {
  const idx = (i: number, j: number) => j * (cols + 1) + i;
  const out: TriangleIndices[] = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = idx(i, j);
      const b = idx(i + 1, j);
      const c = idx(i + 1, j + 1);
      const d = idx(i, j + 1);
      if ((i + j) % 2 === 0) out.push([a, b, c], [a, c, d]);
      else out.push([a, b, d], [b, c, d]);
    }
  }
  return out;
}

/** Weighted fill pick (§6.2 weights). */
export function pickFill(rng: Rng): ShardFill {
  const total = SHARD_FILLS.reduce((s, f) => s + f.weight, 0);
  let roll = rng.float() * total;
  for (const fill of SHARD_FILLS) {
    roll -= fill.weight;
    if (roll < 0) return fill.token;
  }
  return SHARD_FILLS[0].token;
}

function flightFor(centroid: Vec, centre: Vec, profile: FlightProfile, rng: Rng): ShardFlight {
  const spread = ((profile.spreadDeg ?? 50) * Math.PI) / 180;
  const ox = centroid.x - centre.x;
  const oy = centroid.y - centre.y;
  const base = Math.hypot(ox, oy) < 1e-6 ? rng.float() * 2 * Math.PI : Math.atan2(oy, ox);
  const angle = base + (rng.float() * 2 - 1) * spread;
  const distance = profile.minDistance + rng.float() * (profile.maxDistance - profile.minDistance);
  const rotateDeg = (rng.float() * 2 - 1) * profile.maxRotateDeg;
  return { dx: Math.cos(angle) * distance, dy: Math.sin(angle) * distance, distance, rotateDeg };
}

function isValidTiling(pts: readonly Vec[], tris: readonly TriangleIndices[], expected: number, area: number): boolean {
  if (tris.length !== expected) return false;
  let sum = 0;
  for (const [a, b, c] of tris) {
    const t = triangleArea(pts[a], pts[b], pts[c]);
    if (t <= area * 1e-9) return false;
    sum += t;
  }
  return Math.abs(sum - area) <= area * 1e-6;
}

/**
 * Seeded shards tiling `rect` exactly (no gaps, no overlaps). Empty for a
 * zero-sized rect. The count is `2 · cols · rows` ≤ min(cap, maxShards).
 */
export function createShards(rect: Rect, options: ShardOptions): Shard[] {
  if (!(rect.width > 0 && rect.height > 0)) return [];
  const cap = SHARD_CAPS[options.density];
  const limit = Math.max(2, Math.min(cap, Math.floor(options.maxShards ?? cap)));
  const { cols, rows } = chooseGrid(rect, Math.floor(limit / 2));
  const rng = new Rng(`${String(options.seed)}:shatter`);
  const pts = jitteredGrid(rect, cols, rows, rng);
  const area = rect.width * rect.height;
  let tris = delaunay(pts);
  if (!isValidTiling(pts, tris, 2 * cols * rows, area)) {
    // Numerically unlucky point set (near-cocircular): the plain split
    // always tiles, with the same jittered points.
    tris = gridSplit(cols, rows);
  }
  const centre = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  const shaped = tris.map((t) => {
    const points = [pts[t[0]], pts[t[1]], pts[t[2]]] as const;
    const centroid = {
      x: (points[0].x + points[1].x + points[2].x) / 3,
      y: (points[0].y + points[1].y + points[2].y) / 3,
    };
    return { points, centroid };
  });
  shaped.sort((a, b) => a.centroid.y - b.centroid.y || a.centroid.x - b.centroid.x);
  return shaped.map(({ points, centroid }, id) => {
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    return {
      id,
      points,
      centroid,
      bounds: { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY },
      area: triangleArea(points[0], points[1], points[2]),
      fill: pickFill(rng),
      flight: flightFor(centroid, centre, options.flight, rng),
    };
  });
}

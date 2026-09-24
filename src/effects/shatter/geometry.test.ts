import { describe, expect, it } from 'vitest';
import { Rng } from '../../lib/rng';
import {
  CELEBRATE_FLIGHT,
  SHARD_CAPS,
  SHARD_FILLS,
  chooseGrid,
  createShards,
  delaunay,
  gridSplit,
  jitteredGrid,
  pickFill,
  pointInTriangle,
  transitionFlight,
  triangleArea,
  type Density,
  type Rect,
  type Vec,
} from './geometry';

const PHONE: Rect = { x: 0, y: 0, width: 390, height: 844 };
const PROJECTOR: Rect = { x: 0, y: 0, width: 1920, height: 1080 };

const RECTS: Rect[] = [
  PHONE,
  PROJECTOR,
  { x: 10, y: 20, width: 320, height: 568 },
  { x: 100, y: 300, width: 800, height: 50 }, // a leaderboard row
  { x: 0, y: 0, width: 26, height: 26 }, // a reveal dot
  { x: 5, y: 5, width: 3000, height: 200 },
  { x: 0, y: 0, width: 50, height: 900 },
];

function opts(density: Density, seed: string | number = 'test') {
  return { seed, density, flight: transitionFlight(PROJECTOR) };
}

describe('createShards', () => {
  it('is deterministic for a seed and differs between seeds', () => {
    const a = createShards(PHONE, opts('phone', 's1'));
    const b = createShards(PHONE, opts('phone', 's1'));
    const c = createShards(PHONE, opts('phone', 's2'));
    expect(a).toEqual(b);
    expect(JSON.stringify(a)).not.toEqual(JSON.stringify(c));
  });

  it.each(['phone', 'projector'] as const)('stays within the %s cap for every rect shape', (density) => {
    for (const rect of RECTS) {
      for (let s = 0; s < 20; s++) {
        const shards = createShards(rect, opts(density, s));
        expect(shards.length).toBeGreaterThanOrEqual(2);
        expect(shards.length).toBeLessThanOrEqual(SHARD_CAPS[density]);
        expect(shards.length % 2).toBe(0);
      }
    }
  });

  it('uses (nearly) the whole budget on screen-shaped rects', () => {
    // Square-ish cells win over the last few shards (390 × 844 → 2 × 5 cells = 20).
    expect(createShards(PHONE, opts('phone')).length).toBeGreaterThanOrEqual(0.8 * 24);
    expect(createShards(PROJECTOR, opts('projector')).length).toBe(48);
  });

  it('honours maxShards, clamped to [2, cap]', () => {
    expect(createShards(PROJECTOR, { ...opts('projector'), maxShards: 8 }).length).toBeLessThanOrEqual(8);
    expect(createShards(PROJECTOR, { ...opts('projector'), maxShards: 1 }).length).toBe(2);
    expect(createShards(PROJECTOR, { ...opts('phone'), maxShards: 500 }).length).toBeLessThanOrEqual(24);
  });

  it('returns nothing for an empty rect', () => {
    expect(createShards({ x: 0, y: 0, width: 0, height: 0 }, opts('phone'))).toEqual([]);
    expect(createShards({ x: 0, y: 0, width: 100, height: 0 }, opts('phone'))).toEqual([]);
  });

  it.each(['phone', 'projector'] as const)('tiles the rect exactly (%s): areas sum to the rect area', (density) => {
    for (const rect of RECTS) {
      for (let s = 0; s < 20; s++) {
        const shards = createShards(rect, opts(density, `area-${s}`));
        const sum = shards.reduce((acc, sh) => acc + sh.area, 0);
        expect(Math.abs(sum - rect.width * rect.height)).toBeLessThan(rect.width * rect.height * 1e-6);
        const eps = 1e-6;
        const outside = shards.flatMap((sh) => sh.points).filter(
          (p) =>
            p.x < rect.x - eps || p.x > rect.x + rect.width + eps || p.y < rect.y - eps || p.y > rect.y + rect.height + eps,
        );
        expect(outside).toEqual([]);
        expect(shards.every((sh) => sh.area > 0)).toBe(true);
      }
    }
  });

  it('covers every sampled point exactly once (no gaps, no overlaps)', () => {
    const rng = new Rng('samples');
    for (const rect of [PHONE, PROJECTOR, RECTS[3]]) {
      const shards = createShards(rect, opts('projector', 'cover'));
      for (let i = 0; i < 400; i++) {
        const p = { x: rect.x + rng.float() * rect.width, y: rect.y + rng.float() * rect.height };
        const hits = shards.filter((s) => pointInTriangle(p, ...s.points, 0)).length;
        // A point exactly on a shared edge can hit two; random points essentially never do.
        expect(hits).toBe(1);
      }
    }
  });

  it('orders shards top to bottom and numbers them from 0', () => {
    const shards = createShards(PROJECTOR, opts('projector'));
    shards.forEach((s, i) => expect(s.id).toBe(i));
    for (let i = 1; i < shards.length; i++) {
      expect(shards[i].centroid.y).toBeGreaterThanOrEqual(shards[i - 1].centroid.y);
    }
  });

  it('gives transition flights 30–60 % of the viewport and rotations within ±40°', () => {
    const flight = transitionFlight(PROJECTOR);
    const shards = createShards(PROJECTOR, { seed: 'fl', density: 'projector', flight });
    for (const s of shards) {
      expect(s.flight.distance).toBeGreaterThanOrEqual(0.3 * 1920 - 1e-9);
      expect(s.flight.distance).toBeLessThanOrEqual(0.6 * 1920 + 1e-9);
      expect(Math.hypot(s.flight.dx, s.flight.dy)).toBeCloseTo(s.flight.distance, 6);
      expect(Math.abs(s.flight.rotateDeg)).toBeLessThanOrEqual(40);
    }
  });

  it('gives celebrate flights 18–40 px and ±25°', () => {
    const shards = createShards(RECTS[3], { seed: 'c', density: 'projector', flight: CELEBRATE_FLIGHT });
    for (const s of shards) {
      expect(s.flight.distance).toBeGreaterThanOrEqual(18);
      expect(s.flight.distance).toBeLessThanOrEqual(40);
      expect(Math.abs(s.flight.rotateDeg)).toBeLessThanOrEqual(25);
    }
  });

  it('points flights outward from the rect centre (within the spread)', () => {
    const shards = createShards(PROJECTOR, { seed: 'out', density: 'projector', flight: transitionFlight(PROJECTOR) });
    for (const s of shards) {
      const ox = s.centroid.x - 960;
      const oy = s.centroid.y - 540;
      const cos = (ox * s.flight.dx + oy * s.flight.dy) / (Math.hypot(ox, oy) * s.flight.distance);
      expect(cos).toBeGreaterThan(Math.cos((50 * Math.PI) / 180) - 1e-9);
    }
  });
});

describe('pickFill', () => {
  it('follows the §6.2 weights', () => {
    const rng = new Rng('weights');
    const counts = new Map<string, number>();
    const n = 20000;
    for (let i = 0; i < n; i++) {
      const f = pickFill(rng);
      counts.set(f, (counts.get(f) ?? 0) + 1);
    }
    for (const { token, weight } of SHARD_FILLS) {
      expect((counts.get(token) ?? 0) / n).toBeCloseTo(weight / 100, 1);
    }
    expect(SHARD_FILLS.reduce((s, f) => s + f.weight, 0)).toBe(100);
  });
});

describe('delaunay (Bowyer–Watson)', () => {
  it('satisfies the empty-circumcircle property on random points', () => {
    const rng = new Rng('dt');
    const pts: Vec[] = Array.from({ length: 30 }, () => ({ x: rng.float() * 1000, y: rng.float() * 600 }));
    const tris = delaunay(pts);
    expect(tris.length).toBeGreaterThan(0);
    for (const [a, b, c] of tris) {
      const [A, B, C] = [pts[a], pts[b], pts[c]];
      const d = 2 * (A.x * (B.y - C.y) + B.x * (C.y - A.y) + C.x * (A.y - B.y));
      const ux = ((A.x ** 2 + A.y ** 2) * (B.y - C.y) + (B.x ** 2 + B.y ** 2) * (C.y - A.y) + (C.x ** 2 + C.y ** 2) * (A.y - B.y)) / d;
      const uy = ((A.x ** 2 + A.y ** 2) * (C.x - B.x) + (B.x ** 2 + B.y ** 2) * (A.x - C.x) + (C.x ** 2 + C.y ** 2) * (B.x - A.x)) / d;
      const r2 = (A.x - ux) ** 2 + (A.y - uy) ** 2;
      pts.forEach((p, i) => {
        if (i === a || i === b || i === c) return;
        expect((p.x - ux) ** 2 + (p.y - uy) ** 2).toBeGreaterThanOrEqual(r2 * (1 - 1e-9));
      });
    }
  });

  it('returns nothing for fewer than 3 points', () => {
    expect(delaunay([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toEqual([]);
  });
});

describe('gridSplit (fallback)', () => {
  it('tiles the jittered grid exactly', () => {
    const rect = PROJECTOR;
    const pts = jitteredGrid(rect, 6, 4, new Rng('split'));
    const tris = gridSplit(6, 4);
    expect(tris).toHaveLength(48);
    const sum = tris.reduce((acc, [a, b, c]) => acc + triangleArea(pts[a], pts[b], pts[c]), 0);
    expect(sum).toBeCloseTo(rect.width * rect.height, 3);
  });
});

describe('chooseGrid', () => {
  it('keeps cells near square and within the cell budget', () => {
    expect(chooseGrid(PROJECTOR, 24)).toEqual({ cols: 6, rows: 4 });
    const phone = chooseGrid(PHONE, 12);
    expect(phone.cols * phone.rows).toBeLessThanOrEqual(12);
    expect(phone.rows).toBeGreaterThan(phone.cols);
    expect(chooseGrid(RECTS[3], 12).rows).toBe(1);
  });
});

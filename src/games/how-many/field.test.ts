import { describe, expect, it } from 'vitest';
import { countsFor, fieldFor, HM_GLYPH, HM_GRID, HM_JITTER } from './field';
import { HM_BANDS } from './scoring';

/** The glyph's ink (stroke 28 in a 100 box, round caps) reaches at most 49 % of its box from the centre. */
const INK_RADIUS = 0.49 * HM_GLYPH;

describe('fieldFor (docs/games/how-many.md §2)', () => {
  it('HM-T5: same seed -> same counts, cells, rotations and colours; another seed differs', () => {
    for (let i = 0; i < 3; i++) {
      const a = fieldFor('round-seed', i);
      expect(fieldFor('round-seed', i)).toBe(a); // memoised
      const copy = JSON.parse(JSON.stringify(a));
      for (let k = 0; k < 40; k++) fieldFor(`flood-${k}`, i); // evicts the cache
      const fresh = fieldFor('round-seed', i);
      expect(fresh).not.toBe(a);
      expect(fresh).toEqual(copy);
      expect(fieldFor('another-seed', i).chevrons).not.toEqual(a.chevrons);
    }
  });

  it('HM-T5: N_i in its band, one chevron per distinct cell', () => {
    for (let s = 0; s < 200; s++) {
      for (let i = 0; i < 3; i++) {
        const f = fieldFor(`seed-${s}`, i);
        const [lo, hi] = HM_BANDS[i];
        expect(f.grid).toBe(HM_GRID[i]);
        expect(f.count).toBeGreaterThanOrEqual(lo);
        expect(f.count).toBeLessThanOrEqual(hi);
        expect(f.chevrons).toHaveLength(f.count);
        expect(new Set(f.chevrons.map((c) => c.cell)).size).toBe(f.count);
        for (const c of f.chevrons) {
          expect(c.cell).toBeLessThan(f.grid * f.grid);
          expect(c.rotationDeg).toBeGreaterThanOrEqual(0);
          expect(c.rotationDeg).toBeLessThan(360);
          expect(['blue', 'amber']).toContain(c.color);
        }
      }
    }
  });

  it('HM-T6: 200 seeds x 3 flashes: every glyph inside the field, pairwise centre distance >= 0.7 cell', () => {
    for (let s = 0; s < 200; s++) {
      for (let i = 0; i < 3; i++) {
        const f = fieldFor(`layout-${s}`, i);
        for (const c of f.chevrons) {
          expect(Math.abs(c.cx - (c.col + 0.5))).toBeLessThanOrEqual(HM_JITTER);
          expect(Math.abs(c.cy - (c.row + 0.5))).toBeLessThanOrEqual(HM_JITTER);
          // the glyph box (and so its bounding circle of diameter 0.7) stays inside the field
          expect(c.cx - HM_GLYPH / 2).toBeGreaterThanOrEqual(-1e-9);
          expect(c.cy - HM_GLYPH / 2).toBeGreaterThanOrEqual(-1e-9);
          expect(c.cx + HM_GLYPH / 2).toBeLessThanOrEqual(f.grid + 1e-9);
          expect(c.cy + HM_GLYPH / 2).toBeLessThanOrEqual(f.grid + 1e-9);
        }
        let minD = Infinity;
        for (let a = 0; a < f.chevrons.length; a++) {
          for (let b = a + 1; b < f.chevrons.length; b++) {
            const p = f.chevrons[a];
            const q = f.chevrons[b];
            minD = Math.min(minD, Math.hypot(p.cx - q.cx, p.cy - q.cy));
          }
        }
        expect(minD).toBeGreaterThanOrEqual(HM_GLYPH - 1e-9);
        // rotated ink never touches: two ink circles of radius 0.343 cell
        expect(minD).toBeGreaterThan(2 * INK_RADIUS);
      }
    }
  });

  it('countsFor: every integer in the band (ADR-138); the grid holds the band maximum', () => {
    expect(countsFor(0)).toEqual([4, 5, 6, 7]);
    expect(countsFor(1)).toEqual([9, 10, 11, 12, 13]);
    expect(countsFor(2)).toEqual([14, 15, 16, 17, 18]);
    expect(HM_GRID).toEqual([4, 5, 6]);
    for (let i = 0; i < 3; i++) expect(HM_GRID[i] * HM_GRID[i]).toBeGreaterThanOrEqual(HM_BANDS[i][1]);
  });

  it('draws every count in the band and mixes both colours across seeds', () => {
    for (let i = 0; i < 3; i++) {
      const seen = new Set<number>();
      let blue = 0;
      let total = 0;
      for (let s = 0; s < 400; s++) {
        const f = fieldFor(`mix-${s}`, i);
        seen.add(f.count);
        for (const c of f.chevrons) {
          total++;
          if (c.color === 'blue') blue++;
        }
      }
      expect(seen.size).toBe(countsFor(i).length);
      expect(blue / total).toBeGreaterThan(0.45);
      expect(blue / total).toBeLessThan(0.55);
    }
  });
});

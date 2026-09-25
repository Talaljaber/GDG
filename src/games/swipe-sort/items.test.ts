import { describe, expect, it } from 'vitest';
import { itemFor, SIDE_FOR, SS_TILT_MAX_DEG } from './items';

describe('itemFor (docs/games/swipe-sort.md §2)', () => {
  it('SS-T7: same seed -> the same colour sequence (everyone in a round, reloads)', () => {
    const a = Array.from({ length: 80 }, (_, k) => itemFor('round-seed', k));
    const b = Array.from({ length: 80 }, (_, k) => itemFor('round-seed', k));
    expect(a).toEqual(b);
    const c = Array.from({ length: 80 }, (_, k) => itemFor('another-seed', k));
    expect(c.map((i) => i.color)).not.toEqual(a.map((i) => i.color));
  });

  it('SS-T7: over 200 items, 40-60 % are blue (several seeds)', () => {
    for (const seed of ['s1', 's2', 's3', 'preview-seed', 'worst-case:swipe_sort']) {
      const blue = Array.from({ length: 200 }, (_, k) => itemFor(seed, k)).filter((i) => i.color === 'blue').length;
      expect(blue).toBeGreaterThanOrEqual(80);
      expect(blue).toBeLessThanOrEqual(120);
    }
  });

  it('the chevron points the way it must be swiped: blue left, amber right (the shape cue)', () => {
    expect(SIDE_FOR).toEqual({ blue: 'left', amber: 'right' });
    for (let k = 0; k < 100; k++) {
      const item = itemFor('cue', k);
      expect(item.side).toBe(SIDE_FOR[item.color]);
    }
  });

  it('tilts are integers within -12..+12 degrees and vary', () => {
    const tilts = new Set<number>();
    for (let k = 0; k < 200; k++) {
      const { tiltDeg } = itemFor('tilt', k);
      expect(Number.isInteger(tiltDeg)).toBe(true);
      expect(Math.abs(tiltDeg)).toBeLessThanOrEqual(SS_TILT_MAX_DEG);
      tilts.add(tiltDeg);
    }
    expect(tilts.size).toBeGreaterThan(15);
  });
});

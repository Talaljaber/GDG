import { describe, expect, it } from 'vitest';
import { ICON_IDS, layoutFor, PR_TILES } from './layout';

describe('layoutFor (docs/games/pairs.md §2)', () => {
  it('PR-T9: same seed -> the same 16-icon layout (everyone in a round, reloads)', () => {
    expect(layoutFor('round-seed')).toEqual(layoutFor('round-seed'));
    expect(layoutFor('another-seed')).not.toEqual(layoutFor('round-seed'));
  });

  it('PR-T9: 16 tiles, each of the 8 icons exactly twice', () => {
    for (const seed of ['s1', 's2', 's3', 'preview-seed', '']) {
      const board = layoutFor(seed);
      expect(board).toHaveLength(PR_TILES);
      for (const id of ICON_IDS) expect(board.filter((x) => x === id)).toHaveLength(2);
    }
  });

  it('is actually shuffled (not the sorted deck) and varies across seeds', () => {
    const sorted = ICON_IDS.flatMap((id) => [id, id]);
    const boards = Array.from({ length: 20 }, (_, i) => layoutFor(`seed-${i}`).join(','));
    expect(boards).not.toContain(sorted.join(','));
    expect(new Set(boards).size).toBe(20);
  });

  it('the fixed icon set of the plan, in order', () => {
    expect(ICON_IDS).toEqual(['bug', 'coffee', 'terminal', 'branch', 'cloud', 'bulb', 'rocket', 'gear']);
  });
});

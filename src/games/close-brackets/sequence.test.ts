import { describe, expect, it } from 'vitest';
import { BRACKET_KINDS, expectedCloser, openersFor } from './sequence';

describe('openersFor (docs/games/close-brackets.md §2)', () => {
  it('CB-T9: same seed, length and index -> identical openers (reload, everyone in a round)', () => {
    expect(openersFor('round-seed', 5, 0)).toEqual(openersFor('round-seed', 5, 0));
    expect(openersFor('round-seed', 5, 0)).not.toEqual(openersFor('other-seed', 5, 0));
  });

  it('has the requested length, only known kinds and never two identical neighbours', () => {
    for (let len = 2; len <= 8; len++) {
      for (let k = 0; k < 40; k++) {
        const seq = openersFor(`seed-${k}`, len, k % 3);
        expect(seq).toHaveLength(len);
        seq.forEach((kind, i) => {
          expect(BRACKET_KINDS).toContain(kind);
          if (i > 0) expect(kind).not.toBe(seq[i - 1]);
        });
      }
    }
  });

  it('uses every kind in every position over many seeds (no fixed pattern)', () => {
    const first = new Set<string>();
    const last = new Set<string>();
    for (let k = 0; k < 200; k++) {
      const seq = openersFor(`s${k}`, 6, 0);
      first.add(seq[0]);
      last.add(seq[5]);
    }
    expect(first.size).toBe(4);
    expect(last.size).toBe(4);
  });

  it('expectedCloser walks the openers from the last one', () => {
    const seq = ['curly', 'round', 'square', 'angle'] as const;
    expect([0, 1, 2, 3, 4].map((c) => expectedCloser(seq, c))).toEqual(['angle', 'square', 'round', 'curly', null]);
  });
});

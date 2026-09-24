import { describe, expect, it } from 'vitest';
import { Rng, int, pick, sampleWithoutReplacement, shuffle } from './rng';

describe('Rng determinism', () => {
  it('produces the same float sequence for the same string seed', () => {
    const a = new Rng('round-abc-123');
    const b = new Rng('round-abc-123');
    const seqA = Array.from({ length: 20 }, () => a.float());
    const seqB = Array.from({ length: 20 }, () => b.float());
    expect(seqA).toEqual(seqB);
  });

  it('produces the same float sequence for the same numeric seed', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    expect(a.float()).toBe(b.float());
    expect(a.float()).toBe(b.float());
  });

  it('produces different sequences for different seeds', () => {
    const a = new Rng('seed-one');
    const b = new Rng('seed-two');
    const seqA = Array.from({ length: 10 }, () => a.float());
    const seqB = Array.from({ length: 10 }, () => b.float());
    expect(seqA).not.toEqual(seqB);
  });

  it('shuffle is deterministic for the same seed', () => {
    const items = Array.from({ length: 12 }, (_, i) => i);
    expect(shuffle('same-seed', items)).toEqual(shuffle('same-seed', items));
  });

  it('shuffle does not mutate the input array', () => {
    const items = [1, 2, 3, 4, 5];
    const copy = items.slice();
    shuffle('seed', items);
    expect(items).toEqual(copy);
  });

  it('sampleWithoutReplacement is deterministic and has no duplicates', () => {
    const items = Array.from({ length: 30 }, (_, i) => i);
    const sample1 = sampleWithoutReplacement('trivia-seed', items, 10);
    const sample2 = sampleWithoutReplacement('trivia-seed', items, 10);
    expect(sample1).toEqual(sample2);
    expect(new Set(sample1).size).toBe(10);
  });
});

describe('Rng uniformity sanity', () => {
  it('int(n) stays within [0, n) across many draws', () => {
    const rng = new Rng('range-check');
    for (let i = 0; i < 5000; i++) {
      const v = rng.int(7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(7);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it('int(n) roughly covers all buckets with a large sample (chi-square-ish sanity)', () => {
    const rng = new Rng('bucket-coverage');
    const n = 6;
    const counts = new Array(n).fill(0);
    const draws = 60_000;
    for (let i = 0; i < draws; i++) {
      counts[rng.int(n)] += 1;
    }
    const expected = draws / n;
    for (const count of counts) {
      // Allow generous 20% deviation from uniform — this is a sanity check,
      // not a rigorous statistical test.
      expect(count).toBeGreaterThan(expected * 0.8);
      expect(count).toBeLessThan(expected * 1.2);
    }
  });

  it('pick() only returns items from the input array', () => {
    const rng = new Rng('pick-check');
    const items = ['a', 'b', 'c', 'd'];
    for (let i = 0; i < 200; i++) {
      expect(items).toContain(rng.pick(items));
    }
  });

  it('shuffle() is a permutation (same multiset of elements)', () => {
    const items = Array.from({ length: 15 }, (_, i) => i);
    const shuffled = shuffle('perm-check', items);
    expect(shuffled.slice().sort((a, b) => a - b)).toEqual(items);
  });
});

describe('module-level convenience helpers', () => {
  it('int/pick/shuffle/sampleWithoutReplacement match a Rng built from the same seed', () => {
    expect(int('x', 100)).toBe(new Rng('x').int(100));
    expect(pick('y', [1, 2, 3])).toBe(new Rng('y').pick([1, 2, 3]));
    expect(shuffle('z', [1, 2, 3])).toEqual(new Rng('z').shuffle([1, 2, 3]));
    expect(sampleWithoutReplacement('w', [1, 2, 3, 4], 2)).toEqual(
      new Rng('w').sampleWithoutReplacement([1, 2, 3, 4], 2),
    );
  });

  it('pick() throws on empty array', () => {
    expect(() => pick('seed', [])).toThrow();
  });

  it('int() throws on n <= 0', () => {
    expect(() => int('seed', 0)).toThrow();
  });
});

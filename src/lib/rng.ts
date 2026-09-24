/**
 * Seeded RNG for deterministic shuffles, layouts and sequences (used by
 * games so a given round seed always produces the same layout).
 *
 * Algorithm: mulberry32, seeded from a string via a small string hash
 * (xmur3-style). Not cryptographically secure — not needed for game boards.
 */

/** Hashes a string into a 32-bit seed, for feeding into mulberry32. */
function hashStringToSeed(seed: string): number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  // Final avalanche, so short/similar seeds don't produce similar outputs.
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  h ^= h >>> 16;
  return h >>> 0;
}

/** mulberry32: fast, small, decent-quality 32-bit PRNG. Returns a [0, 1) generator. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  private readonly next: () => number;

  constructor(seed: string | number) {
    const numericSeed = typeof seed === 'string' ? hashStringToSeed(seed) : seed >>> 0;
    this.next = mulberry32(numericSeed);
  }

  /** Next float in [0, 1). */
  float(): number {
    return this.next();
  }

  /** Random integer in [0, n). */
  int(n: number): number {
    if (!Number.isFinite(n) || n <= 0) {
      throw new RangeError('int(n) requires n > 0');
    }
    return Math.floor(this.next() * n);
  }

  /** Picks a uniformly random element from a non-empty array. */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new RangeError('pick() requires a non-empty array');
    }
    return items[this.int(items.length)];
  }

  /** Returns a new array with the items shuffled (Fisher-Yates), input unchanged. */
  shuffle<T>(items: readonly T[]): T[] {
    const result = items.slice();
    for (let i = result.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  /** Samples `count` distinct elements without replacement, in random order. */
  sampleWithoutReplacement<T>(items: readonly T[], count: number): T[] {
    if (count < 0 || count > items.length) {
      throw new RangeError('sampleWithoutReplacement: count out of range');
    }
    return this.shuffle(items).slice(0, count);
  }
}

/** Convenience: int(n) using a fresh Rng from the given seed. */
export function int(seed: string | number, n: number): number {
  return new Rng(seed).int(n);
}

/** Convenience: pick() using a fresh Rng from the given seed. */
export function pick<T>(seed: string | number, items: readonly T[]): T {
  return new Rng(seed).pick(items);
}

/** Convenience: shuffle() using a fresh Rng from the given seed. */
export function shuffle<T>(seed: string | number, items: readonly T[]): T[] {
  return new Rng(seed).shuffle(items);
}

/** Convenience: sampleWithoutReplacement() using a fresh Rng from the given seed. */
export function sampleWithoutReplacement<T>(
  seed: string | number,
  items: readonly T[],
  count: number,
): T[] {
  return new Rng(seed).sampleWithoutReplacement(items, count);
}

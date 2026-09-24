import { describe, expect, it } from 'vitest';
import { SIMON_PADS, generateSimonSequence } from './sequence';

describe('generateSimonSequence', () => {
  it('is deterministic for a given seed', () => {
    expect(generateSimonSequence('round-1', 15)).toEqual(generateSimonSequence('round-1', 15));
  });

  it('differs for different seeds (with overwhelming probability)', () => {
    expect(generateSimonSequence('round-1', 15)).not.toEqual(generateSimonSequence('round-2', 15));
  });

  it('returns only valid pads', () => {
    const seq = generateSimonSequence('seed-x', 15);
    expect(seq.every((pad) => (SIMON_PADS as readonly string[]).includes(pad))).toBe(true);
  });

  it('returns the requested length', () => {
    expect(generateSimonSequence('seed-x', 0)).toHaveLength(0);
    expect(generateSimonSequence('seed-x', 3)).toHaveLength(3);
    expect(generateSimonSequence('seed-x', 15)).toHaveLength(15);
  });

  it('never repeats the same pad three times in a row', () => {
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']) {
      const seq = generateSimonSequence(seed, 15);
      for (let i = 2; i < seq.length; i++) {
        const runOfThree = seq[i] === seq[i - 1] && seq[i] === seq[i - 2];
        expect(runOfThree).toBe(false);
      }
    }
  });

  it('is prefix-stable: a shorter request matches the start of a longer one', () => {
    const full = generateSimonSequence('stable-seed', 15);
    for (let length = 0; length <= 15; length++) {
      expect(generateSimonSequence('stable-seed', length)).toEqual(full.slice(0, length));
    }
  });

  it('draws each pad with roughly uniform frequency over many seeds', () => {
    const counts: Record<string, number> = { up: 0, right: 0, left: 0, down: 0 };
    const seeds = 500;
    for (let i = 0; i < seeds; i++) {
      const [pad] = generateSimonSequence(`uniform-${i}`, 1);
      counts[pad] += 1;
    }
    for (const pad of SIMON_PADS) {
      // Expected 125 per pad out of 500 draws; allow generous slack for a
      // pseudo-random stream (this is not a statistical rigor test).
      expect(counts[pad]).toBeGreaterThan(75);
      expect(counts[pad]).toBeLessThan(175);
    }
  });

  it('rejects a length of -1', () => {
    expect(() => generateSimonSequence('seed', -1)).toThrow(RangeError);
  });
});

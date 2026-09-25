import { describe, expect, it } from 'vitest';
import { CC_BLOCK_SIZE, CC_CONGRUENT_PER_BLOCK, INKS, trialFor } from './trials';

describe('trialFor (docs/games/color-clash.md §2)', () => {
  it('CC-T7: same seed -> the same (word, ink) sequence (everyone in a round, reloads)', () => {
    const a = Array.from({ length: 40 }, (_, k) => trialFor('round-seed', k));
    const b = Array.from({ length: 40 }, (_, k) => trialFor('round-seed', k));
    expect(a).toEqual(b);
    const c = Array.from({ length: 40 }, (_, k) => trialFor('another-seed', k));
    expect(c).not.toEqual(a);
  });

  it('CC-T7: exactly 3 congruent trials in every block of 10', () => {
    for (const seed of ['s1', 's2', 's3', 'preview-seed']) {
      for (let block = 0; block < 6; block++) {
        let congruent = 0;
        for (let i = 0; i < CC_BLOCK_SIZE; i++) {
          const trial = trialFor(seed, block * CC_BLOCK_SIZE + i);
          expect(trial.congruent).toBe(trial.word === trial.ink);
          if (trial.congruent) congruent++;
        }
        expect(congruent).toBe(CC_CONGRUENT_PER_BLOCK);
      }
    }
  });

  it('uses all three inks and all three words', () => {
    const inks = new Set<string>();
    const words = new Set<string>();
    for (let k = 0; k < 60; k++) {
      const trial = trialFor('mix', k);
      expect(INKS).toContain(trial.ink);
      expect(INKS).toContain(trial.word);
      inks.add(trial.ink);
      words.add(trial.word);
    }
    expect(inks.size).toBe(3);
    expect(words.size).toBe(3);
  });
});

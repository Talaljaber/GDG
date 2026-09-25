/**
 * Seeded trials for Color Clash. Source of truth: docs/games/color-clash.md §2.
 * Blocks of 10 trials with exactly 3 congruent ones (positions shuffled by
 * Rng("<seed>:cc:block<b>")); trial k's ink and word from Rng("<seed>:cc:trial<k>").
 * Everyone in a round sees the same (word, ink) sequence; a reload shows the
 * same trial again.
 */
import { Rng } from '../../lib/rng';

/** The three inks, in the fixed button order. */
export const INKS = ['blue', 'amber', 'charcoal'] as const;
export type Ink = (typeof INKS)[number];

export const CC_BLOCK_SIZE = 10;
export const CC_CONGRUENT_PER_BLOCK = 3;

export interface ColorClashTrial {
  /** The colour the word names. */
  word: Ink;
  /** The colour it is printed in (the right answer). */
  ink: Ink;
  congruent: boolean;
}

function congruentPositions(seed: string, block: number): Set<number> {
  const positions = Array.from({ length: CC_BLOCK_SIZE }, (_, i) => i);
  return new Set(new Rng(`${seed}:cc:block${block}`).sampleWithoutReplacement(positions, CC_CONGRUENT_PER_BLOCK));
}

/** Trial k (0-based) of the round. */
export function trialFor(seed: string, k: number): ColorClashTrial {
  const block = Math.floor(k / CC_BLOCK_SIZE);
  const congruent = congruentPositions(seed, block).has(k % CC_BLOCK_SIZE);
  const rng = new Rng(`${seed}:cc:trial${k}`);
  const inkIndex = rng.int(INKS.length);
  const wordIndex = congruent ? inkIndex : (inkIndex + 1 + rng.int(INKS.length - 1)) % INKS.length;
  return { word: INKS[wordIndex], ink: INKS[inkIndex], congruent };
}

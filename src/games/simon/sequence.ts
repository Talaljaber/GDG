/**
 * Seeded pad sequence generator for Simon. Source of truth:
 * docs/games/simon.md §2 (pads), §9 (reload keeps the same seed).
 *
 * Deterministic and prefix-stable: generateSimonSequence(seed, N) always
 * starts with generateSimonSequence(seed, M) for M <= N, because each pad
 * is drawn in order from a single seeded stream and only depends on the
 * pads already drawn before it, never on the requested total length.
 */
import { Rng } from '../../lib/rng';
import { SIMON_MAX_LEVEL } from './scoring';

/** The four pads, in no particular order (position/colour mapping lives in the component). */
export const SIMON_PADS = ['up', 'right', 'left', 'down'] as const;

export type SimonPad = (typeof SIMON_PADS)[number];

/**
 * Generates `length` pads (default the max game length) uniformly at random
 * from the per-round seed, rejecting a third identical pad in a row
 * (docs/games/simon.md §2 "Sequence generation").
 */
export function generateSimonSequence(seed: string, length: number = SIMON_MAX_LEVEL): SimonPad[] {
  if (!Number.isInteger(length) || length < 0) {
    throw new RangeError('generateSimonSequence: length must be a non-negative integer');
  }
  const rng = new Rng(`simon:${seed}`);
  const sequence: SimonPad[] = [];
  for (let i = 0; i < length; i++) {
    let pad: SimonPad;
    do {
      pad = rng.pick(SIMON_PADS);
    } while (i >= 2 && pad === sequence[i - 1] && pad === sequence[i - 2]);
    sequence.push(pad);
  }
  return sequence;
}

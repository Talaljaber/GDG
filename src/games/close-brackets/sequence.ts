/**
 * Seeded opening sequences for Close the Brackets. Source of truth:
 * docs/games/close-brackets.md §2. The k-th sequence of length L comes from
 * Rng("<seed>:cb:L<L>:<k>"), so everyone in a round who reaches a length sees
 * the same openers, and a reload shows the same sequence again.
 */
import { Rng } from '../../lib/rng';

/** The four bracket kinds, in the fixed button order `)` `]` `}` `>`. */
export const BRACKET_KINDS = ['round', 'square', 'curly', 'angle'] as const;
export type BracketKind = (typeof BRACKET_KINDS)[number];

/**
 * The openers of the k-th sequence of the given length: uniform over the
 * kinds, never two identical neighbours.
 */
export function openersFor(seed: string, length: number, index: number): BracketKind[] {
  const rng = new Rng(`${seed}:cb:L${length}:${index}`);
  const out: BracketKind[] = [];
  let prev = -1;
  for (let i = 0; i < length; i++) {
    const k = prev < 0 ? rng.int(BRACKET_KINDS.length) : (prev + 1 + rng.int(BRACKET_KINDS.length - 1)) % BRACKET_KINDS.length;
    out.push(BRACKET_KINDS[k]);
    prev = k;
  }
  return out;
}

/** The closer the player must tap next, after `closed` correct closers (last opener first). */
export function expectedCloser(openers: readonly BracketKind[], closed: number): BracketKind | null {
  const i = openers.length - 1 - closed;
  return i >= 0 ? openers[i] : null;
}

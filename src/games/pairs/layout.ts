/**
 * Seeded board for Pairs. Source of truth: docs/games/pairs.md §2.
 * Fisher-Yates (Rng.shuffle) over the 16 positions of [icon0, icon0, ..., icon7, icon7]
 * with Rng("<seed>:pr:layout"): everyone in a round sees the same board, and a
 * reload shows it again.
 */
import { Rng } from '../../lib/rng';

/** The eight icons, in their fixed order (names: COPY `game.pairs.icon.<id>`). */
export const ICON_IDS = ['bug', 'coffee', 'terminal', 'branch', 'cloud', 'bulb', 'rocket', 'gear'] as const;
export type IconId = (typeof ICON_IDS)[number];

/** 4 x 4 board. */
export const PR_COLUMNS = 4;
export const PR_TILES = ICON_IDS.length * 2;

/** The 16 icons of the round's board, row by row (index = tile position). */
export function layoutFor(seed: string): IconId[] {
  const deck = ICON_IDS.flatMap((id) => [id, id]);
  return new Rng(`${seed}:pr:layout`).shuffle(deck);
}

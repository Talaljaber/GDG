/**
 * Lineup picker rules (`SCREENS.md` H1, ADR-012, ADR-120): tap a game card
 * to add it in order, tap again to remove it; exactly ROUNDS_PER_SESSION
 * distinct games from the registered ones make a valid lineup.
 */
import type { GameId } from '../games/types';

export function toggleLineup(lineup: readonly GameId[], game: GameId, max: number): GameId[] {
  if (lineup.includes(game)) return lineup.filter((g) => g !== game);
  if (lineup.length >= max) return [...lineup];
  return [...lineup, game];
}

export function isLineupValid(lineup: readonly GameId[], registered: readonly GameId[], count: number): boolean {
  return (
    lineup.length === count &&
    new Set(lineup).size === lineup.length &&
    lineup.every((g) => registered.includes(g))
  );
}

/** The first `count` registered games, used when no lineup exists yet. */
export function defaultLineup(registered: readonly GameId[], count: number): GameId[] {
  return registered.slice(0, count);
}

export function sameLineup(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((g, i) => g === b[i]);
}

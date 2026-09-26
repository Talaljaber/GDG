/**
 * The seed a game gets for a round (`GameProps.seed`). Pure, no React.
 *
 * Default (`seedScope: 'round'`): the round id, the same on every phone, so everyone in a round
 * sees the same How Many? fields, Pairs board and Swipe Sort / Color Clash / Close the Brackets
 * sequences (ADR-134 (2), ADR-136 (1)), and the H3 How Many? reveal centres on the count everyone
 * saw. `seedScope: 'player'` (Trivia, ADR-027): `${roundId}:${playerRowId}`, one draw per player.
 *
 * The shell persists the seed it used (`gdg.v1.current.seed`) and a reload reuses that stored
 * value, so a phone that began a round before this rule keeps its old seed until the round ends.
 */
import { games } from '../games/registry';
import type { GameId } from '../games/types';

export function gameSeed(game: GameId, roundId: string, playerRowId: string): string {
  // A game left out of the registry (e.g. Trivia with < 5 ready questions) falls back to the round id.
  return games[game]?.seedScope === 'player' ? `${roundId}:${playerRowId}` : roundId;
}

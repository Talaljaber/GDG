/**
 * The registry of playable games. Source of truth: docs/ARCHITECTURE.md §7.
 * `Partial` because a game can be left out (e.g. Trivia without enough ready questions).
 */
import type { GameId, GameModule } from './types';
import { stopTheClock } from './stop-the-clock';
import { oddOneOut } from './odd-one-out';
import { simon } from './simon';
import { perfectCircle } from './perfect-circle';
import { trivia } from './trivia';
import { closeBrackets } from './close-brackets';
import { colorClash } from './color-clash';
import { howMany } from './how-many';
import { swipeSort } from './swipe-sort';
import { pairs } from './pairs';
import { isTriviaAvailable } from './trivia/draw';
import { triviaPoolFile as poolFile } from './trivia/pool';

// The registry is intentionally heterogeneous: each game's GameModule<S> has
// its own snapshot type, and GameModule<S> is invariant in S (S appears in
// both onProgress's parameter and score/raw positions), so no single
// concrete type fits here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const games: Partial<Record<GameId, GameModule<any>>> = {
  stop_the_clock: stopTheClock,
  odd_one_out: oddOneOut,
  simon,
  perfect_circle: perfectCircle,
  // Trivia needs at least 5 ready questions (docs/games/trivia.md §2 step 6).
  ...(isTriviaAvailable(poolFile.questions) ? { trivia } : {}),
  close_brackets: closeBrackets,
  color_clash: colorClash,
  how_many: howMany,
  swipe_sort: swipeSort,
  pairs,
};

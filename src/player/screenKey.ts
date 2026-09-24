/**
 * Screen keys for the phone's shatter transitions (`DESIGN_SYSTEM.md` §6.2):
 * join → lobby, round → intermission, intermission → next round, results,
 * day board. A round's intro (3-2-1), game and own result share one key, so
 * nothing plays between them: an effect must never cover or delay a game
 * (`.claude/rules/games.md`). The intermission steps share one key too
 * (phones get lighter effects than the projector).
 */
import { LOADING_KEY } from '../components/ScreenTransition';
import type { PlayerView } from './playerFlow';

export function phoneScreenKey(view: PlayerView): string {
  switch (view.screen) {
    case 'loading':
      return LOADING_KEY;
    case 'intro':
    case 'game':
      return `round:${view.round.id}`;
    case 'round_result':
      return view.round ? `round:${view.round.id}` : 'round_result';
    case 'intermission':
      return `intermission:${view.round.id}`;
    default:
      return view.screen;
  }
}

/** Changes that swap at once: anything into a game screen (a reload mid-attempt, E2). */
export function phoneSwapIsInstant(view: PlayerView): boolean {
  return view.screen === 'game';
}

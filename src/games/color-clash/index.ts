import type { GameModule } from '../types';
import { ColorClash, type ColorClashSnapshot } from './ColorClash';
import { scoreColorClash } from './scoring';

/**
 * Worst-case round length per docs/SCORING.md §2 / docs/games/color-clash.md §3:
 * 1.5 s intro + the 30 s game clock (gaps run inside it) = 31.5 s, rounded
 * up; well inside the 120 s cap.
 */
export const COLOR_CLASH_WORST_CASE_MS = 32_000;

export const colorClash: GameModule<ColorClashSnapshot> = {
  id: 'color_clash',
  Component: ColorClash,
  score: scoreColorClash,
  worstCaseMs: COLOR_CLASH_WORST_CASE_MS,
};

export default colorClash;
export type { ColorClashSnapshot };

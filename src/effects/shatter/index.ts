/**
 * Mosaic shatter effect layer (docs/DESIGN_SYSTEM.md §6.2). Public API —
 * see README.md in this folder.
 */
export { ShatterProvider } from './ShatterProvider';
export { ShatterTransition, type ShatterTransitionProps, type TransitionKey } from './ShatterTransition';
export { Celebrate, type CelebrateProps } from './Celebrate';
export { ShatterIn, type ShatterInProps } from './ShatterIn';
export { DayBoardMerge, type DayBoardMergeProps } from './DayBoardMerge';
export { ShatterBurst, type ShatterBurstProps } from './ShatterBurst';
export { useCelebrate, type CelebrateControls, type UseCelebrateOptions } from './hooks';
export { useReducedMotion, useDensity, usePrefersReducedMotion, prefersReducedMotion, type ShatterSettings } from './settings';
export {
  playScreenShatter,
  playCelebrate,
  playShatterIn,
  playBurst,
  revealSchedule,
  shardsPerItem,
  type ShatterHandle,
  type ScreenShatterOptions,
  type CelebrateOptions,
  type ShatterInOptions,
  type BurstOptions,
  type RevealSlot,
} from './plays';
export {
  playDayBoardMerge,
  mergeSchedule,
  type DayBoardMergeGame,
  type DayBoardMergeOptions,
  type MergeTarget,
} from './merge';
export {
  TRANSITION_TIMELINE,
  CELEBRATE_TIMELINE,
  SHATTER_IN_TIMELINE,
  DAY_BOARD_MERGE_TIMELINE,
  STC_REVEAL_TIMELINE,
  REDUCED_CROSSFADE_MS,
  SHARD_FADE_MS,
  mergeTotalMs,
} from './motion';
export { SHARD_CAPS, SHARD_FILLS, createShards, type Density, type Shard, type Rect } from './geometry';

/** Put on the logo (or its wrapper) so it stays above every shard layer (§5). */
export const SHATTER_LOGO_CLASS = 'gdg-shatter-logo-safe';
/** Class of every shard overlay (fixed, z-index var(--z-shatter)). */
export const SHATTER_LAYER_CLASS = 'gdg-shatter-layer';
/** CSS custom properties for the layer order (defined in shatter.css). */
export const SHATTER_Z_TOKENS = { layer: '--z-shatter', logo: '--z-shatter-logo' } as const;

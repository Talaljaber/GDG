import { createElement, useRef, type ReactNode } from 'react';
import type { Density } from './geometry';
import { useLatest, useReplay } from './hooks';
import { SHATTER_IN_TIMELINE } from './motion';
import { playShatterIn } from './plays';
import { useDensity, useReducedMotion } from './settings';

export interface ShatterInProps {
  /** ms before the first row starts (default 0); all times below shift by it. */
  delay?: number;
  /** ms between rows (default 60, §6.2). */
  stagger?: number;
  /** ms per row (default 500, §6.2). */
  itemDuration?: number;
  /** Element rendered as the container (default 'div'; 'ol'/'ul' for boards). */
  as?: 'div' | 'ol' | 'ul' | 'li' | 'span' | 'section';
  /** Rows = elements matching this inside the container; default: direct children. */
  itemSelector?: string;
  /** Replays when this changes. */
  trigger?: unknown;
  /** Default true: rows assemble as the board mounts. */
  playOnMount?: boolean;
  density?: Density;
  reducedMotion?: boolean;
  seed?: string | number;
  className?: string;
  'data-testid'?: string;
  /** Row i at i·stagger + itemDuration (all at 0 with reduced motion). */
  onItemRevealed?: (index: number) => void;
  /** (n−1)·stagger + itemDuration (200 ms with reduced motion). */
  onDone?: () => void;
  children?: ReactNode;
}

/**
 * Rows assemble from shards top to bottom (§6.2 "Round results
 * shatter-in"). Rows present when it plays are animated; rows added later
 * simply appear (bump `trigger` to replay). Reduced motion: 200 ms fade.
 */
export function ShatterIn({
  delay = 0,
  stagger = SHATTER_IN_TIMELINE.staggerMs,
  itemDuration = SHATTER_IN_TIMELINE.itemMs,
  as = 'div',
  itemSelector,
  trigger,
  playOnMount = true,
  density,
  reducedMotion,
  seed,
  className,
  'data-testid': testId,
  onItemRevealed,
  onDone,
  children,
}: ShatterInProps) {
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion(reducedMotion);
  const effectiveDensity = useDensity(density);
  const callbacks = useLatest({ onItemRevealed, onDone });
  useReplay(trigger, playOnMount, () => {
    const root = ref.current;
    if (!root) return null;
    const items = itemSelector ? Array.from(root.querySelectorAll(itemSelector)) : Array.from(root.children);
    return playShatterIn(items, {
      delayMs: delay,
      staggerMs: stagger,
      itemMs: itemDuration,
      density: effectiveDensity,
      seed,
      reducedMotion: reduced,
      onItemRevealed: (i) => callbacks.current.onItemRevealed?.(i),
      onDone: () => callbacks.current.onDone?.(),
    });
  });
  return createElement(as, { ref, className, 'data-testid': testId, 'data-shatter': 'in' }, children);
}

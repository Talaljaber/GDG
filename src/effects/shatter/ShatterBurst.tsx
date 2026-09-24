import { useRef, type ReactNode } from 'react';
import type { Density } from './geometry';
import { useLatest, useReplay } from './hooks';
import { playBurst } from './plays';
import { useDensity, useReducedMotion } from './settings';

export interface ShatterBurstProps {
  /** ms after mount (or trigger change) at which the dot appears. */
  delay?: number;
  /** Shards in the burst; use revealSchedule() to stay within the cap. 0 = plain fade-in. */
  shards?: number;
  /** Replays when this changes. */
  trigger?: unknown;
  /** Default true: the reveal plays as the dots mount. */
  playOnMount?: boolean;
  density?: Density;
  reducedMotion?: boolean;
  seed?: string | number;
  onAppear?: () => void;
  onDone?: () => void;
  /** Exactly one element: the dot. Its own transform is never touched. */
  children: ReactNode;
}

/**
 * A guess dot that appears in a small shatter burst (Stop the Clock reveal,
 * §6.2). Hidden until `delay`; with reduced motion it just fades in (200 ms).
 */
export function ShatterBurst({
  delay = 0,
  shards,
  trigger,
  playOnMount = true,
  density,
  reducedMotion,
  seed,
  onAppear,
  onDone,
  children,
}: ShatterBurstProps) {
  const wrap = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion(reducedMotion);
  const effectiveDensity = useDensity(density ?? 'projector');
  const callbacks = useLatest({ onAppear, onDone });
  useReplay(trigger, playOnMount, () => {
    const el = wrap.current?.firstElementChild;
    if (!el) return null;
    return playBurst(el, {
      delayMs: delay,
      shards,
      density: effectiveDensity,
      seed,
      reducedMotion: reduced,
      onAppear: () => callbacks.current.onAppear?.(),
      onDone: () => callbacks.current.onDone?.(),
    });
  });
  return (
    <span ref={wrap} className="gdg-shatter-contents" data-shatter="burst">
      {children}
    </span>
  );
}

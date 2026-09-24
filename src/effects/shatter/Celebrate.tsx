import { useRef, type ReactNode } from 'react';
import type { Density } from './geometry';
import { useLatest, useReplay } from './hooks';
import { playCelebrate } from './plays';
import { useDensity, useReducedMotion } from './settings';

export interface CelebrateProps {
  /** Plays whenever this value changes (e.g. a counter). */
  trigger: unknown;
  /** Also play on mount (default false). */
  playOnMount?: boolean;
  density?: Density;
  reducedMotion?: boolean;
  seed?: string | number;
  /** 1200 ms (0 with reduced motion). */
  onFused?: () => void;
  /** 1800 ms. */
  onDone?: () => void;
  /** Exactly one element: the box that fragments and reassembles. */
  children: ReactNode;
}

/**
 * Fragment & reassemble (§6.2) over its single child element. Renders a
 * `display: contents` wrapper, so the child keeps its place in the layout.
 * For list rows (<li> in an <ol>) prefer `useCelebrate` on the row itself.
 */
export function Celebrate({ trigger, playOnMount = false, density, reducedMotion, seed, onFused, onDone, children }: CelebrateProps) {
  const wrap = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion(reducedMotion);
  const effectiveDensity = useDensity(density);
  const callbacks = useLatest({ onFused, onDone });
  useReplay(trigger, playOnMount, () => {
    const el = wrap.current?.firstElementChild;
    if (!(el instanceof HTMLElement)) return null;
    return playCelebrate(el, {
      density: effectiveDensity,
      seed,
      reducedMotion: reduced,
      onFused: () => callbacks.current.onFused?.(),
      onDone: () => callbacks.current.onDone?.(),
    });
  });
  return (
    <span ref={wrap} className="gdg-shatter-contents" data-shatter="celebrate">
      {children}
    </span>
  );
}

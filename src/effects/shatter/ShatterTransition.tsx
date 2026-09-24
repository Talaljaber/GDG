import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { Density } from './geometry';
import { useLatest } from './hooks';
import { REDUCED_CROSSFADE_MS, readEasing } from './motion';
import { playScreenShatter, type ShatterHandle } from './plays';
import { safeAnimate } from './renderer';
import { useDensity, useReducedMotion } from './settings';

export type TransitionKey = string | number;

export interface ShatterTransitionProps {
  /** Identity of the current screen; changing it plays the transition. */
  transitionKey: TransitionKey;
  density?: Density;
  reducedMotion?: boolean;
  seed?: string | number;
  className?: string;
  'data-testid'?: string;
  /** 0 ms: the key changed and the transition began. */
  onStart?: (to: TransitionKey) => void;
  /** 320 ms (0 with reduced motion): the new children are now rendered. */
  onSwap?: (to: TransitionKey) => void;
  /** 700 ms (200 with reduced motion). */
  onDone?: (to: TransitionKey) => void;
  children: ReactNode;
}

type Phase = 'idle' | 'in' | 'out' | 'crossfade';

/**
 * Screen transition (§6.2). While the shards fly in (0–320 ms) the previous
 * children stay on screen; at 320 ms the new children mount underneath the
 * tiled shards, which then burst out and fade (320–700 ms). Changes of
 * `transitionKey` during the fly-in are folded into the same swap; a change
 * during the burst starts a new transition.
 *
 * Reduced motion: both screens are stacked in one grid cell and crossfade
 * for 200 ms; the leaving copy is aria-hidden and not clickable.
 *
 * Keep the logo outside this component (or give it `SHATTER_LOGO_CLASS`);
 * the content cells never get a transform or opacity in full motion, so
 * the class keeps it above the shard layer.
 */
export function ShatterTransition({
  transitionKey,
  density,
  reducedMotion,
  seed,
  className,
  'data-testid': testId,
  onStart,
  onSwap,
  onDone,
  children,
}: ShatterTransitionProps) {
  const reduced = useReducedMotion(reducedMotion);
  const effectiveDensity = useDensity(density);
  const [shownKey, setShownKey] = useState<TransitionKey>(transitionKey);
  const [phase, setPhase] = useState<Phase>('idle');
  const [leaving, setLeaving] = useState<{ key: TransitionKey; node: ReactNode } | null>(null);

  const lastShownChildren = useRef<ReactNode>(children);
  const latestKey = useLatest(transitionKey);
  const callbacks = useLatest({ onStart, onSwap, onDone });
  const handle = useRef<ShatterHandle | null>(null);
  const phaseRef = useRef<Phase>('idle');
  const mounted = useRef(true);
  const leavingCell = useRef<HTMLDivElement>(null);
  const currentCell = useRef<HTMLDivElement>(null);

  const setPhaseBoth = (p: Phase) => {
    phaseRef.current = p;
    if (mounted.current) setPhase(p);
  };

  // Remember the children of the screen that is actually shown.
  useLayoutEffect(() => {
    if (transitionKey === shownKey) lastShownChildren.current = children;
  });

  useLayoutEffect(() => {
    if (transitionKey === shownKey) return;
    if (phaseRef.current === 'in') return; // folded into the pending swap
    handle.current?.cancel();
    const to = transitionKey;
    callbacks.current.onStart?.(to);

    if (reduced) {
      setLeaving({ key: shownKey, node: lastShownChildren.current });
      setShownKey(to);
      setPhaseBoth('crossfade');
      handle.current = playScreenShatter({
        reducedMotion: true,
        onSwap: () => callbacks.current.onSwap?.(to),
        onDone: () => {
          if (mounted.current) setLeaving(null);
          setPhaseBoth('idle');
          callbacks.current.onDone?.(to);
        },
      });
      return;
    }

    setLeaving(null);
    setPhaseBoth('in');
    handle.current = playScreenShatter({
      density: effectiveDensity,
      seed,
      onSwap: () => {
        const key = latestKey.current;
        if (mounted.current) setShownKey(key);
        setPhaseBoth('out');
        callbacks.current.onSwap?.(key);
      },
      onDone: () => {
        setPhaseBoth('idle');
        callbacks.current.onDone?.(latestKey.current);
      },
    });
    // Only key changes start transitions; the rest is read when they do.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transitionKey, shownKey]);

  // Reduced-motion crossfade of the two stacked copies.
  useLayoutEffect(() => {
    if (!leaving) return;
    const easing = readEasing('--ease-standard');
    const opts = { duration: REDUCED_CROSSFADE_MS, easing, fill: 'forwards' as const };
    const a = leavingCell.current ? safeAnimate(leavingCell.current, [{ opacity: 1 }, { opacity: 0 }], opts) : null;
    const b = currentCell.current
      ? safeAnimate(currentCell.current, [{ opacity: 0 }, { opacity: 1 }], { ...opts, fill: 'none' })
      : null;
    return () => {
      a?.cancel();
      b?.cancel();
    };
  }, [leaving]);

  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      handle.current?.cancel();
      handle.current = null;
      phaseRef.current = 'idle';
    };
  }, []);

  const current = transitionKey === shownKey ? children : lastShownChildren.current;
  return (
    <div
      className={className ? `gdg-shatter-stack ${className}` : 'gdg-shatter-stack'}
      data-testid={testId}
      data-shatter="transition"
      data-shatter-phase={phase}
    >
      {leaving && (
        <div key={String(leaving.key)} ref={leavingCell} className="gdg-shatter-cell gdg-shatter-leaving" aria-hidden="true">
          {leaving.node}
        </div>
      )}
      <div key={String(shownKey)} ref={currentCell} className="gdg-shatter-cell">
        {current}
      </div>
    </div>
  );
}

import { useCallback, useLayoutEffect, useRef, useState, type MutableRefObject, type RefObject } from 'react';
import { playCelebrate, type CelebrateOptions, type ShatterHandle } from './plays';
import { useDensity, useReducedMotion } from './settings';
import type { Density } from './geometry';

/** A ref that always holds the latest value (updated before other layout effects run). */
export function useLatest<T>(value: T): MutableRefObject<T> {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}

/**
 * Runs `start` whenever `trigger` changes (and on mount when `playOnMount`),
 * cancelling the previous play; cancels on unmount. StrictMode-safe: the
 * simulated unmount resets the "first render" marker so the replay on
 * remount behaves like a real mount.
 */
export function useReplay(trigger: unknown, playOnMount: boolean, start: () => ShatterHandle | null): void {
  const startRef = useLatest(start);
  const prev = useRef<{ value: unknown } | null>(null);
  const handle = useRef<ShatterHandle | null>(null);
  useLayoutEffect(() => {
    const first = prev.current === null;
    const changed = !first && !Object.is(prev.current?.value, trigger);
    prev.current = { value: trigger };
    if ((first && playOnMount) || changed) {
      handle.current?.cancel();
      handle.current = startRef.current();
    }
    // playOnMount only matters on the first run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);
  useLayoutEffect(
    () => () => {
      handle.current?.cancel();
      handle.current = null;
      prev.current = null;
    },
    [],
  );
}

export interface UseCelebrateOptions extends Omit<CelebrateOptions, 'reducedMotion' | 'density'> {
  density?: Density;
  reducedMotion?: boolean;
}

export interface CelebrateControls<T extends HTMLElement> {
  /** Attach to the element to celebrate. */
  ref: RefObject<T>;
  /** Plays (restarting if one is running). */
  celebrate: () => void;
  /** Stops and restores the element. */
  cancel: () => void;
  /** True from celebrate() until onDone (or cancel). */
  playing: boolean;
}

/**
 * Fragment & reassemble over an element's box (§6.2 "Celebrate"). Honours
 * reduced motion (OS, <ShatterProvider>, or the option) with a static
 * amber ring. Cancels on unmount.
 */
export function useCelebrate<T extends HTMLElement = HTMLElement>(options: UseCelebrateOptions = {}): CelebrateControls<T> {
  const ref = useRef<T>(null);
  const reducedMotion = useReducedMotion(options.reducedMotion);
  const density = useDensity(options.density);
  const latest = useLatest({ ...options, reducedMotion, density });
  const handle = useRef<ShatterHandle | null>(null);
  const [playing, setPlaying] = useState(false);
  const mounted = useRef(true);

  const cancel = useCallback(() => {
    handle.current?.cancel();
    handle.current = null;
    if (mounted.current) setPlaying(false);
  }, []);

  const celebrate = useCallback(() => {
    const el = ref.current;
    const opts = latest.current;
    if (!el) return;
    handle.current?.cancel();
    setPlaying(true);
    const h = playCelebrate(el, {
      density: opts.density,
      seed: opts.seed,
      reducedMotion: opts.reducedMotion,
      onFused: () => latest.current.onFused?.(),
      onDone: () => {
        if (handle.current === h) handle.current = null;
        if (mounted.current) setPlaying(false);
        latest.current.onDone?.();
      },
    });
    handle.current = h;
  }, [latest]);

  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      handle.current?.cancel();
      handle.current = null;
    };
  }, []);

  return { ref, celebrate, cancel, playing };
}

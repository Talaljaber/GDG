/**
 * Shared settings for the shatter components: reduced motion and density.
 *
 * Reduced motion is ON when any of these is true (OR, never overridden
 * back to full motion): the OS `prefers-reduced-motion: reduce`, the
 * nearest <ShatterProvider reducedMotion>, or a component's own
 * `reducedMotion` prop. The host's settings toggle feeds the provider.
 */
import { createContext, useContext, useSyncExternalStore } from 'react';
import type { Density } from './geometry';

export interface ShatterSettings {
  reducedMotion?: boolean;
  density?: Density;
}

export const ShatterContext = createContext<ShatterSettings>({});

const QUERY = '(prefers-reduced-motion: reduce)';

function mediaList(): MediaQueryList | null {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(QUERY) : null;
  } catch {
    return null;
  }
}

/** Current OS preference, outside React. */
export function prefersReducedMotion(): boolean {
  return mediaList()?.matches ?? false;
}

function subscribe(onChange: () => void): () => void {
  const list = mediaList();
  if (!list || typeof list.addEventListener !== 'function') return () => {};
  list.addEventListener('change', onChange);
  return () => list.removeEventListener('change', onChange);
}

/** Live OS `prefers-reduced-motion` value. */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, prefersReducedMotion, () => false);
}

/** Effective reduced-motion flag: OS OR provider OR the component prop. */
export function useReducedMotion(explicit?: boolean): boolean {
  const os = usePrefersReducedMotion();
  const ctx = useContext(ShatterContext);
  return os || ctx.reducedMotion === true || explicit === true;
}

/** Effective density: prop, then provider, then 'phone'. */
export function useDensity(explicit?: Density): Density {
  const ctx = useContext(ShatterContext);
  return explicit ?? ctx.density ?? 'phone';
}

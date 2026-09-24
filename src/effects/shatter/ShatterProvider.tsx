import type { ReactNode } from 'react';
import { useContext, useMemo } from 'react';
import type { Density } from './geometry';
import { ShatterContext } from './settings';

/**
 * Sets defaults for every shatter component below it. The host wraps its
 * app in `<ShatterProvider density="projector" reducedMotion={toggle}>`.
 * `reducedMotion` can only switch reduced motion on (OS preference wins).
 */
export function ShatterProvider({
  reducedMotion,
  density,
  children,
}: {
  reducedMotion?: boolean;
  density?: Density;
  children: ReactNode;
}) {
  const parent = useContext(ShatterContext);
  const reduced = reducedMotion === true || parent.reducedMotion === true;
  const effectiveDensity = density ?? parent.density;
  const value = useMemo(() => ({ reducedMotion: reduced, density: effectiveDensity }), [reduced, effectiveDensity]);
  return <ShatterContext.Provider value={value}>{children}</ShatterContext.Provider>;
}

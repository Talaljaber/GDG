/**
 * Dev-only render counter for the dashboard's render budget (`TESTING.md`,
 * "Render budget"). `useRenderCount(name)` bumps `counts[name]` once per
 * commit in which the calling component rendered (a layout effect with no
 * deps, so React StrictMode's double render doesn't double it; StrictMode's
 * extra mount effect does add one at mount, so browser measurements reset the
 * counts after the page has loaded). In the dev server the counts are on
 * `window.__dashRenderCounts`; unit tests read them with `dashRenderCounts()`.
 *
 * `import.meta.env.DEV` is a build-time constant, so a production build turns
 * the hook into an empty function and drops the counter entirely (checked by
 * grepping `dist/` for `__dashRenderCounts`).
 */
import { useLayoutEffect } from 'react';

type Counts = Record<string, number>;

declare global {
  interface Window {
    __dashRenderCounts?: Counts;
  }
}

const counts: Counts = {};

if (import.meta.env.DEV && typeof window !== 'undefined') window.__dashRenderCounts = counts;

export function useRenderCount(name: string): void {
  if (!import.meta.env.DEV) return;
  // eslint-disable-next-line react-hooks/rules-of-hooks -- DEV is a build-time constant: always or never called.
  useLayoutEffect(() => {
    counts[name] = (counts[name] ?? 0) + 1;
  });
}

/** A snapshot of the counts so far (dev and tests only). */
export function dashRenderCounts(): Counts {
  return { ...counts };
}

export function resetDashRenderCounts(): void {
  for (const k of Object.keys(counts)) delete counts[k];
}

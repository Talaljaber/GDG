/**
 * The big screen's motion settings (`DESIGN_SYSTEM.md` §6.2, SCREENS H6):
 * every shatter on the host uses projector density (48-shard cap), and the
 * host's "Reduce motion" toggle switches every effect to its reduced-motion
 * fallback (crossfades, static ring), on top of the OS setting (which can't
 * be overridden back). The toggle is remembered on this laptop and also sets
 * `data-motion="reduced"` on <html>, which zeroes the CSS duration tokens
 * (tokens.css) the same way the OS setting does.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ShatterProvider } from '../effects/shatter';
import { HostMotionContext } from './motionContext';

const STORAGE_KEY = 'gdg.v1.host-reduced-motion';

function readStored(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeStored(on: boolean): void {
  try {
    if (on) localStorage.setItem(STORAGE_KEY, '1');
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // private mode / blocked storage: the toggle still works for this page
  }
}

export function HostMotionProvider({ children }: { children: ReactNode }) {
  const [reducedMotion, setState] = useState(readStored);
  const setReducedMotion = useCallback((on: boolean) => {
    writeStored(on);
    setState(on);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (reducedMotion) root.dataset.motion = 'reduced';
    else delete root.dataset.motion;
    return () => {
      delete root.dataset.motion;
    };
  }, [reducedMotion]);

  const value = useMemo(() => ({ reducedMotion, setReducedMotion }), [reducedMotion, setReducedMotion]);
  return (
    <HostMotionContext.Provider value={value}>
      <ShatterProvider density="projector" reducedMotion={reducedMotion}>
        {children}
      </ShatterProvider>
    </HostMotionContext.Provider>
  );
}

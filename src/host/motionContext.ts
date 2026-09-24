/** The host's "Reduce motion" toggle (HostMotionProvider in motion.tsx). */
import { createContext, useContext } from 'react';

export interface HostMotion {
  reducedMotion: boolean;
  setReducedMotion(on: boolean): void;
}

export const HostMotionContext = createContext<HostMotion>({ reducedMotion: false, setReducedMotion: () => {} });

export function useHostMotion(): HostMotion {
  return useContext(HostMotionContext);
}

/**
 * Screen-to-screen mosaic shatter (`DESIGN_SYSTEM.md` §6.2 "Screen
 * transition"): a change of `screenKey` plays the 700 ms shatter (200 ms
 * crossfade with reduced motion) through `ShatterTransition`.
 *
 * Some changes must swap at once, with no effect at all:
 * - into or out of the `LOADING_KEY` screen (a reload or first load lands
 *   straight on its screen);
 * - when the caller passes `instant` (e.g. into a game: nothing may cover
 *   or delay a game screen, `.claude/rules/games.md`);
 * - when `instantWhen(from, to)` says so (the host skips the reduced-motion
 *   crossfade for screens that show the logo, which must never fade, §5).
 * An instant change remounts the transition with the new key, so nothing
 * plays and no old screen lingers.
 *
 * Keep the logo outside this component (TopBar), or give it
 * `SHATTER_LOGO_CLASS` and make the change instant under reduced motion.
 *
 * `onShown(key)` reports the key of the screen actually on screen: during
 * the 320 ms fly-in the previous screen is still shown (frozen, and not
 * clickable: ui.module.css), so anything that describes "the current
 * screen" (the host's `data-screen`) should follow this, not `screenKey`.
 */
import { useLayoutEffect, useState, type ReactNode } from 'react';
import { ShatterTransition } from '../effects/shatter';
import ui from './ui.module.css';

export const LOADING_KEY = 'loading';

export function ScreenTransition({
  screenKey,
  instant = false,
  instantWhen,
  onShown,
  className,
  children,
}: {
  screenKey: string;
  instant?: boolean;
  instantWhen?: (from: string, to: string) => boolean;
  /** The key of the screen now on screen (at the swap, or at once for an instant change). */
  onShown?: (key: string) => void;
  className?: string;
  children: ReactNode;
}) {
  const [state, setState] = useState({ key: screenKey, generation: 0, shown: screenKey });
  if (state.key !== screenKey) {
    const skip =
      instant || state.key === LOADING_KEY || screenKey === LOADING_KEY || (instantWhen?.(state.key, screenKey) ?? false);
    // Derived state (React's "adjust state while rendering"): re-renders before committing.
    setState({
      key: screenKey,
      generation: skip ? state.generation + 1 : state.generation,
      shown: skip ? screenKey : state.shown,
    });
  }
  const shown = state.shown;
  useLayoutEffect(() => {
    onShown?.(shown);
    // Report changes of the shown key only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown]);
  return (
    <ShatterTransition
      key={state.generation}
      transitionKey={screenKey}
      className={className ? `${ui.screenStack} ${className}` : ui.screenStack}
      onSwap={(to) => setState((cur) => ({ ...cur, shown: String(to) }))}
    >
      {children}
    </ShatterTransition>
  );
}

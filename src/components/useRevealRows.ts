/**
 * Row shatter-in for lists and boards (`DESIGN_SYSTEM.md` §6.2 "Round
 * results shatter-in"), part of the reveal entry point (RevealIn.tsx):
 * rows present when the list mounts assemble as one budgeted batch (at most
 * 48 shards alive on the projector, 24 on a phone), rows that appear later
 * assemble as a new batch, and an optional "new #1" celebrate plays on the
 * leader row. Reduced motion: rows fade in over 200 ms; celebrate is a
 * static amber ring. One effect owns an element at a time (both set inline
 * opacity), so a celebrate first finishes any running shatter-in.
 */
import { useLayoutEffect, useRef, type RefObject } from 'react';
import { playCelebrate, playShatterIn, useDensity, useReducedMotion, type ShatterHandle } from '../effects/shatter';

/** Attribute that marks a revealable row inside a list and names it (a stable key). */
export const REVEAL_KEY_ATTR = 'data-reveal-key';

export interface RevealRowsOptions {
  /** false: rows simply appear (phones, or while the day-board merge owns the rows). */
  enabled?: boolean;
  /** Key of the current #1 row: when it changes after the first render, that row celebrates. */
  leaderKey?: string | null;
}

/**
 * Shatter-in for the rows of a list. Put the returned ref on the list and
 * `data-reveal-key={key}` on every row, in the same order as `keys`.
 */
export function useRevealRows<T extends HTMLElement>(
  keys: readonly string[],
  { enabled = true, leaderKey }: RevealRowsOptions = {},
): RefObject<T> {
  const ref = useRef<T>(null);
  const reduced = useReducedMotion();
  const density = useDensity();
  const seen = useRef<Set<string> | null>(null);
  const leader = useRef<string | null | undefined>(undefined);
  const rows = useRef(new Set<ShatterHandle>());
  const celebrating = useRef<ShatterHandle | null>(null);
  const keyList = keys.join('\n');

  useLayoutEffect(() => {
    const root = ref.current;
    const current = keyList ? keyList.split('\n') : [];
    const before = seen.current;
    seen.current = new Set(current);

    let celebrateKey: string | null = null;
    if (leaderKey !== undefined) {
      if (leader.current !== undefined && leaderKey && leaderKey !== leader.current) celebrateKey = leaderKey;
      leader.current = leaderKey;
    }
    if (!enabled || !root) return;

    const byKey = new Map<string, Element>();
    root.querySelectorAll(`[${REVEAL_KEY_ATTR}]`).forEach((el) => {
      const k = el.getAttribute(REVEAL_KEY_ATTR);
      if (k !== null) byKey.set(k, el);
    });

    const fresh = current
      .filter((k) => (!before || !before.has(k)) && k !== celebrateKey)
      .map((k) => byKey.get(k))
      .filter((el): el is Element => !!el);
    if (fresh.length > 0) {
      const h = playShatterIn(fresh, {
        density,
        reducedMotion: reduced,
        onDone: () => rows.current.delete(h),
      });
      rows.current.add(h);
    }

    const leaderEl = celebrateKey ? byKey.get(celebrateKey) : undefined;
    if (leaderEl instanceof HTMLElement) {
      // One owner per element at a time: a running shatter-in restores its rows first.
      rows.current.forEach((h) => h.cancel());
      rows.current.clear();
      celebrating.current?.cancel();
      celebrating.current = playCelebrate(leaderEl, { density, reducedMotion: reduced });
    }
    // Only the key list, the leader and `enabled` start effects; settings are read when they do.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyList, leaderKey, enabled]);

  useLayoutEffect(() => {
    const active = rows.current;
    return () => {
      active.forEach((h) => h.cancel());
      active.clear();
      celebrating.current?.cancel();
      celebrating.current = null;
      // A StrictMode remount replays like a real mount.
      seen.current = null;
      leader.current = undefined;
    };
  }, []);

  return ref;
}

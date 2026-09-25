/**
 * Presence dots for the lobby (ADR-103, `SCREENS.md` H1): blue while a
 * player's phone is present on `presence:<sid>`, grey once it has been
 * absent for PRESENCE_GREY_MS. Presence is advisory only (ADR-014).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { PRESENCE_GREY_MS } from '../config';

export type PresenceDot = 'on' | 'off';

/**
 * Updates last-seen times: present ids are seen `now`; listed players the
 * host has never seen start their grace period when first listed.
 */
export function updateLastSeen(
  prev: ReadonlyMap<string, number>,
  presentIds: ReadonlySet<string>,
  listedIds: readonly string[],
  now: number,
): Map<string, number> {
  const next = new Map(prev);
  for (const id of listedIds) {
    if (presentIds.has(id)) next.set(id, now);
    else if (!next.has(id)) next.set(id, now);
  }
  return next;
}

export function presenceDot(
  playerId: string,
  presentIds: ReadonlySet<string>,
  lastSeen: ReadonlyMap<string, number>,
  now: number,
): PresenceDot {
  if (presentIds.has(playerId)) return 'on';
  const seen = lastSeen.get(playerId);
  if (seen === undefined) return 'on';
  return now - seen < PRESENCE_GREY_MS ? 'on' : 'off';
}

const PRESENCE_TICK_MS = 1000;

/**
 * The lobby's presence dots (H1). Last-seen times are updated every second
 * and whenever presence or the player list changes, exactly as before, but
 * they live in a ref: the lobby re-renders only when a dot actually flips
 * (`TESTING.md` §9), not every second. Returns `dotOf(playerId)`.
 */
export function usePresenceDots(
  joinedIds: readonly string[],
  presentIds: ReadonlySet<string>,
): (playerId: string) => PresenceDot {
  const lastSeen = useRef<Map<string, number>>(new Map());
  const idsKey = joinedIds.join(',');
  const [now, setNow] = useState(() => Date.now());
  const latest = useRef({ presentIds, idsKey, now });
  latest.current = { presentIds, idsKey, now };

  const idsOf = (key: string) => (key ? key.split(',') : []);
  const dotsKey = (at: number) => {
    const { presentIds: present, idsKey: key } = latest.current;
    return idsOf(key)
      .map((id) => presenceDot(id, present, lastSeen.current, at))
      .join(',');
  };

  useEffect(() => {
    lastSeen.current = updateLastSeen(lastSeen.current, presentIds, idsOf(idsKey), Date.now());
  }, [presentIds, idsKey]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const at = Date.now();
      const cur = latest.current;
      lastSeen.current = updateLastSeen(lastSeen.current, cur.presentIds, idsOf(cur.idsKey), at);
      if (dotsKey(at) !== dotsKey(cur.now)) setNow(at);
    }, PRESENCE_TICK_MS);
    return () => window.clearInterval(timer);
    // dotsKey only reads refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return useCallback(
    (playerId: string) => presenceDot(playerId, presentIds, lastSeen.current, now),
    [presentIds, now],
  );
}

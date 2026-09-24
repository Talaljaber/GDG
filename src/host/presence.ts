/**
 * Presence dots for the lobby (ADR-103, `SCREENS.md` H1): blue while a
 * player's phone is present on `presence:<sid>`, grey once it has been
 * absent for PRESENCE_GREY_MS. Presence is advisory only (ADR-014).
 */
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

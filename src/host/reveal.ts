/**
 * Pure layout of the Stop the Clock guess reveal (`games/stop-the-clock.md`
 * §6): dot positions per target strip. Rendered by StcReveal.tsx.
 */
import { STC_REVEAL_LABELLED, STC_REVEAL_WINDOW_MS } from '../config';
import type { RevealRow } from '../lib/api';
import { displayName } from '../lib/boards';
import { STC_TARGETS_MS } from '../games/stop-the-clock/scoring';

export interface RevealDot {
  playerRowId: string;
  label: string | null;
  /** 0–100: position along the strip (50 = on target). */
  pos: number;
  /** Outside the ±window: pinned to the edge. */
  pinned: boolean;
}

interface StcAttemptLike {
  target_ms: number;
  measured_ms: number | null;
  missed_start?: boolean;
}

function attemptsOf(raw: unknown): StcAttemptLike[] | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const a = (raw as { attempts?: unknown }).attempts;
  return Array.isArray(a) ? (a as StcAttemptLike[]) : null;
}

/**
 * Pure layout of the reveal: for each target strip, one dot per player that
 * measured a guess for it. `rows` are in round-board order; the first
 * `labelled` get their display name.
 */
export function revealStrips(
  rows: readonly Pick<RevealRow, 'playerRowId' | 'name' | 'displaySuffix' | 'raw'>[],
  labelled = STC_REVEAL_LABELLED,
  windowMs = STC_REVEAL_WINDOW_MS,
): RevealDot[][] {
  return STC_TARGETS_MS.map((target, i) =>
    rows.flatMap((row, rank) => {
      const attempt = attemptsOf(row.raw)?.[i];
      if (!attempt || attempt.measured_ms === null || attempt.missed_start) return [];
      const delta = attempt.measured_ms - target;
      const clamped = Math.max(-windowMs, Math.min(windowMs, delta));
      return [
        {
          playerRowId: row.playerRowId,
          label: rank < labelled ? displayName(row.name, row.displaySuffix) : null,
          pos: 50 + (50 * clamped) / windowMs,
          pinned: Math.abs(delta) > windowMs,
        },
      ];
    }),
  );
}

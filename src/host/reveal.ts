/**
 * The big-screen guess reveals (H3 step 1): the pure layout of the Stop the
 * Clock strips (`games/stop-the-clock.md` §6, rendered by StcReveal.tsx),
 * the label lanes shared with the How Many? reveal (howManyReveal.ts,
 * HowManyReveal.tsx), and the one data hook both use.
 */
import { useEffect, useState } from 'react';
import { STC_REVEAL_LABELLED, STC_REVEAL_WINDOW_MS } from '../config';
import { fetchRoundReveal, type RevealRow } from '../lib/api';
import { displayName } from '../lib/boards';
import { replaceEqualDeep } from '../lib/equal';
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

// ------------------------------------------------------------------ label lanes

/** Two lanes above the track, two below (host-v3 §4.4); the block reserves all four. */
export type Lane = 'above' | 'below' | 'above2' | 'below2';
const LANES: readonly Lane[] = ['above', 'below', 'above2', 'below2'];

/** How a label sits on its dot: centred, or flush with the track's end so it never leaves it. */
export type LabelAlign = 'centre' | 'start' | 'end';

export interface LabelPlace {
  lane: Lane;
  align: LabelAlign;
}

/**
 * Where each labelled dot's name goes: greedy in position order, each label in
 * the first lane whose previous label ends before this one starts (or the
 * emptiest lane when all four are taken). Near an end of the track a label is
 * aligned to that end so it stays over the track. `labelWidthPct` estimates a
 * label's width as a percentage of the track (the text is never measured, so
 * placing labels costs no extra render).
 */
export function labelLanes(
  dots: readonly RevealDot[],
  labelWidthPct: (label: string) => number,
): Map<string, LabelPlace> {
  const end: Record<Lane, number> = { above: -Infinity, below: -Infinity, above2: -Infinity, below2: -Infinity };
  const places = new Map<string, LabelPlace>();
  for (const d of [...dots].filter((x) => x.label).sort((a, b) => a.pos - b.pos)) {
    const w = labelWidthPct(d.label ?? '');
    const align: LabelAlign = d.pos - w / 2 < 0 ? 'start' : d.pos + w / 2 > 100 ? 'end' : 'centre';
    const start = align === 'start' ? d.pos : align === 'end' ? d.pos - w : d.pos - w / 2;
    const lane = LANES.find((l) => end[l] <= start) ?? LANES.reduce((a, b) => (end[b] < end[a] ? b : a));
    end[lane] = start + w;
    places.set(d.playerRowId, { lane, align });
  }
  return places;
}

/**
 * Label width estimate for the projector: t1 text (3.2 vh, ≈ 0.55 em per
 * character) plus the knockout padding, over a track that is 8 of the
 * stage's 12 columns. Read once per render of a reveal (a window resize
 * re-lays the labels on the next data change, which is fine for a 7 s step).
 */
export function projectorLabelWidth(): (label: string) => number {
  const vh = window.innerHeight / 100;
  const trackPx = Math.max(1, (window.innerWidth - 10 * vh) * (8 / 12));
  return (label) => ((label.length * 0.55 * 3.2 * vh + 2 * vh) / trackPx) * 100;
}

// ------------------------------------------------------------------ data

/** Props shared by every big-screen reveal (Intermission's REVEALS map). */
export interface RevealProps {
  roundId: string;
  /** Bumped on every late score / hidden name: re-query. */
  version: number;
  /** Dev preview / tests only: fixed rows instead of the database query. */
  rows?: RevealRow[];
  /**
   * The round's `ended_at` on the LOCAL clock (server time minus the host's offset), in epoch
   * ms: the start of the 7 s round-board step (ADR-129 (1)). Every dot and marker is timed
   * from it, not from the mount, so a late mount, a host reload or a second host tab shows
   * the same reveal state for the same elapsed time. Null/absent (dev fixtures): timed from
   * the mount, as before.
   */
  anchorMs?: number | null;
}

/**
 * How long from now until a reveal slot that is due `delayMs` after the anchor (the
 * round's `ended_at`, local clock): `delayMs` itself without an anchor (dev fixtures:
 * mount-relative), otherwise the time still to go, 0 once it is overdue (a late row,
 * a late mount or a reload mid-step shows it at once).
 */
export function slotDelay(anchorMs: number | null | undefined, delayMs: number, nowMs = Date.now()): number {
  if (anchorMs === null || anchorMs === undefined) return delayMs;
  return Math.max(0, anchorMs + delayMs - nowMs);
}

/**
 * The delay and shard count for one reveal slot: anchored, a slot that is already due
 * appears at once without a burst (`shards: 0`); otherwise it plays as planned.
 */
export function anchoredSlot(
  anchorMs: number | null | undefined,
  slot: { delayMs: number; shards: number } | undefined,
  nowMs = Date.now(),
): { delayMs: number; shards: number } {
  const planned = slot ?? { delayMs: 0, shards: 0 };
  const delayMs = slotDelay(anchorMs, planned.delayMs, nowMs);
  const due = anchorMs !== null && anchorMs !== undefined && delayMs === 0;
  return { delayMs, shards: due ? 0 : planned.shards };
}

/**
 * The visible round-board rows with their raw payloads (`fetchRoundReveal`),
 * re-queried on `version` and kept by identity when nothing changed, so the
 * dots never replay on a refetch.
 */
export function useRoundReveal(roundId: string, version: number, previewRows?: RevealRow[]): RevealRow[] | null {
  const [fetched, setRows] = useState<RevealRow[] | null>(null);
  const live = !previewRows;
  useEffect(() => {
    if (!live) return;
    let alive = true;
    void fetchRoundReveal(roundId)
      .then((r) => {
        if (alive) setRows((prev) => replaceEqualDeep(prev, r));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [roundId, version, live]);
  return previewRows ?? fetched;
}

/**
 * Pure layout of the How Many? count reveal (`docs/plans/games-v3.md` §5,
 * ADR-136): the H3 round-board step after a How Many? round. Rendered by
 * HowManyReveal.tsx. (Named after its export: a `howManyReveal.ts` next to
 * `HowManyReveal.tsx` collides on case-insensitive file systems.)
 *
 * Reads the `how_many` raw payload (§1.4) through a local type, so the host
 * never imports the game package: `{ rounds: [{ true_count, guess, … }] × 3 }`.
 */
import { HM_REVEAL_LABELLED, HM_REVEAL_WINDOW } from '../config';
import type { RevealRow } from '../lib/api';
import { displayName } from '../lib/boards';
import type { RevealDot } from './reveal';

/** The fields of one flash the reveal reads (`how_many raw`, games-v3 §1.4). */
interface HowManyRoundLike {
  true_count: number;
  guess: number | null;
}

/** Flashes per round (games-v3 §1.1). */
export const HM_FLASHES = 3;

export interface HowManyStrip {
  /** The true count of this flash: the most common `true_count` across rows; null with no data. */
  count: number | null;
  /** One dot per row with a guess for this flash (round-board order). */
  dots: RevealDot[];
  /** Rounded mean of the guesses, or null when nobody guessed. */
  mean: number | null;
  /** Where the mean sits on the strip (0–100, clamped to the window), or null. */
  meanPos: number | null;
}

function roundsOf(raw: unknown): unknown[] | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = (raw as { rounds?: unknown }).rounds;
  return Array.isArray(r) ? r : null;
}

function flashOf(raw: unknown, i: number): HowManyRoundLike | null {
  const f = roundsOf(raw)?.[i];
  if (typeof f !== 'object' || f === null) return null;
  const { true_count, guess } = f as { true_count?: unknown; guess?: unknown };
  if (typeof true_count !== 'number' || !Number.isFinite(true_count)) return null;
  return {
    true_count,
    guess: typeof guess === 'number' && Number.isFinite(guess) ? guess : null,
  };
}

/**
 * The most common value (everyone shares the round's seed, so one tampered
 * row can't move the axis). Ties go to the value seen first, i.e. the
 * higher-ranked row's.
 */
export function modeOf(values: readonly number[]): number | null {
  const counts = new Map<number, number>(); // insertion order = first seen
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: number | null = null;
  let bestCount = 0;
  for (const [v, c] of counts) {
    if (c > bestCount) {
      best = v;
      bestCount = c;
    }
  }
  return best;
}

/** Position of `value` on a strip centred on `count` (±`window` relative error = the ends). */
export function countPos(value: number, count: number, window = HM_REVEAL_WINDOW): number {
  const rel = (value - count) / count;
  return 50 + (50 * Math.max(-window, Math.min(window, rel))) / window;
}

/**
 * For each of the three flashes: the true count, one dot per row that
 * guessed, and the crowd average. `rows` are in round-board order; the first
 * `labelled` get their display name.
 */
export function howManyStrips(
  rows: readonly Pick<RevealRow, 'playerRowId' | 'name' | 'displaySuffix' | 'raw'>[],
  labelled = HM_REVEAL_LABELLED,
  window = HM_REVEAL_WINDOW,
): HowManyStrip[] {
  return Array.from({ length: HM_FLASHES }, (_, i) => {
    const flashes = rows.map((row) => flashOf(row.raw, i));
    const count = modeOf(flashes.flatMap((f) => (f && f.true_count > 0 ? [f.true_count] : [])));
    if (count === null) return { count: null, dots: [], mean: null, meanPos: null };

    const guesses: number[] = [];
    const dots = rows.flatMap((row, rank): RevealDot[] => {
      const guess = flashes[rank]?.guess ?? null;
      if (guess === null) return [];
      guesses.push(guess);
      return [
        {
          playerRowId: row.playerRowId,
          label: rank < labelled ? displayName(row.name, row.displaySuffix) : null,
          pos: countPos(guess, count, window),
          pinned: Math.abs((guess - count) / count) > window,
        },
      ];
    });
    const mean = guesses.length > 0 ? Math.round(guesses.reduce((a, b) => a + b, 0) / guesses.length) : null;
    return { count, dots, mean, meanPos: mean === null ? null : countPos(mean, count, window) };
  });
}

/**
 * Motion constants and a tiny scheduler for the shatter layer.
 *
 * The §6.2 timelines (docs/DESIGN_SYSTEM.md) are named constants here; the
 * easings are the §6.1 tokens, read from :root at runtime. Durations that
 * *are* §6.1 tokens (--dur-fast, --dur-base) are mirrored as constants
 * because tokens.css zeroes them under `prefers-reduced-motion`, while the
 * reduced-motion fallback itself must still be a 200 ms crossfade.
 */

/** Screen transition (§6.2): fly in and tile 0–320 ms, swap at 320, burst out and fade 320–700. */
export const TRANSITION_TIMELINE = {
  inMs: 320,
  swapAtMs: 320,
  endMs: 700,
  /** Burst distance relative to the fly-in distance. */
  outDistanceScale: 1.2,
} as const;

/** Celebrate (§6.2): drift out 0–450 ms, return and fuse 450–1200, amber glow pulse at 1200. */
export const CELEBRATE_TIMELINE = {
  driftOutMs: 450,
  fuseAtMs: 1200,
  /** Length of the glow pulse that starts at fuseAtMs (spec gives only its start). */
  glowMs: 600,
  /** Reduced motion: how long the static amber ring stays up. */
  reducedRingMs: 1800,
} as const;

/** Round-results shatter-in (§6.2): 60 ms stagger, 500 ms per row. */
export const SHATTER_IN_TIMELINE = {
  staggerMs: 60,
  itemMs: 500,
  /** Assemble flight: shards converge from 24–64 px away, ±40°. */
  minDistance: 24,
  maxDistance: 64,
  maxRotateDeg: 40,
} as const;

/**
 * Day-board merge (§6.2, ~15 s), one continuous swarm of small mosaic tiles:
 * 0–1.5 s the session rows crack into tiles that loosen while the results
 * fade; then 3 × 4 s per game (the tab shows → +200 ms the tiles glide into
 * the rows that are new or improved → +2.6 s those rows reassemble → 3.5 s
 * the tiles break off them again for the next tab); 1.5 s settle on the
 * first tab. The callback offsets are fixed (mergeSchedule).
 */
export const DAY_BOARD_MERGE_TIMELINE = {
  fragmentMs: 1500,
  perGameMs: 4000,
  settleMs: 1500,
  /** After a tab shows, the tiles start gliding into its rows after this long. */
  streamDelayMs: 200,
  /** Rows reassemble at streamDelayMs + streamMs into the game slot. */
  streamMs: 2400,
  /** One row's glide; the rows are staggered over the rest of streamMs. */
  glideMs: 1600,
  /** Before the next tab, the reassembled rows' tiles break off for this long. */
  crackMs: 500,
  /** Stage fade-ins (first tab, tab changes, settle) and reassembled rows' fade-in (= --dur-slow). */
  fadeMs: 360,
  /** The session results fade out over this long, starting at fragmentFadeDelayMs. */
  fragmentFadeMs: 900,
  fragmentFadeDelayMs: 250,
  /** Tile cell size relative to its row's height (tiles are row-sized mosaic, not slabs). */
  tileScale: 0.8,
  /** Tiles are drawn at this scale around their centroid, so a gap (grout) shows between them. */
  tileInset: 0.88,
  /** Most tiles on one row. */
  maxTilesPerRow: 8,
  /** Loosening drift, relative to the row height, and rotation. */
  driftMin: 0.15,
  driftMax: 0.5,
  maxRotateDeg: 12,
} as const;

/** Total merge length for a lineup of `games` games (15 000 ms for 3). */
export function mergeTotalMs(games: number): number {
  const t = DAY_BOARD_MERGE_TIMELINE;
  return t.fragmentMs + games * t.perGameMs + t.settleMs;
}

/** Stop the Clock reveal (§6.2, games/stop-the-clock.md §6): dots burst in per strip, 5 s total. */
export const STC_REVEAL_TIMELINE = {
  totalMs: 5000,
  burstMs: 600,
  /** Shards per dot burst before the concurrency budget kicks in. */
  shardsPerBurst: 6,
  minDistance: 10,
  maxDistance: 36,
  maxRotateDeg: 40,
} as const;

/** Reduced-motion crossfade = --dur-base (§6.1). */
export const REDUCED_CROSSFADE_MS = 200;
/** Shard fade-away after content is revealed = --dur-fast (§6.1). */
export const SHARD_FADE_MS = 120;

export type EasingToken = '--ease-standard' | '--ease-emphasized' | '--ease-exit';

/** Mirrors tokens.css, used only when the token can't be read (tests, SSR). */
const EASING_FALLBACK: Record<EasingToken, string> = {
  '--ease-standard': 'cubic-bezier(0.2, 0, 0, 1)',
  '--ease-emphasized': 'cubic-bezier(0.05, 0.7, 0.1, 1)',
  '--ease-exit': 'cubic-bezier(0.3, 0, 1, 1)',
};

/**
 * Reads an easing token from :root. The Web Animations API can't take
 * `var()`, so the resolved value is passed instead.
 */
export function readEasing(token: EasingToken): string {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
    if (v) return v;
  } catch {
    // no DOM
  }
  return EASING_FALLBACK[token];
}

/**
 * setTimeout-based scheduler (so fake timers drive it in tests). `at(0)`
 * runs synchronously. `clear()` cancels everything pending.
 */
export class Timeline {
  private readonly ids = new Set<ReturnType<typeof setTimeout>>();
  private cleared = false;

  at(ms: number, fn: () => void): void {
    if (this.cleared) return;
    if (ms <= 0) {
      fn();
      return;
    }
    const id = setTimeout(() => {
      this.ids.delete(id);
      if (!this.cleared) fn();
    }, ms);
    this.ids.add(id);
  }

  clear(): void {
    this.cleared = true;
    for (const id of this.ids) clearTimeout(id);
    this.ids.clear();
  }

  get active(): boolean {
    return !this.cleared;
  }
}

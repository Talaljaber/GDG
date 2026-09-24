/**
 * Imperative players for the §6.2 variants (docs/DESIGN_SYSTEM.md). Each
 * returns a handle; `cancel()` stops the timeline, removes the shard layer
 * and restores anything it hid, and no callback fires after it.
 *
 * The React components in this folder are thin wrappers; screens normally
 * use those. These are exported for non-React callers and for tests.
 */
import {
  CELEBRATE_FLIGHT,
  SHARD_CAPS,
  createShards,
  transitionFlight,
  type Density,
  type FlightProfile,
  type Rect,
} from './geometry';
import {
  CELEBRATE_TIMELINE,
  REDUCED_CROSSFADE_MS,
  SHARD_FADE_MS,
  SHATTER_IN_TIMELINE,
  STC_REVEAL_TIMELINE,
  TRANSITION_TIMELINE,
  Timeline,
  readEasing,
} from './motion';
import {
  boxOf,
  hideElement,
  localRect,
  mountShardLayer,
  safeAnimate,
  viewportRect,
  type ShardLayer,
} from './renderer';

export interface ShatterHandle {
  /** Stops everything; no callback fires afterwards. Idempotent. */
  cancel(): void;
}

export interface CommonOptions {
  density?: Density;
  seed?: string | number;
  /** Already resolved by the caller (OS preference OR the host toggle). */
  reducedMotion?: boolean;
}

let seedCounter = 0;
/** A fresh seed per play when the caller doesn't pass one. */
function autoSeed(seed: string | number | undefined, variant: string): string | number {
  if (seed !== undefined) return seed;
  seedCounter += 1;
  return `${variant}:${seedCounter}`;
}

function handleOf(cleanup: () => void): ShatterHandle {
  let done = false;
  return {
    cancel() {
      if (done) return;
      done = true;
      cleanup();
    },
  };
}

// ---------------------------------------------------------------------------
// Screen transition
// ---------------------------------------------------------------------------

export interface ScreenShatterOptions extends CommonOptions {
  /** 320 ms (0 with reduced motion): swap the content now. */
  onSwap?: () => void;
  /** 700 ms (200 with reduced motion): the layer is gone. */
  onDone?: () => void;
  /** Defaults to the viewport. */
  rect?: Rect;
}

/**
 * Full-screen shards fly in (0–320 ms, emphasized) and tile, `onSwap` at
 * 320 ms, then burst out 1.2× and fade (320–700 ms, exit). With reduced
 * motion there are no shards: `onSwap` at 0 and `onDone` at 200 ms (the
 * caller runs the crossfade).
 */
export function playScreenShatter(options: ScreenShatterOptions): ShatterHandle {
  const tl = new Timeline();
  if (options.reducedMotion) {
    tl.at(0, () => options.onSwap?.());
    tl.at(REDUCED_CROSSFADE_MS, () => options.onDone?.());
    return handleOf(() => tl.clear());
  }
  const T = TRANSITION_TIMELINE;
  const rect = options.rect ?? viewportRect();
  const shards = createShards(localRect(rect), {
    seed: autoSeed(options.seed, 'transition'),
    density: options.density ?? 'phone',
    flight: transitionFlight(rect),
  });
  const layer = mountShardLayer(shards, { rect, variant: 'transition' });
  const emphasized = readEasing('--ease-emphasized');
  const exit = readEasing('--ease-exit');
  for (const m of layer.shards) {
    const f = m.shard.flight;
    layer.animate(
      m.el,
      [
        { transform: m.at(f.dx, f.dy, f.rotateDeg), opacity: 0 },
        { transform: m.at(0, 0), opacity: 1 },
      ],
      { duration: T.inMs, easing: emphasized, fill: 'both' },
    );
  }
  tl.at(T.swapAtMs, () => {
    options.onSwap?.();
    const s = T.outDistanceScale;
    for (const m of layer.shards) {
      const f = m.shard.flight;
      layer.animate(
        m.el,
        [
          { transform: m.at(0, 0), opacity: 1 },
          { transform: m.at(f.dx * s, f.dy * s, -f.rotateDeg * s), opacity: 0 },
        ],
        { duration: T.endMs - T.swapAtMs, easing: exit, fill: 'forwards' },
      );
    }
  });
  tl.at(T.endMs, () => {
    layer.destroy();
    options.onDone?.();
  });
  return handleOf(() => {
    tl.clear();
    layer.destroy();
  });
}

// ---------------------------------------------------------------------------
// Celebrate
// ---------------------------------------------------------------------------

export interface CelebrateOptions extends CommonOptions {
  /** 1200 ms (0 with reduced motion): shards have fused, the glow starts. */
  onFused?: () => void;
  /** 1800 ms in both modes: the layer (or static ring) is gone. */
  onDone?: () => void;
}

/**
 * The element's box splits into shards that drift 18–40 px out with ±25°
 * (0–450 ms), return and fuse (450–1200 ms), then an amber glow pulses.
 * Reduced motion: a static amber ring for 1800 ms, nothing moves.
 */
export function playCelebrate(el: HTMLElement, options: CelebrateOptions = {}): ShatterHandle {
  const T = CELEBRATE_TIMELINE;
  const tl = new Timeline();
  const rect = boxOf(el);
  let radius = '';
  try {
    radius = getComputedStyle(el).borderRadius;
  } catch {
    // no DOM styles
  }
  if (options.reducedMotion) {
    const layer = mountShardLayer([], { rect, variant: 'celebrate' });
    layer.ring(radius);
    tl.at(0, () => options.onFused?.());
    tl.at(T.reducedRingMs, () => {
      layer.destroy();
      options.onDone?.();
    });
    return handleOf(() => {
      tl.clear();
      layer.destroy();
    });
  }
  const shards = createShards(localRect(rect), {
    seed: autoSeed(options.seed, 'celebrate'),
    density: options.density ?? 'phone',
    flight: CELEBRATE_FLIGHT,
  });
  const layer = mountShardLayer(shards, { rect, variant: 'celebrate' });
  const ring = layer.ring(radius);
  ring.style.opacity = '0';
  const restore = shards.length > 0 ? hideElement(el) : () => {};
  const emphasized = readEasing('--ease-emphasized');
  for (const m of layer.shards) {
    const f = m.shard.flight;
    layer.animate(
      m.el,
      [
        { transform: m.at(0, 0), easing: emphasized },
        { transform: m.at(f.dx, f.dy, f.rotateDeg), offset: T.driftOutMs / T.fuseAtMs, easing: emphasized },
        { transform: m.at(0, 0) },
      ],
      { duration: T.fuseAtMs, fill: 'both' },
    );
  }
  tl.at(T.fuseAtMs, () => {
    restore();
    options.onFused?.();
    for (const m of layer.shards) {
      layer.animate(m.el, [{ opacity: 1 }, { opacity: 0 }], { duration: SHARD_FADE_MS, fill: 'forwards' });
    }
    layer.animate(
      ring,
      [
        { opacity: 0, transform: 'scale(1)' },
        { opacity: 1, transform: 'scale(1.03)', offset: 0.3 },
        { opacity: 0, transform: 'scale(1.06)' },
      ],
      { duration: T.glowMs, easing: emphasized, fill: 'forwards' },
    );
  });
  tl.at(T.fuseAtMs + T.glowMs, () => {
    layer.destroy();
    options.onDone?.();
  });
  return handleOf(() => {
    tl.clear();
    restore();
    layer.destroy();
  });
}

// ---------------------------------------------------------------------------
// Shatter-in (rows assemble top to bottom)
// ---------------------------------------------------------------------------

export interface ShatterInOptions extends CommonOptions {
  /** Offset of the whole sequence, ms (rows stay hidden until then). Every time below shifts by it. */
  delayMs?: number;
  staggerMs?: number;
  itemMs?: number;
  /** Row i is revealed at i·stagger + itemMs (0 with reduced motion). */
  onItemRevealed?: (index: number) => void;
  /** (n−1)·stagger + itemMs; 200 ms with reduced motion. */
  onDone?: () => void;
}

/** Most shards per row: more than this reads as noise on a thin row. */
const MAX_SHARDS_PER_ROW = 8;

/**
 * Shards per row so that the rows alive at the same time stay within the
 * density cap. 0 means "no shards, the row fades in over itemMs".
 */
export function shardsPerItem(count: number, density: Density, staggerMs: number, itemMs: number): number {
  if (count <= 0) return 0;
  const concurrent = staggerMs > 0 ? Math.min(count, Math.ceil((itemMs + SHARD_FADE_MS) / staggerMs)) : count;
  const k = Math.min(MAX_SHARDS_PER_ROW, Math.floor(SHARD_CAPS[density] / concurrent));
  const even = k - (k % 2);
  return even >= 2 ? even : 0;
}

const ASSEMBLE_FLIGHT: FlightProfile = {
  minDistance: SHATTER_IN_TIMELINE.minDistance,
  maxDistance: SHATTER_IN_TIMELINE.maxDistance,
  maxRotateDeg: SHATTER_IN_TIMELINE.maxRotateDeg,
};

export function playShatterIn(items: readonly Element[], options: ShatterInOptions = {}): ShatterHandle {
  const tl = new Timeline();
  const stagger = options.staggerMs ?? SHATTER_IN_TIMELINE.staggerMs;
  const itemMs = options.itemMs ?? SHATTER_IN_TIMELINE.itemMs;
  const density = options.density ?? 'phone';
  const seed = autoSeed(options.seed, 'shatter-in');
  const standard = readEasing('--ease-standard');
  const emphasized = readEasing('--ease-emphasized');
  const offset = Math.max(0, options.delayMs ?? 0);

  if (options.reducedMotion) {
    const anims = items.map((el) =>
      safeAnimate(el, [{ opacity: 0 }, { opacity: 1 }], {
        duration: REDUCED_CROSSFADE_MS,
        delay: offset,
        easing: standard,
        fill: 'backwards',
      }),
    );
    tl.at(offset, () => items.forEach((_, i) => options.onItemRevealed?.(i)));
    tl.at(offset + REDUCED_CROSSFADE_MS, () => options.onDone?.());
    return handleOf(() => {
      tl.clear();
      anims.forEach((a) => a?.cancel());
    });
  }

  const perItem = shardsPerItem(items.length, density, stagger, itemMs);
  const restores = items.map((el) => hideElement(el));
  const layers: ShardLayer[] = [];
  items.forEach((el, i) => {
    const start = offset + i * stagger;
    let layer: ShardLayer | null = null;
    tl.at(start, () => {
      if (perItem === 0) return;
      const rect = boxOf(el);
      const shards = createShards(localRect(rect), {
        seed: `${String(seed)}:${i}`,
        density,
        flight: ASSEMBLE_FLIGHT,
        maxShards: perItem,
      });
      if (shards.length === 0) return;
      layer = mountShardLayer(shards, { rect, variant: 'shatter-in' });
      layers.push(layer);
      for (const m of layer.shards) {
        const f = m.shard.flight;
        layer.animate(
          m.el,
          [
            { transform: m.at(f.dx, f.dy, f.rotateDeg), opacity: 0 },
            { transform: m.at(0, 0), opacity: 1 },
          ],
          { duration: itemMs, easing: emphasized, fill: 'both' },
        );
      }
    });
    tl.at(start + itemMs, () => {
      restores[i]();
      if (!layer) {
        // No shard budget left for this row: plain fade instead.
        safeAnimate(el, [{ opacity: 0 }, { opacity: 1 }], { duration: SHARD_FADE_MS, easing: standard });
      } else {
        const l: ShardLayer = layer;
        for (const m of l.shards) {
          l.animate(m.el, [{ opacity: 1 }, { opacity: 0 }], { duration: SHARD_FADE_MS, fill: 'forwards' });
        }
      }
      options.onItemRevealed?.(i);
    });
    tl.at(start + itemMs + SHARD_FADE_MS, () => {
      const l: ShardLayer | null = layer;
      l?.destroy();
    });
  });
  tl.at(offset + Math.max(0, (items.length - 1) * stagger + itemMs), () => options.onDone?.());
  return handleOf(() => {
    tl.clear();
    restores.forEach((r) => r());
    layers.forEach((l) => l.destroy());
  });
}

// ---------------------------------------------------------------------------
// Burst (Stop the Clock reveal dots)
// ---------------------------------------------------------------------------

export interface BurstOptions extends CommonOptions {
  /** When the dot appears, ms from the call. The dot is hidden until then. */
  delayMs?: number;
  /** Shards in this burst (0 = plain fade-in). Defaults to STC_REVEAL_TIMELINE.shardsPerBurst. */
  shards?: number;
  /** The dot has appeared (delayMs). */
  onAppear?: () => void;
  /** delayMs + burstMs (delayMs + 200 with reduced motion). */
  onDone?: () => void;
}

const BURST_FLIGHT: FlightProfile = {
  minDistance: STC_REVEAL_TIMELINE.minDistance,
  maxDistance: STC_REVEAL_TIMELINE.maxDistance,
  maxRotateDeg: STC_REVEAL_TIMELINE.maxRotateDeg,
};

/** The burst covers the dot's box grown by this factor. */
const BURST_BOX_SCALE = 1.6;

/**
 * The element (a guess dot) appears at `delayMs` with a small ring of
 * shards bursting outward and fading. Only the dot's opacity is touched,
 * never its own transform (the host may position dots with it).
 */
export function playBurst(el: Element, options: BurstOptions = {}): ShatterHandle {
  const tl = new Timeline();
  const delay = Math.max(0, options.delayMs ?? 0);
  const restore = hideElement(el);
  const standard = readEasing('--ease-standard');
  const emphasized = readEasing('--ease-emphasized');
  let layer: ShardLayer | null = null;
  let fade: Animation | null = null;
  const count = options.shards ?? STC_REVEAL_TIMELINE.shardsPerBurst;
  const reduced = options.reducedMotion === true;
  const length = reduced ? REDUCED_CROSSFADE_MS : STC_REVEAL_TIMELINE.burstMs;

  tl.at(delay, () => {
    restore();
    fade = safeAnimate(el, [{ opacity: 0 }, { opacity: 1 }], {
      duration: reduced ? REDUCED_CROSSFADE_MS : length / 2,
      easing: reduced ? standard : emphasized,
    });
    options.onAppear?.();
    if (reduced || count < 2) return;
    const box = boxOf(el);
    const rect = {
      x: box.x - (box.width * (BURST_BOX_SCALE - 1)) / 2,
      y: box.y - (box.height * (BURST_BOX_SCALE - 1)) / 2,
      width: box.width * BURST_BOX_SCALE,
      height: box.height * BURST_BOX_SCALE,
    };
    const shards = createShards(localRect(rect), {
      seed: autoSeed(options.seed, 'burst'),
      density: options.density ?? 'projector',
      flight: BURST_FLIGHT,
      maxShards: count,
    });
    if (shards.length === 0) return;
    const l = mountShardLayer(shards, { rect, variant: 'burst' });
    layer = l;
    for (const m of l.shards) {
      const f = m.shard.flight;
      l.animate(
        m.el,
        [
          { transform: m.at(0, 0), opacity: 1 },
          { transform: m.at(f.dx, f.dy, f.rotateDeg, 0.6), opacity: 0 },
        ],
        { duration: length, easing: emphasized, fill: 'forwards' },
      );
    }
  });
  tl.at(delay + length, () => {
    const l: ShardLayer | null = layer;
    l?.destroy();
    options.onDone?.();
  });
  return handleOf(() => {
    tl.clear();
    restore();
    const a: Animation | null = fade;
    a?.cancel();
    const l: ShardLayer | null = layer;
    l?.destroy();
  });
}

export interface RevealSlot {
  strip: number;
  index: number;
  delayMs: number;
  /** Shards for this dot's burst (0 = plain fade-in), keeping concurrent shards ≤ the cap. */
  shards: number;
}

/**
 * Timing for the Stop the Clock reveal: strips burst in one after another
 * within `totalMs` (5 s), dots of a strip spread evenly across its window,
 * the last burst of the last strip ending at `totalMs`. `counts[s]` is the
 * number of dots in strip s, in the order they should appear.
 */
export function revealSchedule(
  counts: readonly number[],
  options: { density?: Density; totalMs?: number; burstMs?: number } = {},
): RevealSlot[][] {
  const total = options.totalMs ?? STC_REVEAL_TIMELINE.totalMs;
  const burst = options.burstMs ?? STC_REVEAL_TIMELINE.burstMs;
  const cap = SHARD_CAPS[options.density ?? 'projector'];
  const windowMs = counts.length > 0 ? total / counts.length : 0;
  const span = Math.max(0, windowMs - burst);
  return counts.map((count, strip) => {
    const spacing = count > 1 ? span / (count - 1) : Infinity;
    const concurrent = Math.max(1, Math.min(count, spacing > 0 ? Math.ceil(burst / spacing) : count));
    const k = Math.min(STC_REVEAL_TIMELINE.shardsPerBurst, Math.floor(cap / concurrent));
    const shards = k - (k % 2) >= 2 ? k - (k % 2) : 0;
    return Array.from({ length: count }, (_, index) => ({
      strip,
      index,
      delayMs: Math.round(strip * windowMs + (count > 1 ? index * spacing : 0)),
      shards,
    }));
  });
}

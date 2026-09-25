/**
 * The ~15 s day-board merge (docs/DESIGN_SYSTEM.md §6.2, SCREENS.md H4 → H5).
 *
 * One continuous swarm of small mosaic tiles carries this session's scores
 * from the session board into each game's day board, then settles. It plays
 * over the stage only: the tile layer is clipped to the stage's box, so the
 * header (with the logo, §5) and the operator bar are never covered.
 *
 * Data-agnostic: it knows a stage element (the host container that shows the
 * session results at t = 0 and the day board afterwards), the session rows
 * the tiles crack out of (`sources`), one entry per game and, per game,
 * resolved lazily, the target rows (elements or rects) that are new or
 * improved. The host switches tabs from the callbacks.
 *
 * Timeline for n games (n = 3 → 15 000 ms), all times from the call:
 *   0          the source rows crack into tiles (≤ 4 per row, row-sized) that loosen
 *              and drift a little; the session results fade out (250–1150 ms)
 *   1500       onFragmented()
 *   g = 1500 + 4000·i
 *              onGameStart(game, i): the host renders tab i *synchronously*
 *              (<DayBoardMerge> wraps it in flushSync); targets() is read at once
 *              and the target rows are hidden before a frame is painted; the
 *              stage fades in (360 ms)
 *   g + 200    the tiles glide from where they float into the target rows (row by
 *              row, each glide 1.6 s, the last landing at g + 2600)
 *   g + 2600   onRowsReassemble(game, i, targets): the rows fade in as the tiles fade out
 *   g + 3500   (not after the last game) the rows' tiles break off again and loosen:
 *              they are what glides into the next tab
 *   g + 4000   onGameEnd(game, i)
 *   1500 + 4000·n   onSettle(): the host shows the first tab (stage fades in)
 *   + 1500     onDone()
 * A game with no targets lets the floating tiles fade; the next game's tiles
 * then assemble from close by. At most SHARD_CAPS[density] tiles are alive.
 *
 * Reduced motion: no tiles. The stage fades out 0–100 ms; at 100 onFragmented +
 * onGameStart(games[0], 0) and the stage fades back in; at 200
 * onRowsReassemble(games[0], 0, …), onSettle, onDone.
 */
import { Rng } from '../../lib/rng';
import { MERGE_FILLS, SHARD_CAPS, createShards, type Density, type Rect, type Shard } from './geometry';
import { DAY_BOARD_MERGE_TIMELINE as T, REDUCED_CROSSFADE_MS, Timeline, mergeTotalMs, readEasing } from './motion';
import type { ShatterHandle } from './plays';
import { boxOf, hideElement, mountShardLayer, safeAnimate, type MountedShard } from './renderer';

export type MergeTarget = Element | DOMRectReadOnly | Rect;

export interface DayBoardMergeGame {
  id: string;
  /**
   * Rows that entered or rose in this game's day board, read right after
   * onGameStart (which must have rendered the tab). Elements are hidden until
   * they reassemble; plain rects only receive tiles.
   */
  targets?: () => readonly MergeTarget[];
}

export interface DayBoardMergeOptions {
  stage: HTMLElement;
  games: readonly DayBoardMergeGame[];
  /** The session rows the tiles crack out of at t = 0 (default: bands of the stage). */
  sources?: () => readonly MergeTarget[];
  density?: Density;
  seed?: string | number;
  reducedMotion?: boolean;
  onFragmented?: () => void;
  onGameStart?: (game: DayBoardMergeGame, index: number) => void;
  onRowsReassemble?: (game: DayBoardMergeGame, index: number, targets: readonly MergeTarget[]) => void;
  onGameEnd?: (game: DayBoardMergeGame, index: number) => void;
  onSettle?: () => void;
  onDone?: () => void;
}

/** Offsets (from the timeline start) of every callback, for hosts and tests. */
export function mergeSchedule(games: number) {
  const gameStarts = Array.from({ length: games }, (_, i) => T.fragmentMs + i * T.perGameMs);
  return {
    fragmentedAt: T.fragmentMs,
    gameStarts,
    glideAt: gameStarts.map((g) => g + T.streamDelayMs),
    reassembleAt: gameStarts.map((g) => g + T.streamDelayMs + T.streamMs),
    crackAt: gameStarts.slice(0, -1).map((g) => g + T.perGameMs - T.crackMs),
    gameEnds: gameStarts.map((g) => g + T.perGameMs),
    settleAt: T.fragmentMs + games * T.perGameMs,
    doneAt: mergeTotalMs(games),
  };
}

function isElement(t: MergeTarget): t is Element {
  return typeof (t as Element).getBoundingClientRect === 'function';
}

/** Tiles per row so that `rows` rows fit the cap: even, 2…maxTilesPerRow. */
export function tilesPerRow(rows: number, cap: number): number {
  if (rows <= 0) return 0;
  const k = Math.min(T.maxTilesPerRow, Math.floor(cap / rows));
  return Math.max(2, k - (k % 2));
}

/**
 * `count` row-sized tiles on one row: a short segment of the row (cells of
 * tileScale × the row height) at a seeded position, triangulated like every
 * shard (§6.2), in the merge palette. Flights are the loosening drift.
 */
export function rowTiles(row: Rect, count: number, seed: string, density: Density): Shard[] {
  const h = row.height;
  if (!(row.width > 0 && h > 0) || count < 2) return [];
  const cell = h * T.tileScale;
  const width = Math.min(row.width, (count / 2) * cell);
  const x = row.x + new Rng(`${seed}:at`).float() * (row.width - width);
  return createShards(
    { x, y: row.y, width, height: h },
    {
      seed,
      density,
      maxShards: count,
      fills: MERGE_FILLS,
      flight: { minDistance: T.driftMin * h, maxDistance: T.driftMax * h, maxRotateDeg: T.maxRotateDeg, spreadDeg: 70 },
    },
  );
}

/** Tiles are drawn slightly inset so the grout between them shows (a mosaic, not a slab). */
const S = T.tileInset;

/** A tile of the swarm and the offset it currently rests at (where its last animation ended). */
interface Tile {
  m: MountedShard;
  row: number;
  dx: number;
  dy: number;
  rot: number;
}

export function playDayBoardMerge(options: DayBoardMergeOptions): ShatterHandle {
  const tl = new Timeline();
  const { stage, games } = options;
  const originalOpacity = stage.style.opacity;
  const standard = readEasing('--ease-standard');
  const stageAnims: Animation[] = [];
  const rowAnims: Animation[] = [];
  const restores: Array<() => void> = [];

  const cancelStage = () => stageAnims.splice(0).forEach((a) => a.cancel());
  const fadeStageOut = (ms: number, delay = 0) => {
    cancelStage();
    stage.style.opacity = '0';
    const a = safeAnimate(stage, [{ opacity: 1 }, { opacity: 0 }], { duration: ms, delay, easing: standard, fill: 'backwards' });
    if (a) stageAnims.push(a);
  };
  const fadeStageIn = (ms: number) => {
    cancelStage();
    stage.style.opacity = originalOpacity;
    const a = safeAnimate(stage, [{ opacity: 0 }, { opacity: 1 }], { duration: ms, easing: standard });
    if (a) stageAnims.push(a);
  };
  const read = (get: (() => readonly MergeTarget[]) | undefined): readonly MergeTarget[] => {
    try {
      return get?.() ?? [];
    } catch {
      return [];
    }
  };

  if (options.reducedMotion) {
    const half = REDUCED_CROSSFADE_MS / 2;
    fadeStageOut(half);
    tl.at(half, () => {
      options.onFragmented?.();
      if (games[0]) options.onGameStart?.(games[0], 0);
      fadeStageIn(half);
    });
    tl.at(REDUCED_CROSSFADE_MS, () => {
      if (games[0]) options.onRowsReassemble?.(games[0], 0, read(games[0].targets));
      options.onSettle?.();
      options.onDone?.();
    });
    return {
      cancel() {
        tl.clear();
        cancelStage();
        stage.style.opacity = originalOpacity;
      },
    };
  }

  const density = options.density ?? 'projector';
  const cap = SHARD_CAPS[density];
  const seed = String(options.seed ?? 'merge');
  // The tiles live on one layer clipped to the stage's box (viewport coordinates → layer-local).
  const area = boxOf(stage);
  const layer = mountShardLayer([], { rect: area, variant: 'merge', clip: true });
  const local = (t: MergeTarget): Rect => {
    const r = boxOf(t);
    return { x: r.x - area.x, y: r.y - area.y, width: r.width, height: r.height };
  };

  /** Tiles over the given rows (at rest), within the cap; `row` is the row's index. */
  const tilesOn = (rows: readonly MergeTarget[], key: string): Tile[] => {
    const rects = rows.map(local).filter((r) => r.width > 0 && r.height > 0);
    const per = tilesPerRow(rects.length, cap);
    const used = per > 0 ? Math.min(rects.length, Math.floor(cap / per)) : 0;
    const out: Tile[] = [];
    for (let r = 0; r < used; r++) {
      const mounted = layer.add(rowTiles(rects[r], per, `${seed}:${key}:${r}`, density));
      for (const m of mounted) out.push({ m, row: r, dx: 0, dy: 0, rot: 0 });
    }
    return out;
  };
  /** Tiles appear at rest on their rows (the rows crack), then loosen over `ms`. */
  const crack = (tiles: Tile[], ms: number) => {
    for (const t of tiles) {
      const f = t.m.shard.flight;
      layer.animate(
        t.m.el,
        [
          { transform: t.m.at(0, 0, 0, S), opacity: 0 },
          { transform: t.m.at(0, 0, 0, S), opacity: 1, offset: 0.15 },
          { transform: t.m.at(f.dx, f.dy, f.rotateDeg, S), opacity: 1 },
        ],
        { duration: ms, easing: standard, fill: 'forwards' },
      );
      t.dx = f.dx;
      t.dy = f.dy;
      t.rot = f.rotateDeg;
    }
  };
  const fadeAway = (tiles: Tile[]) => {
    if (tiles.length === 0) return;
    for (const t of tiles) layer.animate(t.m.el, [{ opacity: 1 }, { opacity: 0 }], { duration: T.fadeMs, fill: 'forwards' });
    tl.at(T.fadeMs, () => layer.remove(tiles.map((t) => t.m)));
  };

  // 0–1500: the session rows crack into tiles; the results fade out under them.
  let sources = read(options.sources);
  if (sources.length === 0) {
    const bands = 8;
    sources = Array.from({ length: bands }, (_, b) => ({
      x: area.x,
      y: area.y + (b * area.height) / bands,
      width: area.width,
      height: area.height / bands,
    }));
  }
  let swarm: Tile[] = tilesOn(sources, 'from');
  crack(swarm, T.fragmentMs);
  fadeStageOut(T.fragmentFadeMs, T.fragmentFadeDelayMs);
  tl.at(T.fragmentMs, () => options.onFragmented?.());

  const schedule = mergeSchedule(games.length);
  games.forEach((game, i) => {
    const g = schedule.gameStarts[i];
    let targets: readonly MergeTarget[] = [];
    let restoreRows: Array<() => void> = [];

    tl.at(g, () => {
      options.onGameStart?.(game, i);
      // The tab is rendered (synchronously): hide its new rows before anything is painted.
      targets = read(game.targets);
      restoreRows = targets.filter(isElement).map((el) => hideElement(el));
      restores.push(...restoreRows);
      fadeStageIn(T.fadeMs);
    });

    tl.at(g + T.streamDelayMs, () => {
      const dest = tilesOn(targets, String(i));
      if (dest.length === 0) {
        fadeAway(swarm);
        swarm = [];
        return;
      }
      const rows = dest[dest.length - 1].row + 1;
      const spread = rows > 1 ? (T.streamMs - T.glideMs) / (rows - 1) : T.streamMs - T.glideMs;
      dest.forEach((d, j) => {
        const src = swarm.length > 0 ? swarm[j % swarm.length] : null;
        const from: Keyframe = src
          ? {
              transform: d.m.at(
                src.m.shard.centroid.x + src.dx - d.m.shard.centroid.x,
                src.m.shard.centroid.y + src.dy - d.m.shard.centroid.y,
                src.rot,
                S,
              ),
              opacity: 1,
            }
          : // Nothing floating (the last game had no new rows): assemble from close by.
            { transform: d.m.at(2 * d.m.shard.flight.dx, 2 * d.m.shard.flight.dy, d.m.shard.flight.rotateDeg, S), opacity: 0 };
        layer.animate(d.m.el, [from, { transform: d.m.at(0, 0, 0, S), opacity: 1 }], {
          duration: T.glideMs,
          delay: d.row * spread,
          easing: standard,
          fill: 'both',
        });
      });
      // Each floating tile turns into the destination tile(s) that leave from its spot.
      const sourcesUsed = swarm.slice(0, dest.length);
      layer.remove(sourcesUsed.map((t) => t.m));
      fadeAway(swarm.slice(dest.length));
      swarm = dest;
    });

    tl.at(schedule.reassembleAt[i], () => {
      restoreRows.forEach((r) => r());
      for (const el of targets.filter(isElement)) {
        const a = safeAnimate(el, [{ opacity: 0 }, { opacity: 1 }], { duration: T.fadeMs, easing: standard });
        if (a) rowAnims.push(a);
      }
      fadeAway(swarm);
      swarm = [];
      options.onRowsReassemble?.(game, i, targets);
    });

    if (i < games.length - 1) {
      tl.at(schedule.crackAt[i], () => {
        // The reassembled rows crack again; these tiles glide into the next tab.
        swarm = tilesOn(targets, `${i}:out`);
        crack(swarm, T.crackMs + T.streamDelayMs);
      });
    }
    tl.at(schedule.gameEnds[i], () => options.onGameEnd?.(game, i));
  });

  tl.at(schedule.settleAt, () => {
    fadeAway(swarm);
    swarm = [];
    options.onSettle?.();
    fadeStageIn(T.fadeMs);
  });
  tl.at(schedule.doneAt, () => {
    layer.destroy();
    restores.forEach((r) => r());
    stage.style.opacity = originalOpacity;
    options.onDone?.();
  });

  return {
    cancel() {
      tl.clear();
      layer.destroy();
      restores.forEach((r) => r());
      rowAnims.splice(0).forEach((a) => a.cancel());
      cancelStage();
      stage.style.opacity = originalOpacity;
    },
  };
}

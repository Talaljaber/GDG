/**
 * The ~15 s day-board merge (docs/DESIGN_SYSTEM.md §6.2, SCREENS.md H4 → H5).
 *
 * Data-agnostic: it knows a stage element (the host container that shows
 * the session results at t = 0 and the day board afterwards), one entry per
 * game, and — per game, resolved lazily — the target rows (elements or
 * rects) that are new or improved. The host switches tabs, highlights rows
 * and slides them to their rank from the callbacks.
 *
 * Timeline for n games (n = 3 → 15 000 ms), all times from the call:
 *   0                   session results fragment (stage hidden, shards drift)
 *   1500                onFragmented()
 *   g = 1500 + 4000·i   onGameStart(game, i)          host shows tab i
 *   g + 200             targets() read, rows hidden, stage fades in, shards stream to rows
 *   g + 2600            onRowsReassemble(game, i, targets)   rows visible; host highlights/slides
 *   g + 4000            onGameEnd(game, i)
 *   1500 + 4000·n       onSettle()                    host shows the first tab
 *   + 1500              onDone()
 * Reduced motion: stage fades out 0–100 ms; at 100 onFragmented +
 * onGameStart(games[0], 0) and the stage fades back in; at 200
 * onRowsReassemble(games[0], 0, …), onSettle, onDone.
 */
import { Rng } from '../../lib/rng';
import { createShards, type Density, type Rect, type Shard } from './geometry';
import {
  DAY_BOARD_MERGE_TIMELINE as T,
  REDUCED_CROSSFADE_MS,
  SHARD_FADE_MS,
  Timeline,
  mergeTotalMs,
  readEasing,
} from './motion';
import type { ShatterHandle } from './plays';
import {
  boxOf,
  hideElement,
  mountShardLayer,
  safeAnimate,
  viewportRect,
  type MountedShard,
  type ShardLayer,
} from './renderer';

export type MergeTarget = Element | DOMRectReadOnly | Rect;

export interface DayBoardMergeGame {
  id: string;
  /**
   * Rows that entered or rose in this game's day board, read
   * DAY_BOARD_MERGE_TIMELINE.targetResolveMs (200 ms) after onGameStart so
   * the host has rendered the tab. Elements are hidden until they
   * reassemble; plain rects only receive shards.
   */
  targets?: () => readonly MergeTarget[];
}

export interface DayBoardMergeOptions {
  stage: HTMLElement;
  games: readonly DayBoardMergeGame[];
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
    reassembleAt: gameStarts.map((g) => g + T.targetResolveMs + T.streamMs),
    gameEnds: gameStarts.map((g) => g + T.perGameMs),
    settleAt: T.fragmentMs + games * T.perGameMs,
    doneAt: mergeTotalMs(games),
  };
}

function isElement(t: MergeTarget): t is Element {
  return typeof (t as Element).getBoundingClientRect === 'function';
}

export function playDayBoardMerge(options: DayBoardMergeOptions): ShatterHandle {
  const tl = new Timeline();
  const { stage, games } = options;
  const originalOpacity = stage.style.opacity;
  const stageAnims: Animation[] = [];
  const hideStage = () => {
    stage.style.opacity = '0';
  };
  const showStage = (ms: number, easing: string) => {
    stageAnims.splice(0).forEach((a) => a.cancel());
    stage.style.opacity = originalOpacity;
    const a = safeAnimate(stage, [{ opacity: 0 }, { opacity: 1 }], { duration: ms, easing });
    if (a) stageAnims.push(a);
  };
  const standard = readEasing('--ease-standard');
  const readTargets = (game: DayBoardMergeGame) => {
    try {
      return game.targets?.() ?? [];
    } catch {
      return [];
    }
  };

  if (options.reducedMotion) {
    const half = REDUCED_CROSSFADE_MS / 2;
    const out = safeAnimate(stage, [{ opacity: 1 }, { opacity: 0 }], { duration: half, easing: standard, fill: 'forwards' });
    if (out) stageAnims.push(out);
    tl.at(half, () => {
      options.onFragmented?.();
      if (games[0]) options.onGameStart?.(games[0], 0);
      showStage(half, standard);
    });
    tl.at(REDUCED_CROSSFADE_MS, () => {
      if (games[0]) options.onRowsReassemble?.(games[0], 0, readTargets(games[0]));
      options.onSettle?.();
      options.onDone?.();
    });
    return {
      cancel() {
        tl.clear();
        stageAnims.splice(0).forEach((a) => a.cancel());
        stage.style.opacity = originalOpacity;
      },
    };
  }

  const density = options.density ?? 'projector';
  const seed = String(options.seed ?? 'merge');
  const vp = viewportRect();
  const side = Math.max(vp.width, vp.height);
  const source = boxOf(stage);
  // Shards live in viewport coordinates on one full-viewport layer.
  const pool = createShards(source, {
    seed,
    density,
    flight: { minDistance: T.fragmentMinDistance * side, maxDistance: T.fragmentMaxDistance * side, maxRotateDeg: T.maxRotateDeg },
  });
  const layer: ShardLayer = mountShardLayer(pool, { rect: vp, variant: 'merge' });
  hideStage();

  // Split the pool into one random group per game.
  const order = new Rng(`${seed}:groups`).shuffle(layer.shards.slice());
  const groups: MountedShard[][] = games.map(() => []);
  if (groups.length > 0) order.forEach((m, i) => groups[i % groups.length].push(m));

  for (const m of layer.shards) {
    const f = m.shard.flight;
    layer.animate(m.el, [{ transform: m.at(0, 0) }, { transform: m.at(f.dx, f.dy, f.rotateDeg) }], {
      duration: T.fragmentMs,
      easing: standard,
      fill: 'forwards',
    });
  }
  tl.at(T.fragmentMs, () => options.onFragmented?.());

  const restores: Array<() => void> = [];
  const schedule = mergeSchedule(games.length);

  games.forEach((game, i) => {
    const g = schedule.gameStarts[i];
    let targets: readonly MergeTarget[] = [];
    const rowShards: MountedShard[] = [];
    let restoreRows: Array<() => void> = [];
    tl.at(g, () => {
      if (i > 0) hideStage();
      options.onGameStart?.(game, i);
    });
    tl.at(g + T.targetResolveMs, () => {
      targets = readTargets(game);
      restoreRows = targets.filter(isElement).map((el) => hideElement(el));
      restores.push(...restoreRows);
      showStage(REDUCED_CROSSFADE_MS, standard);
      const group = groups[i];
      const budget = group.length;
      const rows = targets.length;
      const perRow = rows > 0 ? Math.max(2, Math.floor(budget / rows / 2) * 2) : 0;
      const streamed = perRow > 0 ? Math.min(rows, Math.floor(budget / perRow)) : 0;
      if (streamed === 0) {
        // Nothing new for this game: its group fades where it floats.
        for (const m of group) {
          layer.animate(m.el, [{ opacity: 1 }, { opacity: 0 }], { duration: T.streamMs / 4, fill: 'forwards' });
        }
        return;
      }
      // The group turns into the row shards below (so the total stays within the cap).
      layer.remove(group);
      const flow = T.streamMs * 0.75;
      const spread = streamed > 1 ? (T.streamMs - flow) / (streamed - 1) : 0;
      let from = 0;
      for (let r = 0; r < streamed; r++) {
        const rect = boxOf(targets[r]);
        const shards: Shard[] = createShards(rect, {
          seed: `${seed}:${i}:${r}`,
          density,
          flight: { minDistance: 0, maxDistance: 0, maxRotateDeg: 0 },
          maxShards: perRow,
        });
        const mounted = layer.add(shards);
        for (const m of mounted) {
          // Each row shard leaves from where one pool shard of this game floats.
          const src = group[from++ % group.length].shard;
          const sx = src.centroid.x + src.flight.dx - m.shard.centroid.x;
          const sy = src.centroid.y + src.flight.dy - m.shard.centroid.y;
          layer.animate(
            m.el,
            [
              { transform: m.at(sx, sy, src.flight.rotateDeg), opacity: 1 },
              { transform: m.at(0, 0), opacity: 1 },
            ],
            { duration: flow, delay: r * spread, easing: standard, fill: 'both' },
          );
        }
        rowShards.push(...mounted);
      }
    });
    tl.at(schedule.reassembleAt[i], () => {
      restoreRows.forEach((r) => r());
      const fading = rowShards;
      for (const m of fading) {
        layer.animate(m.el, [{ opacity: 1 }, { opacity: 0 }], { duration: SHARD_FADE_MS, fill: 'forwards' });
      }
      tl.at(SHARD_FADE_MS, () => layer.remove(fading));
      options.onRowsReassemble?.(game, i, targets);
    });
    tl.at(schedule.gameEnds[i], () => options.onGameEnd?.(game, i));
  });

  tl.at(schedule.settleAt, () => {
    if (games.length === 0) showStage(REDUCED_CROSSFADE_MS, standard);
    options.onSettle?.();
  });
  tl.at(schedule.doneAt, () => {
    layer.destroy();
    options.onDone?.();
  });

  return {
    cancel() {
      tl.clear();
      layer.destroy();
      restores.forEach((r) => r());
      stageAnims.splice(0).forEach((a) => a.cancel());
      stage.style.opacity = originalOpacity;
    },
  };
}

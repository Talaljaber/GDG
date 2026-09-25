/**
 * DOM renderer for the shatter layer.
 *
 * Choice: one absolutely positioned inline <svg> per shard, sized to the
 * shard's bounding box (+1 px), inside one fixed overlay appended to
 * <body>. Only `transform` and `opacity` are ever animated, through the Web
 * Animations API, so every shard is a small compositor layer and the
 * animation runs on the compositor thread even when the main thread is busy
 * (Realtime payloads, React renders). A <canvas> would need a full-viewport
 * JS redraw on the main thread every frame (≈ 2.6 Mpx at DPR 3 on a phone).
 * Bounding-box sizing keeps the GPU memory of 48 layers ≈ 1–2 × the covered
 * area instead of 48 full-screen layers, and the SVG stroke gives the 1 px
 * paper edge without a clip-path mask layer. See README.md.
 *
 * Fills and edges reference the colour tokens with `var()`, so theme
 * changes apply without re-reading them.
 */
import './shatter.css';
import type { Rect, Shard } from './geometry';

const SVG_NS = 'http://www.w3.org/2000/svg';
/** Padding around each shard's box so the 1 px edge stroke isn't cut. */
const PAD = 1;

export const LAYER_CLASS = 'gdg-shatter-layer';
export const SHARD_CLASS = 'gdg-shatter-shard';
export const RING_CLASS = 'gdg-shatter-ring';
export const CLIP_CLASS = 'gdg-shatter-clip';

export interface MountedShard {
  readonly shard: Shard;
  readonly el: SVGSVGElement;
  /** CSS transform placing the shard at its rest position plus an offset. */
  at(dx: number, dy: number, rotateDeg?: number, scale?: number): string;
}

export interface ShardLayer {
  readonly root: HTMLDivElement;
  readonly shards: MountedShard[];
  /** Adds shards (layer-local coordinates). */
  add(shards: readonly Shard[]): MountedShard[];
  /** Removes shards from the DOM. */
  remove(shards: readonly MountedShard[]): void;
  /** The amber ring (created on first call), filling the layer's box. */
  ring(borderRadius?: string): HTMLDivElement;
  /** Tracked Web Animation; cancelled by destroy(). No-op without WAAPI. */
  animate(el: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions): Animation | null;
  destroy(): void;
}

/** Keyframe properties the shatter layer is allowed to animate. */
export const ANIMATABLE = new Set(['transform', 'opacity', 'offset', 'easing', 'composite']);

/** element.animate(), guarded for jsdom and old browsers. */
export function safeAnimate(el: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions): Animation | null {
  if (typeof (el as Element & { animate?: unknown }).animate !== 'function') return null;
  try {
    return el.animate(keyframes, options);
  } catch {
    return null;
  }
}

function makeShard(shard: Shard): MountedShard {
  const bx = shard.bounds.x - PAD;
  const by = shard.bounds.y - PAD;
  const w = shard.bounds.width + 2 * PAD;
  const h = shard.bounds.height + 2 * PAD;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', SHARD_CLASS);
  svg.setAttribute('width', String(w));
  svg.setAttribute('height', String(h));
  svg.setAttribute('viewBox', `${bx} ${by} ${w} ${h}`);
  svg.setAttribute('data-shard', String(shard.id));
  const poly = document.createElementNS(SVG_NS, 'polygon');
  poly.setAttribute('points', shard.points.map((p) => `${p.x},${p.y}`).join(' '));
  poly.style.fill = `var(${shard.fill})`;
  svg.appendChild(poly);
  const at = (dx: number, dy: number, rotateDeg = 0, scale = 1) =>
    `translate(${bx + dx}px, ${by + dy}px) rotate(${rotateDeg}deg) scale(${scale})`;
  svg.style.transformOrigin = `${shard.centroid.x - bx}px ${shard.centroid.y - by}px`;
  svg.style.transform = at(0, 0);
  return { shard, el: svg, at };
}

/**
 * Mounts a shard overlay covering `rect` (viewport coordinates, the layer
 * is `position: fixed`). Shard coordinates are local to the layer.
 */
export function mountShardLayer(
  shards: readonly Shard[],
  options: { rect: Rect; variant: string; parent?: HTMLElement; clip?: boolean },
): ShardLayer {
  const root = document.createElement('div');
  // `clip`: nothing is drawn outside `rect` (the merge keeps its tiles inside the board area).
  root.className = options.clip ? `${LAYER_CLASS} ${CLIP_CLASS}` : LAYER_CLASS;
  root.setAttribute('aria-hidden', 'true');
  // Geometry is physical, like the game canvases: never mirrored in RTL.
  root.setAttribute('dir', 'ltr');
  root.setAttribute('data-shatter-layer', options.variant);
  root.style.width = `${options.rect.width}px`;
  root.style.height = `${options.rect.height}px`;
  root.style.transform = `translate(${options.rect.x}px, ${options.rect.y}px)`;

  const mounted: MountedShard[] = [];
  const animations = new Set<Animation>();
  let ringEl: HTMLDivElement | null = null;
  let destroyed = false;

  const layer: ShardLayer = {
    root,
    shards: mounted,
    add(list) {
      const created = list.map(makeShard);
      const frag = document.createDocumentFragment();
      for (const m of created) frag.appendChild(m.el);
      root.appendChild(frag);
      mounted.push(...created);
      return created;
    },
    remove(list) {
      for (const m of list) {
        m.el.remove();
        const i = mounted.indexOf(m);
        if (i >= 0) mounted.splice(i, 1);
      }
    },
    ring(borderRadius) {
      if (!ringEl) {
        ringEl = document.createElement('div');
        ringEl.className = RING_CLASS;
        ringEl.setAttribute('data-shatter-ring', '');
        if (borderRadius) ringEl.style.borderRadius = borderRadius;
        root.appendChild(ringEl);
      }
      return ringEl;
    },
    animate(el, keyframes, opts) {
      if (destroyed) return null;
      const a = safeAnimate(el, keyframes, opts);
      if (a) {
        animations.add(a);
        a.onfinish = () => animations.delete(a);
      }
      return a;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const a of animations) {
        try {
          a.cancel();
        } catch {
          // already gone
        }
      }
      animations.clear();
      root.remove();
    },
  };
  layer.add(shards);
  (options.parent ?? document.body).appendChild(root);
  return layer;
}

/** The viewport as a rect (0, 0, innerWidth, innerHeight). */
export function viewportRect(): Rect {
  return { x: 0, y: 0, width: window.innerWidth || 0, height: window.innerHeight || 0 };
}

/** An element's (or rect's) box in viewport coordinates. */
export function boxOf(target: Element | DOMRectReadOnly | Rect): Rect {
  const r = 'getBoundingClientRect' in target ? target.getBoundingClientRect() : target;
  return { x: r.x, y: r.y, width: r.width, height: r.height };
}

/** Moves a rect to the origin (for shards local to a layer placed at that rect). */
export function localRect(rect: Rect): Rect {
  return { x: 0, y: 0, width: rect.width, height: rect.height };
}

/**
 * Hides an element with inline opacity and returns a function restoring the
 * previous inline value. Used for content the shards stand in for.
 */
export function hideElement(el: Element): () => void {
  const style = (el as HTMLElement).style;
  if (!style) return () => {};
  const previous = style.opacity;
  style.opacity = '0';
  let restored = false;
  return () => {
    if (restored) return;
    restored = true;
    style.opacity = previous;
  };
}

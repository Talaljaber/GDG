/**
 * Test helpers for the shatter layer (jsdom has no Web Animations API, no
 * matchMedia and zero-sized layout boxes).
 */
import { vi } from 'vitest';

export interface AnimateCall {
  el: Element;
  keyframes: Keyframe[];
  options: KeyframeAnimationOptions;
}

/** Installs a recording Element.prototype.animate; returns the call log and a restore(). */
export function stubAnimate(): { calls: AnimateCall[]; restore: () => void } {
  const calls: AnimateCall[] = [];
  const proto = Element.prototype as Element & { animate?: unknown };
  const had = Object.prototype.hasOwnProperty.call(proto, 'animate');
  const previous = proto.animate;
  Object.defineProperty(proto, 'animate', {
    configurable: true,
    writable: true,
    value(this: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions) {
      calls.push({ el: this, keyframes, options });
      return { cancel: vi.fn(), finish: vi.fn(), onfinish: null } as unknown as Animation;
    },
  });
  return {
    calls,
    restore() {
      if (had) Object.defineProperty(proto, 'animate', { configurable: true, writable: true, value: previous });
      else delete (proto as { animate?: unknown }).animate;
    },
  };
}

export function mockReducedMotion(reduce: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: reduce && query.includes('reduce'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
}

export function clearMatchMedia(): void {
  delete (window as { matchMedia?: unknown }).matchMedia;
}

/** Every element box reports `rect` (jsdom boxes are all zero). */
export function mockBoxes(rect = { x: 100, y: 120, width: 320, height: 48 }) {
  return vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
    () =>
      ({
        ...rect,
        top: rect.y,
        left: rect.x,
        right: rect.x + rect.width,
        bottom: rect.y + rect.height,
        toJSON: () => rect,
      }) as DOMRect,
  );
}

export function layers(variant?: string): HTMLElement[] {
  const sel = variant ? `[data-shatter-layer="${variant}"]` : '[data-shatter-layer]';
  return Array.from(document.querySelectorAll<HTMLElement>(sel));
}

export function shardCount(variant?: string): number {
  return layers(variant).reduce((n, l) => n + l.querySelectorAll('[data-shard]').length, 0);
}

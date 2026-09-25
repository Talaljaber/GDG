/**
 * FLIP reorder for the big-screen boards (host v3 "Stage and Rail", plan §4.3/§4.4,
 * ADR-135): when a list's row order changes, every row that moved slides from its old
 * place to its new one (`--dur-reorder`, transform only), the rows that climbed pulse
 * once (`pulseClass`, `--dur-pulse`) and, with `enter`, new rows fade and settle in
 * (`--dur-enter`, cascading by `--stagger-row`).
 *
 * Hand-rolled, no dependency: rows are measured (`[data-reveal-key]` rects, relative to
 * the list) in a layout effect after every commit that rendered the list, and on window
 * resize; when the key order changes, the next layout effect compares the new rects with
 * the stored ones, sets the inverting `transform` and plays it back to rest with the Web
 * Animations API. Nothing goes through React state, so a reorder costs no extra commit
 * (`TESTING.md` §9 render budget).
 *
 * Reduced motion (OS setting, `data-motion="reduced"` on <html>, or `enabled: false`):
 * no transform, no pulse, no entry; rows are simply at their new place.
 */
import { useLayoutEffect, useRef, type RefObject } from 'react';
import { prefersReducedMotion } from '../effects/shatter';

/** The attribute that names a row inside the list (shared with the reveal/merge code). */
export const FLIP_KEY_ATTR = 'data-reveal-key';

/** Entry slide distance (plan §3.4: opacity 0→1 + translateY(8px→0)). */
const ENTER_DISTANCE_PX = 8;

/** True when the OS or the host toggle (`data-motion="reduced"`) asks for reduced motion. */
export function motionReducedNow(): boolean {
  if (prefersReducedMotion()) return true;
  return typeof document !== 'undefined' && document.documentElement.dataset.motion === 'reduced';
}

/**
 * A duration token from `tokens.css` in ms (`--dur-reorder` → 400). The reduced-motion
 * rules zero these tokens, so the value follows the OS and host setting. Falls back
 * where no stylesheet is loaded (unit tests).
 */
export function tokenMs(name: string, fallback: number): number {
  const raw = readToken(name);
  if (!raw) return fallback;
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return fallback;
  if (raw.endsWith('ms')) return n;
  if (raw.endsWith('s')) return n * 1000;
  return fallback;
}

/** An easing token from `tokens.css` (`--ease-standard`), with a fallback. */
export function tokenEasing(name: string, fallback: string): string {
  return readToken(name) || fallback;
}

function readToken(name: string): string {
  if (typeof document === 'undefined' || typeof getComputedStyle !== 'function') return '';
  try {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  } catch {
    return '';
  }
}

const EASE_STANDARD = 'cubic-bezier(0.2, 0, 0, 1)';

/**
 * Plays `className` on `el` once for `ms` (removed afterwards; restarted if it is
 * already on). Returns the timer so a caller can clear it.
 */
export function pulseElement(el: Element | null | undefined, className: string, ms: number): number | undefined {
  if (!el || !className || ms <= 0) return undefined;
  el.classList.remove(className);
  // Restart the CSS animation when the class was already on.
  void (el as HTMLElement).offsetWidth;
  el.classList.add(className);
  return window.setTimeout(() => el.classList.remove(className), ms);
}

export interface FlipOptions {
  /** Reorder duration in ms (`--dur-reorder`); 0 = no FLIP. */
  duration: number;
  /** Class added to rows that climbed, for `pulseDuration` ms (`--dur-pulse`). */
  pulseClass: string;
  /** false: rows are simply at their place (reduced motion, or while another effect owns them). */
  enabled: boolean;
  /** Pulse length in ms; default `--dur-pulse` (500). */
  pulseDuration?: number;
  /** Easing for the reorder and the entry; default `--ease-standard`. */
  easing?: string;
  /** New rows fade + settle in; on the first commit all rows cascade top to bottom. */
  enter?: { duration: number; stagger: number };
}

type Tops = Map<string, number>;

function rowsOf(root: HTMLElement): Map<string, HTMLElement> {
  const byKey = new Map<string, HTMLElement>();
  root.querySelectorAll<HTMLElement>(`[${FLIP_KEY_ATTR}]`).forEach((el) => {
    const k = el.getAttribute(FLIP_KEY_ATTR);
    if (k !== null) byKey.set(k, el);
  });
  return byKey;
}

function measure(root: HTMLElement, rows: Map<string, HTMLElement>): Tops {
  const origin = root.getBoundingClientRect();
  const tops: Tops = new Map();
  rows.forEach((el, k) => tops.set(k, el.getBoundingClientRect().top - origin.top));
  return tops;
}

/**
 * FLIP the `[data-reveal-key]` rows inside `listRef` when `keys` (the rows' order)
 * changes. Put `data-reveal-key={key}` on every row, in the order of `keys`.
 */
export function useFlipRows(
  listRef: RefObject<HTMLElement>,
  keys: readonly string[],
  opts: FlipOptions,
): void {
  const keyList = keys.join('\n');
  const optsRef = useRef(opts);
  const state = useRef<{ keys: string | null; tops: Tops | null }>({ keys: null, tops: null });
  const running = useRef(new Map<string, Animation>());
  const timers = useRef(new Set<number>());

  // Latest options, read by the effect below (it runs on every commit of the list).
  useLayoutEffect(() => {
    optsRef.current = opts;
  });

  useLayoutEffect(() => {
    const root = listRef.current;
    if (!root) return;
    const s = state.current;
    const anims = running.current;
    const changed = s.keys !== keyList;

    if (!changed) {
      // Same order: keep the stored rects fresh, unless a slide is still measuring its transform.
      if (anims.size === 0) s.tops = measure(root, rowsOf(root));
      return;
    }

    // The order changed: stop what is still sliding so the new rects are the resting ones.
    anims.forEach((a) => a.cancel());
    anims.clear();
    const rows = rowsOf(root);
    const tops = measure(root, rows);
    const before = s.tops;
    const beforeKeys = s.keys === null ? null : s.keys ? s.keys.split('\n') : [];
    s.keys = keyList;
    s.tops = tops;

    const { duration, pulseClass, enabled, enter } = optsRef.current;
    if (!enabled || motionReducedNow()) return;
    const easing = optsRef.current.easing ?? tokenEasing('--ease-standard', EASE_STANDARD);
    const pulseMs = optsRef.current.pulseDuration ?? tokenMs('--dur-pulse', 500);
    const current = keyList ? keyList.split('\n') : [];
    const canAnimate = typeof (root as HTMLElement & { animate?: unknown }).animate === 'function';

    const play = (k: string, el: HTMLElement, keyframes: Keyframe[], options: KeyframeAnimationOptions) => {
      if (!canAnimate) return;
      const a = el.animate(keyframes, options);
      anims.set(k, a);
      a.onfinish = () => {
        if (anims.get(k) === a) anims.delete(k);
      };
      a.oncancel = a.onfinish;
    };

    // Entries: everything on the first commit (the cascade), then rows that are new.
    const fresh = current.filter((k) => !before || !before.has(k));
    if (enter && enter.duration > 0) {
      fresh.forEach((k, i) => {
        const el = rows.get(k);
        if (!el) return;
        play(k, el, [
          { opacity: 0, transform: `translateY(${ENTER_DISTANCE_PX}px)` },
          { opacity: 1, transform: 'none' },
        ], { duration: enter.duration, delay: i * enter.stagger, easing, fill: 'backwards' });
      });
    }
    if (!before || !beforeKeys) return;

    // Moves: invert every row whose place changed, play it back to rest; pulse the climbers.
    const stayed = (k: string) => before.has(k) && tops.has(k);
    const oldOrder = beforeKeys.filter(stayed);
    const newOrder = current.filter(stayed);
    const oldIndex = new Map(oldOrder.map((k, i) => [k, i]));
    newOrder.forEach((k, i) => {
      const el = rows.get(k);
      if (!el) return;
      const dy = (before.get(k) as number) - (tops.get(k) as number);
      if (duration > 0 && Math.abs(dy) >= 1) {
        el.style.transform = `translateY(${dy}px)`;
        play(k, el, [{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration, easing });
        // The animation now holds the start frame; the inline invert is no longer needed.
        el.style.transform = '';
      }
      if (i < (oldIndex.get(k) as number)) {
        const id = pulseElement(el, pulseClass, pulseMs);
        if (id !== undefined) timers.current.add(id);
      }
    });
    // Every commit of the list: the key list is the trigger, options are read when it fires.
  });

  // Window resizes move rows without a commit: re-measure while nothing is sliding.
  useLayoutEffect(() => {
    const onResize = () => {
      const root = listRef.current;
      if (root && running.current.size === 0) state.current.tops = measure(root, rowsOf(root));
    };
    window.addEventListener('resize', onResize);
    const anims = running.current;
    const pending = timers.current;
    return () => {
      window.removeEventListener('resize', onResize);
      anims.forEach((a) => a.cancel());
      anims.clear();
      pending.forEach((id) => window.clearTimeout(id));
      pending.clear();
      // A StrictMode remount replays like a real mount.
      state.current = { keys: null, tops: null };
    };
  }, [listRef]);
}

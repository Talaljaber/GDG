/**
 * Count-up for big-screen numbers (host v3 "Stage and Rail", plan §4.4/§4.5, ADR-135):
 * a board total or the winner's total runs in whole-number steps from the value it
 * showed last (0 on first show) to the new value, easing out over `duration`
 * (`--dur-countup` 1.2 s, `--dur-countup-hero` 1.6 s), after `delay` (the row cascade).
 *
 * It writes `textContent` of the element in `ref` from requestAnimationFrame and never
 * touches React state, so a count-up costs no commit (`TESTING.md` §9 render budget).
 * The element must render `formatNumber(value)` as its only child (React then keeps
 * the final text, and the effect below overwrites it with the start value before the
 * browser paints). Every run ends exactly on `formatNumber(value)`.
 *
 * Reduced motion (OS setting, `data-motion="reduced"`, `enabled: false` or a 0 duration):
 * the final value at once.
 */
import { useLayoutEffect, useRef, type RefObject } from 'react';
import { formatNumber } from '../i18n';
import { motionReducedNow } from './flip';

export interface CountUpOptions {
  /** ms from the start value to `value` (after `delay`). */
  duration: number;
  /** ms to hold the start value first. */
  delay?: number;
  /** false: show `value` at once (and count from it next time). */
  enabled: boolean;
}

interface Run {
  from: number;
  to: number;
  start: number;
  duration: number;
}

/** Ease-out cubic: fast first, settling on the target (no overshoot, ADR-135). */
function easeOut(p: number): number {
  return 1 - (1 - p) ** 3;
}

function valueAt(run: Run, now: number): number {
  const p = run.duration > 0 ? Math.min(1, Math.max(0, (now - run.start) / run.duration)) : 1;
  return Math.round(run.from + (run.to - run.from) * easeOut(p));
}

export function useCountUp(ref: RefObject<HTMLElement>, value: number, opts: CountUpOptions): void {
  /** The number on screen now (null before the first show). */
  const shown = useRef<number | null>(null);
  const run = useRef<Run | null>(null);
  const frame = useRef(0);
  const { duration, delay = 0, enabled } = opts;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const now = performance.now();
    // Mid-count, carry on from the number on screen (never a jump).
    const from = shown.current ?? 0;
    cancelAnimationFrame(frame.current);
    run.current = null;

    const final = formatNumber(value);
    const instant =
      !enabled || duration <= 0 || motionReducedNow() || from === value || typeof requestAnimationFrame !== 'function';
    if (instant) {
      if (el.textContent !== final) el.textContent = final;
      shown.current = value;
      return;
    }

    const current: Run = { from, to: value, start: now + Math.max(0, delay), duration };
    run.current = current;
    shown.current = from;
    el.textContent = formatNumber(from);
    const tick = () => {
      if (run.current !== current) return;
      const n = valueAt(current, performance.now());
      if (n !== shown.current) {
        shown.current = n;
        el.textContent = formatNumber(n);
      }
      if (performance.now() >= current.start + current.duration) {
        el.textContent = final;
        shown.current = value;
        run.current = null;
        return;
      }
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    // A new value (or switching the count on/off) starts a run; duration and delay are
    // read when it starts, so a row changing place mid-count doesn't restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, enabled]);

  useLayoutEffect(
    () => () => {
      cancelAnimationFrame(frame.current);
      // A StrictMode remount counts again like a real mount.
      run.current = null;
      shown.current = null;
    },
    [],
  );
}

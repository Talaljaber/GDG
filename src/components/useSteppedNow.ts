import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * A clock that re-renders only when something on screen would change
 * (`TESTING.md` §9 "Render budget"). Returns a `Date.now()` value that is
 * checked every `intervalMs` while `active` (the same cadence as a plain
 * ticking clock), but is only replaced when `keyAt(now)` differs from
 * `keyAt(current value)`: e.g. the whole seconds of a countdown, or which
 * screen a flow shows. Anything derived from the returned value through
 * `keyAt`'s inputs is therefore exactly what a plain clock would give.
 *
 * `keyAt` must return a primitive (compared with Object.is). It is also
 * checked after every render, so a change of its inputs (a new round, a new
 * deadline) is picked up before paint rather than at the next tick.
 *
 * Display clocks only: games keep measuring with performance.now() and
 * stored epochs (ADR-018); nothing here feeds a measurement.
 */
export function useSteppedNow(keyAt: (now: number) => unknown, intervalMs: number, active = true): number {
  const [now, setNow] = useState(() => Date.now());
  const keyRef = useRef(keyAt);
  const nowRef = useRef(now);
  useLayoutEffect(() => {
    keyRef.current = keyAt;
    nowRef.current = now;
  });

  const check = useCallback(() => {
    const fresh = Date.now();
    if (!Object.is(keyRef.current(fresh), keyRef.current(nowRef.current))) {
      nowRef.current = fresh;
      setNow(fresh);
    }
  }, []);

  useLayoutEffect(() => {
    if (active) check();
  });

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(check, intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs, active, check]);

  return now;
}

/**
 * Structural sharing for polled data (`TESTING.md` §9 "Render budget").
 * Boards, player rows and session state are re-fetched every few seconds and
 * usually come back identical; storing the new objects would re-render every
 * screen that shows them. `replaceEqualDeep(prev, next)` returns `prev` when
 * the two are deeply equal, and otherwise `next` with every unchanged part
 * replaced by the old object, so `setState((p) => replaceEqualDeep(p, next))`
 * re-renders only on a real change and memoised rows keep their props.
 *
 * Handles what PostgREST returns (plain objects, arrays, strings, numbers,
 * booleans, null). Anything else (Set, Map, Date, class instances) is equal
 * only when it is the same object.
 */

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (typeof v !== 'object' || v === null) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

export function replaceEqualDeep<T>(prev: T, next: T): T {
  if (Object.is(prev, next)) return prev;
  if (Array.isArray(prev) && Array.isArray(next)) {
    let same = prev.length === next.length;
    const out = next.map((item, i) => {
      const kept = i < prev.length ? replaceEqualDeep(prev[i], item) : item;
      if (kept !== prev[i]) same = false;
      return kept;
    });
    return (same ? prev : out) as T;
  }
  if (isPlainObject(prev) && isPlainObject(next)) {
    const prevKeys = Object.keys(prev);
    const nextKeys = Object.keys(next);
    let same = prevKeys.length === nextKeys.length;
    const out: Record<string, unknown> = {};
    for (const k of nextKeys) {
      const kept = Object.prototype.hasOwnProperty.call(prev, k) ? replaceEqualDeep(prev[k], next[k]) : next[k];
      if (kept !== prev[k] || !Object.prototype.hasOwnProperty.call(prev, k)) same = false;
      out[k] = kept;
    }
    return (same ? prev : out) as T;
  }
  return next;
}

/** True when both sets hold the same members. */
export function sameSet<T>(a: ReadonlySet<T>, b: Iterable<T>): boolean {
  const other = b instanceof Set ? (b as Set<T>) : new Set(b);
  if (a.size !== other.size) return false;
  for (const v of other) if (!a.has(v)) return false;
  return true;
}

import { describe, expect, it } from 'vitest';
import { replaceEqualDeep, sameSet } from './equal';

describe('replaceEqualDeep', () => {
  it('returns the previous object when a poll comes back identical', () => {
    const prev = [
      { playerRowId: 'a', name: 'Sara', displaySuffix: null, value: 900, rank: 1, isOwn: false, detached: false },
      { playerRowId: 'b', name: 'Omar', displaySuffix: 2, value: 400, rank: 2, isOwn: true, detached: false },
    ];
    const next = JSON.parse(JSON.stringify(prev)) as typeof prev;
    expect(replaceEqualDeep(prev, next)).toBe(prev);
  });

  it('keeps unchanged parts and takes the changed ones', () => {
    const prev = { session: { id: 's', status: 'playing' }, rounds: [{ id: 'r1', status: 'done' }, { id: 'r2', status: 'playing' }] };
    const next = { session: { id: 's', status: 'playing' }, rounds: [{ id: 'r1', status: 'done' }, { id: 'r2', status: 'done' }] };
    const out = replaceEqualDeep(prev, next);
    expect(out).not.toBe(prev);
    expect(out).toEqual(next);
    expect(out.session).toBe(prev.session);
    expect(out.rounds[0]).toBe(prev.rounds[0]);
    expect(out.rounds[1]).not.toBe(prev.rounds[1]);
    expect(out.rounds[1]).toEqual({ id: 'r2', status: 'done' });
  });

  it('sees added, removed and reordered rows', () => {
    const a = { id: 'a' };
    const b = { id: 'b' };
    expect(replaceEqualDeep([a], [a, b])).toEqual([a, b]);
    expect(replaceEqualDeep([a, b], [a])).toEqual([a]);
    const swapped = replaceEqualDeep([a, b], [{ id: 'b' }, { id: 'a' }]);
    expect(swapped).toEqual([b, a]);
    expect(replaceEqualDeep({ x: 1 }, { x: 1, y: undefined } as { x: number; y?: number })).toEqual({ x: 1, y: undefined });
  });

  it('handles null, primitives and non-plain objects', () => {
    expect(replaceEqualDeep<unknown>(null, null)).toBe(null);
    const prev = { a: 1 };
    expect(replaceEqualDeep<{ a: number } | null>(prev, null)).toBe(null);
    expect(replaceEqualDeep<{ a: number } | null>(null, prev)).toBe(prev);
    const s1 = new Set([1]);
    const s2 = new Set([1]);
    expect(replaceEqualDeep(s1, s2)).toBe(s2);
  });
});

describe('sameSet', () => {
  it('compares members, not identity', () => {
    expect(sameSet(new Set(['a', 'b']), ['b', 'a'])).toBe(true);
    expect(sameSet(new Set(['a']), ['a', 'b'])).toBe(false);
    expect(sameSet(new Set(['a', 'c']), new Set(['a', 'b']))).toBe(false);
  });
});

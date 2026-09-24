import { describe, expect, it } from 'vitest';
import { displayName, mergeBoard, ownRank, type BoardRow } from './boards';

function row(id: string, value: number, name = id, displaySuffix: number | null = null): BoardRow {
  return { playerRowId: id, name, displaySuffix, value };
}

describe('displayName', () => {
  it('returns the bare name without a suffix', () => {
    expect(displayName('Sara', null)).toBe('Sara');
  });
  it('appends suffixes 2 and above', () => {
    expect(displayName('Sara', 2)).toBe('Sara 2');
    expect(displayName('سارة', 3)).toBe('سارة 3');
  });
});

describe('mergeBoard', () => {
  const top = [row('a', 938), row('b', 812), row('c', 750)];

  it('ranks top rows 1..n in the order given', () => {
    const merged = mergeBoard(top, null, null);
    expect(merged.map((r) => [r.playerRowId, r.rank])).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ]);
    expect(merged.every((r) => !r.isOwn && !r.detached)).toBe(true);
  });

  it('flags the own row in place when it is in the top', () => {
    const merged = mergeBoard(top, null, 'b');
    expect(merged.filter((r) => r.isOwn).map((r) => r.playerRowId)).toEqual(['b']);
    expect(ownRank(merged)).toBe(2);
    expect(merged).toHaveLength(3);
  });

  it('appends a lower own row, detached, with its server rank', () => {
    const merged = mergeBoard(top, { row: row('z', 120), rank: 14 }, 'z');
    expect(merged).toHaveLength(4);
    expect(merged[3]).toMatchObject({ playerRowId: 'z', rank: 14, isOwn: true, detached: true, value: 120 });
    expect(ownRank(merged)).toBe(14);
  });

  it('does not duplicate an own row that is already in the top', () => {
    const merged = mergeBoard(top, { row: row('c', 750), rank: 3 }, 'c');
    expect(merged).toHaveLength(3);
    expect(merged[2]).toMatchObject({ isOwn: true, detached: false });
  });

  it('returns only the own row when the top is empty', () => {
    const merged = mergeBoard([], { row: row('z', 0), rank: 1 }, 'z');
    expect(merged).toEqual([{ ...row('z', 0), rank: 1, isOwn: true, detached: true }]);
  });

  it('has no own rank when the caller has no row', () => {
    expect(ownRank(mergeBoard(top, null, 'nobody'))).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import {
  bestPerName,
  compareDayRows,
  compareRoundRows,
  compareSessionRows,
  competitionRanks,
  displayName,
  mergeBoard,
  ownRank,
  sessionTotals,
  withoutHidden,
  type BoardRow,
} from './boards';

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

const T = (s: number) => new Date(Date.UTC(2026, 8, 24, 10, 0, s)).toISOString();

describe('board ordering and tie-breaks (SCORING §5)', () => {
  it('round board: score desc, then earlier created_at', () => {
    const rows = [
      { id: 'late', score: 800, createdAt: T(20) },
      { id: 'top', score: 900, createdAt: T(30) },
      { id: 'early', score: 800, createdAt: T(10) },
    ];
    expect([...rows].sort(compareRoundRows).map((r) => r.id)).toEqual(['top', 'early', 'late']);
  });

  it('session board: total desc, then faster total duration, then earlier join', () => {
    const rows = [
      { id: 'slow', total: 2000, totalDurationMs: 90_000, joinedAt: T(1) },
      { id: 'lateJoin', total: 2000, totalDurationMs: 60_000, joinedAt: T(5) },
      { id: 'fast', total: 2000, totalDurationMs: 60_000, joinedAt: T(2) },
      { id: 'best', total: 2600, totalDurationMs: 99_000, joinedAt: T(9) },
      { id: 'low', total: 100, totalDurationMs: 1_000, joinedAt: T(0) },
    ];
    expect([...rows].sort(compareSessionRows).map((r) => r.id)).toEqual(['best', 'fast', 'lateJoin', 'slow', 'low']);
  });

  it('day board: score desc, then earlier achieved_at (ADR-105)', () => {
    const rows = [
      { id: 'b', score: 700, achievedAt: T(40) },
      { id: 'a', score: 700, achievedAt: T(5) },
      { id: 'c', score: 701, achievedAt: T(59) },
    ];
    expect([...rows].sort(compareDayRows).map((r) => r.id)).toEqual(['c', 'a', 'b']);
  });
});

describe('sessionTotals', () => {
  it('sums rounds per player (missing rounds count 0) and orders like v_session_board', () => {
    const s = (playerRowId: string, score: number, durationMs: number, joinedAt: string) => ({
      playerRowId,
      name: playerRowId,
      displaySuffix: null,
      score,
      durationMs,
      joinedAt,
    });
    const totals = sessionTotals([
      s('omar', 900, 20_000, T(1)),
      s('omar', 800, 30_000, T(1)),
      s('lina', 1000, 10_000, T(2)),
      s('lina', 700, 10_000, T(2)),
      s('sara', 950, 5_000, T(3)), // one round only
    ]);
    expect(totals.map((t) => [t.playerRowId, t.total, t.roundsScored])).toEqual([
      ['lina', 1700, 2],
      ['omar', 1700, 2],
      ['sara', 950, 1],
    ]);
    // lina and omar tie on 1700: lina was faster overall (20 s vs 50 s)
    expect(totals[0].totalDurationMs).toBe(20_000);
  });

  it('keeps totals inside 0–3000 for three rounds', () => {
    const totals = sessionTotals(
      [1000, 1000, 1000].map((score, i) => ({
        playerRowId: 'p',
        name: 'P',
        displaySuffix: null,
        score,
        durationMs: i,
        joinedAt: T(0),
      })),
    );
    expect(totals[0].total).toBe(3000);
  });
});

describe('bestPerName (v_day_board mirror, AC2.5)', () => {
  const d = (game: string, nameKey: string, name: string, score: number, createdAt: string) => ({
    game,
    nameKey,
    name,
    score,
    createdAt,
  });

  it('keeps one row per name key and game with the best score', () => {
    const rows = bestPerName([
      d('simon', 'sara', 'Sara', 500, T(1)),
      d('simon', 'sara', 'SARA', 640, T(2)), // a different guest also typed Sara: one row
      d('simon', 'sara', 'Sara', 600, T(3)),
      d('simon', 'omar', 'Omar', 700, T(4)),
      d('trivia', 'sara', 'Sara', 100, T(5)),
    ]);
    expect(rows.map((r) => [r.game, r.nameKey, r.score, r.name])).toEqual([
      ['simon', 'omar', 700, 'Omar'],
      ['simon', 'sara', 640, 'SARA'],
      ['trivia', 'sara', 100, 'Sara'],
    ]);
  });

  it('breaks a tie between equal bests by the earliest', () => {
    const rows = bestPerName([
      d('simon', 'sara', 'Sara', 640, T(30)),
      d('simon', 'sara', 'Sara', 640, T(10)),
      d('simon', 'lina', 'Lina', 640, T(20)),
    ]);
    expect(rows.map((r) => [r.nameKey, r.achievedAt])).toEqual([
      ['sara', T(10)],
      ['lina', T(20)],
    ]);
  });

  it('excludes hidden name keys (ADR-115)', () => {
    const rows = bestPerName([d('simon', 'sara', 'Sara', 640, T(1)), d('simon', 'omar', 'Omar', 1, T(2))], new Set(['sara']));
    expect(rows.map((r) => r.nameKey)).toEqual(['omar']);
    expect(withoutHidden([{ nameKey: 'a' }, { nameKey: 'b' }], new Set(['a']))).toEqual([{ nameKey: 'b' }]);
  });
});

describe('competitionRanks', () => {
  it('shares a rank only for full ties (1, 2, 2, 4)', () => {
    const rows = [10, 8, 8, 5];
    expect(competitionRanks(rows, (a, b) => a === b)).toEqual([1, 2, 2, 4]);
    expect(competitionRanks(rows, () => false)).toEqual([1, 2, 3, 4]);
  });
});

import { describe, expect, it } from 'vitest';
import { bestPerName, defaultSort, isNewDayBlocked, sortCombined } from './combinedResults';
import type { CombinedScoreRow, GameId, SessionRow } from './api';

function row(over: Partial<CombinedScoreRow> = {}): CombinedScoreRow {
  return {
    id: over.id ?? Math.random().toString(36),
    name: 'Omar',
    nameKey: 'omar',
    displaySuffix: null,
    game: 'trivia' as GameId,
    score: 500,
    createdAt: '2026-09-24T10:00:00.000Z',
    sessionId: 'session-1',
    sessionCode: '4821',
    eventDayId: 'day-1',
    ...over,
  };
}

function session(status: SessionRow['status']): SessionRow {
  return {
    id: 's1',
    event_day_id: 'day-1',
    code: '4821',
    status,
    lineup: ['trivia'],
    current_round: null,
    created_at: '2026-09-24T09:00:00.000Z',
    opened_at: null,
    started_at: null,
    ended_at: null,
    day_board_shown_at: null,
    closed_at: null,
  };
}

describe('bestPerName (must match v_day_board: distinct on day/game/name_key, score desc, created_at asc)', () => {
  it('keeps only the highest score per (day, game, name key)', () => {
    const rows = [
      row({ id: 'a', score: 700, createdAt: '2026-09-24T10:00:00.000Z' }),
      row({ id: 'b', score: 900, createdAt: '2026-09-24T10:05:00.000Z' }),
      row({ id: 'c', score: 800, createdAt: '2026-09-24T10:10:00.000Z' }),
    ];
    const result = bestPerName(rows);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('b');
    expect(result[0].score).toBe(900);
  });

  it('breaks a score tie by earliest created_at (ADR-105)', () => {
    const rows = [
      row({ id: 'later', score: 900, createdAt: '2026-09-24T10:05:00.000Z' }),
      row({ id: 'earlier', score: 900, createdAt: '2026-09-24T10:00:00.000Z' }),
    ];
    const result = bestPerName(rows);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('earlier');
  });

  it('keeps separate rows per game for the same name key', () => {
    const rows = [row({ id: 'a', game: 'trivia' as GameId }), row({ id: 'b', game: 'simon' as GameId })];
    const result = bestPerName(rows);
    expect(result.map((r) => r.game).sort()).toEqual(['simon', 'trivia']);
  });

  it('keeps separate rows per event day for the same name key and game (day filter = "all")', () => {
    const rows = [row({ id: 'a', eventDayId: 'day-1' }), row({ id: 'b', eventDayId: 'day-2' })];
    const result = bestPerName(rows);
    expect(result).toHaveLength(2);
  });

  it('keeps separate rows for different name keys', () => {
    const rows = [row({ id: 'a', nameKey: 'omar' }), row({ id: 'b', nameKey: 'lina', name: 'Lina' })];
    const result = bestPerName(rows);
    expect(result).toHaveLength(2);
  });

  it('equals a hand-built v_day_board reduction for a realistic mixed day', () => {
    // Simulates: Omar plays Trivia twice (improves), Lina plays once; single day, single game.
    const rows = [
      row({ id: 'o1', nameKey: 'omar', score: 600, createdAt: '2026-09-24T10:00:00.000Z' }),
      row({ id: 'o2', nameKey: 'omar', score: 850, createdAt: '2026-09-24T10:20:00.000Z' }),
      row({ id: 'l1', nameKey: 'lina', name: 'Lina', score: 700, createdAt: '2026-09-24T10:10:00.000Z' }),
    ];
    // v_day_board: distinct on (day, game, name_key) order by score desc, created_at asc.
    const expectedDayBoard = [
      { nameKey: 'omar', score: 850 },
      { nameKey: 'lina', score: 700 },
    ];
    const reduced = bestPerName(rows)
      .map((r) => ({ nameKey: r.nameKey, score: r.score }))
      .sort((a, b) => b.score - a.score);
    expect(reduced).toEqual(expectedDayBoard);
  });
});

describe('sortCombined', () => {
  const rows = [
    row({ id: 'a', name: 'Omar', score: 700, createdAt: '2026-09-24T10:00:00.000Z' }),
    row({ id: 'b', name: 'Lina', score: 900, createdAt: '2026-09-24T09:00:00.000Z' }),
    row({ id: 'c', name: 'Adam', score: 900, createdAt: '2026-09-24T08:00:00.000Z' }),
  ];

  it('sorts by score descending', () => {
    const sorted = sortCombined(rows, 'score', 'desc');
    expect(sorted.map((r) => r.id)).toEqual(['c', 'b', 'a']); // 900/900 tie-broken by earlier created_at, then 700
  });

  it('sorts by score ascending', () => {
    const sorted = sortCombined(rows, 'score', 'asc');
    expect(sorted.map((r) => r.id)[0]).toBe('a');
  });

  it('sorts by name alphabetically', () => {
    const sorted = sortCombined(rows, 'name', 'asc');
    expect(sorted.map((r) => r.name)).toEqual(['Adam', 'Lina', 'Omar']);
  });

  it('defaultSort matches SCORING §5 (score desc, created_at asc)', () => {
    const sorted = defaultSort(rows);
    expect(sorted.map((r) => r.id)).toEqual(['c', 'b', 'a']);
  });

  it('does not mutate the input array', () => {
    const copy = [...rows];
    sortCombined(rows, 'name', 'asc');
    expect(rows).toEqual(copy);
  });
});

describe('isNewDayBlocked (D6, mirrors admin_start_new_day GD010)', () => {
  it('is blocked when a session is playing', () => {
    expect(isNewDayBlocked(session('playing'))).toBe(true);
  });

  it('is not blocked when nothing is playing', () => {
    expect(isNewDayBlocked(null)).toBe(false);
  });
});

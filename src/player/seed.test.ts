import { describe, expect, it } from 'vitest';
import { gameSeed } from './seed';
import { games } from '../games/registry';
import { GAME_IDS, type GameId } from '../games/types';
import { fieldFor } from '../games/how-many/field';
import { layoutFor } from '../games/pairs/layout';

const R = '3f2c9a10-0000-4000-8000-00000000r001';
const A = 'a2127963-0000-4000-8000-000000000001';
const B = 'feaeb2b9-0000-4000-8000-000000000002';

const SHARED: GameId[] = [
  'how_many',
  'pairs',
  'swipe_sort',
  'close_brackets',
  'color_clash',
  'odd_one_out',
  'simon',
  'stop_the_clock',
  'perfect_circle',
];

describe('gameSeed (per round; per player only for seedScope: player)', () => {
  it.each(SHARED)('%s: every phone in the round gets the round id', (game) => {
    expect(gameSeed(game, R, A)).toBe(R);
    expect(gameSeed(game, R, B)).toBe(R);
  });

  it('trivia keeps a per-player seed (ADR-027)', () => {
    // Registered only with >= 5 ready questions; the event pool has 30.
    expect(games.trivia?.seedScope).toBe('player');
    const a = gameSeed('trivia', R, A);
    const b = gameSeed('trivia', R, B);
    expect(a).not.toBe(b);
    expect(a.startsWith(`${R}:`)).toBe(true);
    expect(b.startsWith(`${R}:`)).toBe(true);
  });

  it('only trivia is per player', () => {
    const perPlayer = GAME_IDS.filter((g) => games[g]?.seedScope === 'player');
    expect(perPlayer).toEqual(['trivia']);
  });

  it('a different round gets a different seed', () => {
    expect(gameSeed('how_many', 'other-round', A)).not.toBe(gameSeed('how_many', R, A));
  });

  it('How Many?: two players in one round see the same three counts (the H3 reveal centre)', () => {
    for (let i = 0; i < 3; i++) {
      const a = fieldFor(gameSeed('how_many', R, A), i);
      const b = fieldFor(gameSeed('how_many', R, B), i);
      expect(a.count).toBe(b.count);
      expect(a.chevrons).toEqual(b.chevrons);
    }
  });

  it('Pairs: two players in one round get the same board', () => {
    expect(layoutFor(gameSeed('pairs', R, A))).toEqual(layoutFor(gameSeed('pairs', R, B)));
  });
});

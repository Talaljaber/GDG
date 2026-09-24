import { describe, expect, it } from 'vitest';
import { LOADING_KEY } from '../components/ScreenTransition';
import type { RoundRow } from '../lib/api';
import type { PlayerView } from './playerFlow';
import { phoneScreenKey, phoneSwapIsInstant } from './screenKey';

const r1 = { id: 'r1', round_no: 1, game: 'simon', status: 'playing' } as RoundRow;
const r2 = { id: 'r2', round_no: 2, game: 'trivia', status: 'upcoming' } as RoundRow;

describe('phone screen keys (DESIGN_SYSTEM §6.2 transitions)', () => {
  it('intro, game and own result of a round share one key: nothing plays between them', () => {
    const views: PlayerView[] = [
      { screen: 'intro', round: r1, begin: true },
      { screen: 'game', round: r1, roundEnded: false },
      { screen: 'round_result', round: r1 },
    ];
    expect(new Set(views.map(phoneScreenKey))).toEqual(new Set(['round:r1']));
  });

  it('join → lobby, round → intermission, intermission → next round and results all change the key', () => {
    const keys = [
      phoneScreenKey({ screen: 'lobby', pending: false }),
      phoneScreenKey({ screen: 'round_result', round: r1 }),
      phoneScreenKey({ screen: 'intermission', round: r1, next: r2, step: 'round_board' }),
      phoneScreenKey({ screen: 'intro', round: r2, begin: false }),
      phoneScreenKey({ screen: 'results' }),
      phoneScreenKey({ screen: 'dayboard' }),
    ];
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('intermission steps share a key on phones (lighter than the projector)', () => {
    const steps = (['round_board', 'session_total', 'next_intro'] as const).map((step) =>
      phoneScreenKey({ screen: 'intermission', round: r1, next: r2, step }),
    );
    expect(new Set(steps).size).toBe(1);
  });

  it('loading is the quiet key; only a game screen forces an instant swap', () => {
    expect(phoneScreenKey({ screen: 'loading' })).toBe(LOADING_KEY);
    expect(phoneSwapIsInstant({ screen: 'game', round: r1, roundEnded: false })).toBe(true);
    expect(phoneSwapIsInstant({ screen: 'intro', round: r1, begin: true })).toBe(false);
    expect(phoneSwapIsInstant({ screen: 'round_result', round: r1 })).toBe(false);
  });
});

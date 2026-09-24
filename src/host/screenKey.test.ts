import { describe, expect, it } from 'vitest';
import { LOADING_KEY } from '../components/ScreenTransition';
import { hostScreenKey, showsLogo } from './screenKey';
import type { HostController } from './useHost';

type KeyInput = Pick<HostController, 'data' | 'screen' | 'intermission'>;
const data = {
  session: { id: 's1' },
  rounds: [
    { id: 'r1', round_no: 1, status: 'done' },
    { id: 'r2', round_no: 2, status: 'playing' },
  ],
} as unknown as HostController['data'];

function inter(step: string, next: boolean): KeyInput['intermission'] {
  return { round: { id: 'r1' }, next: next ? { id: 'r2' } : null, state: { step } } as unknown as KeyInput['intermission'];
}

describe('host screen keys (DESIGN_SYSTEM §6.2 transitions)', () => {
  it('one key per screen, per round and per intermission step', () => {
    const keys = [
      hostScreenKey({ data, screen: 'lobby', intermission: null }),
      hostScreenKey({ data, screen: 'round', intermission: null }),
      hostScreenKey({ data, screen: 'intermission', intermission: inter('round_board', true) }),
      hostScreenKey({ data, screen: 'intermission', intermission: inter('session_total', true) }),
      hostScreenKey({ data, screen: 'intermission', intermission: inter('next_intro', true) }),
      hostScreenKey({ data, screen: 'results', intermission: null }),
    ];
    expect(keys[1]).toBe('round:r2');
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('"done" with a next round stays on the Next step until the round starts', () => {
    expect(hostScreenKey({ data, screen: 'intermission', intermission: inter('done', true) })).toBe(
      hostScreenKey({ data, screen: 'intermission', intermission: inter('next_intro', true) }),
    );
    // after the last round, "done" is still the round board
    expect(hostScreenKey({ data, screen: 'intermission', intermission: inter('done', false) })).toBe(
      hostScreenKey({ data, screen: 'intermission', intermission: inter('round_board', false) }),
    );
  });

  it('H4 and H5 share a key (the day-board merge plays between them); logo screens are marked', () => {
    const results = hostScreenKey({ data, screen: 'results', intermission: null });
    expect(hostScreenKey({ data, screen: 'dayboard', intermission: null })).toBe(results);
    expect(showsLogo(results)).toBe(true);
    expect(showsLogo(hostScreenKey({ data, screen: 'lobby', intermission: null }))).toBe(true);
    expect(showsLogo(hostScreenKey({ data, screen: 'round', intermission: null }))).toBe(false);
  });

  it('loading (and the intermission before the server offset is known) is the quiet key', () => {
    expect(hostScreenKey({ data: null, screen: 'loading', intermission: null })).toBe(LOADING_KEY);
    expect(hostScreenKey({ data, screen: 'intermission', intermission: null })).toBe(LOADING_KEY);
  });
});

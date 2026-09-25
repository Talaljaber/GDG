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
  it('one key per screen and per round', () => {
    const keys = [
      hostScreenKey({ data, screen: 'lobby', intermission: null }),
      hostScreenKey({ data, screen: 'round', intermission: null }),
      hostScreenKey({ data, screen: 'intermission', intermission: inter('round_board', true) }),
      hostScreenKey({ data, screen: 'results', intermission: null }),
    ];
    expect(keys[1]).toBe('round:r2');
    expect(keys[2]).toBe('intermission:r1');
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('an intermission keeps one key across its steps (they crossfade inside the stage, host-v3 §4.4)', () => {
    const steps = ['round_board', 'session_total', 'next_intro', 'done'] as const;
    for (const next of [true, false]) {
      const keys = new Set(steps.map((step) => hostScreenKey({ data, screen: 'intermission', intermission: inter(step, next) })));
      expect([...keys]).toEqual(['intermission:r1']);
    }
    // the next round's intermission is a new screen (H3 → H2 → H3 shatters)
    const later = { round: { id: 'r2' }, next: null, state: { step: 'round_board' } } as unknown as KeyInput['intermission'];
    expect(hostScreenKey({ data, screen: 'intermission', intermission: later })).toBe('intermission:r2');
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

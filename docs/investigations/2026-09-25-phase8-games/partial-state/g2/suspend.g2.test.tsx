import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';
import { Pairs, type PairsSnapshot } from 'C:/Users/hp/.m2/GDG/src/games/pairs/Pairs';
import { HowMany, type HowManySnapshot } from 'C:/Users/hp/.m2/GDG/src/games/how-many/HowMany';
import { layoutFor } from 'C:/Users/hp/.m2/GDG/src/games/pairs/layout';
import type { GameResult } from 'C:/Users/hp/.m2/GDG/src/games/types';

vi.mock('C:/Users/hp/.m2/GDG/src/i18n/index.ts', () => ({
  useT: () => (key: string) => key,
  useLang: () => ({ lang: 'en' as const, dir: 'ltr' as const, setLang: vi.fn() }),
}));

const T0 = 1_700_000_000_000;
let vis: 'visible' | 'hidden' = 'visible';
Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => vis });
const adv = (ms: number) => { for (let t = 0; t < ms; t += 50) act(() => { vi.advanceTimersByTime(Math.min(50, ms - t)); }); };
const tid = (c: HTMLElement, id: string) => c.querySelector(`[data-testid="${id}"]`);

beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] }); vi.setSystemTime(T0); vis = 'visible'; });
afterEach(() => { vi.useRealTimers(); vis = 'visible'; });

/**
 * Device suspend semantics: Date.now() (wall) jumps, but pending timers are shifted with it
 * (vi.setSystemTime keeps callAt relative), exactly like Chromium/WebKit delayed tasks, which run
 * on a monotonic clock that excludes system sleep. On return the page fires visibilitychange.
 */
function suspend(ms: number) {
  vis = 'hidden';
  act(() => { document.dispatchEvent(new Event('visibilitychange')); });
  vi.setSystemTime(Date.now() + ms);
  vis = 'visible';
  act(() => { document.dispatchEvent(new Event('visibilitychange')); });
}

describe('G2 suspend (monotonic timers stall, wall clock jumps)', () => {
  it('Pairs: 50 s suspend at board+20 s; how long until the game finishes?', () => {
    let fin: GameResult | null = null;
    const L = layoutFor('s');
    const r = render(<Pairs seed="s" roundStartEpoch={T0} roundEnded={false} snapshot={null} onProgress={vi.fn<(s: PairsSnapshot) => void>()} onFinish={(x) => (fin = x)} />);
    adv(1500);
    const a = L.indexOf('bug'); const b = L.indexOf('bug', a + 1);
    fireEvent.pointerDown(tid(r.container, `pr-tile-${a}`)!); adv(300); fireEvent.pointerDown(tid(r.container, `pr-tile-${b}`)!);
    adv(20_000);
    suspend(50_000); // wall now = board + ~70.3 s: 10 s past the game end
    adv(0);
    const log: string[] = [`return: secs=${tid(r.container, 'pr-seconds')?.textContent} status='${tid(r.container, 'pr-status')?.textContent}' finished=${!!fin}`];
    let waited = 0;
    while (!fin && waited < 60_000) { adv(250); waited += 250; }
    log.push(`finished after ${waited} ms more (wall ${(Date.now() - T0 - 1500) / 1000} s after the board appeared); duration_ms=${(fin as GameResult | null)?.durationMs}`);
    console.log('PAIRS ' + log.join(' | '));
    r.unmount();
  });

  it('How Many?: 20 s suspend during answer 1 is applied on visibilitychange', () => {
    let fin: GameResult | null = null;
    const onProgress = vi.fn<(s: HowManySnapshot) => void>();
    const r = render(<HowMany seed="s" roundStartEpoch={T0} roundEnded={false} snapshot={null} onProgress={onProgress} onFinish={(x) => (fin = x)} />);
    adv(4000);
    suspend(20_000);
    adv(0);
    console.log(`HM return: phase=${onProgress.mock.calls.at(-1)![0].phase} locked=${!!tid(r.container, 'hm-locked')} fin=${!!fin}`);
    r.unmount();
  });

  it('How Many?: 20 s suspend during answer 1 with NO visibilitychange on return (bfcache/iOS)', () => {
    const onProgress = vi.fn<(s: HowManySnapshot) => void>();
    const r = render(<HowMany seed="s" roundStartEpoch={T0} roundEnded={false} snapshot={null} onProgress={onProgress} onFinish={() => {}} />);
    adv(4000); // answer began at 3500
    vi.setSystemTime(Date.now() + 20_000);
    let waited = 0;
    while (onProgress.mock.calls.at(-1)![0].phase === 'answer' && waited < 20_000) { adv(50); waited += 50; }
    console.log(`HM no-visibility: pad stayed at secs=0 for ${waited} ms before "time's up"`);
    r.unmount();
  });
});

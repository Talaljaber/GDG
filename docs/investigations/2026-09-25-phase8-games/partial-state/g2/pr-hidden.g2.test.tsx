import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';
import { Pairs, type PairsSnapshot } from 'C:/Users/hp/.m2/GDG/src/games/pairs/Pairs';
import { layoutFor, ICON_IDS } from 'C:/Users/hp/.m2/GDG/src/games/pairs/layout';
import { validatePairsRaw, type PairsRaw } from 'C:/Users/hp/.m2/GDG/src/games/pairs/scoring';
import type { GameResult } from 'C:/Users/hp/.m2/GDG/src/games/types';

vi.mock('C:/Users/hp/.m2/GDG/src/i18n/index.ts', () => ({
  useT: () => (key: string) => key,
  useLang: () => ({ lang: 'en' as const, dir: 'ltr' as const, setLang: vi.fn() }),
}));

const T0 = 1_700_000_000_000;
const SEED = 'g2-seed';
const L = layoutFor(SEED);
let vis: 'visible' | 'hidden' = 'visible';
Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => vis });
const secs = (c: HTMLElement) => c.querySelector('[data-testid="pr-seconds"]')?.textContent;
const tap = (c: HTMLElement, i: number) => { fireEvent.pointerDown(c.querySelector(`[data-testid="pr-tile-${i}"]`)!); };
const adv = (ms: number) => { for (let t = 0; t < ms; t += 50) act(() => { vi.advanceTimersByTime(Math.min(50, ms - t)); }); };
const pos = (icon: string) => { const a = L.indexOf(icon as never); return [a, L.indexOf(icon as never, a + 1)]; };

function mount() {
  let finished: GameResult | null = null;
  const onProgress = vi.fn<(s: PairsSnapshot) => void>();
  const r = render(<Pairs seed={SEED} roundStartEpoch={T0} roundEnded={false} snapshot={null} onProgress={onProgress} onFinish={(x) => (finished = x)} />);
  return { ...r, onProgress, fin: () => finished as GameResult | null };
}

beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] }); vi.setSystemTime(T0); vis = 'visible'; });
afterEach(() => { vi.useRealTimers(); vis = 'visible'; });

describe('G2 Pairs', () => {
  for (const H of [1000, 5000, 30000]) it(`hidden during intro for ${H} ms (timers fire while hidden)`, () => {
    const g = mount();
    adv(500); vis = 'hidden';
    adv(H); vis = 'visible'; act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    const s = g.onProgress.mock.calls.at(-1)?.[0];
    console.log(`intro hide ${H}: on return seconds shown=${secs(g.container)} gameStart at +${s ? (s.gameStartEpoch as number) - T0 : 'n/a'} ms (board seen only at +${500 + H})`);
    g.unmount();
  });

  it('mismatch lock while hidden (timers fire late by 1 s): lock resolves on the late timer; a tap after lockUntil works', () => {
    const g = mount();
    adv(1500);
    const [b1] = pos('bug'); const [c1] = pos('coffee');
    tap(g.container, b1); tap(g.container, c1);
    const lockUntil = g.onProgress.mock.calls.at(-1)![0].lockUntilEpoch! - T0;
    vis = 'hidden';
    // emulate a 1 s-aligned wake: jump the clock 900 ms without timers? not possible with shifted timers; instead check the tap path
    vi.setSystemTime(Date.now() + 800); // timers shift: lock timer still pending
    const upBefore = [...g.container.querySelectorAll('[data-state="up"]')].length;
    vis = 'visible';
    const [g1] = pos('gear');
    tap(g.container, g1);
    const s = g.onProgress.mock.calls.at(-1)![0];
    console.log(`lock: lockUntil +${lockUntil}; up before tap=${upBefore}; after tap faceUp=${JSON.stringify(s.faceUp)} lockUntil=${s.lockUntilEpoch}`);
    g.unmount();
  });

  function clearBoard(g: ReturnType<typeof mount>, missesFirst: number, suspendMs: number, suspendAfterPairs: number) {
    adv(1500);
    const start = Date.now();
    // forced misses first
    for (let m = 0; m < missesFirst; m++) {
      const a = pos(ICON_IDS[m % 8])[0]; const b = pos(ICON_IDS[(m + 1) % 8])[0];
      tap(g.container, a); adv(300); tap(g.container, b); adv(800);
    }
    let found = 0;
    for (const icon of ICON_IDS) {
      if (found === suspendAfterPairs && suspendMs > 0) {
        // device suspended: wall clock (Date) jumps, performance.now() does not advance (CLOCK_MONOTONIC / mach_absolute_time exclude sleep)
        vi.setSystemTime(Date.now() + suspendMs);
      }
      const [a, b] = pos(icon);
      tap(g.container, a); adv(400); tap(g.container, b); adv(400);
      found++;
    }
    const f = g.fin();
    const raw = f?.raw as PairsRaw;
    console.log(`misses=${missesFirst} suspend=${suspendMs} after ${suspendAfterPairs} pairs: wall elapsed=${Date.now() - start - 400} ms, clear_ms=${raw?.clear_ms}, score=${f?.score}, validate=${JSON.stringify(validatePairsRaw(raw, f!.score))}`);
  }

  it('clear with no suspend', () => { const g = mount(); clearBoard(g, 5, 0, 0); g.unmount(); });
  it('clear with a 30 s suspend after 3 pairs', () => { const g = mount(); clearBoard(g, 5, 30_000, 3); g.unmount(); });
  it('clear with a 40 s suspend after 1 pair, 12 misses', () => { const g = mount(); clearBoard(g, 12, 38_000, 1); g.unmount(); });
});

import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';
import { HowMany, type HowManySnapshot } from 'C:/Users/hp/.m2/GDG/src/games/how-many/HowMany';
import type { GameResult } from 'C:/Users/hp/.m2/GDG/src/games/types';

vi.mock('C:/Users/hp/.m2/GDG/src/i18n/index.ts', () => ({
  useT: () => (key: string) => key,
  useLang: () => ({ lang: 'en' as const, dir: 'ltr' as const, setLang: vi.fn() }),
}));

const T0 = 1_700_000_000_000;
let vis: 'visible' | 'hidden' = 'visible';
Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => vis });
const q = (c: HTMLElement, id: string) => c.querySelector(`[data-testid="${id}"]`);

function phaseOf(c: HTMLElement): string {
  for (const p of ['intro', 'look', 'flash', 'answer', 'locked', 'done']) if (q(c, `hm-${p}`)) return p;
  return '?';
}

/** Scenario: a bot answers "20" 1.5 s after each visible pad; the tab is hidden at hideAt for H ms (timers keep firing, as Chrome desktop/Android background: aligned to <=1 s, never frozen). */
function run(hideAt: number, H: number) {
  vis = 'visible';
  vi.setSystemTime(T0);
  let finished: GameResult | null = null;
  const onProgress = vi.fn<(s: HowManySnapshot) => void>();
  const { container, unmount } = render(
    <HowMany seed="g2-seed" roundStartEpoch={T0} roundEnded={false} snapshot={null} onProgress={onProgress} onFinish={(r) => (finished = r)} />,
  );
  const log: string[] = [];
  let last = '';
  let padSeenAt: number | null = null;
  let shown = [false, false, false];
  let returnedView = '';
  for (let step = 0; step < 2000 && !finished; step++) {
    const t = Date.now() - T0;
    if (t === hideAt) { vis = 'hidden'; act(() => { document.dispatchEvent(new Event('visibilitychange')); }); log.push(`${t} HIDE`); }
    if (t === hideAt + H) {
      vis = 'visible';
      act(() => { document.dispatchEvent(new Event('visibilitychange')); });
      const secs = q(container, 'hm-seconds')?.textContent;
      returnedView = `${phaseOf(container)}${secs ? ` secs=${secs}` : ''} eyebrow=${container.querySelector('p')?.textContent}`;
      log.push(`${t} SHOW -> ${returnedView}`);
    }
    const p = phaseOf(container);
    const s = onProgress.mock.calls.at(-1)?.[0];
    const key = `${p}#${s?.roundIndex ?? 0}`;
    if (key !== last) { log.push(`${t} ${key}${vis === 'hidden' ? ' (hidden)' : ''}${p === 'answer' ? ` secs=${q(container, 'hm-seconds')?.textContent}` : ''}`); last = key; padSeenAt = null; }
    if (p === 'flash' && vis === 'visible') shown[s?.roundIndex ?? 0] = true;
    if (p === 'answer' && vis === 'visible') {
      if (padSeenAt === null) padSeenAt = t;
      else if (t - padSeenAt >= 1500) {
        for (const k of ['2', '0', 'ok']) { fireEvent.pointerDown(q(container, `hm-key-${k}`)!); act(() => { vi.advanceTimersByTime(70); }); }
        padSeenAt = null;
        continue;
      }
    }
    act(() => { vi.advanceTimersByTime(50); });
  }
  const fr = finished as GameResult | null;
  unmount();
  return { log, shown, returnedView, raw: fr ? JSON.stringify(fr.raw) : 'not finished', score: fr?.score, dur: fr?.durationMs };
}

beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] }); });
afterEach(() => { vi.useRealTimers(); vis = 'visible'; });

describe('G2 How Many? hidden (timers keep firing)', () => {
  // phase starts (no hide): intro 0-1500, look#0 1500-2500, flash#0 2500-3500, answer#0 3500-~5000
  const cases: [string, number][] = [
    ['intro', 500], ['look', 1800], ['flash', 2800], ['answer', 4000],
  ];
  for (const [name, at] of cases) for (const H of [1000, 5000, 30000]) {
    it(`${name} +${H}`, () => {
      const r = run(at, H);
      console.log(`\n=== hide during ${name} at ${at} for ${H} ms ===\n${r.log.join('\n')}\nflash seen (visible): ${r.shown}\nraw ${r.raw} score ${r.score} dur ${r.dur}`);
    });
  }
  it('baseline, never hidden', () => {
    const r = run(-1, 0);
    console.log(`\n=== baseline ===\n${r.log.join('\n')}\nflash seen: ${r.shown}\nraw ${r.raw} score ${r.score} dur ${r.dur}`);
  });
});

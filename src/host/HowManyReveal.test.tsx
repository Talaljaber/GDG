import { act, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HM_REVEAL_DOTS_MS, HM_REVEAL_MEAN_MS, INTERMISSION_ROUND_BOARD_MS } from '../config';
import { revealSchedule } from '../effects/shatter';
import { clearMatchMedia, mockBoxes, mockReducedMotion, stubAnimate } from '../effects/shatter/test-utils';
import { STC_TARGETS_MS } from '../games/stop-the-clock/scoring';
import { LangProvider } from '../i18n';
import type { RevealRow } from '../lib/api';
import { HowManyReveal } from './HowManyReveal';
import { howManyStrips } from './howManyStrips';
import { anchoredSlot, slotDelay } from './reveal';
import { StcReveal } from './StcReveal';

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

const hidden = (el: HTMLElement) => el.style.opacity === '0';

function hmRow(i: number, guesses: (number | null)[]): RevealRow {
  return {
    playerRowId: `p${i}`,
    name: ['Sara', 'Omar', 'Lina'][i] ?? `P${i}`,
    displaySuffix: null,
    score: 800 - i * 100,
    raw: {
      rounds: [12, 27, 55].map((true_count, k) => ({
        true_count,
        guess: guesses[k],
        answer_ms: guesses[k] === null ? null : 2500,
        timed_out: guesses[k] === null,
      })),
    },
  };
}

function stcRow(i: number): RevealRow {
  return {
    playerRowId: `s${i}`,
    name: `Player ${i}`,
    displaySuffix: null,
    score: 900 - i * 10,
    raw: {
      attempts: STC_TARGETS_MS.map((target, k) => ({
        target_ms: target,
        measured_ms: i === 7 && k === 1 ? null : target + (i - 4) * 400 + k * 90,
      })),
    },
  };
}

let anim: ReturnType<typeof stubAnimate>;
let boxes: ReturnType<typeof mockBoxes>;
beforeEach(() => {
  vi.useFakeTimers();
  mockReducedMotion(false);
  anim = stubAnimate();
  boxes = mockBoxes();
});

afterEach(() => {
  boxes.mockRestore();
  anim.restore();
  vi.useRealTimers();
  clearMatchMedia();
  document.body.innerHTML = '';
});

describe('How Many? reveal (games-v3 §5)', () => {
  const rows = [hmRow(0, [11, 24, 46]), hmRow(1, [10, 22, 42]), hmRow(2, [9, null, 30])];

  it('draws three strips on the true counts, dots at their layout positions, the average last', () => {
    render(
      <LangProvider initial="en">
        <HowManyReveal roundId="r1" version={0} rows={rows} />
      </LangProvider>,
    );
    const strips = screen.getAllByTestId('hm-strip');
    expect(strips.map((s) => s.dataset.count)).toEqual(['12', '27', '55']);
    expect(strips[0]).toHaveTextContent('Flash 1 · 12');

    const layout = howManyStrips(rows);
    strips.forEach((strip, i) => {
      const dots = within(strip).getAllByTestId('hm-dot');
      expect(dots.map((d) => d.style.insetInlineStart)).toEqual(layout[i].dots.map((d) => `${d.pos}%`));
      expect(within(strip).getAllByTestId('hm-dot-label')).toHaveLength(layout[i].dots.length); // all within the top 5
    });
    expect(within(strips[1]).getAllByTestId('hm-dot')).toHaveLength(2); // the null guess has no dot

    const means = screen.getAllByTestId('hm-mean');
    expect(means.map((m) => m.dataset.mean)).toEqual(['10', '23', '39']);
    expect(means.map((m) => m.style.insetInlineStart)).toEqual(layout.map((s) => `${s.meanPos}%`));

    // no anchor (dev fixtures): timed from the mount. Every dot is in by the end of its slot
    // (all within 3.5 s); the average waits for 4.0 s
    const plan = revealSchedule(layout.map((s) => s.dots.length), { totalMs: HM_REVEAL_DOTS_MS });
    const lastSlot = Math.max(...plan.flat().map((slot) => slot.delayMs));
    expect(means.every(hidden)).toBe(true);
    advance(lastSlot + 1);
    expect(screen.getAllByTestId('hm-dot').some(hidden)).toBe(false);
    expect(lastSlot).toBeLessThan(HM_REVEAL_MEAN_MS);
    expect(means.every(hidden)).toBe(true);
    advance(HM_REVEAL_MEAN_MS - lastSlot);
    expect(means.some(hidden)).toBe(false);
  });
});

describe('slotDelay / anchoredSlot (ADR-137 (5))', () => {
  it('passes the planned delay through without an anchor and counts from the anchor otherwise', () => {
    expect(slotDelay(null, 2900, 10_000)).toBe(2900);
    expect(slotDelay(undefined, 2900, 10_000)).toBe(2900);
    expect(slotDelay(10_000 - 1500, 2900, 10_000)).toBe(1400);
    expect(slotDelay(10_000 - 1500, 1500, 10_000)).toBe(0);
    expect(slotDelay(10_000 - 6000, 4000, 10_000)).toBe(0); // overdue: clamped to now
  });

  it('an anchored slot that is already due appears without a burst; the others keep their shards', () => {
    expect(anchoredSlot(null, { delayMs: 0, shards: 4 }, 10_000)).toEqual({ delayMs: 0, shards: 4 });
    expect(anchoredSlot(9_000, { delayMs: 500, shards: 4 }, 10_000)).toEqual({ delayMs: 0, shards: 0 });
    expect(anchoredSlot(9_000, { delayMs: 2500, shards: 4 }, 10_000)).toEqual({ delayMs: 1500, shards: 4 });
    expect(anchoredSlot(9_000, undefined, 10_000)).toEqual({ delayMs: 0, shards: 0 });
  });
});

describe('How Many? reveal timing against ended_at (ADR-129 (1), ADR-137 (5))', () => {
  const rows = [hmRow(0, [11, 24, 46]), hmRow(1, [10, 22, 42]), hmRow(2, [9, null, 30])];
  const view = (r: RevealRow[], anchorMs: number | null) => (
    <LangProvider initial="en">
      <HowManyReveal roundId="r1" version={0} rows={r} anchorMs={anchorMs} />
    </LangProvider>
  );
  const dotsOf = (player: string) => screen.getAllByTestId('hm-dot').filter((d) => d.dataset.player === player);
  const planOf = (r: RevealRow[]) =>
    revealSchedule(
      howManyStrips(r).map((s) => s.dots.length),
      { totalMs: HM_REVEAL_DOTS_MS },
    );

  it('leaves ≥ 3 s of the 7 s step for the whole picture', () => {
    const plan = revealSchedule([20, 20, 20], { totalMs: HM_REVEAL_DOTS_MS });
    const lastSlot = Math.max(...plan.flat().map((slot) => slot.delayMs));
    expect(lastSlot + 600).toBeLessThanOrEqual(HM_REVEAL_DOTS_MS); // + the 600 ms burst
    expect(HM_REVEAL_MEAN_MS).toBeGreaterThanOrEqual(HM_REVEAL_DOTS_MS);
    expect(INTERMISSION_ROUND_BOARD_MS - HM_REVEAL_MEAN_MS).toBeGreaterThanOrEqual(3000);
  });

  it('mounted 1.5 s after ended_at: every dot is in by 3.5 s and the average at 4.0 s after ended_at', () => {
    render(view(rows, Date.now() - 1500));
    const plan = planOf(rows);
    const dots = screen.getAllByTestId('hm-dot');
    // the slots already due at the mount show at once; the rest are still to come
    const due = plan.flat().filter((slot) => slot.delayMs <= 1500).length;
    expect(due).toBeGreaterThan(0);
    expect(dots.filter((d) => !hidden(d))).toHaveLength(due);
    expect(dots.some(hidden)).toBe(true);

    const means = screen.getAllByTestId('hm-mean');
    advance(HM_REVEAL_DOTS_MS - 1500);
    expect(screen.getAllByTestId('hm-dot').some(hidden)).toBe(false);
    expect(means.every(hidden)).toBe(true);
    advance(HM_REVEAL_MEAN_MS - HM_REVEAL_DOTS_MS - 1);
    expect(means.every(hidden)).toBe(true);
    advance(1); // 4.0 s after ended_at (2.5 s after the mount), not 4.0 s after the mount
    expect(means.some(hidden)).toBe(false);
  });

  it('a host reload late in the step (6 s after ended_at): every dot and the average at once, no shards', () => {
    render(view(rows, Date.now() - 6000));
    expect(screen.getAllByTestId('hm-dot').some(hidden)).toBe(false);
    expect(screen.getAllByTestId('hm-mean').some(hidden)).toBe(false);
    expect(document.querySelector('[data-shatter-layer]')).toBeNull();
  });

  it('a late row 2.7 s in: overdue dots at once, the rest at max(0, slot − elapsed); a late average at 4.0 s', () => {
    const noFlash2 = [hmRow(0, [11, null, 46]), hmRow(1, [10, null, 42])];
    const anchor = Date.now();
    const { rerender } = render(view(noFlash2, anchor));
    expect(screen.getAllByTestId('hm-mean')).toHaveLength(2); // flash 2 has no guess yet
    advance(2700);

    const late = [...noFlash2, hmRow(2, [9, 25, 30])]; // ranked last, the first flash-2 guess
    rerender(view(late, anchor));
    const plan = planOf(late);
    const lateDots = dotsOf('p2');
    expect(lateDots).toHaveLength(3);
    plan.forEach((slots, i) => expect(hidden(lateDots[i])).toBe(slots[slots.length - 1].delayMs > 2700));
    // the last flash-3 slot (2.9 s) is still to come: it shows at 2.9 s, not at 2.7 + 2.9 s
    const lastSlot = plan[2][plan[2].length - 1].delayMs;
    expect(lastSlot).toBeGreaterThan(2700);
    advance(lastSlot - 2700);
    expect(dotsOf('p2').some(hidden)).toBe(false);

    const means = screen.getAllByTestId('hm-mean');
    expect(means).toHaveLength(3);
    expect(hidden(means[1])).toBe(true);
    advance(HM_REVEAL_MEAN_MS - lastSlot - 1);
    expect(hidden(means[1])).toBe(true);
    advance(1);
    expect(means.some(hidden)).toBe(false); // 4.0 s after ended_at, inside the 7 s step
  });

  it('a late row after 4.0 s: its dots and a first-time average appear at once', () => {
    const noFlash2 = [hmRow(0, [11, null, 46])];
    const anchor = Date.now();
    const { rerender } = render(view(noFlash2, anchor));
    advance(5000);
    rerender(view([...noFlash2, hmRow(1, [10, 22, 42])], anchor));
    expect(dotsOf('p1').some(hidden)).toBe(false);
    expect(screen.getAllByTestId('hm-mean')).toHaveLength(3);
    expect(screen.getAllByTestId('hm-mean').some(hidden)).toBe(false);
  });

  it('keeps the count a strip first showed, so a refetch never moves the dots on screen', () => {
    const tampered = (id: string): RevealRow => ({
      ...hmRow(1, [10, 22, 42]),
      playerRowId: id,
      raw: { rounds: [15, 27, 55].map((true_count, k) => ({ true_count, guess: [10, 22, 42][k] })) },
    });
    const two = [hmRow(0, [11, 24, 46]), tampered('p1')];
    const { rerender } = render(view(two, Date.now() - 6000));
    const strip = () => screen.getAllByTestId('hm-strip')[0];
    expect(strip().dataset.count).toBe('12'); // a 1–1 tie goes to the top row
    const before = within(strip()).getAllByTestId('hm-dot').map((d) => d.style.insetInlineStart);
    // two more rows say 15: the mode would move, the axis on screen doesn't
    rerender(view([...two, tampered('p8'), tampered('p9')], Date.now()));
    expect(strip().dataset.count).toBe('12');
    const kept = within(strip())
      .getAllByTestId('hm-dot')
      .filter((d) => d.dataset.player === 'p0' || d.dataset.player === 'p1');
    expect(kept.map((d) => d.style.insetInlineStart)).toEqual(before);
  });
});

describe('Stop the Clock reveal (host-v3 §4.4)', () => {
  it('three tracks by target, one dot per measured guess, the top 5 labelled', () => {
    const rows = Array.from({ length: 8 }, (_, i) => stcRow(i));
    render(
      <LangProvider initial="en">
        <StcReveal roundId="r1" version={0} rows={rows} />
      </LangProvider>,
    );
    const strips = screen.getAllByTestId('stc-strip');
    expect(strips.map((s) => s.dataset.target)).toEqual(STC_TARGETS_MS.map(String));
    expect(strips.map((s) => within(s).getAllByTestId('stc-dot').length)).toEqual([8, 7, 8]);
    expect(within(strips[0]).getAllByTestId('stc-dot-label').map((l) => l.textContent)).toEqual([
      'Player 0',
      'Player 1',
      'Player 2',
      'Player 3',
      'Player 4',
    ]);
    // Player 0 is 1.6 s early on the 5 s target: 50 − 50 × 1.6 / 5 = 34 %
    expect(within(strips[0]).getAllByTestId('stc-dot')[0].style.insetInlineStart).toBe('34%');
    expect(screen.getAllByTestId('stc-dot').some(hidden)).toBe(true); // bursting in, track by track
    advance(5000);
    expect(screen.getAllByTestId('stc-dot').some(hidden)).toBe(false);
  });

  const stc = (anchorMs: number) => (
    <LangProvider initial="en">
      <StcReveal roundId="r1" version={0} rows={Array.from({ length: 8 }, (_, i) => stcRow(i))} anchorMs={anchorMs} />
    </LangProvider>
  );

  it('anchored on ended_at: a host reload late in the step shows every dot at once', () => {
    render(stc(Date.now() - 6000));
    expect(screen.getAllByTestId('stc-dot').some(hidden)).toBe(false);
    expect(document.querySelector('[data-shatter-layer]')).toBeNull();
  });

  it('anchored on ended_at: mounted 3 s in, the dots still finish 5 s after ended_at', () => {
    render(stc(Date.now() - 3000));
    const dots = screen.getAllByTestId('stc-dot');
    expect(dots.some(hidden)).toBe(true);
    expect(dots.every(hidden)).toBe(false); // the first track is already due
    advance(2000);
    expect(screen.getAllByTestId('stc-dot').some(hidden)).toBe(false);
  });
});

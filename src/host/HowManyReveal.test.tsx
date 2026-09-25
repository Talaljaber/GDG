import { act, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HM_REVEAL_MEAN_MS } from '../config';
import { revealSchedule } from '../effects/shatter';
import { clearMatchMedia, mockBoxes, mockReducedMotion, stubAnimate } from '../effects/shatter/test-utils';
import { STC_TARGETS_MS } from '../games/stop-the-clock/scoring';
import { LangProvider } from '../i18n';
import type { RevealRow } from '../lib/api';
import { HowManyReveal } from './HowManyReveal';
import { howManyStrips } from './howManyStrips';
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

    // every dot is in by the end of its slot; the average waits for 5.2 s
    const plan = revealSchedule(layout.map((s) => s.dots.length));
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
});

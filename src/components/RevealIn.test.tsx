import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShatterProvider, SHATTER_LOGO_CLASS } from '../effects/shatter';
import {
  clearMatchMedia,
  layers,
  mockBoxes,
  mockReducedMotion,
  shardCount,
  stubAnimate,
} from '../effects/shatter/test-utils';
import { LangProvider } from '../i18n';
import type { RankedRow } from '../lib/boards';
import { Leaderboard } from './Leaderboard';
import { RevealIn } from './RevealIn';
import { TopBar } from './TopBar';

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function rowsOf(names: string[]): RankedRow[] {
  return names.map((name, i) => ({
    playerRowId: `p-${name}`,
    name,
    displaySuffix: null,
    value: 900 - i * 10,
    rank: i + 1,
    isOwn: false,
    detached: false,
  }));
}

const TEN = ['Omar', 'Lina', 'Sara', 'Adam', 'Noor', 'Zaid', 'Hala', 'Rami', 'Dana', 'Yousef'];
const hiddenRows = () => screen.getAllByTestId('board-row').filter((r) => r.style.opacity === '0');

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

describe('Leaderboard rows shatter in (projector)', () => {
  it('assembles the rows top to bottom within the 48-shard cap, then shows them all', () => {
    render(
      <ShatterProvider density="projector">
        <Leaderboard rows={rowsOf(TEN)} projector />
      </ShatterProvider>,
    );
    expect(hiddenRows()).toHaveLength(10);
    let peak = 0;
    for (let t = 0; t < 1200; t += 20) {
      peak = Math.max(peak, shardCount('shatter-in'));
      advance(20);
    }
    expect(peak).toBeGreaterThan(0);
    expect(peak).toBeLessThanOrEqual(48);
    expect(hiddenRows()).toHaveLength(0);
    expect(layers()).toHaveLength(0);
  });

  it('a row that appears later assembles on its own; the others are left alone', () => {
    const { rerender } = render(<Leaderboard rows={rowsOf(['Omar', 'Lina'])} projector />);
    advance(2000);
    rerender(<Leaderboard rows={rowsOf(['Omar', 'Lina', 'Sara'])} projector />);
    expect(hiddenRows().map((r) => r.textContent)).toEqual([expect.stringContaining('Sara')]);
    advance(700);
    expect(hiddenRows()).toHaveLength(0);
  });

  it('phone boards stay plain (lighter on low-end phones)', () => {
    render(<Leaderboard rows={rowsOf(TEN)} />);
    expect(hiddenRows()).toHaveLength(0);
    expect(layers()).toHaveLength(0);
  });

  it('reveal={false} (the day-board merge owns the rows) leaves rows untouched', () => {
    render(<Leaderboard rows={rowsOf(TEN)} projector reveal={false} />);
    expect(hiddenRows()).toHaveLength(0);
    expect(layers()).toHaveLength(0);
  });

  it('reduced motion: rows fade in over 200 ms, no shards', () => {
    mockReducedMotion(true);
    render(<Leaderboard rows={rowsOf(TEN)} projector />);
    expect(layers()).toHaveLength(0);
    expect(hiddenRows()).toHaveLength(0);
    const rowFades = anim.calls.filter((c) => (c.el as HTMLElement).dataset.testid === 'board-row');
    expect(rowFades).toHaveLength(10);
    expect(rowFades.every((c) => c.options.duration === 200 && c.keyframes.every((k) => Object.keys(k).join() === 'opacity'))).toBe(
      true,
    );
  });

  it('host toggle (ShatterProvider reducedMotion) also switches to the fade', () => {
    render(
      <ShatterProvider density="projector" reducedMotion>
        <Leaderboard rows={rowsOf(TEN)} projector />
      </ShatterProvider>,
    );
    expect(layers()).toHaveLength(0);
    expect(hiddenRows()).toHaveLength(0);
  });
});

describe('H2 new #1 celebrate', () => {
  it('celebrates the row that takes #1, not the first board', () => {
    const { rerender } = render(<Leaderboard rows={rowsOf(['Omar', 'Lina'])} projector celebrateLeader />);
    advance(2000);
    expect(layers('celebrate')).toHaveLength(0);
    rerender(<Leaderboard rows={rowsOf(['Lina', 'Omar'])} projector celebrateLeader />);
    expect(layers('celebrate')).toHaveLength(1);
    advance(2000);
    expect(layers()).toHaveLength(0);
    expect(hiddenRows()).toHaveLength(0);
  });

  it('a brand-new #1 celebrates instead of shattering in (one effect per row)', () => {
    const { rerender } = render(<Leaderboard rows={rowsOf(['Omar'])} projector celebrateLeader />);
    advance(2000);
    rerender(<Leaderboard rows={rowsOf(['Sara', 'Omar'])} projector celebrateLeader />);
    expect(layers('celebrate')).toHaveLength(1);
    expect(layers('shatter-in')).toHaveLength(0);
    advance(2000);
    expect(hiddenRows()).toHaveLength(0);
  });

  it('reduced motion: a static amber ring, the row never disappears', () => {
    mockReducedMotion(true);
    const { rerender } = render(<Leaderboard rows={rowsOf(['Omar', 'Lina'])} projector celebrateLeader />);
    rerender(<Leaderboard rows={rowsOf(['Lina', 'Omar'])} projector celebrateLeader />);
    expect(hiddenRows()).toHaveLength(0);
    expect(shardCount()).toBe(0);
    expect(document.querySelector('.gdg-shatter-ring')).not.toBeNull();
    advance(1800);
    expect(document.querySelector('.gdg-shatter-ring')).toBeNull();
  });
});

describe('RevealIn', () => {
  it('dot: hidden until its slot, then a shard burst', () => {
    render(<RevealIn variant="dot" delayMs={1000} shards={4} data-testid="dot" />);
    const dot = screen.getByTestId('dot');
    expect(dot.style.opacity).toBe('0');
    advance(999);
    expect(dot.style.opacity).toBe('0');
    advance(1);
    expect(dot.style.opacity).not.toBe('0');
    expect(layers('burst').length).toBe(1);
    advance(1000);
    expect(layers()).toHaveLength(0);
  });

  it('dot, reduced motion: fades in at its slot, no shards', () => {
    mockReducedMotion(true);
    render(<RevealIn variant="dot" delayMs={500} shards={4} data-testid="dot" />);
    advance(500);
    expect(shardCount()).toBe(0);
    advance(300);
    expect(screen.getByTestId('dot').style.opacity).not.toBe('0');
  });

  it('celebrate (P7 new best): fragments on mount and is whole again by 1200 ms', () => {
    render(
      <RevealIn variant="celebrate" data-testid="new-best">
        New best!
      </RevealIn>,
    );
    const el = screen.getByTestId('new-best');
    expect(el.style.opacity).toBe('0');
    expect(layers('celebrate')).toHaveLength(1);
    advance(1200);
    expect(el.style.opacity).not.toBe('0');
    advance(600);
    expect(layers()).toHaveLength(0);
  });

  it('celebrate, reduced motion: a static amber ring', () => {
    mockReducedMotion(true);
    render(
      <RevealIn variant="celebrate" data-testid="new-best">
        New best!
      </RevealIn>,
    );
    expect(screen.getByTestId('new-best').style.opacity).not.toBe('0');
    expect(shardCount()).toBe(0);
    expect(document.querySelector('.gdg-shatter-ring')).not.toBeNull();
  });
});

describe('logo is shatter-safe (DESIGN_SYSTEM §5)', () => {
  it('the phone top bar logo carries SHATTER_LOGO_CLASS and is never animated', () => {
    render(
      <LangProvider>
        <TopBar showLangToggle />
      </LangProvider>,
    );
    const logo = screen.getByTestId('logo');
    expect(logo).toHaveClass(SHATTER_LOGO_CLASS);
    expect(logo.getAttribute('style')).toBeNull();
    expect(anim.calls.some((c) => c.el === logo)).toBe(false);
  });
});

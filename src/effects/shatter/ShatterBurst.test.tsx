import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShatterBurst } from './ShatterBurst';
import { revealSchedule } from './plays';
import { clearMatchMedia, layers, mockBoxes, mockReducedMotion, shardCount } from './test-utils';

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  mockReducedMotion(false);
  mockBoxes({ x: 400, y: 300, width: 26, height: 26 });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  clearMatchMedia();
  document.body.innerHTML = '';
});

function Dot(props: { delay?: number; reducedMotion?: boolean; onAppear?: () => void; onDone?: () => void }) {
  return (
    <ShatterBurst shards={6} {...props}>
      <span data-testid="dot" />
    </ShatterBurst>
  );
}

describe('ShatterBurst', () => {
  it('keeps the dot hidden until its delay, bursts, and finishes after 600 ms', () => {
    const onAppear = vi.fn();
    const onDone = vi.fn();
    render(<Dot delay={1000} onAppear={onAppear} onDone={onDone} />);
    const dot = screen.getByTestId('dot');
    expect(dot.style.opacity).toBe('0');
    expect(layers()).toHaveLength(0);
    advance(999);
    expect(onAppear).not.toHaveBeenCalled();
    advance(1);
    expect(onAppear).toHaveBeenCalledTimes(1);
    expect(dot.style.opacity).toBe('');
    expect(layers('burst')).toHaveLength(1);
    expect(shardCount()).toBeGreaterThan(0);
    expect(shardCount()).toBeLessThanOrEqual(6);
    advance(599);
    expect(onDone).not.toHaveBeenCalled();
    advance(1);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(layers()).toHaveLength(0);
  });

  it('fades the dot in with reduced motion (no shards)', () => {
    const onDone = vi.fn();
    render(<Dot delay={500} reducedMotion onDone={onDone} />);
    advance(500);
    expect(layers()).toHaveLength(0);
    expect(screen.getByTestId('dot').style.opacity).toBe('');
    advance(200);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('cleans up on unmount and restores the dot', () => {
    const onDone = vi.fn();
    const { unmount } = render(<Dot delay={100} onDone={onDone} />);
    advance(150);
    expect(layers()).toHaveLength(1);
    unmount();
    expect(layers()).toHaveLength(0);
    advance(2000);
    expect(onDone).not.toHaveBeenCalled();
  });
});

describe('revealSchedule', () => {
  it('runs the strips one after another within 5 s', () => {
    const plan = revealSchedule([20, 20, 20]);
    expect(plan).toHaveLength(3);
    for (let s = 0; s < 3; s++) {
      const delays = plan[s].map((d) => d.delayMs);
      expect(Math.min(...delays)).toBeGreaterThanOrEqual(Math.round((s * 5000) / 3));
      expect(Math.max(...delays) + 600).toBeLessThanOrEqual(Math.round(((s + 1) * 5000) / 3) + 1);
      expect([...delays].sort((a, b) => a - b)).toEqual(delays);
    }
  });

  it('keeps concurrent burst shards within the cap', () => {
    for (const count of [1, 5, 14, 40, 100]) {
      const [strip] = revealSchedule([count]);
      // Worst-case overlap: every burst alive within one burst window.
      let peak = 0;
      for (const d of strip) {
        const alive = strip.filter((o) => o.delayMs <= d.delayMs && o.delayMs + 600 > d.delayMs);
        peak = Math.max(peak, alive.reduce((n, o) => n + o.shards, 0));
      }
      expect(peak).toBeLessThanOrEqual(48);
    }
    expect(revealSchedule([1])[0][0]).toMatchObject({ delayMs: 0, shards: 6 });
    expect(revealSchedule([])).toEqual([]);
  });
});

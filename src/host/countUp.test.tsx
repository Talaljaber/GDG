import { act, render, screen } from '@testing-library/react';
import { Profiler, useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearMatchMedia, mockReducedMotion } from '../effects/shatter/test-utils';
import { formatNumber } from '../i18n';
import { useCountUp } from './countUp';

let renders = 0;
let commits = 0;

function Num({ value, enabled = true, delay }: { value: number; enabled?: boolean; delay?: number }) {
  renders += 1;
  const ref = useRef<HTMLSpanElement>(null);
  useCountUp(ref, value, { duration: 1200, delay, enabled });
  return (
    <span ref={ref} data-testid="n">
      {formatNumber(value)}
    </span>
  );
}

function Counted(props: { value: number; enabled?: boolean; delay?: number }) {
  return (
    <Profiler id="count" onRender={() => (commits += 1)}>
      <Num {...props} />
    </Profiler>
  );
}

const text = () => screen.getByTestId('n').textContent;
const num = () => Number((text() ?? '').replace(/,/g, ''));

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame'],
  });
  mockReducedMotion(false);
  renders = 0;
  commits = 0;
});

afterEach(() => {
  vi.useRealTimers();
  clearMatchMedia();
  delete document.documentElement.dataset.motion;
});

describe('useCountUp', () => {
  it('counts from 0 in whole, formatted steps and ends exactly on formatNumber(value)', () => {
    render(<Counted value={2890} />);
    expect(text()).toBe('0');
    const seen: number[] = [];
    for (let t = 0; t < 1200; t += 100) {
      advance(100);
      seen.push(num());
      expect(text()).toBe(formatNumber(num())); // odometer-style integers, grouped
    }
    advance(50);
    expect(text()).toBe('2,890');
    // Monotonic, ease-out: the first half covers more than half the distance.
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
    expect(seen[5]).toBeGreaterThan(2890 / 2);
    expect(seen[5]).toBeLessThan(2890);
  });

  it('runs without a single React render or commit while counting', () => {
    render(<Counted value={2890} />);
    expect(renders).toBe(1);
    expect(commits).toBe(1);
    advance(1300);
    expect(text()).toBe('2,890');
    expect(renders).toBe(1);
    expect(commits).toBe(1);
  });

  it('counts from the value it showed to a new value (E22 late score, total step)', () => {
    const { rerender } = render(<Counted value={900} />);
    advance(1300);
    expect(text()).toBe('900');
    rerender(<Counted value={1850} />);
    expect(text()).toBe('900');
    advance(600);
    expect(num()).toBeGreaterThan(900);
    expect(num()).toBeLessThan(1850);
    // Changed again mid-count: carries on from where it is, never jumps back.
    const mid = num();
    rerender(<Counted value={2000} />);
    expect(num()).toBe(mid);
    advance(1300);
    expect(text()).toBe('2,000');
  });

  it('holds the start value during the delay (row cascade)', () => {
    render(<Counted value={500} delay={300} />);
    advance(280);
    expect(text()).toBe('0');
    advance(1300);
    expect(text()).toBe('500');
  });

  it('reduced motion (OS): the final value at once, no frames', () => {
    mockReducedMotion(true);
    render(<Counted value={2890} />);
    expect(text()).toBe('2,890');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reduced motion (host toggle) and enabled=false: the final value at once', () => {
    document.documentElement.dataset.motion = 'reduced';
    const { unmount } = render(<Counted value={1234} />);
    expect(text()).toBe('1,234');
    unmount();
    delete document.documentElement.dataset.motion;
    const off = render(<Counted value={777} enabled={false} />);
    expect(text()).toBe('777');
    // Switched on later: counts from what it showed, not from 0.
    off.rerender(<Counted value={800} enabled />);
    expect(text()).toBe('777');
    advance(1300);
    expect(text()).toBe('800');
  });
});

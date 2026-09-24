import { act, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShatterIn } from './ShatterIn';
import { shardsPerItem } from './plays';
import { clearMatchMedia, layers, mockBoxes, mockReducedMotion, shardCount } from './test-utils';

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  mockReducedMotion(false);
  mockBoxes();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  clearMatchMedia();
  document.body.innerHTML = '';
});

function Board(props: { reducedMotion?: boolean; onItemRevealed?: (i: number) => void; onDone?: () => void; trigger?: number; rows?: number; density?: 'phone' | 'projector' }) {
  const n = props.rows ?? 3;
  return (
    <ShatterIn as="ol" stagger={60} itemDuration={500} {...props}>
      {Array.from({ length: n }, (_, i) => (
        <li key={i} data-testid={`row-${i}`}>
          row {i}
        </li>
      ))}
    </ShatterIn>
  );
}

const row = (i: number) => screen.getByTestId(`row-${i}`);

describe('ShatterIn', () => {
  it('assembles rows top to bottom: row i revealed at i·60 + 500 ms', () => {
    const revealed = vi.fn();
    const onDone = vi.fn();
    render(<Board onItemRevealed={revealed} onDone={onDone} />);
    expect([0, 1, 2].map((i) => row(i).style.opacity)).toEqual(['0', '0', '0']);
    expect(layers('shatter-in')).toHaveLength(1);

    advance(60);
    expect(layers('shatter-in')).toHaveLength(2);
    advance(439); // 499
    expect(revealed).not.toHaveBeenCalled();
    advance(1); // 500
    expect(revealed).toHaveBeenLastCalledWith(0);
    expect(row(0).style.opacity).toBe('');
    expect(row(1).style.opacity).toBe('0');
    advance(60); // 560
    expect(revealed).toHaveBeenLastCalledWith(1);
    advance(59); // 619
    expect(onDone).not.toHaveBeenCalled();
    advance(1); // 620
    expect(revealed).toHaveBeenLastCalledWith(2);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(row(2).style.opacity).toBe('');
    advance(120);
    expect(layers()).toHaveLength(0);
  });

  it('keeps concurrent shards within the cap on a 10-row projector board', () => {
    render(<Board rows={10} density="projector" />);
    let peak = 0;
    for (let t = 0; t < 1300; t += 10) {
      peak = Math.max(peak, shardCount());
      advance(10);
    }
    expect(peak).toBeGreaterThan(0);
    expect(peak).toBeLessThanOrEqual(48);
    expect(layers()).toHaveLength(0);
  });

  it('computes a per-row budget that respects the cap', () => {
    for (const density of ['phone', 'projector'] as const) {
      for (const n of [1, 3, 10, 40]) {
        const k = shardsPerItem(n, density, 60, 500);
        const concurrent = Math.min(n, Math.ceil((500 + 120) / 60));
        expect(k * concurrent).toBeLessThanOrEqual(density === 'phone' ? 24 : 48);
        expect(k % 2).toBe(0);
      }
    }
    expect(shardsPerItem(100, 'phone', 0, 500)).toBe(0);
  });

  it('fades rows in over 200 ms with reduced motion, nothing hidden', () => {
    const revealed = vi.fn();
    const onDone = vi.fn();
    render(<Board reducedMotion onItemRevealed={revealed} onDone={onDone} />);
    expect(layers()).toHaveLength(0);
    expect(row(0).style.opacity).toBe('');
    expect(revealed).toHaveBeenCalledTimes(3);
    advance(199);
    expect(onDone).not.toHaveBeenCalled();
    advance(1);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('replays when the trigger changes', () => {
    const onDone = vi.fn();
    const { rerender } = render(<Board trigger={1} onDone={onDone} />);
    advance(800);
    expect(onDone).toHaveBeenCalledTimes(1);
    rerender(<Board trigger={2} onDone={onDone} />);
    expect(row(0).style.opacity).toBe('0');
    advance(620);
    expect(onDone).toHaveBeenCalledTimes(2);
  });

  it('plays once under StrictMode (simulated unmount/remount)', () => {
    const onDone = vi.fn();
    render(
      <StrictMode>
        <Board onDone={onDone} />
      </StrictMode>,
    );
    expect(layers('shatter-in')).toHaveLength(1);
    expect(row(2).style.opacity).toBe('0');
    advance(800);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(row(2).style.opacity).toBe('');
    expect(layers()).toHaveLength(0);
  });

  it('shifts the whole sequence by delay (one element per ShatterIn, as in a per-row wrapper)', () => {
    const onDone = vi.fn();
    render(
      <ShatterIn delay={300} onDone={onDone}>
        <div data-testid="single">row</div>
      </ShatterIn>,
    );
    const el = screen.getByTestId('single');
    expect(el.style.opacity).toBe('0');
    expect(layers()).toHaveLength(0);
    advance(300);
    expect(layers('shatter-in')).toHaveLength(1);
    advance(499);
    expect(el.style.opacity).toBe('0');
    advance(1);
    expect(el.style.opacity).toBe('');
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('cleans up on unmount', () => {
    const onDone = vi.fn();
    const { unmount } = render(<Board onDone={onDone} />);
    advance(100);
    unmount();
    expect(layers()).toHaveLength(0);
    advance(1000);
    expect(onDone).not.toHaveBeenCalled();
  });
});

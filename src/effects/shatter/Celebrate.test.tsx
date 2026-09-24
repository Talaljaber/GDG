import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Celebrate } from './Celebrate';
import { useCelebrate } from './hooks';
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

function Row({ trigger, reducedMotion, onFused, onDone }: { trigger: number; reducedMotion?: boolean; onFused?: () => void; onDone?: () => void }) {
  return (
    <Celebrate trigger={trigger} reducedMotion={reducedMotion} onFused={onFused} onDone={onDone}>
      <div data-testid="row">#1 Omar 938</div>
    </Celebrate>
  );
}

describe('Celebrate', () => {
  it('does not play on mount by default', () => {
    render(<Row trigger={0} />);
    expect(layers()).toHaveLength(0);
  });

  it('fragments, fuses at 1200 ms and finishes after the glow at 1800 ms', () => {
    const onFused = vi.fn();
    const onDone = vi.fn();
    const { rerender } = render(<Row trigger={0} onFused={onFused} onDone={onDone} />);
    rerender(<Row trigger={1} onFused={onFused} onDone={onDone} />);
    const row = screen.getByTestId('row');
    expect(layers('celebrate')).toHaveLength(1);
    expect(shardCount()).toBeGreaterThan(0);
    expect(shardCount()).toBeLessThanOrEqual(24);
    expect(row.style.opacity).toBe('0');

    advance(1199);
    expect(onFused).not.toHaveBeenCalled();
    advance(1);
    expect(onFused).toHaveBeenCalledTimes(1);
    expect(row.style.opacity).toBe('');
    expect(document.querySelector('[data-shatter-ring]')).not.toBeNull();

    advance(599);
    expect(onDone).not.toHaveBeenCalled();
    advance(1);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(layers()).toHaveLength(0);
  });

  it('plays on mount when asked', () => {
    render(
      <Celebrate trigger={3} playOnMount>
        <div>best</div>
      </Celebrate>,
    );
    expect(layers('celebrate')).toHaveLength(1);
  });

  it('restarts when the trigger changes mid-play', () => {
    const onDone = vi.fn();
    const { rerender } = render(<Row trigger={0} onDone={onDone} />);
    rerender(<Row trigger={1} onDone={onDone} />);
    advance(600);
    rerender(<Row trigger={2} onDone={onDone} />);
    expect(layers()).toHaveLength(1);
    advance(1799);
    expect(onDone).not.toHaveBeenCalled();
    advance(1);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('shows a static amber ring with reduced motion', () => {
    const onFused = vi.fn();
    const onDone = vi.fn();
    const { rerender } = render(<Row trigger={0} reducedMotion onFused={onFused} onDone={onDone} />);
    rerender(<Row trigger={1} reducedMotion onFused={onFused} onDone={onDone} />);
    expect(shardCount()).toBe(0);
    expect(document.querySelector('[data-shatter-ring]')).not.toBeNull();
    expect(screen.getByTestId('row').style.opacity).toBe('');
    expect(onFused).toHaveBeenCalledTimes(1);
    advance(1800);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(layers()).toHaveLength(0);
  });

  it('honours prefers-reduced-motion', () => {
    mockReducedMotion(true);
    const { rerender } = render(<Row trigger={0} />);
    rerender(<Row trigger={1} />);
    expect(shardCount()).toBe(0);
    expect(document.querySelector('[data-shatter-ring]')).not.toBeNull();
  });

  it('cleans up on unmount', () => {
    const onFused = vi.fn();
    const onDone = vi.fn();
    const { rerender, unmount } = render(<Row trigger={0} onFused={onFused} onDone={onDone} />);
    rerender(<Row trigger={1} onFused={onFused} onDone={onDone} />);
    unmount();
    expect(layers()).toHaveLength(0);
    advance(3000);
    expect(onFused).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });
});

describe('useCelebrate', () => {
  function Card({ onDone }: { onDone: () => void }) {
    const { ref, celebrate, playing } = useCelebrate<HTMLDivElement>({ density: 'projector', onDone });
    return (
      <div>
        <div ref={ref} data-testid="card">
          card
        </div>
        <button onClick={celebrate}>go</button>
        <span data-testid="state">{playing ? 'playing' : 'idle'}</span>
      </div>
    );
  }

  it('plays on demand and reports playing until done', () => {
    const onDone = vi.fn();
    render(<Card onDone={onDone} />);
    fireEvent.click(screen.getByText('go'));
    expect(screen.getByTestId('state')).toHaveTextContent('playing');
    expect(shardCount()).toBeLessThanOrEqual(48);
    expect(screen.getByTestId('card').style.opacity).toBe('0');
    advance(1800);
    expect(screen.getByTestId('state')).toHaveTextContent('idle');
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('card').style.opacity).toBe('');
  });

  it('cancels on unmount', () => {
    const onDone = vi.fn();
    const { unmount } = render(<Card onDone={onDone} />);
    fireEvent.click(screen.getByText('go'));
    unmount();
    expect(layers()).toHaveLength(0);
    advance(2000);
    expect(onDone).not.toHaveBeenCalled();
  });
});

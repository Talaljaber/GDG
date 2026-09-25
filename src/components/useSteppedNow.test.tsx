import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSteppedNow } from './useSteppedNow';

const START = 1_000_000;

let renders = 0;
function Countdown({ endsAt, active = true }: { endsAt: number; active?: boolean }) {
  renders += 1;
  const secondsAt = (n: number) => Math.max(0, Math.ceil((endsAt - n) / 1000));
  const now = useSteppedNow(secondsAt, 250, active);
  return <p data-testid="s">{secondsAt(now)}</p>;
}

describe('useSteppedNow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
    renders = 0;
  });
  afterEach(() => vi.useRealTimers());

  it('checks every tick but re-renders only when the key changes', () => {
    render(<Countdown endsAt={START + 3000} />);
    expect(screen.getByTestId('s')).toHaveTextContent('3');
    const afterMount = renders;
    // 12 ticks of 250 ms = 3 s: the value changes 3 times (3 → 2 → 1 → 0).
    for (let i = 0; i < 12; i++) act(() => vi.advanceTimersByTime(250));
    expect(screen.getByTestId('s')).toHaveTextContent('0');
    expect(renders - afterMount).toBe(3);
    // Nothing left to change: no more renders.
    act(() => vi.advanceTimersByTime(5000));
    expect(renders - afterMount).toBe(3);
  });

  it('picks up new inputs before paint, not at the next tick', () => {
    const { rerender } = render(<Countdown endsAt={START + 3000} />);
    act(() => vi.advanceTimersByTime(10_000)); // long idle: the held value is 10 s old
    rerender(<Countdown endsAt={START + 20_000} />);
    // 10 s left from the real now, not 20 s from the held value
    expect(screen.getByTestId('s')).toHaveTextContent('10');
  });

  it('does not tick while inactive', () => {
    render(<Countdown endsAt={START + 3000} active={false} />);
    const afterMount = renders;
    act(() => vi.advanceTimersByTime(5000));
    expect(renders).toBe(afterMount);
    expect(screen.getByTestId('s')).toHaveTextContent('3');
  });
});

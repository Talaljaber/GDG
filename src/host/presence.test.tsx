import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PRESENCE_GREY_MS } from '../config';
import { usePresenceDots } from './presence';

let renders = 0;
function Dots({ ids, present }: { ids: string[]; present: ReadonlySet<string> }) {
  renders += 1;
  const dotOf = usePresenceDots(ids, present);
  return <p data-testid="dots">{ids.map((id) => `${id}:${dotOf(id)}`).join(' ')}</p>;
}

describe('usePresenceDots', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    renders = 0;
  });
  afterEach(() => vi.useRealTimers());

  it('does not re-render an idle lobby every second', () => {
    const present = new Set(['a', 'b', 'c']);
    render(<Dots ids={['a', 'b', 'c']} present={present} />);
    const mounted = renders;
    act(() => vi.advanceTimersByTime(30_000));
    expect(renders).toBe(mounted);
    expect(screen.getByTestId('dots')).toHaveTextContent('a:on b:on c:on');
  });

  it('greys a phone PRESENCE_GREY_MS after it left, with one re-render', () => {
    const { rerender } = render(<Dots ids={['a', 'b']} present={new Set(['a', 'b'])} />);
    act(() => vi.advanceTimersByTime(3000));
    rerender(<Dots ids={['a', 'b']} present={new Set(['a'])} />); // b leaves
    const left = renders;
    act(() => vi.advanceTimersByTime(PRESENCE_GREY_MS - 2000));
    expect(screen.getByTestId('dots')).toHaveTextContent('a:on b:on');
    expect(renders).toBe(left);
    act(() => vi.advanceTimersByTime(3000));
    expect(screen.getByTestId('dots')).toHaveTextContent('a:on b:off');
    expect(renders).toBe(left + 1);
    act(() => vi.advanceTimersByTime(20_000));
    expect(renders).toBe(left + 1);
    rerender(<Dots ids={['a', 'b']} present={new Set(['a', 'b'])} />); // back
    expect(screen.getByTestId('dots')).toHaveTextContent('a:on b:on');
  });
});

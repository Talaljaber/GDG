import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ShatterDemo from './Demo';
import { clearMatchMedia, layers, mockBoxes, mockReducedMotion } from './test-utils';

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

describe('ShatterDemo (dev-only)', () => {
  it.each([false, true])('plays every variant and leaves no layer behind (reduced motion: %s)', (reduced) => {
    render(<ShatterDemo />);
    if (reduced) fireEvent.click(screen.getByLabelText(/Reduced motion/));
    for (const label of ['Next screen', 'New personal best', 'useCelebrate on an li', 'Replay', 'Show day board', 'Replay reveal']) {
      fireEvent.click(screen.getByText(label));
    }
    for (let t = 0; t < 16000; t += 100) {
      act(() => {
        vi.advanceTimersByTime(100);
      });
    }
    expect(layers()).toHaveLength(0);
    expect(screen.getByText('Lobby')).toBeInTheDocument();
  });
});

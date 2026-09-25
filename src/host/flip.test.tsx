import { render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearMatchMedia, mockReducedMotion } from '../effects/shatter/test-utils';
import { useFlipRows, type FlipOptions } from './flip';

const ROW = 50;

interface Call {
  el: HTMLElement;
  keyframes: Keyframe[];
  options: KeyframeAnimationOptions;
  /** The element's inline transform when the animation started (the FLIP invert). */
  inlineAtStart: string;
}

let calls: Call[] = [];
let restoreAnimate: () => void;
let boxes: ReturnType<typeof vi.spyOn>;

/** WAAPI stub (jsdom has none) that also records the inline transform at play time. */
function stubAnimate() {
  const proto = Element.prototype as Element & { animate?: unknown };
  Object.defineProperty(proto, 'animate', {
    configurable: true,
    writable: true,
    value(this: HTMLElement, keyframes: Keyframe[], options: KeyframeAnimationOptions) {
      calls.push({ el: this, keyframes, options, inlineAtStart: this.style.transform });
      return { cancel: vi.fn(), finish: vi.fn(), onfinish: null, oncancel: null } as unknown as Animation;
    },
  });
  return () => delete (proto as { animate?: unknown }).animate;
}

/** Layout: each keyed row sits at its index × 50 px inside its list (jsdom boxes are all zero). */
function mockLayout() {
  return vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    let top = 0;
    if (this.hasAttribute('data-reveal-key') && this.parentElement) {
      top = Array.from(this.parentElement.children).indexOf(this) * ROW;
    }
    return { x: 0, y: top, top, left: 0, right: 300, bottom: top + ROW, width: 300, height: ROW, toJSON: () => ({}) } as DOMRect;
  });
}

function List({ keys, ...opts }: { keys: string[] } & Partial<FlipOptions>) {
  const ref = useRef<HTMLUListElement>(null);
  useFlipRows(ref, keys, { duration: 400, pulseClass: 'pulse', enabled: true, pulseDuration: 500, ...opts });
  return (
    <ul ref={ref}>
      {keys.map((k) => (
        <li key={k} data-reveal-key={k}>
          {k}
        </li>
      ))}
    </ul>
  );
}

const row = (k: string) => document.querySelector<HTMLElement>(`[data-reveal-key="${k}"]`) as HTMLElement;
const callFor = (k: string) => calls.filter((c) => c.el === row(k));

beforeEach(() => {
  vi.useFakeTimers();
  calls = [];
  restoreAnimate = stubAnimate();
  boxes = mockLayout();
  mockReducedMotion(false);
});

afterEach(() => {
  boxes.mockRestore();
  restoreAnimate();
  vi.useRealTimers();
  clearMatchMedia();
  delete document.documentElement.dataset.motion;
  document.body.innerHTML = '';
});

describe('useFlipRows', () => {
  it('inverts each moved row with a transform, plays it back to rest, then clears the inline transform', () => {
    const { rerender } = render(<List keys={['a', 'b', 'c']} />);
    expect(calls).toHaveLength(0); // no `enter`: the first render just measures
    rerender(<List keys={['c', 'a', 'b']} />);

    // c: 100 px → 0: starts 100 px lower; a, b: one row higher than their new place.
    const [c] = callFor('c');
    expect(c.inlineAtStart).toBe('translateY(100px)');
    expect(c.keyframes).toEqual([{ transform: 'translateY(100px)' }, { transform: 'none' }]);
    expect(c.options.duration).toBe(400);
    expect(callFor('a')[0].keyframes[0]).toEqual({ transform: 'translateY(-50px)' });
    expect(callFor('b')[0].keyframes[0]).toEqual({ transform: 'translateY(-50px)' });
    for (const k of ['a', 'b', 'c']) expect(row(k).style.transform).toBe('');
    // Only animates transform (never layout properties).
    expect(calls.every((x) => x.keyframes.every((f) => Object.keys(f).every((p) => p === 'transform')))).toBe(true);
  });

  it('pulses only the rows that climbed, once, for the pulse duration', () => {
    const { rerender } = render(<List keys={['a', 'b', 'c']} />);
    rerender(<List keys={['c', 'a', 'b']} />);
    expect(row('c')).toHaveClass('pulse');
    expect(row('a')).not.toHaveClass('pulse');
    expect(row('b')).not.toHaveClass('pulse');
    vi.advanceTimersByTime(499);
    expect(row('c')).toHaveClass('pulse');
    vi.advanceTimersByTime(1);
    expect(row('c')).not.toHaveClass('pulse');
  });

  it('does nothing when the order is unchanged (re-render with the same keys)', () => {
    const { rerender } = render(<List keys={['a', 'b']} />);
    rerender(<List keys={['a', 'b']} />);
    rerender(<List keys={['a', 'b']} />);
    expect(calls).toHaveLength(0);
  });

  it('a row that is new has nothing to slide from; with `enter` it fades and settles in', () => {
    const { rerender } = render(<List keys={['a', 'b']} enter={{ duration: 240, stagger: 60 }} />);
    // The first render cascades every row in, top to bottom.
    expect(calls.map((x) => [x.el.textContent, x.options.delay])).toEqual([
      ['a', 0],
      ['b', 60],
    ]);
    expect(calls[0].keyframes).toEqual([
      { opacity: 0, transform: 'translateY(8px)' },
      { opacity: 1, transform: 'none' },
    ]);
    expect(calls[0].options.fill).toBe('backwards');
    calls = [];
    rerender(<List keys={['x', 'a', 'b']} enter={{ duration: 240, stagger: 60 }} />);
    expect(callFor('x')).toHaveLength(1);
    expect(callFor('x')[0].keyframes[0]).toEqual({ opacity: 0, transform: 'translateY(8px)' });
    // a and b were pushed down one row: they slide, but they did not climb (no pulse).
    expect(callFor('a')[0].keyframes[0]).toEqual({ transform: 'translateY(-50px)' });
    expect(row('a')).not.toHaveClass('pulse');
  });

  it('reduced motion (OS): no transform, no animation, no pulse', () => {
    mockReducedMotion(true);
    const { rerender } = render(<List keys={['a', 'b', 'c']} enter={{ duration: 240, stagger: 60 }} />);
    rerender(<List keys={['c', 'b', 'a']} enter={{ duration: 240, stagger: 60 }} />);
    expect(calls).toHaveLength(0);
    for (const k of ['a', 'b', 'c']) {
      expect(row(k).style.transform).toBe('');
      expect(row(k)).not.toHaveClass('pulse');
    }
  });

  it('reduced motion (host toggle, data-motion="reduced") and enabled=false skip it the same way', () => {
    document.documentElement.dataset.motion = 'reduced';
    const first = render(<List keys={['a', 'b']} />);
    first.rerender(<List keys={['b', 'a']} />);
    expect(calls).toHaveLength(0);
    first.unmount();
    delete document.documentElement.dataset.motion;

    const second = render(<List keys={['a', 'b']} enabled={false} />);
    second.rerender(<List keys={['b', 'a']} enabled={false} />);
    expect(calls).toHaveLength(0);
    expect(row('b')).not.toHaveClass('pulse');
  });
});

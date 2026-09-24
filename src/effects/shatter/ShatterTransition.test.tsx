import { act, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShatterProvider } from './ShatterProvider';
import { ShatterTransition } from './ShatterTransition';
import { ANIMATABLE } from './renderer';
import { clearMatchMedia, layers, mockReducedMotion, shardCount, stubAnimate } from './test-utils';

let mounts: Record<string, number>;
function Screen({ name }: { name: string }) {
  useEffect(() => {
    mounts[name] = (mounts[name] ?? 0) + 1;
  }, [name]);
  return <p>{name}</p>;
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  mounts = {};
  mockReducedMotion(false);
});

afterEach(() => {
  vi.useRealTimers();
  clearMatchMedia();
  document.body.innerHTML = '';
});

describe('ShatterTransition', () => {
  it('flies in, swaps content at 320 ms and finishes at 700 ms', () => {
    const onStart = vi.fn();
    const onSwap = vi.fn();
    const onDone = vi.fn();
    const props = { onStart, onSwap, onDone };
    const { rerender } = render(
      <ShatterTransition transitionKey="a" {...props}>
        <Screen name="A" />
      </ShatterTransition>,
    );
    expect(layers()).toHaveLength(0);

    rerender(
      <ShatterTransition transitionKey="b" {...props}>
        <Screen name="B" />
      </ShatterTransition>,
    );
    expect(onStart).toHaveBeenCalledWith('b');
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.queryByText('B')).toBeNull();
    expect(layers('transition')).toHaveLength(1);
    expect(shardCount()).toBeGreaterThan(0);
    expect(shardCount()).toBeLessThanOrEqual(24);

    advance(319);
    expect(onSwap).not.toHaveBeenCalled();
    expect(screen.getByText('A')).toBeInTheDocument();

    advance(1);
    expect(onSwap).toHaveBeenCalledWith('b');
    expect(screen.getByText('B')).toBeInTheDocument();
    expect(screen.queryByText('A')).toBeNull();
    expect(layers()).toHaveLength(1);

    advance(379);
    expect(onDone).not.toHaveBeenCalled();
    advance(1);
    expect(onDone).toHaveBeenCalledWith('b');
    expect(layers()).toHaveLength(0);
    expect(onSwap).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('keeps the old screen mounted (not remounted) until the swap', () => {
    const { rerender } = render(
      <ShatterTransition transitionKey="a">
        <Screen name="A" />
      </ShatterTransition>,
    );
    rerender(
      <ShatterTransition transitionKey="b">
        <Screen name="B" />
      </ShatterTransition>,
    );
    advance(700);
    expect(mounts).toEqual({ A: 1, B: 1 });
  });

  it('uses up to 48 shards on the projector', () => {
    const { rerender } = render(
      <ShatterTransition transitionKey={1} density="projector">
        <Screen name="A" />
      </ShatterTransition>,
    );
    rerender(
      <ShatterTransition transitionKey={2} density="projector">
        <Screen name="B" />
      </ShatterTransition>,
    );
    expect(shardCount()).toBeGreaterThan(24);
    expect(shardCount()).toBeLessThanOrEqual(48);
  });

  it('folds key changes during the fly-in into one swap to the latest screen', () => {
    const onSwap = vi.fn();
    const { rerender } = render(
      <ShatterTransition transitionKey="a" onSwap={onSwap}>
        <Screen name="A" />
      </ShatterTransition>,
    );
    rerender(
      <ShatterTransition transitionKey="b" onSwap={onSwap}>
        <Screen name="B" />
      </ShatterTransition>,
    );
    advance(100);
    rerender(
      <ShatterTransition transitionKey="c" onSwap={onSwap}>
        <Screen name="C" />
      </ShatterTransition>,
    );
    expect(layers()).toHaveLength(1);
    advance(220);
    expect(onSwap).toHaveBeenCalledTimes(1);
    expect(onSwap).toHaveBeenCalledWith('c');
    expect(screen.getByText('C')).toBeInTheDocument();
    expect(mounts.B).toBeUndefined();
  });

  it('passes live updates of the shown screen straight through', () => {
    const { rerender } = render(
      <ShatterTransition transitionKey="a">
        <p>A1</p>
      </ShatterTransition>,
    );
    rerender(
      <ShatterTransition transitionKey="a">
        <p>A2</p>
      </ShatterTransition>,
    );
    expect(screen.getByText('A2')).toBeInTheDocument();
    expect(layers()).toHaveLength(0);
  });

  it.each([
    ['the reducedMotion prop', (el: JSX.Element) => el, true],
    ['the provider', (el: JSX.Element) => <ShatterProvider reducedMotion>{el}</ShatterProvider>, false],
    ['prefers-reduced-motion', (el: JSX.Element) => el, false],
  ] as const)('crossfades for 200 ms with reduced motion via %s', (label, wrap, prop) => {
    if (label === 'prefers-reduced-motion') mockReducedMotion(true);
    const anim = stubAnimate();
    const onSwap = vi.fn();
    const onDone = vi.fn();
    const tree = (key: string, name: string) =>
      wrap(
        <ShatterTransition transitionKey={key} reducedMotion={prop || undefined} onSwap={onSwap} onDone={onDone}>
          <Screen name={name} />
        </ShatterTransition>,
      );
    const { rerender } = render(tree('a', 'A'));
    rerender(tree('b', 'B'));
    expect(layers()).toHaveLength(0);
    expect(onSwap).toHaveBeenCalledWith('b');
    expect(screen.getByText('B')).toBeInTheDocument();
    const leaving = screen.getByText('A').closest('.gdg-shatter-cell');
    expect(leaving).toHaveAttribute('aria-hidden', 'true');
    // Both copies fade over 200 ms, opacity only.
    const fades = anim.calls.filter((c) => c.options.duration === 200);
    expect(fades).toHaveLength(2);
    advance(199);
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByText('A')).toBeInTheDocument();
    advance(1);
    expect(onDone).toHaveBeenCalledWith('b');
    expect(screen.queryByText('A')).toBeNull();
    anim.restore();
  });

  it('cleans up on unmount mid-transition', () => {
    const onSwap = vi.fn();
    const onDone = vi.fn();
    const { rerender, unmount } = render(
      <ShatterTransition transitionKey="a" onSwap={onSwap} onDone={onDone}>
        <Screen name="A" />
      </ShatterTransition>,
    );
    rerender(
      <ShatterTransition transitionKey="b" onSwap={onSwap} onDone={onDone}>
        <Screen name="B" />
      </ShatterTransition>,
    );
    expect(layers()).toHaveLength(1);
    unmount();
    expect(layers()).toHaveLength(0);
    advance(1000);
    expect(onSwap).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('animates only transform and opacity', () => {
    const anim = stubAnimate();
    const { rerender } = render(
      <ShatterTransition transitionKey="a">
        <Screen name="A" />
      </ShatterTransition>,
    );
    rerender(
      <ShatterTransition transitionKey="b">
        <Screen name="B" />
      </ShatterTransition>,
    );
    advance(700);
    expect(anim.calls.length).toBeGreaterThan(0);
    for (const call of anim.calls) {
      for (const frame of call.keyframes) {
        for (const key of Object.keys(frame)) expect(ANIMATABLE.has(key)).toBe(true);
      }
    }
    anim.restore();
  });
});

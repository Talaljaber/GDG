import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShatterProvider } from '../effects/shatter';
import { clearMatchMedia, layers, mockReducedMotion, stubAnimate } from '../effects/shatter/test-utils';
import { LOADING_KEY, ScreenTransition } from './ScreenTransition';

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

let anim: ReturnType<typeof stubAnimate>;
beforeEach(() => {
  vi.useFakeTimers();
  mockReducedMotion(false);
  anim = stubAnimate();
});

afterEach(() => {
  anim.restore();
  vi.useRealTimers();
  clearMatchMedia();
  document.body.innerHTML = '';
});

describe('ScreenTransition (DESIGN_SYSTEM §6.2 screen transition)', () => {
  it('plays the shatter on a key change: old screen until 320 ms, then the new one', () => {
    const { rerender } = render(<ScreenTransition screenKey="lobby">{<p>lobby</p>}</ScreenTransition>);
    rerender(<ScreenTransition screenKey="results">{<p>results</p>}</ScreenTransition>);
    expect(layers().length).toBeGreaterThan(0);
    expect(screen.getByText('lobby')).toBeInTheDocument();
    expect(screen.queryByText('results')).toBeNull();
    advance(320);
    expect(screen.getByText('results')).toBeInTheDocument();
    advance(400);
    expect(layers()).toHaveLength(0);
  });

  it('onShown reports the screen actually shown: the old one through the fly-in, the new one at the swap', () => {
    const onShown = vi.fn();
    const { rerender, container } = render(
      <ScreenTransition screenKey="results" onShown={onShown}>
        {<p>results</p>}
      </ScreenTransition>,
    );
    expect(onShown).toHaveBeenLastCalledWith('results');
    rerender(
      <ScreenTransition screenKey="lobby" onShown={onShown}>
        {<p>lobby</p>}
      </ScreenTransition>,
    );
    expect(onShown).toHaveBeenLastCalledWith('results');
    // the frozen old screen is marked as flying in (CSS makes it take no taps)
    expect(container.querySelector('[data-shatter-phase="in"]')).not.toBeNull();
    advance(319);
    expect(onShown).toHaveBeenLastCalledWith('results');
    advance(1);
    expect(onShown).toHaveBeenLastCalledWith('lobby');
    expect(container.querySelector('[data-shatter-phase="in"]')).toBeNull();
  });

  it('onShown follows an instant change at once', () => {
    const onShown = vi.fn();
    const { rerender } = render(
      <ScreenTransition screenKey={LOADING_KEY} onShown={onShown}>
        {<p>spinner</p>}
      </ScreenTransition>,
    );
    rerender(
      <ScreenTransition screenKey="lobby" onShown={onShown}>
        {<p>lobby</p>}
      </ScreenTransition>,
    );
    expect(onShown).toHaveBeenLastCalledWith('lobby');
  });

  it('swaps at once, with no shards, when the change is instant (into a game)', () => {
    const { rerender } = render(<ScreenTransition screenKey="intermission:r1">{<p>board</p>}</ScreenTransition>);
    rerender(
      <ScreenTransition screenKey="round:r2" instant>
        {<p>game</p>}
      </ScreenTransition>,
    );
    expect(screen.getByText('game')).toBeInTheDocument();
    expect(screen.queryByText('board')).toBeNull();
    expect(layers()).toHaveLength(0);
    advance(1000);
    expect(layers()).toHaveLength(0);
  });

  it('swaps at once into and out of the loading screen (a reload lands straight on its screen)', () => {
    const { rerender } = render(<ScreenTransition screenKey={LOADING_KEY}>{<p>spinner</p>}</ScreenTransition>);
    rerender(<ScreenTransition screenKey="round:r1">{<p>game</p>}</ScreenTransition>);
    expect(screen.getByText('game')).toBeInTheDocument();
    expect(layers()).toHaveLength(0);
    rerender(<ScreenTransition screenKey={LOADING_KEY}>{<p>spinner</p>}</ScreenTransition>);
    expect(screen.getByText('spinner')).toBeInTheDocument();
    expect(layers()).toHaveLength(0);
  });

  it('asks instantWhen(from, to) and swaps at once when it says so', () => {
    const instantWhen = vi.fn((from: string) => from === 'lobby:s1');
    const { rerender } = render(
      <ScreenTransition screenKey="lobby:s1" instantWhen={instantWhen}>
        {<p>lobby</p>}
      </ScreenTransition>,
    );
    rerender(
      <ScreenTransition screenKey="round:r1" instantWhen={instantWhen}>
        {<p>round</p>}
      </ScreenTransition>,
    );
    expect(instantWhen).toHaveBeenCalledWith('lobby:s1', 'round:r1');
    expect(screen.getByText('round')).toBeInTheDocument();
    expect(layers()).toHaveLength(0);
  });

  it('reduced motion (OS): a 200 ms crossfade, no shards; the leaving screen is inert', () => {
    mockReducedMotion(true);
    const { rerender } = render(<ScreenTransition screenKey="lobby">{<p>lobby</p>}</ScreenTransition>);
    rerender(<ScreenTransition screenKey="results">{<p>results</p>}</ScreenTransition>);
    expect(layers()).toHaveLength(0);
    expect(screen.getByText('results')).toBeInTheDocument();
    expect(screen.getByText('lobby').closest('[aria-hidden="true"]')).not.toBeNull();
    const fades = anim.calls.filter((c) => c.keyframes.some((k) => 'opacity' in k));
    expect(fades.length).toBeGreaterThan(0);
    expect(fades.every((c) => c.options.duration === 200)).toBe(true);
    advance(200);
    expect(screen.queryByText('lobby')).toBeNull();
  });

  it('reduced motion from the host toggle (ShatterProvider) behaves like the OS setting', () => {
    const { rerender } = render(
      <ShatterProvider reducedMotion>
        <ScreenTransition screenKey="a">{<p>a</p>}</ScreenTransition>
      </ShatterProvider>,
    );
    rerender(
      <ShatterProvider reducedMotion>
        <ScreenTransition screenKey="b">{<p>b</p>}</ScreenTransition>
      </ShatterProvider>,
    );
    expect(layers()).toHaveLength(0);
    expect(screen.getByText('b')).toBeInTheDocument();
  });
});

import { act, render, screen } from '@testing-library/react';
import { useRef, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DayBoardMerge } from './DayBoardMerge';
import { mergeSchedule, playDayBoardMerge, type DayBoardMergeGame } from './merge';
import { mergeTotalMs } from './motion';
import { clearMatchMedia, layers, mockBoxes, mockReducedMotion, shardCount } from './test-utils';

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

let t0 = 0;
let events: Array<[string, number]>;
const log = (name: string) => events.push([name, Date.now() - t0]);

beforeEach(() => {
  vi.useFakeTimers();
  mockReducedMotion(false);
  mockBoxes({ x: 0, y: 0, width: 1024, height: 768 });
  events = [];
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  clearMatchMedia();
  document.body.innerHTML = '';
});

const GAME_IDS = ['stop-the-clock', 'simon', 'trivia'];

/** A host-like stage: session results until onFragmented, then tabs. */
function Host({ trigger, reducedMotion }: { trigger: number; reducedMotion?: boolean }) {
  const [view, setView] = useState<'results' | number>('results');
  const rows = useRef<HTMLElement | null>(null);
  const games: DayBoardMergeGame[] = GAME_IDS.map((id) => ({
    id,
    targets: () => {
      log(`targets:${id}`);
      return rows.current ? Array.from(rows.current.querySelectorAll('[data-new]')) : [];
    },
  }));
  return (
    <DayBoardMerge
      trigger={trigger}
      games={games}
      reducedMotion={reducedMotion}
      data-testid="stage"
      onFragmented={() => {
        log('fragmented');
        setView(0);
      }}
      onGameStart={(g, i) => {
        log(`start:${g.id}`);
        setView(i);
      }}
      onRowsReassemble={(g, _i, targets) => log(`reassemble:${g.id}:${targets.length}`)}
      onGameEnd={(g) => log(`end:${g.id}`)}
      onSettle={() => {
        log('settle');
        setView(0);
      }}
      onDone={() => log('done')}
    >
      {view === 'results' ? (
        <p>session results</p>
      ) : (
        <ol ref={(el) => (rows.current = el)} data-testid="board">
          <li data-new="">new row of {GAME_IDS[view]}</li>
          <li data-new="">improved row</li>
          <li>old row</li>
        </ol>
      )}
    </DayBoardMerge>
  );
}

describe('DayBoardMerge', () => {
  it('runs the ~15 s choreography with callbacks at the documented times', () => {
    const { rerender } = render(<Host trigger={0} />);
    expect(layers()).toHaveLength(0);
    t0 = Date.now();
    rerender(<Host trigger={1} />);
    expect(layers('merge')).toHaveLength(1);
    expect(shardCount()).toBeLessThanOrEqual(48);
    expect(screen.getByTestId('stage').style.opacity).toBe('0');

    let peak = 0;
    for (let t = 0; t < 15100; t += 50) {
      peak = Math.max(peak, shardCount());
      advance(50);
    }
    expect(peak).toBeLessThanOrEqual(48);

    const s = mergeSchedule(3);
    const expected: Array<[string, number]> = [['fragmented', 1500]];
    GAME_IDS.forEach((id, i) => {
      expected.push([`start:${id}`, s.gameStarts[i]]);
      expected.push([`targets:${id}`, s.gameStarts[i] + 200]);
      expected.push([`reassemble:${id}:2`, s.reassembleAt[i]]);
      expected.push([`end:${id}`, s.gameEnds[i]]);
    });
    expected.push(['settle', 13500], ['done', 15000]);
    expect(events).toEqual(expected);
    expect(s.gameStarts).toEqual([1500, 5500, 9500]);
    expect(s.reassembleAt).toEqual([4100, 8100, 12100]);
    expect(mergeTotalMs(3)).toBe(15000);

    expect(layers()).toHaveLength(0);
    expect(screen.getByTestId('stage').style.opacity).toBe('');
    expect(screen.getByText(/new row of stop-the-clock/)).toBeInTheDocument();
  });

  it('hides target rows from +200 ms until they reassemble', () => {
    const { rerender } = render(<Host trigger={0} />);
    rerender(<Host trigger={1} />);
    advance(1500); // (separate acts so React renders the tab, as a browser would)
    advance(200);
    const newRow = screen.getByText(/new row of stop-the-clock/);
    const oldRow = screen.getByText('old row');
    expect(newRow.style.opacity).toBe('0');
    expect(oldRow.style.opacity).toBe('');
    expect(screen.getByTestId('stage').style.opacity).toBe('');
    advance(2399);
    expect(newRow.style.opacity).toBe('0');
    advance(1);
    expect(newRow.style.opacity).toBe('');
  });

  it('crossfades with reduced motion: everything within 200 ms, no shards', () => {
    const { rerender } = render(<Host trigger={0} reducedMotion />);
    t0 = Date.now();
    rerender(<Host trigger={1} reducedMotion />);
    expect(layers()).toHaveLength(0);
    advance(100);
    advance(100);
    advance(100);
    expect(events).toEqual([
      ['fragmented', 100],
      ['start:stop-the-clock', 100],
      ['targets:stop-the-clock', 200],
      ['reassemble:stop-the-clock:2', 200],
      ['settle', 200],
      ['done', 200],
    ]);
    expect(layers()).toHaveLength(0);
  });

  it('honours prefers-reduced-motion', () => {
    mockReducedMotion(true);
    const { rerender } = render(<Host trigger={0} />);
    rerender(<Host trigger={1} />);
    expect(layers()).toHaveLength(0);
    advance(200);
    expect(events.map((e) => e[0])).toContain('done');
  });

  it('cleans up on unmount mid-merge', () => {
    const { rerender, unmount } = render(<Host trigger={0} />);
    rerender(<Host trigger={1} />);
    advance(3000);
    unmount();
    expect(layers()).toHaveLength(0);
    const before = events.length;
    advance(20000);
    expect(events).toHaveLength(before);
  });
});

describe('playDayBoardMerge', () => {
  it('restores the stage and target rows when cancelled', () => {
    const stage = document.createElement('div');
    const row = document.createElement('div');
    stage.appendChild(row);
    document.body.appendChild(stage);
    const onDone = vi.fn();
    const h = playDayBoardMerge({ stage, games: [{ id: 'g', targets: () => [row] }], onDone });
    advance(1800);
    expect(row.style.opacity).toBe('0');
    h.cancel();
    expect(row.style.opacity).toBe('');
    expect(stage.style.opacity).toBe('');
    expect(layers()).toHaveLength(0);
    advance(20000);
    expect(onDone).not.toHaveBeenCalled();
  });

  it('adapts the timeline to the lineup length and tolerates no targets', () => {
    const stage = document.createElement('div');
    document.body.appendChild(stage);
    const onDone = vi.fn();
    const onRowsReassemble = vi.fn();
    playDayBoardMerge({ stage, games: [{ id: 'a' }], onDone, onRowsReassemble });
    advance(mergeTotalMs(1) - 1);
    expect(onRowsReassemble).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }), 0, []);
    expect(onDone).not.toHaveBeenCalled();
    advance(1);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(mergeTotalMs(1)).toBe(7000);
  });
});

import { act, render, screen, within } from '@testing-library/react';
import { Profiler, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShatterProvider } from '../effects/shatter';
import { clearMatchMedia, layers, mockReducedMotion, stubAnimate } from '../effects/shatter/test-utils';
import { LangProvider } from '../i18n';
import type { RankedRow } from '../lib/boards';
import { BoardTable, type BoardColumn } from './BoardTable';
import styles from './board.module.css';

// formatNumber runs once per rendered number: counting its calls tells whether the board rendered.
const format = vi.hoisted(() => ({ calls: 0 }));
vi.mock('../i18n', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../i18n')>();
  return {
    ...mod,
    formatNumber: (n: number) => {
      format.calls += 1;
      return mod.formatNumber(n);
    },
  };
});

function rowsOf(entries: Array<[string, number]>): RankedRow[] {
  return entries.map(([name, value], i) => ({
    playerRowId: `p-${name}`,
    name,
    displaySuffix: name === 'Sara' ? 2 : null,
    value,
    rank: i + 1,
    isOwn: false,
    detached: false,
  }));
}

const THREE = rowsOf([
  ['عبدالرحمن سا', 940],
  ['Maximilian R', 903],
  ['Sara', 866],
]);

let commits = 0;
function Wrap({ children }: { children: ReactNode }) {
  return (
    <LangProvider initial="en">
      <ShatterProvider density="projector">
        <Profiler id="board" onRender={() => (commits += 1)}>
          {children}
        </Profiler>
      </ShatterProvider>
    </LangProvider>
  );
}

const show = (ui: ReactNode) => render(ui, { wrapper: Wrap });

const board = (id = 'board') => screen.getByTestId(id);
const bodyRows = (id = 'board') => Array.from(board(id).querySelectorAll('tbody tr'));

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

let anim: ReturnType<typeof stubAnimate>;
beforeEach(() => {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame'],
  });
  mockReducedMotion(false);
  anim = stubAnimate();
  commits = 0;
  format.calls = 0;
});

afterEach(() => {
  anim.restore();
  vi.useRealTimers();
  clearMatchMedia();
  document.body.innerHTML = '';
});

describe('BoardTable: 10 fixed slots', () => {
  it('draws exactly 10 rows: 3 filled board rows and 7 calm empty slots', () => {
    show(<BoardTable rows={THREE} testId="board" />);
    const all = bodyRows();
    expect(all).toHaveLength(10);
    expect(all.filter((r) => r.classList.contains(styles.row))).toHaveLength(3);
    const slots = all.filter((r) => r.classList.contains(styles.slot));
    expect(slots).toHaveLength(7);
    for (const s of slots) {
      expect(s).toHaveAttribute('data-slot', 'empty');
      expect(s).toHaveAttribute('aria-hidden', 'true');
      expect(s.textContent).toBe('');
      expect(s).not.toHaveAttribute('data-testid');
    }
    // e2e counts `board-row`: only the filled rows carry it.
    expect(within(board()).getAllByTestId('board-row')).toHaveLength(3);
  });

  it('keeps the e2e ids: board-row, board-name in <bdi> (with the suffix), board-score formatted', () => {
    show(<BoardTable rows={THREE} testId="board" />);
    const names = within(board()).getAllByTestId('board-name');
    expect(names.map((n) => n.tagName)).toEqual(['BDI', 'BDI', 'BDI']);
    expect(names.map((n) => n.textContent)).toEqual(['عبدالرحمن سا', 'Maximilian R', 'Sara 2']);
    expect(within(board()).getAllByTestId('board-score').map((s) => s.textContent)).toEqual(['940', '903', '866']);
    expect(within(board()).getAllByTestId('board-row').map((r) => r.getAttribute('data-reveal-key'))).toEqual([
      'p-عبدالرحمن سا',
      'p-Maximilian R',
      'p-Sara',
    ]);
  });

  it('with no rows: ten empty slots and the empty text over them', () => {
    show(<BoardTable rows={[]} testId="board" emptyText="No scores yet" />);
    expect(bodyRows()).toHaveLength(10);
    expect(bodyRows().every((r) => r.getAttribute('data-slot') === 'empty')).toBe(true);
    expect(screen.getByText('No scores yet')).toHaveClass(styles.empty);
    expect(screen.queryAllByTestId('board-row')).toHaveLength(0);
  });

  it('the empty text is not shown once there are rows; `slots` changes the count; never fewer than the rows', () => {
    const { rerender } = show(<BoardTable rows={THREE} testId="board" emptyText="No scores yet" slots={5} />);
    expect(screen.queryByText('No scores yet')).toBeNull();
    expect(bodyRows()).toHaveLength(5);
    rerender(<BoardTable rows={THREE} testId="board" slots={2} />);
    expect(bodyRows()).toHaveLength(3);
  });
});

describe('BoardTable: styling hooks', () => {
  it('rank 1 gets the amber role (.first), ranks 1–3 are .podium, highlighted rows the live rule', () => {
    const four = rowsOf([
      ['Omar', 990],
      ['Lina', 950],
      ['Sara', 900],
      ['Adam', 850],
    ]);
    show(<BoardTable rows={four} testId="board" highlightIds={new Set(['p-Lina'])} />);
    const [first, second, third, fourth] = within(board()).getAllByTestId('board-row');
    expect(first).toHaveClass(styles.first, styles.podium);
    expect(first).toHaveAttribute('data-rank', '1');
    expect(second).not.toHaveClass(styles.first);
    expect(second).toHaveClass(styles.podium, styles.highlight);
    expect(second).toHaveAttribute('data-highlight', 'true');
    expect(third).toHaveClass(styles.podium);
    expect(fourth).not.toHaveClass(styles.podium);
    expect(first).not.toHaveAttribute('data-highlight');
    // Cells: rank · name · score, tabular numbers from the table.
    expect(Array.from(first.children).map((c) => c.className)).toEqual([styles.rank, styles.name, styles.score]);
  });

  it('column heads are visually hidden (still in the table for screen readers)', () => {
    show(<BoardTable rows={THREE} testId="board" />);
    const heads = within(board()).getAllByRole('columnheader');
    expect(heads.map((h) => h.textContent)).toEqual(['#', 'Player', 'Score']);
    for (const h of heads) expect(h.querySelector('.visually-hidden')).not.toBeNull();
  });
});

describe('BoardTable: `columns` API (H4 round scores)', () => {
  const rounds: BoardColumn[] = [
    {
      key: 'stop_the_clock',
      head: 'Stop the Clock',
      value: (r) => (
        <span data-testid="board-round-score" data-game="stop_the_clock">
          {r.value - 100}
        </span>
      ),
    },
    { key: 'simon', head: 'Simon', value: () => '–', className: 'custom' },
  ];

  it('renders the extra columns between the name and the total, with visible heads and a Total head', () => {
    show(<BoardTable rows={THREE} testId="board" columns={rounds} />);
    const heads = within(board()).getAllByRole('columnheader');
    expect(heads.map((h) => h.textContent)).toEqual(['#', 'Player', 'Stop the Clock', 'Simon', 'Total']);
    expect(heads[2]).toHaveClass(styles.extra);
    expect(heads[2].querySelector('.visually-hidden')).toBeNull();
    expect(heads[4].querySelector('.visually-hidden')).toBeNull();
    const first = within(board()).getAllByTestId('board-row')[0];
    const cells = Array.from(first.children);
    expect(cells).toHaveLength(5);
    expect(cells[2]).toHaveClass(styles.extra);
    expect(cells[2]).toHaveAttribute('data-column', 'stop_the_clock');
    expect(within(cells[2] as HTMLElement).getByTestId('board-round-score')).toHaveTextContent('840');
    expect(cells[3]).toHaveClass(styles.extra, 'custom');
    expect(cells[3]).toHaveTextContent('–');
    expect(cells[4]).toHaveAttribute('data-testid', 'board-score');
    // Empty slots span every column.
    const slot = bodyRows().find((r) => r.getAttribute('data-slot') === 'empty') as Element;
    expect(slot.querySelector('td')).toHaveAttribute('colspan', '5');
  });
});

describe('BoardTable: rendering and motion', () => {
  it('rendering the same rows array twice renders the board once (memo)', () => {
    const highlight = new Set<string>();
    const { rerender } = show(<BoardTable rows={THREE} testId="board" highlightIds={highlight} />);
    const afterMount = format.calls;
    expect(afterMount).toBeGreaterThan(0);
    rerender(<BoardTable rows={THREE} testId="board" highlightIds={highlight} />);
    expect(format.calls).toBe(afterMount);
    // A new rows array does render.
    rerender(<BoardTable rows={[...THREE]} testId="board" highlightIds={highlight} />);
    expect(format.calls).toBeGreaterThan(afterMount);
  });

  it('rows cascade in on mount (fade + settle, staggered) and never shatter', () => {
    show(<BoardTable rows={THREE} testId="board" />);
    const entries = anim.calls.filter((c) => (c.keyframes[0] as Keyframe).opacity === 0);
    expect(entries.map((c) => (c.el as HTMLElement).getAttribute('data-reveal-key'))).toEqual([
      'p-عبدالرحمن سا',
      'p-Maximilian R',
      'p-Sara',
    ]);
    expect(entries.map((c) => c.options.delay)).toEqual([0, 60, 120]);
    expect(layers()).toHaveLength(0);
  });

  it('countUp: scores count up from 0 with no commit while counting, ending on the formatted value', () => {
    show(<BoardTable rows={rowsOf([['Omar', 2890], ['Lina', 1200]])} testId="board" countUp />);
    const committed = commits;
    const scores = () => within(board()).getAllByTestId('board-score').map((s) => s.textContent);
    expect(scores()).toEqual(['0', '0']);
    advance(600);
    const mid = scores().map((s) => Number(s?.replace(/,/g, '')));
    expect(mid[0]).toBeGreaterThan(0);
    expect(mid[0]).toBeLessThan(2890);
    advance(1200);
    expect(scores()).toEqual(['2,890', '1,200']);
    expect(commits).toBe(committed);
  });

  it('countUp: a reorder (round board → total) counts from the shown value and shows a rank delta', () => {
    const round = rowsOf([
      ['Omar', 900],
      ['Lina', 800],
    ]);
    const { rerender } = show(<BoardTable rows={round} testId="board" countUp />);
    advance(2000);
    const total: RankedRow[] = [
      { ...round[1], value: 1850, rank: 1 },
      { ...round[0], value: 1700, rank: 2 },
    ];
    rerender(<BoardTable rows={total} testId="board" countUp />);
    const [lina, omar] = within(board()).getAllByTestId('board-row');
    expect(within(lina).getByTestId('board-score')).toHaveTextContent('800');
    expect(within(omar).getByTestId('board-score')).toHaveTextContent('900');
    const up = lina.querySelector(`.${styles.delta}`);
    expect(up).toHaveAttribute('data-delta', 'up');
    expect(up).toHaveAttribute('aria-label', '1 place');
    expect(omar.querySelector(`.${styles.delta}`)).toHaveAttribute('data-delta', 'down');
    advance(2000);
    expect(within(lina).getByTestId('board-score')).toHaveTextContent('1,850');
    expect(within(omar).getByTestId('board-score')).toHaveTextContent('1,700');
  });

  it('no count-up without `countUp`: the live board (H2) shows its numbers at once, no deltas', () => {
    const { rerender } = show(<BoardTable rows={THREE} testId="board" />);
    expect(within(board()).getAllByTestId('board-score')[0]).toHaveTextContent('940');
    rerender(<BoardTable rows={[{ ...THREE[1], rank: 1 }, { ...THREE[0], rank: 2 }, THREE[2]]} testId="board" />);
    expect(board().querySelector(`.${styles.delta}`)).toBeNull();
  });

  it('celebrateLeader: a new #1 pulses (no celebrate shatter)', () => {
    const { rerender } = show(<BoardTable rows={THREE} testId="board" celebrateLeader />);
    rerender(
      <BoardTable rows={[{ ...THREE[2], rank: 1 }, { ...THREE[0], rank: 2 }, { ...THREE[1], rank: 3 }]} testId="board" celebrateLeader />,
    );
    const leader = within(board()).getAllByTestId('board-row')[0];
    expect(leader).toHaveClass(styles.pulse);
    expect(layers()).toHaveLength(0);
    advance(500);
    expect(leader).not.toHaveClass(styles.pulse);
  });

  it('reveal={false} (the merge owns the rows): no entry, FLIP, count-up or inline opacity', () => {
    const { rerender } = show(<BoardTable rows={THREE} testId="board" reveal={false} countUp />);
    expect(within(board()).getAllByTestId('board-score')[0]).toHaveTextContent('940');
    rerender(<BoardTable rows={[{ ...THREE[1], rank: 1 }, { ...THREE[0], rank: 2 }]} testId="board" reveal={false} countUp />);
    expect(anim.calls).toHaveLength(0);
    expect(within(board()).getAllByTestId('board-row').every((r) => (r as HTMLElement).style.opacity === '')).toBe(true);
  });

  it('reduced motion: no animation at all, final values at once', () => {
    mockReducedMotion(true);
    const { rerender } = show(<BoardTable rows={THREE} testId="board" countUp celebrateLeader />);
    expect(within(board()).getAllByTestId('board-score').map((s) => s.textContent)).toEqual(['940', '903', '866']);
    rerender(
      <BoardTable rows={[{ ...THREE[2], rank: 1, value: 999 }, { ...THREE[0], rank: 2 }]} testId="board" countUp celebrateLeader />,
    );
    expect(within(board()).getAllByTestId('board-score')[0]).toHaveTextContent('999');
    expect(anim.calls).toHaveLength(0);
    expect(board().querySelector(`.${styles.pulse}`)).toBeNull();
  });
});

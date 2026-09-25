import { describe, expect, it } from 'vitest';
import { HM_REVEAL_LABELLED } from '../config';
import { countPos, howManyStrips, modeOf } from './howManyStrips';
import { labelLanes, type RevealDot } from './reveal';

type Row = Parameters<typeof howManyStrips>[0][number];

const N = [12, 27, 55];

function raw(guesses: (number | null)[], counts: number[] = N): unknown {
  return {
    rounds: counts.map((true_count, i) => ({
      true_count,
      guess: guesses[i],
      answer_ms: guesses[i] === null ? null : 2000,
      timed_out: guesses[i] === null,
    })),
  };
}

function row(i: number, guesses: (number | null)[], counts?: number[]): Row {
  return { playerRowId: `p${i}`, name: `Player ${i}`, displaySuffix: null, raw: raw(guesses, counts) };
}

describe('howManyStrips (games-v3 §5)', () => {
  it('places a guess by its relative error: on the count = 50, ±50 % = the ends, beyond = pinned', () => {
    const rows = [
      row(0, [12, 27, 55]), // on target
      row(1, [18, 27, 55]), // +50 %: the edge, not beyond it
      row(2, [20, 27, 55]), // +67 %: pinned at 100
      row(3, [0, 27, 55]), // −100 %: pinned at 0
    ];
    const [first] = howManyStrips(rows);
    expect(first.count).toBe(12);
    expect(first.dots.map((d) => [d.pos, d.pinned])).toEqual([
      [50, false],
      [100, false],
      [100, true],
      [0, true],
    ]);
    // the three strips share one scale: −20 % → 30, −40 % → 10 whatever the count
    expect(countPos(0.8 * 55, 55)).toBeCloseTo(30);
    expect(countPos(0.6 * 27, 27)).toBeCloseTo(10);
    expect(countPos(1.5 * 12, 12)).toBe(100);
  });

  it('the true count is the most common true_count, so one tampered row cannot move the axis', () => {
    const rows = [
      row(0, [11, 24, 46], [99, 27, 55]), // tampered, and ranked first
      row(1, [10, 22, 42]),
      row(2, [9, 18, 30]),
    ];
    const strips = howManyStrips(rows);
    expect(strips.map((s) => s.count)).toEqual([12, 27, 55]);
    // the tampered row's guess is still drawn, against the shared axis
    expect(strips[0].dots[0].pos).toBeCloseTo(countPos(11, 12));
    expect(modeOf([5, 7, 7, 5])).toBe(5); // a tie goes to the value seen first (the higher row)
    expect(modeOf([])).toBeNull();
  });

  it('null guesses give no dot; the crowd average is the rounded mean of the guesses', () => {
    const rows = [row(0, [12, null, 50]), row(1, [10, null, 42]), row(2, [9, 22, null])];
    const strips = howManyStrips(rows);
    expect(strips.map((s) => s.dots.length)).toEqual([3, 1, 2]);
    expect(strips[0].mean).toBe(Math.round((12 + 10 + 9) / 3)); // 10
    expect(strips[0].meanPos).toBeCloseTo(countPos(10, 12));
    expect(strips[1].mean).toBe(22);
    expect(strips[2].mean).toBe(46);
    const nobody = howManyStrips([row(0, [null, null, null])]);
    expect(nobody.map((s) => [s.count, s.dots.length, s.mean, s.meanPos])).toEqual([
      [12, 0, null, null],
      [27, 0, null, null],
      [55, 0, null, null],
    ]);
  });

  it('labels the top 5 of the round board (in board order) and nobody else', () => {
    const rows = Array.from({ length: 8 }, (_, i) => row(i, [12 - (i % 3), 27, 55]));
    const [first] = howManyStrips(rows);
    expect(HM_REVEAL_LABELLED).toBe(5);
    expect(first.dots.filter((d) => d.label).map((d) => d.label)).toEqual([
      'Player 0',
      'Player 1',
      'Player 2',
      'Player 3',
      'Player 4',
    ]);
    // a labelled row that didn't guess this flash takes no label slot from someone else
    const [, second] = howManyStrips([row(0, [12, null, 55]), ...rows.slice(1)]);
    expect(second.dots.filter((d) => d.label)).toHaveLength(4);
  });

  it('ignores malformed payloads', () => {
    const rows: Row[] = [
      { playerRowId: 'x', name: 'X', displaySuffix: null, raw: null },
      { playerRowId: 'y', name: 'Y', displaySuffix: null, raw: { rounds: 'nope' } },
      { playerRowId: 'z', name: 'Z', displaySuffix: null, raw: { rounds: [{ true_count: 'a', guess: 3 }] } },
    ];
    expect(howManyStrips(rows).map((s) => s.count)).toEqual([null, null, null]);
    expect(howManyStrips([]).every((s) => s.dots.length === 0)).toBe(true);
  });
});

describe('labelLanes (shared by the STC and How Many? reveals)', () => {
  const dot = (id: string, pos: number): RevealDot => ({ playerRowId: id, label: id, pos, pinned: false });

  it('spreads colliding labels over the four lanes and keeps labels near the ends on the track', () => {
    const width = () => 10; // every label 10 % of the track
    const places = labelLanes([dot('a', 50), dot('b', 52), dot('c', 54), dot('d', 56), dot('e', 90), dot('f', 2), dot('g', 99)], width);
    expect(places.get('a')?.lane).not.toBe(places.get('b')?.lane);
    expect(new Set(['a', 'b', 'c', 'd'].map((id) => places.get(id)?.lane)).size).toBe(4);
    expect(places.get('f')?.align).toBe('start');
    expect(places.get('g')?.align).toBe('end');
    expect(places.get('a')?.align).toBe('centre');
  });
});

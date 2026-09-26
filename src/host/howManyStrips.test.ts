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

  it('the true count is the most common true_count, so with ≥ 3 rows one tampered row cannot move the axis', () => {
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

  it('mixed true_counts: the count is the mode', () => {
    const rows = [
      row(0, [11, 24, 46], [13, 27, 55]),
      row(1, [10, 22, 42]),
      row(2, [9, 18, 30], [12, 28, 54]),
      row(3, [12, 25, 50], [14, 28, 55]),
    ];
    // flash 1: 13, 12, 12, 14; flash 2: 27, 27, 28, 28 (a tie: the first seen); flash 3: 55, 55, 54, 55
    expect(howManyStrips(rows).map((s) => s.count)).toEqual([12, 27, 55]);
  });

  it('with 1–2 rows the rule needs ≥ 3 rows: a tie goes to the first (higher-ranked) row (ADR-137 (6))', () => {
    // documented caveat, kept on purpose (cheating is an accepted risk, ADR-021)
    const tie = howManyStrips([row(0, [11, 24, 46], [15, 27, 55]), row(1, [10, 22, 42])]);
    expect(tie[0].count).toBe(15); // the true count is 12, but the top row wins the 1–1 tie
    expect(tie.slice(1).map((s) => s.count)).toEqual([27, 55]);
    expect(howManyStrips([row(0, [11, 24, 46], [15, 30, 60])]).map((s) => s.count)).toEqual([15, 30, 60]);
  });

  it('5 rows where 4 agree and 1 differs: the agreed value, whatever the odd row’s rank', () => {
    for (const odd of [0, 2, 4]) {
      const rows = Array.from({ length: 5 }, (_, i) => row(i, [11, 24, 46], i === odd ? [20, 35, 70] : N));
      expect(howManyStrips(rows).map((s) => s.count)).toEqual(N);
    }
  });

  it('a fixed count (the one already on screen) overrides the mode; null falls back to it', () => {
    const rows = [row(0, [11, 24, 46], [15, 27, 55]), row(1, [10, 22, 42]), row(2, [9, 18, 30], [15, 27, 55])];
    expect(howManyStrips(rows).map((s) => s.count)).toEqual([15, 27, 55]);
    const kept = howManyStrips(rows, undefined, undefined, [12, null]);
    expect(kept.map((s) => s.count)).toEqual([12, 27, 55]);
    expect(kept[0].dots[0].pos).toBeCloseTo(countPos(11, 12));
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

  it('labels the top 4 of the round board (in board order) and nobody else', () => {
    const rows = Array.from({ length: 8 }, (_, i) => row(i, [12 - (i % 3), 27, 55]));
    const [first] = howManyStrips(rows);
    expect(HM_REVEAL_LABELLED).toBe(4);
    expect(first.dots.filter((d) => d.label).map((d) => d.label)).toEqual(['Player 0', 'Player 1', 'Player 2', 'Player 3']);
    // a labelled row that didn't guess this flash takes no label slot from someone else
    const [, second] = howManyStrips([row(0, [12, null, 55]), ...rows.slice(1)]);
    expect(second.dots.filter((d) => d.label)).toHaveLength(3);
  });

  it('ADR-138 small counts: one guess step is a wide step, and exact guesses never stack labels', () => {
    const small = [5, 11, 16];
    // count 5: every unit is 20 % off, so 4 / 6 sit at 30 / 70 and 8 is beyond the window
    const [five] = howManyStrips(
      [3, 4, 6, 7, 8].map((g, i) => row(i, [g, 11, 16], small)),
      0,
    );
    [10, 30, 70, 90, 100].forEach((pos, i) => expect(five.dots[i].pos).toBeCloseTo(pos, 9));
    expect(five.dots.map((d) => d.pinned)).toEqual([false, false, false, false, true]);
    // the whole top of the board typed the exact count: every labelled dot is on the centre line
    const exact = howManyStrips(Array.from({ length: 8 }, (_, i) => row(i, small, small)));
    for (const strip of exact) {
      const labelled = strip.dots.filter((d) => d.label);
      expect(labelled).toHaveLength(HM_REVEAL_LABELLED);
      expect(labelled.every((d) => d.pos === 50)).toBe(true);
      const places = labelLanes(labelled, () => 12);
      expect(new Set(labelled.map((d) => places.get(d.playerRowId)?.lane)).size).toBe(labelled.length);
    }
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

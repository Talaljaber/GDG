import { describe, expect, it } from 'vitest';
import { GESTURE_IDLE, isInEdgeBand, reduceGesture, SS_EDGE_GUARD_PX, SS_SWIPE_PX, type GestureEvent, type GestureStep } from './gesture';

const W = 360;

function run(events: GestureEvent[]): GestureStep[] {
  let state = GESTURE_IDLE;
  return events.map((e) => {
    const step = reduceGesture(state, e);
    state = step.state;
    return step;
  });
}

const down = (x: number, y: number, pointerId = 1): GestureEvent => ({ type: 'down', pointerId, x, y, viewportWidth: W });
const move = (x: number, y: number, pointerId = 1): GestureEvent => ({ type: 'move', pointerId, x, y });

describe('reduceGesture (SS-T9)', () => {
  it('uses the documented thresholds', () => {
    expect(SS_SWIPE_PX).toBe(40);
    expect(SS_EDGE_GUARD_PX).toBe(24);
  });

  it('39 px registers nothing; 40 px right registers "right" once', () => {
    const steps = run([down(180, 300), move(219, 300), move(220, 300), move(260, 300)]);
    expect(steps.map((s) => s.swipe)).toEqual([null, null, 'right', null]);
    expect(steps[1].dx).toBe(39);
    expect(steps[2].state).toBe(GESTURE_IDLE); // consumed: the rest of the drag does nothing
  });

  it('40 px left registers "left"', () => {
    const steps = run([down(180, 300), move(140, 310)]);
    expect(steps[1].swipe).toBe('left');
  });

  it('a mostly vertical drag (dy 50 / dx 30) registers nothing', () => {
    const steps = run([down(180, 300), move(210, 350), move(210, 250)]);
    expect(steps.map((s) => s.swipe)).toEqual([null, null, null]);
  });

  it('a diagonal with |dx| = |dy| registers nothing (|dx| must be greater)', () => {
    expect(run([down(180, 300), move(230, 350)])[1].swipe).toBeNull();
  });

  it('a release or a cancel before 40 px registers nothing and resets the drag', () => {
    for (const end of ['up', 'cancel'] as const) {
      const steps = run([down(180, 300), move(200, 300), { type: end, pointerId: 1 }, move(260, 300)]);
      expect(steps.map((s) => s.swipe)).toEqual([null, null, null, null]);
      expect(steps[2].state).toEqual(GESTURE_IDLE);
    }
  });

  it('only the first pointer counts; a second finger is ignored', () => {
    const steps = run([down(180, 300, 1), down(100, 300, 2), move(40, 300, 2), move(230, 300, 1)]);
    expect(steps[1].state.pointerId).toBe(1);
    expect(steps.map((s) => s.swipe)).toEqual([null, null, null, 'right']);
  });

  it('a touch starting in the 24 px edge band never starts a drag', () => {
    for (const x of [0, 10, 23.5, W - 23.5, W - 1]) {
      const steps = run([down(x, 300), move(x < W / 2 ? x + 100 : x - 100, 300)]);
      expect(steps[0].state).toBe(GESTURE_IDLE);
      expect(steps[1].swipe).toBeNull();
    }
    // Just inside the surface: a normal drag.
    expect(run([down(24, 300), move(80, 300)])[1].swipe).toBe('right');
    expect(run([down(W - 24, 300), move(W - 80, 300)])[1].swipe).toBe('left');
  });

  it('isInEdgeBand', () => {
    expect(isInEdgeBand(23.9, W)).toBe(true);
    expect(isInEdgeBand(24, W)).toBe(false);
    expect(isInEdgeBand(W - 24, W)).toBe(false);
    expect(isInEdgeBand(W - 23.9, W)).toBe(true);
  });
});

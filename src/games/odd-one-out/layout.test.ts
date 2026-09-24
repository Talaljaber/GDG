import { describe, expect, it } from 'vitest';
import { computeGridLayout, TOUCH_TARGET_FLOOR_PX } from './layout';

describe('computeGridLayout (docs/games/odd-one-out.md §2)', () => {
  it('OOO-T6: 6x6 grid on a 360px viewport keeps tiles >= 44px', () => {
    const { side, gap, tileSize } = computeGridLayout(360, 6);
    expect(side).toBe(328); // 360 - 2*16
    expect(gap).toBe(6);
    expect(tileSize).toBeCloseTo((328 - 6 * 5) / 6, 5);
    expect(tileSize).toBeGreaterThanOrEqual(TOUCH_TARGET_FLOOR_PX);
  });

  it('falls back to a 4px gap under 340px so 6x6 tiles stay >= 44px', () => {
    const { gap, tileSize } = computeGridLayout(320, 6);
    expect(gap).toBe(4);
    expect(tileSize).toBeGreaterThanOrEqual(TOUCH_TARGET_FLOOR_PX);
  });

  it('uses the normal 8px gap for 4x4 and 5x5 grids regardless of width', () => {
    expect(computeGridLayout(320, 4).gap).toBe(8);
    expect(computeGridLayout(320, 5).gap).toBe(8);
    expect(computeGridLayout(600, 4).gap).toBe(8);
  });

  it('caps the grid side at 480px on wide viewports', () => {
    const { side } = computeGridLayout(1200, 4);
    expect(side).toBe(480);
  });

  it('side is viewport width minus the 32px gutter below the 480px cap', () => {
    const { side } = computeGridLayout(400, 5);
    expect(side).toBe(368);
  });
});

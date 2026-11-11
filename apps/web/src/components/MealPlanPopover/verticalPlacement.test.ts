import { describe, expect, it } from 'vitest';
import { placeVertically } from './verticalPlacement';

const base = {
  columnTop: 300,
  columnBottom: 340,
  height: 200,
  gap: 10,
  topLimit: 8,
  bottomLimit: 700,
};

describe('placeVertically', () => {
  it('sits below the column when it fits above the Dock zone', () => {
    expect(placeVertically(base)).toEqual({ top: 350, placement: 'below' });
  });

  it('flips above the column when below would reach the Dock zone', () => {
    expect(placeVertically({ ...base, columnBottom: 560 })).toEqual({
      top: 90,
      placement: 'above',
    });
  });

  it('keeps the popover under the top inset when it has to be squeezed in', () => {
    // Above would start at 60 - 10 - 200 < 0: pinned to the limit, not to the screen top.
    const result = placeVertically({
      ...base,
      columnTop: 60,
      columnBottom: 600,
      topLimit: 67,
    });
    expect(result.top).toBe(500);
    const tall = placeVertically({
      ...base,
      columnTop: 60,
      columnBottom: 600,
      height: 700,
      topLimit: 67,
    });
    expect(tall.top).toBe(67);
  });

  it('does not flip above into the status bar', () => {
    const result = placeVertically({
      ...base,
      columnTop: 270,
      columnBottom: 600,
      topLimit: 67,
    });
    // above would be 60, under a 67px limit: not allowed.
    expect(result.top).toBe(500);
  });
});

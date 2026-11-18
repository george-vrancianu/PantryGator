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

  it('squeezes against the Dock zone when neither side has room', () => {
    expect(
      placeVertically({ ...base, columnTop: 60, columnBottom: 600 }),
    ).toEqual({ top: 500, placement: 'below' });
  });

  it('does not flip above into the status bar (above would be 60, limit 67)', () => {
    expect(
      placeVertically({
        ...base,
        columnTop: 270,
        columnBottom: 600,
        topLimit: 67,
      }),
    ).toEqual({ top: 500, placement: 'below' });
  });

  it('never goes above the top limit when taller than the room', () => {
    expect(
      placeVertically({
        ...base,
        columnTop: 60,
        columnBottom: 600,
        height: 700,
        topLimit: 67,
      }),
    ).toEqual({ top: 67, placement: 'below' });
  });
});

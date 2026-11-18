import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PLACEMENT,
  loadPlacement,
  moveToEdge,
  PLACEMENT_KEY,
  savePlacement,
  snapPlacement,
} from './bubblePlacement';

const bounds = { top: 100, bottom: 700 };
const viewport = { width: 400 };

describe('snapPlacement', () => {
  it('snaps to the nearer side edge', () => {
    expect(
      snapPlacement({ centreX: 120, top: 400 }, viewport, bounds).side,
    ).toBe('left');
    expect(
      snapPlacement({ centreX: 280, top: 400 }, viewport, bounds).side,
    ).toBe('right');
  });

  it('keeps the height it was dropped at, as a lift above the lowest spot', () => {
    // Bottom of the bubble at 400 + 56 = 456, the lowest spot is 700.
    expect(
      snapPlacement({ centreX: 280, top: 400 }, viewport, bounds).lift,
    ).toBe(244);
  });

  it('clamps below the header and above the Dock', () => {
    expect(
      snapPlacement({ centreX: 280, top: 10 }, viewport, bounds).lift,
    ).toBe(700 - (100 + 56));
    expect(
      snapPlacement({ centreX: 280, top: 900 }, viewport, bounds).lift,
    ).toBe(0);
  });
});

describe('moveToEdge', () => {
  it('changes the side and keeps the height', () => {
    expect(moveToEdge({ side: 'right', lift: 30 }, 'left')).toEqual({
      side: 'left',
      lift: 30,
    });
  });
});

describe('storage', () => {
  const store = () => {
    const map = new Map<string, string>();
    return {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
    };
  };

  it('remembers a saved place', () => {
    const s = store();
    savePlacement(s, { side: 'left', lift: 120 });
    expect(loadPlacement(s)).toEqual({ side: 'left', lift: 120 });
  });

  it('falls back to the default for nothing, junk or a bad shape', () => {
    const s = store();
    expect(loadPlacement(s)).toEqual(DEFAULT_PLACEMENT);
    s.setItem(PLACEMENT_KEY, 'not json');
    expect(loadPlacement(s)).toEqual(DEFAULT_PLACEMENT);
    s.setItem(PLACEMENT_KEY, JSON.stringify({ side: 'top', lift: 1 }));
    expect(loadPlacement(s)).toEqual(DEFAULT_PLACEMENT);
    s.setItem(PLACEMENT_KEY, JSON.stringify({ side: 'left', lift: -5 }));
    expect(loadPlacement(s)).toEqual(DEFAULT_PLACEMENT);
  });

  it('survives a store that throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(loadPlacement(broken)).toEqual(DEFAULT_PLACEMENT);
    expect(() => savePlacement(broken, DEFAULT_PLACEMENT)).not.toThrow();
  });
});

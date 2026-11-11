import { afterEach, describe, expect, it, vi } from 'vitest';
import { dockBottomPx, readSafeInsets } from './insets';

function stubInsets(
  paddingTop: string,
  paddingBottom: string,
  paddingLeft = '0px',
  paddingRight = '0px',
) {
  vi.spyOn(window, 'getComputedStyle').mockReturnValue({
    paddingTop,
    paddingBottom,
    paddingLeft,
    paddingRight,
  } as CSSStyleDeclaration);
}

describe('readSafeInsets', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reads the four insets the probe resolves to', () => {
    stubInsets('59px', '34px', '47px', '48px');
    expect(readSafeInsets()).toEqual({
      top: 59,
      right: 48,
      bottom: 34,
      left: 47,
    });
  });

  it('is 0 where env() is unknown, and leaves no probe behind', () => {
    expect(readSafeInsets()).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
    expect(document.body.children).toHaveLength(0);
  });
});

describe('dockBottomPx', () => {
  afterEach(() => vi.restoreAllMocks());

  it('is 28 with no inset, and the inset when it is larger (Face ID)', () => {
    expect(dockBottomPx()).toBe(28);
    expect(dockBottomPx({ bottom: 34 })).toBe(34);
    stubInsets('0px', '34px');
    expect(dockBottomPx()).toBe(34);
    stubInsets('0px', '20px');
    expect(dockBottomPx()).toBe(28);
  });
});

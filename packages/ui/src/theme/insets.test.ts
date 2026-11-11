import { afterEach, describe, expect, it, vi } from 'vitest';
import { dockBottomPx, readSafeInsets } from './insets';

function stubInsets(paddingTop: string, paddingBottom: string) {
  vi.spyOn(window, 'getComputedStyle').mockReturnValue({
    paddingTop,
    paddingBottom,
  } as CSSStyleDeclaration);
}

describe('readSafeInsets', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reads the top and bottom insets the probe resolves to', () => {
    stubInsets('59px', '34px');
    expect(readSafeInsets()).toEqual({ top: 59, bottom: 34 });
  });

  it('is 0 where env() is unknown, and leaves no probe behind', () => {
    expect(readSafeInsets()).toEqual({ top: 0, bottom: 0 });
    expect(document.body.children).toHaveLength(0);
  });
});

describe('dockBottomPx', () => {
  afterEach(() => vi.restoreAllMocks());

  it('is 28 with no inset, and the inset when it is larger (Face ID)', () => {
    expect(dockBottomPx()).toBe(28);
    stubInsets('0px', '34px');
    expect(dockBottomPx()).toBe(34);
    stubInsets('0px', '20px');
    expect(dockBottomPx()).toBe(28);
  });
});

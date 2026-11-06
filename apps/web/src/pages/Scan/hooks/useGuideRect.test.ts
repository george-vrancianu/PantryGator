import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stubScreen } from '../../../test/screen';
import { readCameraOrientation } from '../../../lib/cameraOrientation';
import { guideRect, RAIL_WIDTH } from '../../../lib/scanGuides';
import { feedSize, measureView, useGuideRect } from './useGuideRect';

const measureFeed = (feed: HTMLElement) =>
  measureView(feedSize(feed), readCameraOrientation(), window.innerWidth);
const measureWindow = () =>
  measureView(feedSize(), readCameraOrientation(), window.innerWidth);

/** An element that reports this client size (jsdom has no layout). */
function feedOf(width: number, height: number) {
  const feed = document.createElement('div');
  Object.defineProperty(feed, 'clientWidth', {
    value: width,
    configurable: true,
  });
  Object.defineProperty(feed, 'clientHeight', {
    value: height,
    configurable: true,
  });
  return feed;
}

describe('measureView', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('is a phone on a phone screen', () => {
    stubScreen({ width: 390, height: 844 });
    expect(measureWindow().deviceClass).toBe('phone');
  });

  it('is a tablet on a tablet, even when the window is narrow', () => {
    stubScreen({
      width: 820,
      height: 1180,
      viewport: { width: 500, height: 900 },
    });
    expect(measureWindow().deviceClass).toBe('tablet');
  });

  it('is a tablet in a desktop window', () => {
    stubScreen({
      width: 1920,
      height: 1080,
      viewport: { width: 1440, height: 900 },
    });
    expect(measureWindow().deviceClass).toBe('tablet');
  });
});

describe('measuring from the feed', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('takes the feed element size, not the window', () => {
    stubScreen({ width: 1180, height: 820 });
    const feed = document.createElement('div');
    Object.defineProperty(feed, 'clientWidth', { value: 1000 });
    Object.defineProperty(feed, 'clientHeight', { value: 820 });
    expect(feedSize(feed)).toEqual({ width: 1000, height: 820 });
    const view = measureFeed(feed);
    expect(view).toMatchObject({ width: 1000, height: 820 });
  });

  it('falls back to the window without a feed', () => {
    stubScreen({ width: 390, height: 844 });
    expect(feedSize(null)).toEqual({ width: 390, height: 844 });
  });

  it('swaps the feed size at 90 degrees', () => {
    stubScreen({
      width: 390,
      height: 844,
      viewport: { width: 844, height: 390 },
      angle: 90,
    });
    const view = measureWindow();
    expect(view).toMatchObject({ width: 390, height: 844 });
  });
});

describe('the rail and a feed that stops short of it', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  const TABLET = { width: 820, height: 1180 };
  const LANDSCAPE = { width: 1180, height: 820 };

  it('takes the whole rail off a feed that runs under it', () => {
    stubScreen({ ...TABLET, viewport: LANDSCAPE });
    const view = measureFeed(feedOf(1180, 820));
    expect(view.railOverlap).toBe(RAIL_WIDTH);
  });

  it('takes none of it off a feed that ends where the rail begins', () => {
    stubScreen({ ...TABLET, viewport: LANDSCAPE });
    const view = measureFeed(feedOf(1180 - RAIL_WIDTH, 820));
    expect(view.railOverlap).toBe(0);
    // The guide is centred in the feed, as it is in the feed that runs under the rail.
    const under = guideRect('product', measureFeed(feedOf(1180, 820)));
    const beside = guideRect('product', view);
    expect(beside.x + beside.width / 2).toBeCloseTo(under.x + under.width / 2);
    expect(beside.width).toBeCloseTo(under.width);
  });

  it('takes off only the part of the rail over a feed that ends partway', () => {
    stubScreen({ ...TABLET, viewport: LANDSCAPE });
    expect(measureFeed(feedOf(1180 - 100, 820)).railOverlap).toBe(
      RAIL_WIDTH - 100,
    );
  });

  it('has no rail overlap in the footer layout', () => {
    stubScreen({ ...TABLET });
    expect(measureFeed(feedOf(820, 1180)).railOverlap).toBeUndefined();
  });
});

describe('useGuideRect following the feed', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('measures again when the feed resizes on its own', () => {
    stubScreen({ width: 390, height: 844 });
    let notify: () => void = () => {};
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          notify = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
    const feed = feedOf(390, 844);
    const { result } = renderHook(() => useGuideRect('product', feed));
    const before = result.current.width;
    Object.defineProperty(feed, 'clientWidth', { value: 300 });
    act(() => notify());
    expect(result.current.width).toBeLessThan(before);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { stubScreen } from '../../../test/screen';
import { readCameraOrientation } from '../../../lib/cameraOrientation';
import { feedSize, measureView } from './useGuideRect';

const measure = () => measureView(feedSize(), readCameraOrientation());

describe('measureView', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('is a phone on a phone screen', () => {
    stubScreen({ width: 390, height: 844 });
    expect(measure().deviceClass).toBe('phone');
  });

  it('is a tablet on a tablet, even when the window is narrow', () => {
    stubScreen({
      width: 820,
      height: 1180,
      viewport: { width: 500, height: 900 },
    });
    expect(measure().deviceClass).toBe('tablet');
  });

  it('is a tablet in a desktop window', () => {
    stubScreen({
      width: 1920,
      height: 1080,
      viewport: { width: 1440, height: 900 },
    });
    expect(measure().deviceClass).toBe('tablet');
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
    const view = measureView(feedSize(feed), readCameraOrientation());
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
    const view = measureView(feedSize(), readCameraOrientation());
    expect(view).toMatchObject({ width: 390, height: 844 });
  });
});

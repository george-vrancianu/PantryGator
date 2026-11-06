import { afterEach, describe, expect, it, vi } from 'vitest';
import { stubScreen } from '../../../test/screen';
import { measureView } from './useGuideRect';

describe('measureView', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('is a phone on a phone screen', () => {
    stubScreen({ width: 390, height: 844 });
    expect(measureView().deviceClass).toBe('phone');
  });

  it('is a tablet on a tablet, even when the window is narrow', () => {
    stubScreen({
      width: 820,
      height: 1180,
      viewport: { width: 500, height: 900 },
    });
    expect(measureView().deviceClass).toBe('tablet');
  });

  it('is a tablet in a desktop window', () => {
    stubScreen({
      width: 1920,
      height: 1080,
      viewport: { width: 1440, height: 900 },
    });
    expect(measureView().deviceClass).toBe('tablet');
  });
});

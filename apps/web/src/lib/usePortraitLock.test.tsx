import { ScreenOrientation } from '@capacitor/screen-orientation';
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { stubScreen } from '../test/screen';
import { usePortraitLock } from './usePortraitLock';

vi.mock('@capacitor/screen-orientation', () => ({
  ScreenOrientation: {
    lock: vi.fn(() => Promise.resolve()),
    unlock: vi.fn(() => Promise.resolve()),
  },
}));

const PHONE = { width: 390, height: 844 };
const TABLET = { width: 820, height: 1180 };

function Camera() {
  usePortraitLock();
  return null;
}

describe('usePortraitLock', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('locks to portrait on a phone in the app, and unlocks on unmount', () => {
    stubScreen({ ...PHONE, native: true });
    const { unmount } = render(<Camera />);
    expect(ScreenOrientation.lock).toHaveBeenCalledExactlyOnceWith({
      orientation: 'portrait',
    });
    expect(ScreenOrientation.unlock).not.toHaveBeenCalled();
    unmount();
    expect(ScreenOrientation.unlock).toHaveBeenCalledOnce();
  });

  it('never locks a tablet in the app', () => {
    stubScreen({ ...TABLET, native: true });
    render(<Camera />).unmount();
    expect(ScreenOrientation.lock).not.toHaveBeenCalled();
    expect(ScreenOrientation.unlock).not.toHaveBeenCalled();
  });

  it.each([
    ['phone', PHONE],
    ['tablet', TABLET],
  ])('never calls the plugin on the web, on a %s', (_name, size) => {
    stubScreen({ ...size, native: false });
    render(<Camera />).unmount();
    expect(ScreenOrientation.lock).not.toHaveBeenCalled();
    expect(ScreenOrientation.unlock).not.toHaveBeenCalled();
  });

  it('handles a refused lock and unlock instead of leaving a rejection unhandled', () => {
    const refused = () => {
      const rejection = Promise.reject(new Error('refused'));
      const handled = vi.spyOn(rejection, 'catch');
      return { rejection, handled };
    };
    const lock = refused();
    const unlock = refused();
    vi.mocked(ScreenOrientation.lock).mockReturnValueOnce(lock.rejection);
    vi.mocked(ScreenOrientation.unlock).mockReturnValueOnce(unlock.rejection);
    stubScreen({ ...PHONE, native: true });
    render(<Camera />).unmount();
    expect(lock.handled).toHaveBeenCalledOnce();
    expect(unlock.handled).toHaveBeenCalledOnce();
  });
});

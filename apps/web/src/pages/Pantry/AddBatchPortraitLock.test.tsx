import { ScreenOrientation } from '@capacitor/screen-orientation';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openOverlay, stubPantry } from '../../test/addBatch';
import { stubScreen } from '../../test/screen';

// The add-Batch camera locks to portrait on a phone in the app (ADR 0037) and unlocks on every exit.
vi.mock('../../lib/camera', async () =>
  (await import('../../test/scan')).fakeCameraModule(),
);
vi.mock('../../lib/image', () => ({
  resizeImage: () => Promise.resolve('data:image/jpeg;base64,AAAA'),
}));
vi.mock('@capacitor/screen-orientation', () => ({
  ScreenOrientation: {
    lock: vi.fn(() => Promise.resolve()),
    unlock: vi.fn(() => Promise.resolve()),
  },
}));

const PHONE = { width: 390, height: 844 };
const TABLET = { width: 820, height: 1180 };
const overlay = () => screen.queryByTestId('camera-overlay');
const closeCamera = () =>
  within(screen.getByTestId('scan-top-bar')).getByRole('button', {
    name: 'Close scanner',
  });

describe('The add-Batch camera portrait lock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('locks to portrait on a phone in the app when it opens', async () => {
    stubScreen({ ...PHONE, native: true });
    stubPantry();
    await openOverlay('product');
    expect(overlay()).toBeInTheDocument();
    expect(ScreenOrientation.lock).toHaveBeenCalledExactlyOnceWith({
      orientation: 'portrait',
    });
    expect(ScreenOrientation.unlock).not.toHaveBeenCalled();
  });

  it('unlocks on Close', async () => {
    stubScreen({ ...PHONE, native: true });
    stubPantry();
    const user = await openOverlay('product');
    await user.click(closeCamera());
    expect(overlay()).toBeNull();
    expect(ScreenOrientation.unlock).toHaveBeenCalledOnce();
  });

  it('unlocks on Escape', async () => {
    stubScreen({ ...PHONE, native: true });
    stubPantry();
    const user = await openOverlay('product');
    await user.keyboard('{Escape}');
    expect(overlay()).toBeNull();
    expect(ScreenOrientation.unlock).toHaveBeenCalledOnce();
  });

  it('unlocks on a result', async () => {
    stubScreen({ ...PHONE, native: true });
    stubPantry({
      'POST /api/scan/product': () =>
        Response.json({
          lines: [
            {
              name: 'Zorblax',
              sourceText: null,
              match: null,
              lowConfidence: false,
              quantity: null,
              unit: null,
              expiryDate: null,
              productDescription: null,
            },
          ],
        }),
    });
    await openOverlay('product');
    fireEvent.click(screen.getByRole('button', { name: 'Take photo' }));
    await waitFor(() => expect(overlay()).toBeNull());
    expect(ScreenOrientation.unlock).toHaveBeenCalledOnce();
  });

  it('unlocks on Scan several', async () => {
    stubScreen({ ...PHONE, native: true });
    stubPantry();
    const user = await openOverlay('product');
    await user.click(screen.getByRole('button', { name: 'Scan several' }));
    await waitFor(() => expect(overlay()).toBeNull());
    expect(ScreenOrientation.unlock).toHaveBeenCalledOnce();
  });

  it('never locks a tablet in the app', async () => {
    stubScreen({ ...TABLET, native: true });
    stubPantry();
    const user = await openOverlay('product');
    await user.click(closeCamera());
    expect(ScreenOrientation.lock).not.toHaveBeenCalled();
    expect(ScreenOrientation.unlock).not.toHaveBeenCalled();
  });

  it.each([
    ['phone', PHONE],
    ['tablet', TABLET],
  ])('never calls the plugin on the web, on a %s', async (_kind, size) => {
    stubScreen({ ...size, native: false });
    stubPantry();
    const user = await openOverlay('product');
    await user.click(closeCamera());
    expect(ScreenOrientation.lock).not.toHaveBeenCalled();
    expect(ScreenOrientation.unlock).not.toHaveBeenCalled();
  });
});

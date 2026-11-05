import { act, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IMAGE_PREPARATION } from '../../lib/scanImage';
import { openOverlay, stubPantry } from '../../test/addBatch';
import { emitBarcode, fakeCamera, shutter } from '../../test/scan';
import { stubScreen } from '../../test/screen';

// The add-Batch camera rotates its chrome back on a phone on the web, as the other two cameras do
// (ADR 0037); the Scan page and the Intro camera are covered in pages/Scan/CameraRotateBack.test.tsx.
vi.mock('../../lib/camera', async () =>
  (await import('../../test/scan')).fakeCameraModule(),
);
vi.mock('../../lib/scanImage', () => ({
  IMAGE_PREPARATION: {
    product: vi.fn(() => Promise.resolve('data:image/jpeg;base64,AAAA')),
    receipt: vi.fn(),
    plate: vi.fn(),
    ingredients: vi.fn(),
  },
}));
vi.mock('@capacitor/screen-orientation', () => ({
  ScreenOrientation: {
    lock: vi.fn(() => Promise.resolve()),
    unlock: vi.fn(() => Promise.resolve()),
  },
}));

const PHONE = { width: 390, height: 844 };
const TABLET = { width: 820, height: 1180 };
const frame = () => screen.getByTestId('camera-frame');

describe('The add-Batch camera rotates back', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(IMAGE_PREPARATION.product).mockClear();
    stubPantry();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('is upright at angle 0', async () => {
    stubScreen({ ...PHONE });
    await openOverlay('product');
    expect(frame().style.transform).toBe('');
  });

  it('turns the chrome back at 90, 180 and 270, with the video outside the turned box', async () => {
    const s = stubScreen({ ...PHONE });
    await openOverlay('product');
    act(() => s.rotate(90));
    expect(frame().style.transform).toContain('rotate(-90deg)');
    expect(frame()).toContainElement(screen.getByTestId('scan-top-bar'));
    expect(frame()).toContainElement(screen.getByTestId('scan-footer'));
    expect(frame()).toContainElement(screen.getByTestId('scan-guide'));
    expect(frame()).not.toContainElement(
      screen.getByTestId('camera-overlay').querySelector('video'),
    );
    act(() => s.setAngle(180));
    expect(frame().style.transform).toBe('rotate(-180deg)');
    act(() => s.rotate(270));
    expect(frame().style.transform).toContain('rotate(-270deg)');
    act(() => s.rotate(0));
    expect(frame().style.transform).toBe('');
  });

  it('holds the barcode result card inside the turned box', async () => {
    stubPantry({
      'GET /api/barcode-lookup/5941234567899': () =>
        Response.json({ found: false }),
    });
    const s = stubScreen({ ...PHONE });
    await openOverlay('barcode');
    act(() => s.rotate(90));
    await waitFor(() => expect(fakeCamera.emit).not.toBeNull());
    act(() => emitBarcode('5941234567899'));
    expect(frame()).toContainElement(await screen.findByTestId('barcode-card'));
  });

  it('is never rotated back in the app', async () => {
    const s = stubScreen({ ...PHONE, native: true });
    await openOverlay('product');
    act(() => s.rotate(90));
    expect(frame().style.transform).toBe('');
  });

  it('never rotates a tablet', async () => {
    const s = stubScreen({ ...TABLET });
    await openOverlay('product');
    act(() => s.rotate(90));
    expect(frame().style.transform).toBe('');
  });

  it('turns the photo by the angle at the shutter, in the portrait frame', async () => {
    const s = stubScreen({ ...PHONE });
    await openOverlay('product');
    act(() => s.rotate(270));
    await waitFor(() => expect(shutter()).not.toHaveAttribute('aria-disabled'));
    act(() => shutter().click());
    await waitFor(() =>
      expect(IMAGE_PREPARATION.product).toHaveBeenCalledOnce(),
    );
    expect(IMAGE_PREPARATION.product).toHaveBeenCalledWith(
      expect.any(Blob),
      'camera',
      expect.objectContaining({ width: 390, height: 844 }),
      270,
    );
  });
});

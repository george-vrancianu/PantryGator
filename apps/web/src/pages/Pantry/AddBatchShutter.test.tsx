import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openOverlay, stubPantry } from '@/test/addBatch';
import {
  advance,
  fakeCamera,
  flush,
  lift,
  press,
  queryLanguageChip,
  shutter,
} from '@/test/scan';

// jsdom has no camera or canvas: the camera hook and image preparation are the seams.
vi.mock('@/lib/camera', async () =>
  (await import('@/test/scan')).fakeCameraModule(),
);
vi.mock('@/lib/image', () => ({
  resizeImage: () => Promise.resolve('data:image/jpeg;base64,AAAA'),
}));

const scans = (calls: ReturnType<typeof stubPantry>) =>
  calls.filter((call) => call.key === 'POST /api/scan/product');

describe('Scanning from the add-Batch camera overlay by the shutter', () => {
  beforeEach(() => {
    localStorage.clear();
    fakeCamera.focusSupported = true;
    Object.defineProperty(navigator, 'vibrate', {
      value: vi.fn(() => true),
      configurable: true,
    });
  });
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'vibrate');
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  /** The overlay opens on real timers; the gestures then run on fake ones. */
  const gesturesOnFakeTimers = () =>
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

  it('has the v3 chrome: the shutter and a slider with Product and Barcode only', async () => {
    stubPantry();
    await openOverlay('product');
    expect(shutter()).toBeInTheDocument();
    expect(
      screen.getAllByRole('radio').map((radio) => radio.textContent),
    ).toEqual(['Product', 'Barcode']);
    expect(screen.queryByRole('button', { name: /^Review/ })).toBeNull();
  });

  it('uses the shared top bar and footer, with an empty stack cell and no Import', async () => {
    stubPantry();
    await openOverlay('product');
    const bar = within(screen.getByTestId('scan-top-bar'));
    expect(bar.getByRole('button', { name: 'Close scanner' })).toBeVisible();
    expect(bar.getByRole('button', { name: /^Torch/ })).toBeVisible();
    expect(bar.getByRole('button', { name: 'Reading as' })).toBeVisible();
    const footer = within(screen.getByTestId('scan-footer'));
    expect(footer.getByRole('button', { name: 'Take photo' })).toBeVisible();
    expect(screen.queryByTestId('photo-stack')).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Import from photos' }),
    ).toBeNull();
  });

  it('hides the Scan Language chip in Barcode', async () => {
    stubPantry();
    await openOverlay('barcode');
    expect(queryLanguageChip()).not.toBeInTheDocument();
  });

  it('a tap on the shutter sends a Scan, with the guide haptic', async () => {
    const calls = stubPantry();
    await openOverlay('product');
    fireEvent.click(shutter());
    await flush();
    expect(scans(calls)).toHaveLength(1);
    expect(navigator.vibrate).toHaveBeenCalledWith(12);
  });

  it('holding the shutter focuses, then sends exactly one Scan on release', async () => {
    const calls = stubPantry();
    await openOverlay('product');
    gesturesOnFakeTimers();
    press();
    await advance(301);
    expect(fakeCamera.focuses).toBe(1);
    expect(navigator.vibrate).toHaveBeenCalledWith(6);
    lift();
    expect(scans(calls)).toHaveLength(0);
    fakeCamera.finishFocus();
    await flush();
    expect(scans(calls)).toHaveLength(1);
    expect(navigator.vibrate).toHaveBeenCalledWith(12);
  });

  it('shows a ring that takes no input in Barcode Lookup', async () => {
    const calls = stubPantry();
    await openOverlay('barcode');
    expect(
      screen.queryByRole('button', { name: 'Take photo' }),
    ).not.toBeInTheDocument();
    const ring = screen.getByTestId('shutter-ring');
    expect(ring).toHaveAttribute('aria-hidden', 'true');
    fireEvent.click(ring);
    await flush();
    expect(fakeCamera.focuses).toBe(0);
    expect(screen.queryByTestId('scan-flash')).toBeNull();
    expect(scans(calls)).toHaveLength(0);
  });
});

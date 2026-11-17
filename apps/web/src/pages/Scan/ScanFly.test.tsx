import { act, screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { stubMatchMedia } from '../../test/viewport';
import { resetScanSession } from '../../lib/scanSession';
import { ScanPage } from './ScanPage';
import { emitBarcode, fakeCamera, stackCount, takeScan } from '../../test/scan';

vi.mock('../../lib/camera', async () =>
  (await import('../../test/scan')).fakeCameraModule(),
);
vi.mock('../../lib/image', async (importActual) => ({
  ...(await importActual<typeof import('../../lib/image')>()),
  // A capped resize is a small thumbnail; the default is the full-size image.
  resizeImage: (_source: Blob, _turn?: number, maxEdge?: number) =>
    Promise.resolve(
      maxEdge
        ? 'data:image/jpeg;base64,c21hbGw='
        : 'data:image/jpeg;base64,YQ==',
    ),
}));

function renderScan(route = '/scan?mode=product') {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise<Response>(() => {})),
  );
  renderWithProviders(
    <Routes>
      <Route path="/scan" element={<ScanPage />} />
    </Routes>,
    { route },
  );
}
const flush = () => act(async () => {});

describe('Capture feedback and the fly to the stack', () => {
  const vibrate = vi.fn(() => true);
  beforeEach(() => {
    localStorage.clear();
    resetScanSession();
    vibrate.mockClear();
    Object.defineProperty(navigator, 'vibrate', {
      value: vibrate,
      configurable: true,
    });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'vibrate');
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('flies the cropped photo to the stack, without delaying the Scan, and removes it after', async () => {
    renderScan();
    takeScan();
    await flush();
    // The Scan is already in the Scan Session while the photo is still flying.
    expect(stackCount()).toBe(1);
    const fly = screen.getByTestId('scan-fly');
    expect(fly).toHaveAttribute('src', 'data:image/jpeg;base64,YQ==');
    expect(screen.getByTestId('scan-flash')).toBeInTheDocument();
    await act(async () => vi.advanceTimersByTime(500));
    expect(screen.queryByTestId('scan-fly')).toBeNull();
    expect(screen.getByTestId('photo-stack')).toBeInTheDocument();
  });

  it('flies the frozen frame of a Barcode card, with no flash', async () => {
    renderScan('/scan?mode=barcode');
    await vi.waitFor(() => expect(fakeCamera.emit).not.toBeNull());
    await act(async () => emitBarcode('4006381333931'));
    await flush();
    expect(stackCount()).toBe(1);
    expect(screen.getByTestId('scan-fly')).toBeInTheDocument();
    expect(screen.queryByTestId('scan-flash')).toBeNull();
  });

  it('flies a full-size frame of a Barcode card but stores a small thumbnail', async () => {
    renderScan('/scan?mode=barcode');
    await vi.waitFor(() => expect(fakeCamera.emit).not.toBeNull());
    await act(async () => emitBarcode('4006381333931'));
    await flush();
    expect(screen.getByTestId('scan-fly')).toHaveAttribute(
      'src',
      'data:image/jpeg;base64,YQ==',
    );
    const layer = screen.getByTestId('stack-layer');
    expect(layer.querySelector('img')).toHaveAttribute(
      'src',
      'data:image/jpeg;base64,c21hbGw=',
    );
  });

  describe('under reduced motion', () => {
    beforeEach(() => {
      stubMatchMedia((query) => query.includes('prefers-reduced-motion'));
    });

    it('renders no flash, guide fill, pulse or fly, but keeps the thicker brackets and the haptic', async () => {
      renderScan();
      takeScan();
      await flush();
      expect(stackCount()).toBe(1);
      expect(screen.queryByTestId('scan-flash')).toBeNull();
      expect(screen.queryByTestId('scan-guide-fill')).toBeNull();
      expect(screen.queryByTestId('scan-fly')).toBeNull();
      expect(screen.getByTestId('scan-guide')).not.toHaveAttribute(
        'data-pulse',
      );
      expect(vibrate).toHaveBeenCalledWith(12);
      // The brackets thicken for the shot all the same.
      expect(screen.getByTestId('scan-guide')).toHaveAttribute(
        'data-thick',
        'true',
      );
    });

    it('does not fly a Barcode card either', async () => {
      renderScan('/scan?mode=barcode');
      await vi.waitFor(() => expect(fakeCamera.emit).not.toBeNull());
      await act(async () => emitBarcode('4006381333931'));
      await flush();
      expect(stackCount()).toBe(1);
      expect(screen.queryByTestId('scan-fly')).toBeNull();
    });
  });
});

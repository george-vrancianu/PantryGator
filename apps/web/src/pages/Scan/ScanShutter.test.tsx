import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FOCUS_PAUSE_MS } from '../../lib/camera';
import { renderWithProviders, stubApi } from '../../test/render';
import { stubScreen } from '../../test/screen';
import { dispatchScanSession, resetScanSession } from '../../lib/scanSession';
import { ScanPage } from './ScanPage';
import {
  advance,
  cancelPress,
  fakeCamera,
  flush,
  lift,
  moveOnShutter,
  press,
  setStatus,
  shutter,
  takeScan,
} from '../../test/scan';

const image = vi.hoisted(() => ({ resize: null as null | Promise<string> }));
vi.mock('../../lib/camera', async () =>
  (await import('../../test/scan')).fakeCameraModule(),
);
vi.mock('../../lib/image', async (importActual) => ({
  ...(await importActual<typeof import('../../lib/image')>()),
  resizeImage: () =>
    image.resize ?? Promise.resolve('data:image/jpeg;base64,YQ=='),
}));

let fetchCalls: ReturnType<typeof stubApi>['calls'];
function renderScan() {
  const { fetchMock, calls } = stubApi({
    'POST /api/scan/product': () => Response.json({ lines: [] }),
  });
  fetchCalls = calls;
  vi.stubGlobal('fetch', fetchMock);
  return renderWithProviders(
    <Routes>
      <Route path="/scan" element={<ScanPage />} />
    </Routes>,
    { route: '/scan?mode=product' },
  );
}
const scans = () =>
  fetchCalls.filter((c) => c.key === 'POST /api/scan/product');

describe('The shutter on the Scan page', () => {
  const vibrate = vi.fn(() => true);
  beforeEach(() => {
    localStorage.clear();
    resetScanSession();
    fakeCamera.focusSupported = true;
    image.resize = null;
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
    vi.restoreAllMocks();
  });

  it('is a button named "Take photo" that a tap sends one Scan from, with the capture feedback', async () => {
    renderScan();
    expect(
      screen.getByRole('button', { name: 'Take photo' }),
    ).toBeInTheDocument();
    takeScan();
    await flush();
    expect(scans()).toHaveLength(1);
    expect(screen.getByTestId('scan-flash')).toBeInTheDocument();
    expect(screen.getByTestId('scan-guide')).toHaveAttribute(
      'data-pulse',
      'true',
    );
    expect(vibrate).toHaveBeenCalledWith(12);
  });

  it('a hold ticks 6 ms, focuses, and sends one Scan only when released', async () => {
    renderScan();
    press();
    await advance(301);
    expect(vibrate).toHaveBeenCalledWith(6);
    expect(fakeCamera.focuses).toBe(1);
    lift();
    await flush();
    expect(scans()).toHaveLength(0);
    fakeCamera.finishFocus();
    await flush();
    expect(scans()).toHaveLength(1);
    expect(vibrate).toHaveBeenCalledWith(12);
    expect(screen.getByTestId('scan-flash')).toBeInTheDocument();
    // The click that follows the release is not a second Scan.
    fireEvent.click(shutter());
    await flush();
    expect(scans()).toHaveLength(1);
  });

  it('a hold on a tablet in landscape aims at the guide, centred left of the rail, not at the fixed point', async () => {
    stubScreen({
      width: 820,
      height: 1180,
      viewport: { width: 1180, height: 820 },
    });
    renderScan();
    press();
    await advance(301);
    const [point] = fakeCamera.focusPoints;
    // Clear area: left of the 168 px rail, between the 52 px top bar and the bottom edge.
    expect(point?.x).toBeCloseTo((1180 - 168) / 2 / 1180, 2);
    expect(point?.y).toBeCloseTo((52 + 820) / 2 / 820, 2);
  });

  it('a hold on a phone turned to 90 aims at the guide centre as a fraction of the rotated-back frame', async () => {
    // Window 844 x 390, so the frame is 390 x 844; footer layout, no insets: the clear area runs
    // from the 52 px top bar to 144 px (footer) + 20 px (floor under it) above the bottom edge,
    // and the guide sits 14 px above its middle.
    stubScreen({
      width: 390,
      height: 844,
      angle: 90,
      viewport: { width: 844, height: 390 },
    });
    renderScan();
    press();
    await advance(301);
    const [point] = fakeCamera.focusPoints;
    expect(point?.x).toBeCloseTo(0.5, 2);
    expect(point?.y).toBeCloseTo((52 + (844 - 164 - 52) / 2 - 14) / 844, 2);
  });

  it('where single-shot focus is missing, a hold is the steady pause, then the Scan', async () => {
    fakeCamera.focusSupported = false;
    renderScan();
    press();
    await advance(301);
    expect(fakeCamera.focuses).toBe(1);
    lift();
    await flush();
    expect(scans()).toHaveLength(0);
    await advance(FOCUS_PAUSE_MS);
    await flush();
    expect(scans()).toHaveLength(1);
  });

  it('a press released before 300 ms does not focus', async () => {
    renderScan();
    press();
    await advance(200);
    lift();
    await flush();
    expect(fakeCamera.focuses).toBe(0);
  });

  it('sliding off after the hold started cancels the focus pass and takes no Scan', async () => {
    renderScan();
    press();
    await advance(301);
    moveOnShutter(150, 700);
    moveOnShutter(60, 700);
    lift(60);
    fireEvent.click(shutter());
    fakeCamera.finishFocus();
    await flush();
    expect(fakeCamera.cancels).toBe(1);
    expect(scans()).toHaveLength(0);
    expect(screen.queryByTestId('scan-flash')).toBeNull();
  });

  it('sliding off before the hold starts takes no Scan and starts no focus pass', async () => {
    renderScan();
    press();
    moveOnShutter(120, 700);
    await advance(400);
    lift(120);
    fireEvent.click(shutter());
    await flush();
    expect(fakeCamera.focuses).toBe(0);
    expect(scans()).toHaveLength(0);
  });

  it('a cancelled press (the OS took the touch) cancels the pass and takes no Scan', async () => {
    renderScan();
    press();
    await advance(301);
    cancelPress();
    await flush();
    expect(fakeCamera.cancels).toBe(1);
    expect(scans()).toHaveLength(0);
  });

  it('a press still pending when the shutter turns into the Barcode ring starts no focus pass', async () => {
    renderScan();
    press();
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    await flush();
    expect(screen.getByTestId('shutter-ring')).toBeInTheDocument();
    await advance(400);
    expect(fakeCamera.focuses).toBe(0);
  });

  it('a hold already running when the shutter turns into the ring is cancelled', async () => {
    renderScan();
    press();
    await advance(301);
    expect(fakeCamera.focuses).toBe(1);
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    await flush();
    expect(fakeCamera.cancels).toBe(1);
    expect(scans()).toHaveLength(0);
  });

  describe('when it is disabled', () => {
    it('stays disabled and sends nothing under the Scan Cap, where the cap message already shows', async () => {
      dispatchScanSession({
        type: 'enqueue',
        scan: {
          id: 'held',
          mode: 'product',
          scanLanguage: 'en',
          image: 'data:image/jpeg;base64,YQ==',
          thumbnail: 'data:image/jpeg;base64,YQ==',
        },
      });
      dispatchScanSession({ type: 'fail', id: 'held', reason: 'cap' });
      renderScan();
      expect(shutter()).toHaveAttribute('aria-disabled', 'true');
      expect(screen.getByText('Daily scan limit reached')).toBeInTheDocument();
      takeScan();
      press();
      await advance(500);
      lift();
      fakeCamera.finishFocus();
      await flush();
      expect(fakeCamera.focuses).toBe(0);
      expect(vibrate).not.toHaveBeenCalled();
      expect(screen.queryByTestId('scan-flash')).toBeNull();
      expect(scans()).toHaveLength(0);
    });

    it('sends nothing while a photo is being prepared, and says so', async () => {
      image.resize = new Promise<string>(() => {});
      renderScan();
      takeScan();
      await flush();
      expect(screen.getByText('Reading your photo')).toBeInTheDocument();
      expect(shutter()).toHaveAttribute('aria-disabled', 'true');
      const focusesBefore = fakeCamera.focuses;
      takeScan();
      press();
      await advance(500);
      lift();
      fakeCamera.finishFocus();
      await flush();
      expect(fakeCamera.focuses).toBe(focusesBefore);
      expect(scans()).toHaveLength(0);
    });

    it('sends nothing while the camera is not ready, and says so', async () => {
      renderScan();
      setStatus('unavailable');
      expect(shutter()).toHaveAttribute('aria-disabled', 'true');
      expect(screen.getByText(/camera is not available/)).toBeInTheDocument();
      takeScan();
      await flush();
      expect(scans()).toHaveLength(0);
    });

    it('shows the limit message when pressed at 20 cards', async () => {
      for (let i = 0; i < 20; i += 1) {
        dispatchScanSession({
          type: 'enqueue',
          scan: {
            id: `card-${i}`,
            mode: 'product',
            scanLanguage: 'en',
            image: 'data:image/jpeg;base64,YQ==',
            thumbnail: 'data:image/jpeg;base64,YQ==',
          },
        });
      }
      renderScan();
      expect(shutter()).toHaveAttribute('aria-disabled', 'true');
      expect(screen.queryByText(/20 Scans and Barcode Lookups/)).toBeNull();
      takeScan();
      await flush();
      expect(
        screen.getByText(/20 Scans and Barcode Lookups/),
      ).toBeInTheDocument();
      expect(scans()).toHaveLength(0);
    });
  });
});

describe('The shutter as a plain button', () => {
  beforeEach(() => {
    localStorage.clear();
    resetScanSession();
    image.resize = null;
    // user-event waits on timers between its steps: let the fake clock run on its own.
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('sends a Scan from a real press and release too', async () => {
    renderScan();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(shutter());
    await flush();
    expect(scans()).toHaveLength(1);
    expect(fakeCamera.focuses).toBe(0);
  });

  it('takes a Scan from Enter and from Space', async () => {
    renderScan();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    shutter().focus();
    await user.keyboard('{Enter}');
    await flush();
    expect(scans()).toHaveLength(1);
    await user.keyboard(' ');
    await flush();
    expect(scans()).toHaveLength(2);
  });
});

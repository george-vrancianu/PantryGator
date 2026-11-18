import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetReads } from '@/lib/scanReads';
import {
  dispatchScanSession,
  getScanSession,
  resetScanSession,
} from '@/lib/scanSession';
import { renderWithProviders, stubApi } from '@/test/render';
import { takeScan, fakeCamera } from '@/test/scan';
import { ScanPage } from './ScanPage';

vi.mock('@/lib/camera', async () =>
  (await import('@/test/scan')).fakeCameraModule(),
);
vi.mock('@/lib/image', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/image')>()),
  resizeImage: () => Promise.resolve('data:image/jpeg;base64,YQ=='),
}));

const flush = () => act(async () => {});

function renderScan(route = '/scan?mode=product') {
  const stub = stubApi({});
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) =>
    String(input).includes('/api/scan/')
      ? new Promise<Response>(() => {})
      : stub.fetchMock(input, init),
  );
  return renderWithProviders(
    <Routes>
      <Route path="/scan" element={<ScanPage />} />
      <Route path="/scan/review" element={<Link to="/scan">to camera</Link>} />
      <Route path="/" element={<p>home screen</p>} />
    </Routes>,
    { route },
  );
}

describe('Scan screen, epic review fixes', () => {
  beforeEach(() => {
    resetScanSession();
    resetReads();
    localStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('requests 1080p in every mode, so the mode slider never restarts the stream (#2)', () => {
    for (const mode of ['product', 'ingredients', 'plate']) {
      fakeCamera.calls = [];
      const { unmount } = renderScan(`/scan?mode=${mode}`);
      expect(fakeCamera.calls.length).toBeGreaterThan(0);
      expect(fakeCamera.calls.every((arg) => arg !== false)).toBe(true);
      unmount();
    }
  });

  it('announces a Scan joining the Scan Session (#12b)', async () => {
    renderScan();
    takeScan();
    await flush();
    expect(
      screen
        .getAllByRole('status')
        .some((region) => /Photo 1 added/.test(region.textContent ?? '')),
    ).toBe(true);
  });

  it('goes home, not to an empty overview, after Close discards the Scan Session (#20)', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderScan('/scan/review');
    act(() =>
      dispatchScanSession({
        type: 'enqueue',
        scan: {
          id: 'a',
          mode: 'product',
          scanLanguage: 'en',
          image: 'x',
          thumbnail: 'x',
        },
      }),
    );
    await userEvent.click(screen.getByRole('link', { name: 'to camera' }));
    await userEvent.click(
      screen.getByRole('button', { name: 'Close scanner' }),
    );
    expect(await screen.findByText('home screen')).toBeInTheDocument();
    expect(getScanSession().scans).toEqual([]);
  });

  it('words the limit toast for any Scan Mode, not just the pantry (#18)', async () => {
    renderScan();
    for (let i = 0; i < 21; i += 1) {
      takeScan();
      await flush();
    }
    expect(
      await screen.findByText(/Add or discard these first/),
    ).toBeInTheDocument();
  });
});

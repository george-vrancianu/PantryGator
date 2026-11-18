import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetReads } from '@/lib/scanReads';
import { getScanSession, resetScanSession } from '@/lib/scanSession';
import { renderWithProviders, stubApi } from '@/test/render';
import { scanOnce } from '@/test/scan';
import { ScanPage } from './ScanPage';

vi.mock('@/lib/camera', async () =>
  (await import('@/test/scan')).fakeCameraModule(),
);
vi.mock('@/lib/image', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/image')>()),
  resizeImage: () => Promise.resolve('data:image/jpeg;base64,YQ=='),
}));

function renderScan() {
  // Reads never answer, so the Scans stay in the Scan Session.
  const stub = stubApi({});
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) =>
    String(input).includes('/api/scan/')
      ? new Promise<Response>(() => {})
      : stub.fetchMock(input, init),
  );
  return renderWithProviders(
    <Routes>
      <Route path="/scan" element={<ScanPage />} />
      <Route path="/scan/review" element={<p>overview</p>} />
      <Route path="/" element={<p>home screen</p>} />
    </Routes>,
    { route: { pathname: '/scan', search: '?mode=product' } },
  );
}

describe('Scan Session limits', () => {
  beforeEach(() => {
    resetScanSession();
    resetReads();
    localStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('refuses the 21st Scan with a toast and adds no card', async () => {
    renderScan();
    for (let i = 0; i < 20; i += 1) await scanOnce();
    expect(getScanSession().scans).toHaveLength(20);
    expect(
      screen.queryByText(/20 Scans and Barcode Lookups/),
    ).not.toBeInTheDocument();
    await scanOnce();
    expect(getScanSession().scans).toHaveLength(20);
    expect(screen.getByTestId('stack-badge')).toHaveTextContent('20');
    const toast = await screen.findByText(/20 Scans and Barcode Lookups/);
    expect((toast.closest('.MuiAlert-root') as HTMLElement).className).toMatch(
      /MuiAlert-\w*Warning/,
    );
  });

  it('takes Scans again once a Scan has left the Scan Session', async () => {
    renderScan();
    for (let i = 0; i < 20; i += 1) await scanOnce();
    await scanOnce();
    expect(getScanSession().scans).toHaveLength(20);
    const { dispatchScanSession } = await import('@/lib/scanSession');
    act(() =>
      dispatchScanSession({
        type: 'remove',
        id: getScanSession().scans[0].id,
      }),
    );
    await scanOnce();
    expect(getScanSession().scans).toHaveLength(20);
  });

  describe('Close with Scans present', () => {
    it('asks "Discard N photos?" and stays when the Member declines', async () => {
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
      renderScan();
      await scanOnce();
      await scanOnce();
      await userEvent.click(
        screen.getByRole('button', { name: 'Close scanner' }),
      );
      expect(confirm).toHaveBeenCalledWith('Discard 2 photos?');
      expect(screen.getByTestId('scan-guide')).toBeInTheDocument();
      expect(getScanSession().scans).toHaveLength(2);
    });

    it('discards the Scan Session and leaves when the Member agrees', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      renderScan();
      await scanOnce();
      await userEvent.click(
        screen.getByRole('button', { name: 'Close scanner' }),
      );
      expect(await screen.findByText('home screen')).toBeInTheDocument();
      expect(getScanSession().scans).toEqual([]);
    });

    it('does not ask when there are no Scans', async () => {
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
      renderScan();
      await userEvent.click(
        screen.getByRole('button', { name: 'Close scanner' }),
      );
      expect(confirm).not.toHaveBeenCalled();
      expect(await screen.findByText('home screen')).toBeInTheDocument();
    });
  });

  describe('a read that fails after the Scan Session was discarded', () => {
    const failLater = async () => {
      let reject!: () => void;
      vi.stubGlobal('fetch', (input: RequestInfo | URL) =>
        String(input).includes('/api/scan/')
          ? new Promise<Response>((resolve) => {
              reject = () =>
                resolve(
                  Response.json(
                    { code: 'internal_server_error', params: {} },
                    { status: 500 },
                  ),
                );
            })
          : Promise.resolve(Response.json({}, { status: 404 })),
      );
      renderWithProviders(
        <Routes>
          <Route path="/scan" element={<ScanPage />} />
          <Route path="/" element={<p>home screen</p>} />
        </Routes>,
        { route: '/scan?mode=product' },
      );
      await scanOnce();
      return async () => {
        await act(async () => reject());
      };
    };
    const sorry = /Something went wrong on our side/;

    it('shows no error on the next Scan screen after Discard all', async () => {
      const fail = await failLater();
      act(() => resetScanSession());
      await fail();
      expect(screen.queryByText(sorry)).not.toBeInTheDocument();
    });

    it('shows no error after Close was confirmed and the camera is reopened', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      const fail = await failLater();
      await userEvent.click(
        screen.getByRole('button', { name: 'Close scanner' }),
      );
      await fail();
      expect(screen.queryByText(sorry)).not.toBeInTheDocument();
    });
  });
});

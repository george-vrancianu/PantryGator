import { act, screen } from '@testing-library/react';
import { openFirstScanCard, takeScan, fakeCamera } from '@/test/scan';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, stubApi } from '@/test/render';
import { findReviewRow } from '@/test/review';
import { ReviewOverviewPage } from '@/pages/Review/ReviewOverviewPage';
import { ReviewPage } from '@/pages/Review/ReviewPage';
import { ScanPage } from './ScanPage';

vi.mock('@/lib/camera', async () =>
  (await import('@/test/scan')).fakeCameraModule(),
);
const cropToReceiptAreaMock = vi.hoisted(() => vi.fn());
const cropToReceiptGuideMock = vi.hoisted(() => vi.fn());
/** When set, image preparation waits on it, so a test can change the screen mid-preparation. */
const gate = vi.hoisted(() => ({ current: null as Promise<void> | null }));
vi.mock('@/lib/image', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/image')>()),
  resizeImage: () => Promise.resolve('data:image/jpeg;base64,YQ=='),
  cropToReceiptGuide: async (...args: unknown[]) => {
    cropToReceiptGuideMock(...args);
    await gate.current;
    return 'data:image/jpeg;base64,Y3JvcA==';
  },
  cropToReceiptArea: async (...args: unknown[]) => {
    cropToReceiptAreaMock(...args);
    await gate.current;
    return 'data:image/jpeg;base64,Z2FsbGVyeQ==';
  },
}));
// react-easy-crop measures real image and element sizes, which jsdom cannot do: report a fixed crop.
vi.mock('react-easy-crop', async () => {
  const { useEffect } = await import('react');
  return {
    default: ({
      onCropComplete,
    }: {
      onCropComplete: (
        area: unknown,
        pixels: { x: number; y: number; width: number; height: number },
      ) => void;
    }) => {
      useEffect(() => {
        onCropComplete({}, { x: 10, y: 20, width: 300, height: 900 });
        // eslint-disable-next-line react-hooks/exhaustive-deps -- report once, like the real cropper on load
      }, []);
      return <div data-testid="cropper" />;
    },
  };
});

describe('Receipt Scan on the Scan screen', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends the cropped receipt photo to the Receipt endpoint and reviews its lines on the Scan card', async () => {
    const { fetchMock, calls } = stubApi({
      'GET /api/catalog/parents': () => Response.json({ parents: [] }),
      'POST /api/scan/receipt': () =>
        Response.json({
          lines: [
            {
              name: 'Eggs',
              match: null,
              lowConfidence: false,
              quantity: 10,
              unit: 'pcs',
              expiryDate: null,
              productDescription: null,
            },
            {
              name: 'SACOSA',
              match: null,
              lowConfidence: false,
              quantity: null,
              unit: null,
              expiryDate: null,
              productDescription: null,
              excluded: { reason: 'other' },
            },
          ],
        }),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/scan" element={<ScanPage />} />
        <Route path="/scan/review" element={<ReviewOverviewPage />} />
        <Route path="/scan/review/:scanId" element={<ReviewPage />} />
      </Routes>,
      { route: '/scan?mode=receipt' },
    );
    takeScan();
    await openFirstScanCard();
    expect(await findReviewRow('Eggs')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Excluded · 1/ }));
    expect(screen.getByText('Not for the Pantry')).toBeInTheDocument();
    expect(calls.find((c) => c.key === 'POST /api/scan/receipt')?.body).toEqual(
      { receiptImage: 'data:image/jpeg;base64,Y3JvcA==' },
    );
    expect(calls.map((c) => c.key)).not.toContain('POST /api/scan/product');
  });

  it('crops a receipt Scan to the guide: the camera frame and the screen it was framed on', async () => {
    const { fetchMock } = stubApi({
      'POST /api/scan/receipt': () => Response.json({ lines: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    cropToReceiptGuideMock.mockClear();
    renderWithProviders(<ScanPage />, { route: '/scan?mode=receipt' });
    takeScan();
    await act(async () => {});
    expect(cropToReceiptGuideMock).toHaveBeenCalledTimes(1);
    const [frame, view] = cropToReceiptGuideMock.mock.calls[0];
    expect(frame).toBe(fakeCamera.frame);
    // The view carries the screen size and safe areas the guide is centred in.
    expect(view).toMatchObject({
      width: expect.any(Number),
      height: expect.any(Number),
      insets: { top: expect.any(Number), bottom: expect.any(Number) },
    });
  });

  it('shows the guide and asks the camera for high resolution (as in every mode)', () => {
    renderWithProviders(<ScanPage />, { route: '/scan?mode=receipt' });
    expect(screen.getByTestId('scan-guide')).toBeInTheDocument();
    expect(fakeCamera.calls.length).toBeGreaterThan(0);
  });

  it('leaves the mode description and receipt tips to the Info sheet', () => {
    renderWithProviders(<ScanPage />, { route: '/scan?mode=receipt' });
    expect(
      screen.queryByText(/Adds every item from your shop/),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/40 cm above the receipt/),
    ).not.toBeInTheDocument();
  });
});

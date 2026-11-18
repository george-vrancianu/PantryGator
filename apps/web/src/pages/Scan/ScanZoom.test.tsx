import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, stubApi } from '@/test/render';
import { fakeCamera, takeScan } from '@/test/scan';
import { ScanPage } from './ScanPage';

vi.mock('@/lib/camera', async () =>
  (await import('@/test/scan')).fakeCameraModule(),
);
const cropToReceiptGuideMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/image', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/image')>()),
  resizeImage: () => Promise.resolve('data:image/jpeg;base64,YQ=='),
  cropToReceiptGuide: async (...args: unknown[]) => {
    cropToReceiptGuideMock(...args);
    return 'data:image/jpeg;base64,Y3JvcA==';
  },
}));

const pill = () => screen.queryByRole('group', { name: 'Zoom' });

describe('The zoom pill on the Scan page', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is hidden when the camera cannot zoom', () => {
    renderWithProviders(<ScanPage />, { route: '/scan?mode=product' });
    expect(pill()).toBeNull();
  });

  it('sits in the footer and switches between 1× and 2 with aria-pressed', async () => {
    fakeCamera.zoomSupported = true;
    renderWithProviders(<ScanPage />, { route: '/scan?mode=product' });
    const group = screen.getByRole('group', { name: 'Zoom' });
    expect(screen.getByTestId('scan-footer')).toContainElement(group);
    const one = within(group).getByRole('button', { name: 'Zoom 1×' });
    const two = within(group).getByRole('button', { name: 'Zoom 2×' });
    expect(one).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(two);
    expect(fakeCamera.zooms).toEqual([2]);
    expect(two).toHaveAttribute('aria-pressed', 'true');
    expect(one).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(one);
    expect(one).toHaveAttribute('aria-pressed', 'true');
  });

  it('is there in Barcode mode too', () => {
    fakeCamera.zoomSupported = true;
    renderWithProviders(<ScanPage />, { route: '/scan?mode=barcode' });
    expect(pill()).toBeInTheDocument();
  });

  it('crops receipt Scans at 1× and 2× from the same camera frame and guide view', async () => {
    fakeCamera.zoomSupported = true;
    const { fetchMock } = stubApi({
      'POST /api/scan/receipt': () => Response.json({ lines: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    cropToReceiptGuideMock.mockClear();
    renderWithProviders(<ScanPage />, { route: '/scan?mode=receipt' });
    takeScan();
    await act(async () => {});
    await userEvent.click(screen.getByRole('button', { name: 'Zoom 2×' }));
    takeScan();
    await act(async () => {});
    expect(cropToReceiptGuideMock).toHaveBeenCalledTimes(2);
    const [[frame1, view1], [frame2, view2]] =
      cropToReceiptGuideMock.mock.calls;
    expect(frame1).toBe(fakeCamera.frame);
    expect(frame2).toBe(frame1);
    expect(view2).toEqual(view1);
    expect(view1).toMatchObject({
      width: expect.any(Number),
      height: expect.any(Number),
    });
  });
});

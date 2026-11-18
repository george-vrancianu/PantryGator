import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import {
  dispatchScanSession,
  resetScanSession,
  type SessionScan,
} from '@/lib/scanSession';
import { ReviewOverviewPage } from '@/pages/Review/ReviewOverviewPage';
import { ScanPage } from './ScanPage';
import { emitBarcode, expectStack, fakeCamera, takeScan } from '@/test/scan';

vi.mock('@/lib/camera', async () =>
  (await import('@/test/scan')).fakeCameraModule(),
);
vi.mock('@/lib/image', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/image')>()),
  resizeImage: () => Promise.resolve('data:image/jpeg;base64,YQ=='),
}));

function renderScan(route = '/scan?mode=product') {
  const never = new Promise<Response>(() => {});
  vi.stubGlobal(
    'fetch',
    vi.fn(() => never),
  );
  renderWithProviders(
    <Routes>
      <Route path="/scan" element={<ScanPage />} />
      <Route path="/scan/review" element={<ReviewOverviewPage />} />
    </Routes>,
    { route },
  );
}

let n = 0;
type Seeded = 'queued' | 'read' | 'failed' | 'uncropped';
/** Puts a card in the Scan Session in the given state, through the reducer's own actions. */
const seed = (status: Seeded, mode: SessionScan['mode'] = 'product') =>
  act(() => {
    n += 1;
    const id = `c${n}`;
    dispatchScanSession({
      type: 'enqueue',
      scan: {
        id,
        mode,
        image: mode === 'barcode' || status === 'uncropped' ? undefined : 'i',
        code: mode === 'barcode' ? '123' : undefined,
        source:
          status === 'uncropped'
            ? new Blob(['x'], { type: 'image/jpeg' })
            : undefined,
        thumbnail: `data:image/jpeg;base64,${n}`,
      },
    });
    if (status === 'read' || status === 'failed') {
      dispatchScanSession({ type: 'start' });
      dispatchScanSession(
        status === 'read'
          ? { type: 'read', id, lines: [] }
          : { type: 'fail', id, reason: 'error' },
      );
    }
  });
const stack = () => screen.getByTestId('photo-stack');
const badge = () => screen.getByTestId('stack-badge');

describe('The photo stack on the Scan page', () => {
  beforeEach(() => {
    localStorage.clear();
    resetScanSession();
    n = 0;
  });
  afterEach(() => vi.unstubAllGlobals());

  it('is an empty, disabled placeholder that does nothing', async () => {
    renderScan();
    expect(stack()).toHaveAccessibleName('No photos yet');
    expect(stack()).toHaveAttribute('aria-disabled', 'true');
    expect(screen.queryByTestId('stack-badge')).toBeNull();
    await userEvent.click(stack());
    expect(screen.queryByTestId('review-overview')).toBeNull();
  });

  it('counts Scans and Barcode cards in the badge, and names photos and barcodes', async () => {
    renderScan();
    takeScan();
    await act(async () => {});
    expect(badge()).toHaveTextContent('1');
    expect(stack()).toHaveAccessibleName(/^Review 1 photo, /);
    await seed('queued', 'barcode');
    await seed('queued', 'barcode');
    expect(badge()).toHaveTextContent('3');
    expect(stack()).toHaveAccessibleName(
      /^Review 1 photo and 2 barcodes, 3 still reading$/,
    );
  });

  it('names barcodes alone without a photo part', async () => {
    renderScan();
    await seed('queued', 'barcode');
    expect(stack()).toHaveAccessibleName(/^Review 1 barcode, /);
    expect(stack()).not.toHaveAccessibleName(/photo/);
  });

  it('never says "items"', async () => {
    renderScan();
    await seed('queued');
    expect(stack().getAttribute('aria-label')).not.toMatch(/item/i);
  });

  it('shows the layers newest on top, at most three', async () => {
    renderScan();
    for (let i = 0; i < 4; i += 1) await seed('queued');
    const layers = screen.getAllByTestId('stack-layer');
    expect(layers).toHaveLength(3);
    // Painted in order: the last in the DOM is on top and is the newest card.
    expect(layers[2].querySelector('img')).toHaveAttribute(
      'src',
      'data:image/jpeg;base64,4',
    );
  });

  it('shows the four badge states in order: reading, needs crop, failed, all read', async () => {
    renderScan();
    await seed('read');
    expect(stack()).toHaveAccessibleName('Review 1 photo, all read');
    await seed('failed');
    expect(badge()).toHaveAttribute('data-state', 'failed');
    expect(stack()).toHaveAccessibleName("Review 2 photos, 1 couldn't be read");
    await seed('uncropped', 'receipt');
    expect(stack()).toHaveAccessibleName(/1 receipt to crop$/);
    await seed('queued');
    expect(screen.getByTestId('stack-spinner')).toBeInTheDocument();
    expect(stack()).toHaveAccessibleName('Review 4 photos, 1 still reading');
  });

  it('opens Review on a tap, even while reads are running', async () => {
    renderScan();
    takeScan();
    await act(async () => {});
    expectStack('reading');
    await userEvent.click(stack());
    expect(screen.getByTestId('review-overview')).toBeInTheDocument();
  });

  it('gains a card for a Barcode code at the Scan Cap and shows it in the stack', async () => {
    renderScan('/scan?mode=barcode');
    dispatchScanSession({
      type: 'enqueue',
      scan: { id: 'cap', mode: 'product', image: 'i', thumbnail: 'i' },
    });
    dispatchScanSession({ type: 'start' });
    dispatchScanSession({ type: 'fail', id: 'cap', reason: 'cap' });
    await act(async () => {});
    await vi.waitFor(() => expect(fakeCamera.emit).not.toBeNull());
    await act(async () => emitBarcode('4006381333931'));
    await vi.waitFor(() => expect(badge()).toHaveTextContent('2'));
    expect(stack()).toHaveAccessibleName(/barcode/);
  });
});

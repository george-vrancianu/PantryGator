import { screen, waitFor } from '@testing-library/react';
import {
  expectStack,
  shutter,
  openFirstScanCard,
  takeScan,
  fakeCamera,
} from '@/test/scan';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CatalogSearchResult } from '@/lib/catalog';
import type { ProposedLine } from '@/lib/scan';
import { renderWithProviders, stubApi } from '@/test/render';
import { findReviewRow } from '@/test/review';
import { ReviewOverviewPage } from '@/pages/Review/ReviewOverviewPage';
import { ReviewPage } from '@/pages/Review/ReviewPage';
import { ScanPage } from './ScanPage';

// jsdom has no camera or canvas: the camera and the resizer are the seams.
vi.mock('@/lib/camera', async () =>
  (await import('@/test/scan')).fakeCameraModule(),
);
vi.mock('@/lib/image', () => ({
  resizeImage: () => Promise.resolve('data:image/jpeg;base64,YQ=='),
}));

/** The camera restarts when the mode changes: wait until the guide takes Scans again. */
const shoot = async () => {
  await waitFor(() => expect(shutter()).not.toHaveAttribute('aria-disabled'));
  takeScan();
};

const parmesan: CatalogSearchResult = {
  owner: 'catalog',
  amountScale: 'medium',
  id: 'parmesan-id',
  name: 'Parmesan',
  defaultUnit: 'g',
  leafCategory: { id: 'hard', name: 'Hard cheese' },
  parentCategory: {
    id: 'dairy',
    name: 'Dairy',
    aisle: { id: 'aisle', name: 'Dairy' },
  },
  defaults: { expiryDays: 60, location: 'fridge' },
};

const proposed: ProposedLine = {
  name: 'Grana Padano',
  match: parmesan,
  lowConfidence: false,
  quantity: null,
  unit: null,
  expiryDate: '2026-12-24',
  sourceText: 'GRANA PAD 200G',
  productDescription: 'Grana Padano 200g',
};

function renderScan(
  routes: Record<string, () => Response>,
  route = '/scan?mode=product',
) {
  const { fetchMock, calls } = stubApi(routes);
  vi.stubGlobal('fetch', fetchMock);
  renderWithProviders(
    <Routes>
      <Route path="/scan" element={<ScanPage />} />
      <Route path="/scan/review" element={<ReviewOverviewPage />} />
      <Route path="/scan/review/:scanId" element={<ReviewPage />} />
    </Routes>,
    { route },
  );
  return calls;
}

describe('ScanPage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('has the camera controls, with Receipt selected among all four modes', () => {
    renderScan({}, '/scan');
    expect(screen.getAllByRole('radio').map((r) => r.textContent)).toEqual([
      'Receipt',
      'Ingredients',
      'Product',
      'Barcode',
      'Plate',
    ]);
    expect(screen.getByRole('radio', { name: 'Receipt' })).toBeChecked();
    for (const name of [
      'Close scanner',
      /^Torch/,
      'How scanning works',
      'Import from photos',
      'Take photo',
      'No photos yet',
    ]) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
    // Done, the top-bar gallery button and the thumbnail column are gone.
    expect(
      screen.queryByRole('button', { name: /^Done|Choose from photos/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('scan-thumbnail')).not.toBeInTheDocument();
  });

  it('hides the flash toggle when the camera has no torch', () => {
    fakeCamera.torchSupported = false;
    renderScan({});
    expect(
      screen.queryByRole('button', { name: /^Torch/ }),
    ).not.toBeInTheDocument();
  });

  it('toggles the flash', async () => {
    renderScan({});
    const flash = screen.getByRole('button', { name: /^Torch/ });
    expect(flash).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(flash);
    expect(flash).toHaveAttribute('aria-pressed', 'true');
  });

  it.each(['Product', 'Receipt', 'Plate', 'Ingredients'])(
    'enables the shutter in %s mode',
    async (mode) => {
      renderScan({});
      await userEvent.click(screen.getByRole('radio', { name: mode }));
      expect(screen.getByRole('radio', { name: mode })).toHaveAttribute(
        'aria-checked',
        'true',
      );
      expect(shutter()).not.toHaveAttribute('aria-disabled');
      expect(
        screen.getByRole('button', { name: 'Import from photos' }),
      ).toBeEnabled();
    },
  );

  it('turns a camera shot into a proposed line on the Review screen', async () => {
    renderScan({
      'POST /api/scan/product': () => Response.json({ lines: [proposed] }),
    });
    await shoot();
    await openFirstScanCard();
    expect(await findReviewRow('Parmesan')).toBeInTheDocument();
  });

  it('shows the daily limit and stops scanning when the Scan Cap is reached', async () => {
    renderScan({
      'POST /api/scan/product': () =>
        Response.json(
          { code: 'scan.cap_reached', params: { cap: 30 } },
          { status: 429 },
        ),
    });
    await shoot();
    expect(
      await screen.findByText('Daily scan limit reached'),
    ).toBeInTheDocument();
    expect(shutter()).toHaveAttribute('aria-disabled', 'true');
  });

  it('fails the Scan for a rejected image', async () => {
    renderScan({
      'POST /api/scan/product': () =>
        Response.json(
          { code: 'scan.image_too_large', params: {} },
          { status: 413 },
        ),
    });
    await shoot();
    // Retry and the reason live on the card in Review; the camera only shows the stack going amber.
    await waitFor(() => expectStack('failed'));
    expect(
      screen.queryByRole('button', { name: /retry/i }),
    ).not.toBeInTheDocument();
  });
});

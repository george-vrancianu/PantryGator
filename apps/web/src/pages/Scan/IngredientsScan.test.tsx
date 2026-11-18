import { waitFor } from '@testing-library/react';
import { expectStack, shutter, openFirstScanCard, takeScan } from '@/test/scan';
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CatalogSearchResult } from '@/lib/catalog';
import type { ProposedLine } from '@/lib/scan';
import { renderWithProviders, stubApi } from '@/test/render';
import { findReviewRow } from '@/test/review';
import { ReviewOverviewPage } from '@/pages/Review/ReviewOverviewPage';
import { ReviewPage } from '@/pages/Review/ReviewPage';
import { ScanPage } from './ScanPage';

const IMAGE = 'data:image/jpeg;base64,YQ==';

vi.mock('@/lib/camera', async () =>
  (await import('@/test/scan')).fakeCameraModule(),
);
vi.mock('@/lib/image', () => ({
  resizeImage: () => Promise.resolve('data:image/jpeg;base64,YQ=='),
}));

const catalogItem = (id: string, name: string): CatalogSearchResult => ({
  owner: 'catalog',
  amountScale: 'medium',
  id,
  name,
  defaultUnit: 'pcs',
  leafCategory: { id: `${id}-leaf`, name },
  parentCategory: {
    id: 'produce',
    name: 'Produce',
    aisle: { id: 'aisle', name: 'Produce' },
  },
  defaults: { expiryDays: 7, location: 'fridge' },
});

const line = (id: string, name: string): ProposedLine => ({
  name,
  match: catalogItem(id, name),
  lowConfidence: false,
  quantity: null,
  unit: null,
  expiryDate: null,
  sourceText: null,
  productDescription: null,
});

function renderIngredients(routes: Record<string, () => Response>) {
  const { fetchMock, calls } = stubApi(routes);
  vi.stubGlobal('fetch', fetchMock);
  renderWithProviders(
    <Routes>
      <Route path="/scan" element={<ScanPage />} />
      <Route path="/scan/review" element={<ReviewOverviewPage />} />
      <Route path="/scan/review/:scanId" element={<ReviewPage />} />
    </Routes>,
    { route: '/scan?mode=ingredients' },
  );
  return calls;
}

describe('Ingredients Scan on the Scan screen', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('enables the shutter', () => {
    renderIngredients({});
    expect(shutter()).not.toHaveAttribute('aria-disabled');
  });

  it('sends the photo to the Ingredients endpoint and reviews one card per item', async () => {
    const calls = renderIngredients({
      'POST /api/scan/ingredients': () =>
        Response.json({
          lines: [line('tomato', 'Tomato'), line('onion', 'Onion')],
        }),
    });
    takeScan();
    await openFirstScanCard();
    expect(await findReviewRow('Tomato')).toBeInTheDocument();
    expect(await findReviewRow('Onion')).toBeInTheDocument();
    expect(
      calls.find((c) => c.key === 'POST /api/scan/ingredients')?.body,
    ).toEqual({ ingredientsImage: IMAGE });
  });

  it('fails the Scan when nothing was recognised, and stays on the Scan screen', async () => {
    renderIngredients({
      'POST /api/scan/ingredients': () => Response.json({ lines: [] }),
    });
    takeScan();
    await waitFor(() => expectStack('failed'));
    expect(shutter()).not.toHaveAttribute('aria-disabled');
  });

  it('fails the Scan when there were too many items', async () => {
    renderIngredients({
      'POST /api/scan/ingredients': () =>
        Response.json(
          { code: 'scan.too_many_items', params: { max: 50 } },
          { status: 422 },
        ),
    });
    takeScan();
    await waitFor(() => expectStack('failed'));
  });
});

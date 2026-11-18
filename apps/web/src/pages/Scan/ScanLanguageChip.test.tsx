import { screen, within } from '@testing-library/react';
import {
  languageChip,
  openFirstScanCard,
  pickScanLanguage,
  queryLanguageChip,
  takeScan,
} from '@/test/scan';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, stubApi } from '@/test/render';
import { ReviewOverviewPage } from '@/pages/Review/ReviewOverviewPage';
import { ReviewPage } from '@/pages/Review/ReviewPage';
import { ScanPage } from './ScanPage';

vi.mock('@/lib/camera', async () =>
  (await import('@/test/scan')).fakeCameraModule(),
);
vi.mock('@/lib/image', () => ({
  resizeImage: () => Promise.resolve('data:image/jpeg;base64,YQ=='),
  cropToReceiptGuide: () => Promise.resolve('data:image/jpeg;base64,Y3JvcA=='),
}));

const line = {
  name: 'Cheese',
  match: null,
  lowConfidence: false,
  quantity: null,
  unit: null,
  expiryDate: null,
  sourceText: 'OST 200G',
  productDescription: null,
};

function renderScan(route: string) {
  const { fetchMock, calls } = stubApi({
    'GET /api/catalog/parents': () => Response.json({ parents: [] }),
    'POST /api/scan/product': () => Response.json({ lines: [line] }),
    'POST /api/scan/ingredients': () => Response.json({ lines: [line] }),
  });
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

describe('Scan Language chip in the top bar', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('sits in the top bar', () => {
    renderScan('/scan?mode=product');
    const bar = screen.getByTestId('scan-top-bar');
    expect(within(bar).getByRole('button', { name: /Reading as/ })).toBe(
      languageChip(),
    );
  });

  it('is compact: a globe and the code of the Scan Language', () => {
    renderScan('/scan?mode=product');
    expect(languageChip()).toHaveTextContent(/^EN$/);
  });

  it.each(['product', 'ingredients', 'receipt'])(
    'is shown in %s mode',
    (mode) => {
      renderScan(`/scan?mode=${mode}`);
      expect(languageChip()).toBeVisible();
    },
  );

  it('is hidden in Plate mode', () => {
    renderScan('/scan?mode=plate');
    expect(queryLanguageChip()).not.toBeInTheDocument();
  });

  it('sends the chosen Scan Language with the next Scan', async () => {
    const calls = renderScan('/scan?mode=product');
    await pickScanLanguage('Română');
    takeScan();
    await openFirstScanCard();
    await screen.findByRole('button', { name: /Save 1 item/ });
    const scan = calls.find((c) => c.key === 'POST /api/scan/product');
    expect(new URLSearchParams(scan?.search).get('scanLanguage')).toBe('ro');
  });
});

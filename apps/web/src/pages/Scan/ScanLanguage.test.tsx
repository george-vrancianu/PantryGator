import { act, screen } from '@testing-library/react';
import {
  languageChip,
  openFirstScanCard,
  pickScanLanguage,
  queryLanguageChip,
  takeScan,
} from '@/test/scan';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, stubApi } from '@/test/render';
import { ReviewOverviewPage } from '@/pages/Review/ReviewOverviewPage';
import { ReviewPage } from '@/pages/Review/ReviewPage';
import { ScanPage } from './ScanPage';

// jsdom has no camera or canvas: the camera and the image preparation are the seams.
vi.mock('@/lib/camera', async () =>
  (await import('@/test/scan')).fakeCameraModule(),
);
vi.mock('@/lib/image', () => ({
  resizeImage: () => Promise.resolve('data:image/jpeg;base64,YQ=='),
  cropToReceiptGuide: () => Promise.resolve('data:image/jpeg;base64,Y3JvcA=='),
  cropToReceiptArea: () =>
    Promise.resolve('data:image/jpeg;base64,Z2FsbGVyeQ=='),
}));
// react-easy-crop measures real sizes, which jsdom cannot do: report a fixed crop.
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

const unmatchedLine = {
  name: 'Cheese',
  match: null,
  lowConfidence: false,
  quantity: null,
  unit: null,
  expiryDate: null,
  sourceText: 'OST 200G',
  productDescription: null,
};

function renderScan(
  route: string,
  routes: Record<string, () => Response | Promise<Response>> = {},
  locale: 'en' | 'ro' | 'da' = 'en',
) {
  const { fetchMock, calls } = stubApi({
    'GET /api/catalog/parents': () => Response.json({ parents: [] }),
    'POST /api/scan/product': () => Response.json({ lines: [unmatchedLine] }),
    'POST /api/scan/ingredients': () =>
      Response.json({ lines: [unmatchedLine] }),
    'POST /api/scan/receipt': () => Response.json({ lines: [unmatchedLine] }),
    'POST /api/scan/receipt/confirm': () =>
      Response.json({ batches: [], matchedShoppingItemIds: [] }),
    'POST /api/pantry/batches/bulk': () => Response.json({ batches: [] }),
    ...routes,
  });
  vi.stubGlobal('fetch', fetchMock);
  renderWithProviders(
    <Routes>
      <Route path="/scan" element={<ScanPage />} />
      <Route path="/scan/review" element={<ReviewOverviewPage />} />
      <Route path="/scan/review/:scanId" element={<ReviewPage />} />
      <Route path="/pantry" element={<p>pantry screen</p>} />
    </Routes>,
    { route, locale },
  );
  return calls;
}

describe('Scan Language on the Scan screen', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('starts at the UI language', () => {
    renderScan('/scan', {}, 'ro');
    expect(languageChip()).toHaveTextContent('RO');
  });

  it('sends no Scan Language before the Preferences have loaded, so the API uses the stored one', async () => {
    const calls = renderScan(
      '/scan?mode=product',
      {
        'GET /api/settings/preferences': () => new Promise<Response>(() => {}),
      },
      'en',
    );
    expect(languageChip()).toHaveTextContent('EN');
    takeScan();
    await openFirstScanCard();
    const scan = calls.find((c) => c.key === 'POST /api/scan/product');
    expect(new URLSearchParams(scan?.search).get('scanLanguage')).toBeNull();
  });

  it('starts at Dansk under a Danish UI', () => {
    renderScan('/scan', {}, 'da');
    expect(languageChip()).toHaveTextContent('DA');
  });

  it('follows the UI language while nothing is picked', async () => {
    const { i18n } = renderWithProviders(<ScanPage />, {
      route: '/scan',
      locale: 'da',
    });
    await act(() => i18n.changeLanguage('en'));
    expect(languageChip()).toHaveTextContent('EN');
    await act(() => i18n.changeLanguage('da'));
    expect(languageChip()).toHaveTextContent('DA');
  });

  it('changes the Scan Language without changing the UI language', async () => {
    renderScan('/scan');
    await pickScanLanguage('Dansk');
    expect(languageChip()).toHaveTextContent('DA');
    expect(screen.getByRole('button', { name: 'Close scanner' })).toBeVisible();
    expect(document.documentElement.lang).toBe('en');
  });

  it.each([
    ['ro', 'Se citește în daneză'],
    ['da', 'Læser på dansk'],
    ['en', 'Reading in Dansk'],
  ] as const)(
    'says the pick in a sentence under a %s UI',
    async (locale, text) => {
      renderScan('/scan', {}, locale);
      await pickScanLanguage('Dansk');
      expect(await screen.findByText(text)).toBeVisible();
    },
  );

  it('has no picker for Plate Scan', () => {
    renderScan('/scan?mode=plate');
    expect(queryLanguageChip()).not.toBeInTheDocument();
  });

  it.each(['product', 'ingredients'])(
    '%s Scan reads in the chosen language, and Review saves in it with the printed text',
    async (mode) => {
      const calls = renderScan(`/scan?mode=${mode}`);
      await pickScanLanguage('Dansk');
      takeScan();
      await openFirstScanCard();
      await userEvent.click(
        await screen.findByRole('button', { name: 'Save 1 item' }),
      );
      await screen.findByText('pantry screen');
      const scan = calls.find((c) => c.key === `POST /api/scan/${mode}`);
      expect(new URLSearchParams(scan?.search).get('scanLanguage')).toBe('da');
      const save = calls.find((c) => c.key === 'POST /api/pantry/batches/bulk');
      expect(new URLSearchParams(save?.search).get('scanLanguage')).toBe('da');
      expect(save?.body).toMatchObject({
        batches: [{ rawName: 'Cheese', sourceText: 'OST 200G' }],
      });
    },
  );

  it('reads a Receipt Scan in the chosen language and confirms in it', async () => {
    const calls = renderScan('/scan?mode=receipt');
    await pickScanLanguage('Dansk');
    takeScan();
    await openFirstScanCard();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Save 1 item' }),
    );
    await screen.findByText('pantry screen');
    const scan = calls.find((c) => c.key === 'POST /api/scan/receipt');
    expect(new URLSearchParams(scan?.search).get('scanLanguage')).toBe('da');
    const confirm = calls.find(
      (c) => c.key === 'POST /api/scan/receipt/confirm',
    );
    expect(new URLSearchParams(confirm?.search).get('scanLanguage')).toBe('da');
  });
});

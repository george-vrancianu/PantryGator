import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatalogSearchResult } from '@/lib/catalog';
import type { ProposedLine, ScanMode } from '@/lib/scan';
import {
  dispatchScanSession,
  getScanSession,
  resetScanSession,
} from '@/lib/scanSession';
import { renderWithProviders, stubApi } from '@/test/render';
import { ScanPage } from '@/pages/Scan/ScanPage';
import { ReviewOverviewPage } from './ReviewOverviewPage';
import { findReviewRow } from '@/test/review';
import { ReviewPage } from './ReviewPage';

vi.mock('@/lib/camera', async () =>
  (await import('@/test/scan')).fakeCameraModule(),
);

const milk: CatalogSearchResult = {
  owner: 'catalog',
  amountScale: 'medium',
  id: 'milk-id',
  name: 'Milk',
  defaultUnit: 'l',
  leafCategory: { id: 'milk', name: 'Milk' },
  parentCategory: {
    id: 'dairy',
    name: 'Dairy',
    aisle: { id: 'aisle', name: 'Dairy' },
  },
  defaults: { expiryDays: 7, location: 'fridge' },
};

const line = (
  name: string,
  extra: Partial<ProposedLine> = {},
): ProposedLine => ({
  name,
  match: { ...milk, name },
  lowConfidence: false,
  quantity: 1,
  unit: 'pcs',
  expiryDate: null,
  sourceText: null,
  productDescription: null,
  ...extra,
});

const seed = (
  id: string,
  mode: ScanMode,
  lines: ProposedLine[] | 'reading' | 'queued',
  source?: Blob,
) =>
  act(() => {
    dispatchScanSession({
      type: 'enqueue',
      scan: {
        id,
        mode,
        scanLanguage: 'en',
        image: 'data:image/jpeg;base64,YQ==',
        thumbnail: 'data:image/jpeg;base64,YQ==',
        source,
      },
    });
    if (lines === 'queued' || source) return;
    dispatchScanSession({ type: 'start' });
    if (lines !== 'reading') dispatchScanSession({ type: 'read', id, lines });
  });

/** A button that goes to the overview, as the browser Back does. */
function BackToOverview() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate('/scan/review')}>
      test back
    </button>
  );
}

function renderOverview(
  extra: Record<string, (url: URL) => Response> = {},
  route = '/scan/review',
) {
  const stub = stubApi({
    'GET /api/catalog/parents': () => Response.json({ parents: [] }),
    'POST /api/pantry/batches/bulk': () => Response.json({ batches: [] }),
    'POST /api/scan/receipt/confirm': () =>
      Response.json({ batches: [], matchedShoppingItemIds: [] }),
    ...extra,
  });
  vi.stubGlobal('fetch', stub.fetchMock);
  renderWithProviders(
    <Routes>
      <Route path="/scan" element={<ScanPage />} />
      <Route path="/scan/review" element={<ReviewOverviewPage />} />
      <Route
        path="/scan/review/:scanId"
        element={
          <>
            <BackToOverview />
            <ReviewPage />
          </>
        }
      />
    </Routes>,
    { route },
  );
  return stub.calls;
}

const cards = () => screen.getAllByTestId('review-card');
const add = () => screen.getByRole('button', { name: /^Add(?! from photos)/ });
const batchesOf = (body: unknown) => (body as { batches: unknown[] }).batches;

describe('Review overview, epic review fixes', () => {
  beforeEach(() => {
    resetScanSession();
    localStorage.clear();
  });
  afterEach(() => vi.unstubAllGlobals());

  describe('Scan Cap (#1, #5)', () => {
    it('lets Add save the read cards once a Scan hit the cap and the rest were held back', async () => {
      await seed('a', 'product', [line('Yogurt')]);
      await seed('b', 'product', 'reading');
      await seed('c', 'product', 'queued');
      act(() => dispatchScanSession({ type: 'fail', id: 'b', reason: 'cap' }));
      const calls = renderOverview();
      expect(add()).toBeEnabled();
      await userEvent.click(add());
      await waitFor(() =>
        expect(
          calls.filter((c) => c.key === 'POST /api/pantry/batches/bulk'),
        ).toHaveLength(1),
      );
    });

    it('says why a card failed by the Scan Cap', async () => {
      await seed('a', 'product', 'reading');
      act(() =>
        dispatchScanSession({
          type: 'fail',
          id: 'a',
          reason: 'cap',
          code: 'scan.cap_reached',
          params: { cap: 30 },
        }),
      );
      renderOverview();
      expect(
        within(cards()[0]).getByText('Daily scan limit reached'),
      ).toBeInTheDocument();
    });
  });

  describe('Add all sends only saves the API accepts (#3)', () => {
    it('skips a receipt card whose lines are all excluded, and saves the others', async () => {
      await seed('a', 'receipt', [
        line('Bag', { excluded: { reason: 'other' } }),
      ]);
      await seed('b', 'product', [line('Yogurt')]);
      const calls = renderOverview();
      await userEvent.click(add());
      await waitFor(() =>
        expect(
          calls.filter((c) => c.key === 'POST /api/pantry/batches/bulk'),
        ).toHaveLength(1),
      );
      expect(
        calls.filter((c) => c.key === 'POST /api/scan/receipt/confirm'),
      ).toHaveLength(0);
    });

    it('never sends more than 50 batches in one save', async () => {
      await seed(
        'a',
        'receipt',
        Array.from({ length: 51 }, (_, i) => line(`Item ${i}`)),
      );
      const calls = renderOverview();
      await userEvent.click(add());
      await act(async () => {});
      for (const call of calls.filter((c) => c.key.includes('receipt/confirm')))
        expect(batchesOf(call.body).length).toBeLessThanOrEqual(50);
    });
  });

  describe('editing a card (#4)', () => {
    it('keeps the edits made in the editor when going back to the overview and adding all', async () => {
      await seed('a', 'product', [line('Rice'), line('Flour')]);
      const calls = renderOverview({}, '/scan/review/a');
      await userEvent.click(await findReviewRow('Rice'));
      await userEvent.click(
        await screen.findByRole('button', { name: 'Remove Rice' }),
      );
      await userEvent.click(
        await screen.findByRole('button', { name: 'test back' }),
      );
      await userEvent.click(
        await screen.findByRole('button', { name: /^Add(?! from photos)/ }),
      );
      await waitFor(() =>
        expect(
          calls.filter((c) => c.key === 'POST /api/pantry/batches/bulk'),
        ).toHaveLength(1),
      );
      const save = calls.find((c) => c.key === 'POST /api/pantry/batches/bulk');
      expect(batchesOf(save?.body)).toHaveLength(1);
    });
  });

  describe('Receipt tick failures (#7)', () => {
    it('tells the Member on the camera when Add all could not tick Shopping Items', async () => {
      await seed('a', 'receipt', [line('Eggs')]);
      renderOverview({
        'POST /api/scan/receipt/confirm': () =>
          Response.json({ batches: [], matchedShoppingItemIds: ['s1'] }),
        'PATCH /api/shopping-list/items/s1': () =>
          Response.json({ code: 'boom', params: {} }, { status: 500 }),
      });
      await userEvent.click(add());
      expect(await screen.findByText(/tick/)).toBeInTheDocument();
    });
  });

  describe('uncropped receipts (#9)', () => {
    it('asks to crop them instead of saying it is waiting on reads', async () => {
      await seed('a', 'product', [line('Yogurt')]);
      await seed('b', 'receipt', 'queued', new Blob(['x']));
      await seed('c', 'receipt', 'queued', new Blob(['x']));
      renderOverview();
      const button = screen.getByRole('button', {
        name: /^Crop 2 receipts first/,
      });
      expect(button).toBeDisabled();
      expect(screen.queryByText(/waiting on/)).not.toBeInTheDocument();
    });
  });

  describe('focus (#12a)', () => {
    it('moves focus to the next card when a card is removed', async () => {
      await seed('a', 'product', [line('Yogurt')]);
      await seed('b', 'product', [line('Rice')]);
      renderOverview();
      await userEvent.click(
        within(cards()[0]).getByRole('button', { name: /remove/i }),
      );
      await waitFor(() => expect(document.activeElement).toBe(cards()[0]));
      expect(cards()[0]).toHaveAttribute('data-scan-id', 'b');
    });

    it('moves focus to the merged card after Merge and to a restored card after Split', async () => {
      await seed('a', 'receipt', [line('Eggs')]);
      await seed('b', 'receipt', [line('Jam')]);
      renderOverview();
      await userEvent.click(
        within(cards()[1]).getByRole('button', {
          name: /merge with previous/i,
        }),
      );
      await waitFor(() => expect(document.activeElement).toBe(cards()[0]));
      await userEvent.click(
        within(cards()[0]).getByRole('button', { name: 'Split' }),
      );
      await waitFor(() =>
        expect(document.activeElement).not.toBe(document.body),
      );
    });
  });

  describe('Retake (#10)', () => {
    it('removes the failed card and goes back to the camera', async () => {
      await seed('a', 'product', [line('Yogurt')]);
      await seed('b', 'product', 'reading');
      act(() =>
        dispatchScanSession({ type: 'fail', id: 'b', reason: 'error' }),
      );
      renderOverview();
      await userEvent.click(
        within(cards()[1]).getByRole('button', { name: /^Retake/ }),
      );
      expect(await screen.findByTestId('scan-guide')).toBeInTheDocument();
      expect(getScanSession().scans.map((scan) => scan.id)).toEqual(['a']);
    });
  });

  describe('a failed Barcode card (#421)', () => {
    const failBarcode = (code?: string) => {
      act(() => {
        dispatchScanSession({
          type: 'enqueue',
          scan: {
            id: 'b',
            mode: 'barcode',
            scanLanguage: 'en',
            image: 'data:image/jpeg;base64,YQ==',
            thumbnail: 'data:image/jpeg;base64,YQ==',
            code: '5941234200017',
          },
        });
        dispatchScanSession({ type: 'start' });
        dispatchScanSession({
          type: 'fail',
          id: 'b',
          reason: 'error',
          code,
        });
      });
    };

    it('says the lookup failed, not that it could not be read, and retries the lookup in place', async () => {
      failBarcode('internal');
      const calls = renderOverview({
        'GET /api/barcode-lookup/5941234200017': () =>
          Response.json({ found: false, code: '5941234200017' }),
      });
      const card = cards()[0];
      expect(
        within(card).getByText("Couldn't look up this barcode"),
      ).toBeInTheDocument();
      expect(within(card).queryByText(/retake/i)).toBeNull();
      expect(
        within(card).queryByRole('button', { name: /^Retake/ }),
      ).toBeNull();

      await userEvent.click(
        within(card).getByRole('button', { name: 'Look up again' }),
      );
      await waitFor(() =>
        expect(
          calls.filter(
            (c) => c.key === 'GET /api/barcode-lookup/5941234200017',
          ),
        ).toHaveLength(1),
      );
      expect(screen.queryByTestId('scan-guide')).toBeNull();
      expect(getScanSession().scans.map((scan) => scan.id)).toEqual(['b']);
      await waitFor(() => expect(cards()[0]).toHaveFocus());
    });

    it('offers Remove next to Look up again, never Retake, and stays on Review', async () => {
      failBarcode('internal');
      renderOverview();
      const card = cards()[0];
      expect(
        within(card).queryByRole('button', { name: /^Retake/ }),
      ).toBeNull();
      await userEvent.click(
        within(card).getByRole('button', { name: 'Remove' }),
      );
      expect(getScanSession().scans).toEqual([]);
      expect(screen.queryByTestId('scan-guide')).toBeNull();
    });
  });

  describe('merging after an edit (N1)', () => {
    it('saves both receipts lines when the upper card was edited before Merge', async () => {
      await seed('a', 'receipt', [line('Eggs'), line('Bag')]);
      await seed('b', 'receipt', [line('Jam')]);
      const calls = renderOverview({}, '/scan/review/a');
      await userEvent.click(await findReviewRow('Bag'));
      await userEvent.click(
        await screen.findByRole('button', { name: 'Remove Bag' }),
      );
      await userEvent.click(
        await screen.findByRole('button', { name: 'test back' }),
      );
      await userEvent.click(
        await screen.findByRole('button', { name: /merge with previous/i }),
      );
      await userEvent.click(
        await screen.findByRole('button', { name: /^Add(?! from photos)/ }),
      );
      await waitFor(() =>
        expect(
          calls.filter((c) => c.key === 'POST /api/scan/receipt/confirm'),
        ).toHaveLength(1),
      );
      const save = calls.find(
        (c) => c.key === 'POST /api/scan/receipt/confirm',
      );
      expect(batchesOf(save?.body)).toHaveLength(2);
    });
  });

  describe('copy (#18)', () => {
    it('names the button for any Scan Mode, not just the pantry', async () => {
      await seed('a', 'receipt', [line('Pasta')]);
      renderOverview();
      expect(
        screen.getByRole('button', { name: 'Add all' }),
      ).toBeInTheDocument();
    });
  });
});

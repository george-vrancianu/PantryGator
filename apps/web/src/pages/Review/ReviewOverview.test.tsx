import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatalogSearchResult } from '@/lib/catalog';
import type { ProposedLine, ScanMode } from '@/lib/scan';
import { resetReads } from '@/lib/scanReads';
import { dispatchScanSession, resetScanSession } from '@/lib/scanSession';
import { saveScanPageMode, type CameraMode } from '@/lib/cameraMode';
import { renderWithProviders, stubApi } from '@/test/render';
import { preferencesQueryKey } from '@/lib/settings';
import { scanLanguagePreference } from '@/test/scan';
import { ScanPage } from '@/pages/Scan/ScanPage';
import { ReviewOverviewPage } from './ReviewOverviewPage';
import { ReviewPage } from './ReviewPage';

vi.mock('@/lib/camera', async () =>
  (await import('@/test/scan')).fakeCameraModule(),
);
vi.mock('@/lib/image', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/image')>()),
  resizeImage: () => Promise.resolve('data:image/jpeg;base64,YQ=='),
}));

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

const yogurt = line('Greek yogurt');
const shelf = [
  line('Rice'),
  line('Flour', { lowConfidence: true }),
  line('Mystery tin', { match: null }),
];
const receipt = [line('Eggs'), line('Butter')];

/** Puts a Scan in the Scan Session as the Scan screen would: queued, started and, unless told otherwise, read. */
const seed = (
  id: string,
  mode: ScanMode,
  lines: ProposedLine[] | 'reading',
  scanLanguage: 'en' | 'ro' | 'da' = 'en',
) =>
  act(() => {
    dispatchScanSession({
      type: 'enqueue',
      scan: {
        id,
        mode,
        scanLanguage,
        image: 'data:image/jpeg;base64,YQ==',
        thumbnail: 'data:image/jpeg;base64,YQ==',
      },
    });
    dispatchScanSession({ type: 'start' });
    if (lines !== 'reading') dispatchScanSession({ type: 'read', id, lines });
  });

/** Puts a failed Scan in the Scan Session: a photo Scan, or a Barcode card when `mode` is barcode. */
const seedFailed = (
  id: string,
  mode: CameraMode,
  errorCode?: string,
  errorParams?: Record<string, unknown>,
  scanLanguage: 'en' | 'ro' | 'da' = 'en',
) =>
  act(() => {
    dispatchScanSession({
      type: 'enqueue',
      scan: {
        id,
        mode,
        scanLanguage,
        ...(mode === 'barcode'
          ? { code: '5941234200017' }
          : { image: 'data:image/jpeg;base64,YQ==' }),
        thumbnail: 'data:image/jpeg;base64,YQ==',
      },
    });
    dispatchScanSession({ type: 'start' });
    dispatchScanSession({
      type: 'fail',
      id,
      reason: 'error',
      code: errorCode,
      params: errorParams,
    });
  });

function renderOverview(extra: Parameters<typeof stubApi>[0] = {}) {
  const { fetchMock, calls } = stubApi({
    ...extra,
    'GET /api/catalog/parents': () =>
      Response.json({ parents: [{ id: 'other-id', name: 'Other' }] }),
    'POST /api/pantry/batches/bulk': () => Response.json({ batches: [] }),
    'POST /api/scan/receipt/confirm': () =>
      Response.json({ batches: [], matchedShoppingItemIds: [] }),
  });
  vi.stubGlobal('fetch', fetchMock);
  const { queryClient } = renderWithProviders(
    <Routes>
      <Route path="/scan" element={<ScanPage />} />
      <Route path="/scan/review" element={<ReviewOverviewPage />} />
      <Route path="/scan/review/:scanId" element={<ReviewPage />} />
      <Route path="/pantry" element={<p>pantry screen</p>} />
    </Routes>,
    { route: '/scan/review' },
  );
  return Object.assign(calls, { queryClient });
}

const cards = () => screen.getAllByTestId('review-card');

describe('Review overview', () => {
  beforeEach(() => {
    resetReads();
    resetScanSession();
    localStorage.clear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('shows one card per Scan, in capture order, with its mode as the eyebrow', async () => {
    await seed('a', 'product', [yogurt]);
    await seed('b', 'ingredients', shelf);
    await seed('c', 'receipt', receipt);
    renderOverview();
    expect(cards()).toHaveLength(3);
    expect(cards().map((card) => card.textContent)).toEqual([
      expect.stringContaining('Product'),
      expect.stringContaining('Ingredients'),
      expect.stringContaining('Receipt'),
    ]);
  });

  it('words the result line per mode', async () => {
    await seed('a', 'product', [yogurt]);
    await seed('b', 'ingredients', shelf);
    await seed('c', 'receipt', receipt);
    renderOverview();
    const [product, ingredients, receiptCard] = cards().map((card) =>
      within(card).getByTestId('card-result'),
    );
    expect(product).toHaveTextContent('Greek yogurt');
    expect(ingredients).toHaveTextContent('3 items');
    expect(receiptCard).toHaveTextContent('2 items');
  });

  it('shows the items read as chips', async () => {
    await seed('b', 'ingredients', shelf);
    renderOverview();
    expect(
      within(cards()[0])
        .getAllByTestId('card-chip')
        .map((chip) => chip.textContent),
    ).toEqual(expect.arrayContaining(['Rice', 'Flour', 'Mystery tin']));
  });

  it('says "Check N items" for low-confidence and unmatched lines only', async () => {
    await seed('a', 'product', [yogurt]);
    await seed('b', 'ingredients', shelf);
    renderOverview();
    expect(within(cards()[0]).queryByText(/Check \d+ item/)).toBeNull();
    expect(within(cards()[1]).getByText('Check 2 items')).toBeInTheDocument();
  });

  it('says how many photos there are and whether any is still reading', async () => {
    await seed('a', 'product', [yogurt]);
    await seed('b', 'product', 'reading');
    renderOverview();
    expect(screen.getByText('2 photos · 1 still reading')).toBeInTheDocument();
  });

  it('says "all read" when nothing is reading', async () => {
    await seed('a', 'product', [yogurt]);
    await seed('b', 'product', [yogurt]);
    renderOverview();
    expect(screen.getByText('2 photos · all read')).toBeInTheDocument();
  });

  it('shows a Scan still being read as Gator reading it, with no remove button', async () => {
    vi.stubGlobal('fetch', () => new Promise<Response>(() => {}));
    await seed('a', 'product', 'reading');
    renderOverview();
    const card = cards()[0];
    expect(
      within(card).getByText("Gator's reading this one…"),
    ).toBeInTheDocument();
    expect(
      within(card).queryByRole('button', { name: /remove/i }),
    ).not.toBeInTheDocument();
    // The list-keeper Gator is decorative: the line beside it says what it does.
    const gator = card.querySelector('img[data-mood="list-keeper"]');
    expect(gator).not.toBeNull();
    expect(gator).toHaveAttribute('alt', '');
    expect(gator).toHaveAttribute('aria-hidden', 'true');
  });

  it('plays no Entrance on any card, and loops the reading one in its Signature', async () => {
    vi.stubGlobal('fetch', () => new Promise<Response>(() => {}));
    await seed('a', 'product', 'reading');
    await seed('b', 'product', 'reading');
    await seedFailed('c', 'product', 'internal');
    renderOverview();
    const gators = cards().flatMap((card) => [
      ...card.querySelectorAll('img[data-mood]'),
    ]);
    expect(gators).toHaveLength(3);
    expect(gators.map((g) => g.getAttribute('data-motion')).sort()).toEqual([
      'idle',
      'signature',
      'signature',
    ]);
  });

  it('shows the worried Gator, the reason and Retake on a card that failed', async () => {
    await seedFailed('a', 'product', 'internal');
    renderOverview();
    const card = cards()[0];
    expect(
      within(card).getByRole('img', { name: 'Gator, worried' }),
    ).toBeInTheDocument();
    expect(card).toHaveTextContent("Couldn't read, retake");
    expect(
      within(card).getByRole('button', { name: 'Retake' }),
    ).toBeInTheDocument();
  });

  describe('the all-read banner', () => {
    it('shows the happy Gator with the item and unsure counts once every card is read', async () => {
      await seed('a', 'product', [
        yogurt,
        line('Flour', { lowConfidence: true }),
      ]);
      await seed('b', 'product', [line('Mystery', { match: null }), yogurt]);
      renderOverview();
      const banner = screen.getByTestId('all-read-banner');
      expect(
        within(banner).getByRole('img', { name: 'Gator, happy' }),
      ).toBeInTheDocument();
      expect(banner).toHaveTextContent(
        "All read! 4 items.Check the 2 I wasn't sure about, then add them.",
      );
      expect(screen.getByRole('button', { name: 'Add all' })).toBeEnabled();
    });

    it('says there is nothing to check when every line is sure', async () => {
      await seed('a', 'product', [yogurt]);
      renderOverview();
      expect(screen.getByTestId('all-read-banner')).toHaveTextContent(
        "All read! 1 item.Nothing to check. Add it whenever you're ready.",
      );
    });

    it('is not there while a card is still being read, and Add all keeps waiting', async () => {
      vi.stubGlobal('fetch', () => new Promise<Response>(() => {}));
      await seed('a', 'product', [yogurt]);
      await seed('b', 'product', 'reading');
      renderOverview();
      expect(screen.queryByTestId('all-read-banner')).toBeNull();
      expect(
        screen.getByRole('button', { name: 'Add all (waiting on 1)' }),
      ).toBeDisabled();
    });

    it('is not there when a card failed', async () => {
      await seed('a', 'product', [yogurt]);
      await seedFailed('b', 'product', 'internal');
      renderOverview();
      expect(screen.queryByTestId('all-read-banner')).toBeNull();
    });
  });

  it('removes a card with its ×', async () => {
    await seed('a', 'product', [yogurt]);
    await seed('b', 'ingredients', shelf);
    renderOverview();
    await userEvent.click(
      within(cards()[0]).getByRole('button', { name: /remove/i }),
    );
    expect(cards()).toHaveLength(1);
    expect(within(cards()[0]).getByText('Ingredients')).toBeInTheDocument();
  });

  it('goes back to the camera with the Scan Session intact', async () => {
    await seed('a', 'product', [yogurt]);
    await seed('b', 'ingredients', shelf);
    renderOverview();
    await userEvent.click(screen.getByRole('link', { name: 'Camera' }));
    expect(screen.getByTestId('scan-guide')).toBeInTheDocument();
    expect(screen.getByTestId('stack-badge')).toHaveTextContent('2');
  });

  describe('opening a card', () => {
    it('opens the line editor for that Scan only', async () => {
      await seed('a', 'product', [yogurt]);
      await seed('b', 'ingredients', shelf);
      renderOverview();
      await userEvent.click(within(cards()[1]).getByTestId('card-result'));
      expect(
        screen.getByText('Scanned ingredients · 3 lines read'),
      ).toBeInTheDocument();
      expect(screen.queryByTestId('review-overview')).not.toBeInTheDocument();
    });

    it('saves only that card through the bulk endpoint, in its Scan Language, and removes it', async () => {
      await seed('a', 'product', [yogurt], 'ro');
      await seed('b', 'ingredients', [line('Rice')], 'da');
      const calls = renderOverview();
      await userEvent.click(within(cards()[1]).getByTestId('card-result'));
      await userEvent.click(
        await screen.findByRole('button', { name: 'Save 1 item' }),
      );
      await waitFor(() =>
        expect(screen.getByTestId('review-overview')).toBeInTheDocument(),
      );
      const saves = calls.filter(
        (c) => c.key === 'POST /api/pantry/batches/bulk',
      );
      expect(saves).toHaveLength(1);
      expect(new URLSearchParams(saves[0].search).get('scanLanguage')).toBe(
        'da',
      );
      expect((saves[0].body as { batches: unknown[] }).batches).toHaveLength(1);
      expect(cards()).toHaveLength(1);
      expect(within(cards()[0]).getByText('Product')).toBeInTheDocument();
    });

    it('saves a Receipt card through the receipt confirm endpoint', async () => {
      await seed('a', 'product', [yogurt]);
      await seed('b', 'receipt', receipt);
      const calls = renderOverview();
      await userEvent.click(within(cards()[1]).getByTestId('card-result'));
      await userEvent.click(
        await screen.findByRole('button', { name: 'Save 2 items' }),
      );
      await waitFor(() =>
        expect(screen.getByTestId('review-overview')).toBeInTheDocument(),
      );
      expect(
        calls.filter((c) => c.key === 'POST /api/scan/receipt/confirm'),
      ).toHaveLength(1);
      expect(
        calls.filter((c) => c.key === 'POST /api/pantry/batches/bulk'),
      ).toHaveLength(0);
      expect(cards()).toHaveLength(1);
    });
  });

  describe('merging receipt cards', () => {
    it('offers Merge with previous only on a receipt card below another receipt card', async () => {
      await seed('a', 'receipt', receipt);
      await seed('b', 'receipt', [line('Jam')]);
      await seed('c', 'product', [yogurt]);
      renderOverview();
      const merge = /merge with previous/i;
      expect(
        within(cards()[0]).queryByRole('button', { name: merge }),
      ).toBeNull();
      expect(
        within(cards()[1]).getByRole('button', { name: merge }),
      ).toBeInTheDocument();
      expect(
        within(cards()[2]).queryByRole('button', { name: merge }),
      ).toBeNull();
    });

    it('does not offer it while a receipt is still reading', async () => {
      await seed('a', 'receipt', receipt);
      await seed('b', 'receipt', 'reading');
      renderOverview();
      expect(
        screen.queryByRole('button', { name: /merge with previous/i }),
      ).toBeNull();
    });

    it('joins the cards into one with the lines of both, and Split undoes it', async () => {
      await seed('a', 'receipt', receipt);
      await seed('b', 'receipt', [line('Jam')]);
      renderOverview();
      await userEvent.click(
        within(cards()[1]).getByRole('button', {
          name: /merge with previous/i,
        }),
      );
      expect(cards()).toHaveLength(1);
      expect(within(cards()[0]).getByTestId('card-result')).toHaveTextContent(
        '3 items',
      );
      await userEvent.click(
        within(cards()[0]).getByRole('button', { name: 'Split' }),
      );
      expect(cards()).toHaveLength(2);
      expect(within(cards()[0]).getByTestId('card-result')).toHaveTextContent(
        '2 items',
      );
      expect(within(cards()[1]).getByTestId('card-result')).toHaveTextContent(
        '1 item',
      );
    });

    it('confirms a merged receipt as one Receipt Scan', async () => {
      await seed('a', 'receipt', receipt);
      await seed('b', 'receipt', [line('Jam')]);
      const calls = renderOverview();
      await userEvent.click(
        within(cards()[1]).getByRole('button', {
          name: /merge with previous/i,
        }),
      );
      await userEvent.click(within(cards()[0]).getByTestId('card-result'));
      await userEvent.click(
        await screen.findByRole('button', { name: 'Save 3 items' }),
      );
      // It was the only card, so saving it lands on the Pantry.
      expect(await screen.findByText('pantry screen')).toBeInTheDocument();
      const confirms = calls.filter(
        (c) => c.key === 'POST /api/scan/receipt/confirm',
      );
      expect(confirms).toHaveLength(1);
      expect((confirms[0].body as { batches: unknown[] }).batches).toHaveLength(
        3,
      );
    });
  });

  describe('retrying from the card', () => {
    const readAgain = { name: 'Read again' };
    const lookUpAgain = { name: 'Look up again' };

    it('reads a failed photo again, from the same photo, when a retry can change the error', async () => {
      await seedFailed('a', 'product', 'internal');
      const calls = renderOverview({
        'POST /api/scan/product': () => Response.json({ lines: [yogurt] }),
      });
      const card = cards()[0];
      expect(card).toHaveTextContent("Couldn't read, retake");
      await userEvent.click(within(card).getByRole('button', readAgain));
      await waitFor(() =>
        expect(within(cards()[0]).getByTestId('card-result')).toHaveTextContent(
          'Greek yogurt',
        ),
      );
      const reads = calls.filter((c) => c.key === 'POST /api/scan/product');
      expect(reads).toHaveLength(1);
      expect(reads[0].body).toEqual({
        productImage: 'data:image/jpeg;base64,YQ==',
      });
      // Still on Review, same card.
      expect(screen.queryByTestId('scan-guide')).toBeNull();
      expect(cards()).toHaveLength(1);
    });

    it("reads again in the Scan Language the Scan was taken in, not the Member's preference", async () => {
      await seedFailed('a', 'product', 'internal', undefined, 'ro');
      const calls = renderOverview({
        ...scanLanguagePreference('da'),
        'POST /api/scan/product': () => Response.json({ lines: [yogurt] }),
      });
      await userEvent.click(within(cards()[0]).getByRole('button', readAgain));
      await waitFor(() =>
        expect(
          calls.find((c) => c.key === 'POST /api/scan/product')?.search,
        ).toContain('scanLanguage=ro'),
      );
    });

    it('keeps the focus on the card while the photo is read again', async () => {
      await seedFailed('a', 'product', 'internal');
      renderOverview({
        'POST /api/scan/product': () => Response.json({ lines: [yogurt] }),
      });
      await userEvent.click(within(cards()[0]).getByRole('button', readAgain));
      await waitFor(() => expect(cards()[0]).toHaveFocus());
    });

    it('offers Read again next to Retake, and Retake still goes back to the camera', async () => {
      await seedFailed('a', 'ingredients', 'network_error');
      renderOverview();
      const card = cards()[0];
      expect(within(card).getByRole('button', readAgain)).toBeInTheDocument();
      await userEvent.click(
        within(card).getByRole('button', { name: 'Retake' }),
      );
      expect(await screen.findByTestId('scan-guide')).toBeInTheDocument();
    });

    it.each([
      'scan.too_many_items',
      'scan.image_too_large',
      'scan.image_invalid',
      'scan.nothing_found',
    ])(
      'gives a photo failing with %s its reason and only Retake and Remove',
      async (code) => {
        await seedFailed('a', 'receipt', code, { max: 50 });
        renderOverview();
        const card = cards()[0];
        expect(card).toHaveTextContent("Couldn't read, retake");
        expect(
          within(card).queryByRole('button', readAgain),
        ).not.toBeInTheDocument();
        expect(
          within(card).queryByRole('button', lookUpAgain),
        ).not.toBeInTheDocument();
        expect(
          within(card)
            .getAllByRole('button')
            .map((button) => button.textContent || button.ariaLabel),
        ).toEqual(['Retake', 'Remove photo']);
      },
    );

    it.each(['barcode.rate_limited', 'network_error'])(
      'looks a failed Barcode card up again (%s) and stays on Review',
      async (code) => {
        await seedFailed('b', 'barcode', code);
        const calls = renderOverview({
          'GET /api/barcode-lookup/5941234200017': () =>
            Response.json({ found: false, code: '5941234200017' }),
        });
        const card = cards()[0];
        expect(
          within(card).queryByRole('button', readAgain),
        ).not.toBeInTheDocument();
        await userEvent.click(within(card).getByRole('button', lookUpAgain));
        await waitFor(() =>
          expect(
            calls.filter(
              (c) => c.key === 'GET /api/barcode-lookup/5941234200017',
            ),
          ).toHaveLength(1),
        );
        expect(screen.queryByTestId('scan-guide')).toBeNull();
        expect(cards()).toHaveLength(1);
      },
    );

    it('offers no retry on a Barcode card whose error a retry cannot change', async () => {
      await seedFailed('b', 'barcode', 'scan.image_invalid');
      renderOverview();
      expect(
        within(cards()[0]).queryByRole('button', lookUpAgain),
      ).not.toBeInTheDocument();
      expect(
        within(cards()[0]).getByRole('button', { name: 'Remove' }),
      ).toBeInTheDocument();
    });

    it('shows neither retry on a card that was read', async () => {
      await seed('a', 'product', [yogurt]);
      renderOverview();
      expect(
        screen.queryByRole('button', { name: /again/ }),
      ).not.toBeInTheDocument();
    });
  });

  describe('end-of-list actions', () => {
    const addFromPhotos = () => screen.getByTestId('review-photos-input');
    const files = (count: number) =>
      Array.from(
        { length: count },
        (_, i) => new File(['x'], `photo${i}.jpg`, { type: 'image/jpeg' }),
      );
    const pick = (count: number) =>
      act(async () => {
        fireEvent.change(addFromPhotos(), { target: { files: files(count) } });
      });
    const later = {
      'POST /api/scan/product': () => new Promise<Response>(() => {}),
    };

    it('shows Take more and Add from photos after the last card, and not on an empty overview', async () => {
      renderOverview();
      expect(
        screen.queryByRole('button', { name: 'Take more' }),
      ).not.toBeInTheDocument();
      await seed('a', 'product', [yogurt]);
      expect(
        screen.getByRole('button', { name: 'Take more' }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Add from photos' }),
      ).toBeInTheDocument();
    });

    it('also shows them while every card is still reading or has failed', async () => {
      await seedFailed('a', 'product', 'scan.nothing_found');
      renderOverview();
      expect(
        screen.getByRole('button', { name: 'Take more' }),
      ).toBeInTheDocument();
    });

    it('opens the camera with every card still in the Scan Session on Take more', async () => {
      await seed('a', 'product', [yogurt]);
      await seed('b', 'ingredients', shelf);
      renderOverview();
      await userEvent.click(screen.getByRole('button', { name: 'Take more' }));
      expect(await screen.findByTestId('scan-guide')).toBeInTheDocument();
      expect(screen.getByTestId('stack-badge')).toHaveTextContent('2');
    });

    it('keeps the header Camera link', async () => {
      await seed('a', 'product', [yogurt]);
      renderOverview();
      expect(screen.getByRole('link', { name: 'Camera' })).toBeInTheDocument();
    });

    it('opens a file picker for several images from Add from photos', async () => {
      await seed('a', 'product', [yogurt]);
      renderOverview();
      const input = addFromPhotos() as HTMLInputElement;
      expect(input.type).toBe('file');
      expect(input.multiple).toBe(true);
      expect(input.accept).toBe('image/*');
      const click = vi.spyOn(input, 'click');
      await userEvent.click(
        screen.getByRole('button', { name: 'Add from photos' }),
      );
      expect(click).toHaveBeenCalled();
    });

    it('adds one card per file at the end, reading, with the Member still on Review', async () => {
      saveScanPageMode('product');
      await seed('a', 'product', [yogurt]);
      renderOverview(later);
      await pick(2);
      await waitFor(() => expect(cards()).toHaveLength(3));
      expect(cards()[0]).toHaveTextContent('Greek yogurt');
      for (const card of cards().slice(1)) {
        expect(
          within(card).getByText("Gator's reading this one…"),
        ).toBeInTheDocument();
      }
      expect(screen.getByTestId('review-overview')).toBeInTheDocument();
      expect(screen.queryByTestId('scan-guide')).toBeNull();
    });

    it.each<[CameraMode | null, string]>([
      ['ingredients', 'Ingredients'],
      ['plate', 'Plate'],
      ['product', 'Product'],
      ['barcode', 'Product'],
    ])(
      'reads the added files in the last-used camera mode (%s) as %s',
      async (last, label) => {
        if (last) saveScanPageMode(last);
        await seed('a', 'receipt', receipt);
        renderOverview({
          'POST /api/scan/ingredients': () => new Promise<Response>(() => {}),
          'POST /api/scan/plate': () => new Promise<Response>(() => {}),
          ...later,
        });
        await pick(1);
        await waitFor(() => expect(cards()).toHaveLength(2));
        expect(cards()[1]).toHaveTextContent(label);
      },
    );

    it('reads the added files in the Scan Language, and a Plate Scan in none', async () => {
      saveScanPageMode('product');
      await seed('a', 'receipt', receipt);
      const calls = renderOverview({
        ...later,
        ...scanLanguagePreference('ro'),
      });
      // The Review page shows nothing of the Preference, so wait for it to be in the cache before the files are added.
      await waitFor(() =>
        expect(
          calls.queryClient.getQueryData(preferencesQueryKey),
        ).toBeDefined(),
      );
      await pick(1);
      await waitFor(() => expect(cards()).toHaveLength(2));
      await waitFor(() =>
        expect(
          calls.find((c) => c.key === 'POST /api/scan/product')?.search,
        ).toContain('scanLanguage=ro'),
      );
    });

    it('lets a receipt added from Review wait to be cropped', async () => {
      saveScanPageMode('receipt');
      await seed('a', 'product', [yogurt]);
      renderOverview();
      await pick(1);
      await waitFor(() => expect(cards()).toHaveLength(2));
      expect(
        within(cards()[1]).getByRole('button', { name: 'Crop receipt photo' }),
      ).toBeInTheDocument();
    });

    it('refuses the files over the 20-card limit with the usual message', async () => {
      saveScanPageMode('receipt');
      for (let i = 0; i < 19; i += 1) await seed(`s${i}`, 'product', [yogurt]);
      renderOverview();
      await pick(3);
      await waitFor(() => expect(cards()).toHaveLength(20));
      expect(await screen.findByRole('status')).toHaveTextContent(
        /A Scan Session holds at most 20 Scans and Barcode Lookups in total\. Add or discard these first\./,
      );
    });
  });
});

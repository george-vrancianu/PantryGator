import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CatalogSearchResult } from '@/lib/catalog';
import type { ProposedLine } from '@/lib/scan';
import { renderWithProviders, stubApi } from '@/test/render';
import { REVIEW_ROUTE, startReview } from '@/test/review';
import { ReviewPage } from './ReviewPage';

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

const milkLine: ProposedLine = {
  name: 'Milk',
  match: milk,
  lowConfidence: false,
  quantity: 2,
  unit: 'l',
  expiryDate: null,
  sourceText: 'LAPTE UHT 1L',
  productDescription: 'Lapte UHT',
};

const bagLine: ProposedLine = {
  name: 'SACOSA BIO',
  match: null,
  lowConfidence: false,
  quantity: null,
  unit: null,
  expiryDate: null,
  sourceText: 'SACOSA BIO',
  productDescription: null,
  excluded: { reason: 'other' },
};

function renderReceiptReview(
  lines: ProposedLine[],
  extra = {},
  scanLanguage?: 'en' | 'ro' | 'da',
) {
  startReview({ mode: 'receipt', lines, scanLanguage });
  const { fetchMock, calls } = stubApi({
    'GET /api/catalog/parents': () =>
      Response.json({ parents: [{ id: 'other-id', name: 'Other' }] }),
    'POST /api/scan/receipt/confirm': () =>
      Response.json({ batches: [], matchedShoppingItemIds: [] }),
    ...extra,
  });
  vi.stubGlobal('fetch', fetchMock);
  renderWithProviders(
    <Routes>
      <Route path="/scan/review/:scanId" element={<ReviewPage />} />
      <Route path="/pantry" element={<p>pantry screen</p>} />
    </Routes>,
    { route: REVIEW_ROUTE },
  );
  return calls;
}

describe('Receipt Review', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows excluded lines collapsed, with their reason, apart from the lines to save', async () => {
    renderReceiptReview([milkLine, bagLine]);
    expect(
      screen.getByText('Scanned receipt · 2 lines read'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Milk/, expanded: false }),
    ).toBeInTheDocument();
    const excluded = screen.getByRole('button', { name: /Excluded · 1/ });
    expect(excluded).toHaveAttribute('aria-expanded', 'false');
    expect(excluded).toHaveTextContent('Non-food or unreadable lines');
    expect(screen.queryByText('SACOSA BIO')).not.toBeInTheDocument();
    await userEvent.click(excluded);
    expect(excluded).toHaveAttribute('aria-expanded', 'true');
    expect(excluded).toHaveTextContent('Hide');
    expect(screen.getByText('SACOSA BIO')).toBeInTheDocument();
    expect(screen.getByText('Not for the Pantry')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save 1 item' })).toBeEnabled();
  });

  it('shows what the receipt said under the line name', () => {
    renderReceiptReview([milkLine]);
    expect(screen.getByText('On receipt: LAPTE UHT 1L')).toBeInTheDocument();
  });

  it('says why in the Member language, from the reason code', async () => {
    renderReceiptReview([
      milkLine,
      { ...bagLine, excluded: { reason: 'deposit' } },
    ]);
    await userEvent.click(screen.getByRole('button', { name: /Excluded · 1/ }));
    expect(screen.getByText('A deposit')).toBeInTheDocument();
  });

  it('moves focus to the line when an excluded line is added back', async () => {
    renderReceiptReview([milkLine, bagLine]);
    await userEvent.click(screen.getByRole('button', { name: /Excluded · 1/ }));
    await userEvent.click(
      screen.getByRole('button', { name: 'Add SACOSA BIO back' }),
    );
    expect(
      screen.getByRole('button', { name: /SACOSA BIO/, expanded: false }),
    ).toHaveFocus();
  });

  it('says so and blocks Save when more than 50 entries would be saved', () => {
    const many = Array.from({ length: 51 }, (_, i) => ({
      ...milkLine,
      name: `Milk ${i}`,
    }));
    renderReceiptReview(many);
    // Text queries: role queries are slow across 51 cards.
    expect(
      screen.getByText(
        'You can save up to 50 items at once. Remove 1 to continue.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Save 51 items').closest('button')).toBeDisabled();
  });

  it('sends source receipt on Unmatched Batches only', async () => {
    const calls = renderReceiptReview([
      milkLine,
      { ...bagLine, excluded: undefined },
    ]);
    await userEvent.click(screen.getByRole('button', { name: 'Save 2 items' }));
    await screen.findByText('pantry screen');
    const body = calls.find((c) => c.key === 'POST /api/scan/receipt/confirm')
      ?.body as { batches: { source?: string }[] };
    expect(body.batches[0].source).toBeUndefined();
    expect(body.batches[1].source).toBe('receipt');
  });

  it('confirms in the Scan Language of the receipt, with the printed text of Unmatched lines', async () => {
    const calls = renderReceiptReview(
      [milkLine, { ...bagLine, excluded: undefined, sourceText: 'POSE' }],
      {},
      'da',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save 2 items' }));
    await screen.findByText('pantry screen');
    const confirm = calls.find(
      (c) => c.key === 'POST /api/scan/receipt/confirm',
    );
    expect(new URLSearchParams(confirm?.search).get('scanLanguage')).toBe('da');
    const { batches } = (confirm?.body ?? {}) as { batches: object[] };
    expect(batches[0]).not.toHaveProperty('sourceText');
    expect(batches[1]).toMatchObject({
      rawName: 'SACOSA BIO',
      sourceText: 'POSE',
    });
  });

  it('adds an excluded line back as an editable Unmatched line that is then saved', async () => {
    const calls = renderReceiptReview([milkLine, bagLine]);
    await userEvent.click(screen.getByRole('button', { name: /Excluded · 1/ }));
    await userEvent.click(
      screen.getByRole('button', { name: 'Add SACOSA BIO back' }),
    );
    expect(
      screen.queryByRole('button', { name: /Excluded/ }),
    ).not.toBeInTheDocument();
    // Added back, the line is listed to check but nothing opens by itself.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /SACOSA BIO/ }));
    const panel = await screen.findByRole('dialog', { name: 'SACOSA BIO' });
    expect(within(panel).getByRole('note')).toHaveTextContent(/No match/);
    await userEvent.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: 'Save 2 items' })).toBeEnabled();

    await userEvent.click(screen.getByRole('button', { name: 'Save 2 items' }));
    await screen.findByText('pantry screen');
    const body = calls.find((c) => c.key === 'POST /api/scan/receipt/confirm')
      ?.body as { batches: object[] };
    expect(body.batches).toHaveLength(2);
    expect(body.batches[1]).toMatchObject({ rawName: 'SACOSA BIO' });
  });

  it('lists a removed line under Excluded, saves without it, and can add it back', async () => {
    const calls = renderReceiptReview([
      milkLine,
      { ...milkLine, name: 'Milk 2' },
    ]);
    await userEvent.click(
      screen.getAllByRole('button', { name: /Milk/, expanded: false })[0],
    );
    // Both lines match Milk, so each is named by its position.
    await userEvent.click(
      screen.getByRole('button', { name: 'Remove Milk (1 of 2)' }),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: /Excluded · 1/ }),
    );
    expect(screen.getByText('Removed by you')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save 1 item' }));
    await screen.findByText('pantry screen');
    const body = calls.find((c) => c.key === 'POST /api/scan/receipt/confirm')
      ?.body as { batches: object[] };
    expect(body.batches).toHaveLength(1);
  });

  it('does not save excluded lines', async () => {
    const calls = renderReceiptReview([milkLine, bagLine]);
    await userEvent.click(screen.getByRole('button', { name: 'Save 1 item' }));
    await screen.findByText('pantry screen');
    const body = calls.find((c) => c.key === 'POST /api/scan/receipt/confirm')
      ?.body as { batches: object[] };
    expect(body.batches).toEqual([
      expect.objectContaining({
        ingredientId: 'milk-id',
        quantity: 2,
        unit: 'l',
      }),
    ]);
    expect(calls.map((c) => c.key)).not.toContain(
      'POST /api/pantry/batches/bulk',
    );
  });

  it('ticks the Shopping Items the confirmation says matched', async () => {
    const calls = renderReceiptReview([milkLine], {
      'POST /api/scan/receipt/confirm': () =>
        Response.json({
          batches: [],
          matchedShoppingItemIds: ['item-1', 'item-2'],
        }),
      'PATCH /api/shopping-list/items/item-1': () => Response.json({}),
      'PATCH /api/shopping-list/items/item-2': () => Response.json({}),
    });
    await userEvent.click(screen.getByRole('button', { name: 'Save 1 item' }));
    await screen.findByText('pantry screen');
    const patches = calls.filter((c) => c.key.startsWith('PATCH '));
    expect(patches.map((c) => c.key).sort()).toEqual([
      'PATCH /api/shopping-list/items/item-1',
      'PATCH /api/shopping-list/items/item-2',
    ]);
    expect(patches.every((c) => (c.body as { checked: boolean }).checked)).toBe(
      true,
    );
  });

  it('saves, then says a removed Shopping Item was not ticked, without blocking', async () => {
    renderReceiptReview([milkLine], {
      'POST /api/scan/receipt/confirm': () =>
        Response.json({ batches: [], matchedShoppingItemIds: ['item-1'] }),
      'PATCH /api/shopping-list/items/item-1': () =>
        Response.json({ code: 'shopping.item_not_found' }, { status: 404 }),
    });
    await userEvent.click(screen.getByRole('button', { name: 'Save 1 item' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '1 Shopping Item was removed from your list before we could tick it off.',
    );
    expect(
      screen.getByRole('heading', { name: 'Saved to your Pantry' }),
    ).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: 'Go to Pantry' }));
    expect(await screen.findByText('pantry screen')).toBeInTheDocument();
  });

  it('says the list changed when a tick gets 409 shopping.list_changed', async () => {
    renderReceiptReview([milkLine], {
      'POST /api/scan/receipt/confirm': () =>
        Response.json({
          batches: [],
          matchedShoppingItemIds: ['item-1', 'item-2'],
        }),
      'PATCH /api/shopping-list/items/item-1': () =>
        Response.json({ code: 'shopping.list_changed' }, { status: 409 }),
      'PATCH /api/shopping-list/items/item-2': () =>
        Response.json({ code: 'shopping.list_changed' }, { status: 409 }),
    });
    await userEvent.click(screen.getByRole('button', { name: 'Save 1 item' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The Shopping List changed, so 2 Shopping Items were not ticked off.',
    );
  });

  it('with only excluded lines there is nothing to save', () => {
    renderReceiptReview([bagLine]);
    expect(
      screen.getByRole('button', { name: /Excluded · 1/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save 0 items' })).toBeDisabled();
  });
});

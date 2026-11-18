import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CatalogSearchResult } from '@/lib/catalog';
import { renderWithProviders, stubApi } from '@/test/render';
import { emitBarcode, fakeCamera } from '@/test/scan';
import { PantryPage } from './PantryPage';

vi.mock('@/lib/camera', async () =>
  (await import('@/test/scan')).fakeCameraModule(),
);
vi.mock('@/lib/image', () => ({
  resizeImage: () => Promise.resolve('data:image/jpeg;base64,AAAA'),
}));

// A shelf "+" presets its Location for every pick until the sheet closes, camera picks included.

const CODE = '5941234567899';

const catalogItem = (id: string, name: string) =>
  ({
    owner: 'catalog',
    amountScale: 'medium',
    id,
    name,
    defaultUnit: 'g',
    leafCategory: { id: 'leaf', name: 'Leaf' },
    parentCategory: {
      id: 'dairy',
      name: 'Dairy',
      aisle: { id: 'aisle', name: 'Dairy & eggs' },
    },
    defaults: { expiryDays: 10, location: 'fridge' },
  }) satisfies CatalogSearchResult;

const yogurt = catalogItem('yogurt-id', 'Yogurt');
const rice = catalogItem('rice-id', 'Rice');

function stub() {
  const { fetchMock, calls } = stubApi({
    'GET /api/pantry': () => Response.json({ batches: [], runningLow: [] }),
    'GET /api/staples': () => Response.json({ staples: [] }),
    'GET /api/settings/family': () =>
      Response.json({ staleThresholdDays: 3, expiryOverrides: [] }),
    'GET /api/shopping-list': () =>
      Response.json({
        id: 'l1',
        groups: [],
        summary: { remaining: 0, checked: 0 },
      }),
    'GET /api/catalog/search': () => Response.json({ results: [yogurt, rice] }),
    'GET /api/pantry/recently-stocked': () =>
      Response.json({ ingredients: [] }),
    [`GET /api/barcode-lookup/${CODE}`]: () =>
      Response.json({
        allergens: [],
        missingAllergens: [],
        found: true,
        source: 'open_food_facts',
        match: yogurt,
        lowConfidence: false,
        productDescription: 'Greek yogurt',
        quantity: 400,
        unit: 'g',
      }),
    'POST /api/pantry/batches': () =>
      Response.json(
        {
          id: 'b1',
          name: 'Yogurt',
          ingredientId: 'yogurt-id',
          unmatched: false,
          aisle: null,
          amountScale: null,
          defaultUnit: null,
          defaultExpiryDays: null,
          quantity: 400,
          unit: 'g',
          location: 'freezer',
          expiryDate: null,
          productDescription: null,
          createdAt: '2026-10-01T00:00:00Z',
        },
        { status: 201 },
      ),
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

const posts = (calls: ReturnType<typeof stub>) =>
  calls.filter((call) => call.key === 'POST /api/pantry/batches');

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('a shelf "+" preset', () => {
  it('holds for a camera pick, and for a second pick after a save in the same visit', async () => {
    const calls = stub();
    const user = userEvent.setup();
    renderWithProviders(<PantryPage />);
    await user.click(
      await screen.findByRole('button', { name: 'Add to Freezer' }),
    );
    const sheet = within(
      await screen.findByRole('dialog', { name: 'Add to Pantry' }),
    );

    // A camera pick whose Catalog default is the Fridge.
    await user.click(sheet.getByRole('button', { name: 'Scan barcode' }));
    await waitFor(() => expect(fakeCamera.emit).not.toBeNull());
    act(() => emitBarcode(CODE));
    fireEvent.click(await screen.findByRole('button', { name: 'Use this' }));
    expect(
      await sheet.findByRole('button', { name: /Freezer/, pressed: true }),
    ).toBeInTheDocument();
    await user.click(sheet.getByRole('button', { name: /^Add (?!to )/ }));
    await waitFor(() => expect(posts(calls)).toHaveLength(1));
    expect(posts(calls)[0].body).toMatchObject({ location: 'freezer' });

    // A second, typed pick in the same visit.
    await user.type(
      await sheet.findByRole('combobox', { name: 'Search ingredients' }),
      'rice',
    );
    await user.click(await sheet.findByRole('option', { name: /Rice/ }));
    expect(
      await sheet.findByRole('button', { name: /Freezer/, pressed: true }),
    ).toBeInTheDocument();
    await user.click(sheet.getByRole('button', { name: /^Add (?!to )/ }));
    await waitFor(() => expect(posts(calls)).toHaveLength(2));
    expect(posts(calls)[1].body).toMatchObject({ location: 'freezer' });
  });
});

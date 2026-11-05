import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, stubApi } from '../../test/render';
import { PantryPage } from './PantryPage';

const milk = {
  id: 'milk-id',
  name: 'Milk',
  owner: 'catalog',
  defaultUnit: 'l',
  amountScale: 'medium',
  defaults: { expiryDays: 7, location: 'fridge' },
  leafCategory: { id: 'leaf', name: 'Milk and cream' },
  parentCategory: {
    id: 'parent',
    name: 'Dairy',
    aisle: { id: 'aisle', name: 'Dairy' },
  },
};
const rice = {
  ...milk,
  id: 'rice-id',
  name: 'Rice',
  defaultUnit: 'g',
  defaults: { expiryDays: 365, location: null },
};

function stub(recent: unknown[]) {
  const { fetchMock, calls } = stubApi({
    'GET /api/pantry': () => Response.json({ batches: [], runningLow: [] }),
    'GET /api/staples': () => Response.json({ staples: [] }),
    'GET /api/settings/family': () =>
      Response.json({ staleThresholdDays: 3, expiryOverrides: [] }),
    'GET /api/catalog/search': () => Response.json({ results: [] }),
    'GET /api/catalog/aisles': () => Response.json({ aisles: [] }),
    'GET /api/pantry/recently-stocked': () =>
      Response.json({ ingredients: recent }),
    'GET /api/catalog/popular-to-start': () =>
      Response.json({ ingredients: [milk, rice] }),
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

async function openSheet() {
  const user = userEvent.setup();
  renderWithProviders(<PantryPage />);
  await user.click(await screen.findByRole('button', { name: 'Add batch' }));
  return user;
}

/** On a phone the sheet opens without the keyboard: the Member taps the search to see its tiles. */
async function openSheetAndTapSearch() {
  const user = await openSheet();
  await user.click(
    await screen.findByRole('combobox', { name: 'Search ingredients' }),
  );
  return user;
}

describe('the Add to Pantry sheet before a pick', () => {
  beforeEach(() => localStorage.clear());

  it('offers the camera on Product and on Barcode, and the new placeholder', async () => {
    stub([]);
    await openSheet();
    const row = screen.getByRole('group', { name: 'Add quickly' });
    expect(within(row).getAllByRole('button')).toHaveLength(2);
    expect(
      screen.getByPlaceholderText('Or type it, e.g. milk'),
    ).toBeInTheDocument();
  });

  it('shows Popular to start with amount and Location when nothing was stocked', async () => {
    stub([]);
    const user = await openSheetAndTapSearch();
    const tile = await screen.findByRole('button', {
      name: 'Milk, 0.5 L · Fridge',
    });
    expect(
      screen.getByRole('button', { name: 'Rice, 500 g · Cupboard' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Recently stocked')).not.toBeInTheDocument();
    await user.click(tile);
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Change ingredient' }),
      ).toBeInTheDocument(),
    );
  });

  it('shows Recently Stocked, not Popular to start, when the Family has stocked something', async () => {
    const calls = stub([
      { ...milk, lastStockedAt: new Date().toISOString(), inPantry: true },
    ]);
    await openSheetAndTapSearch();
    expect(await screen.findByText('Recently stocked')).toBeInTheDocument();
    expect(screen.queryByText('Popular to start')).not.toBeInTheDocument();
    expect(calls.some((call) => call.key.includes('popular-to-start'))).toBe(
      false,
    );
  });
});

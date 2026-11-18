import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatalogSearchResult } from '@/lib/catalog';
import type { ShoppingList } from '@/lib/shopping';
import { renderWithProviders, stubApi } from '@/test/render';
import { ShoppingPage } from './ShoppingPage';

const dairy = { id: 'a4', name: 'Dairy & eggs', sortOrder: 4 };
const produce = { id: 'a1', name: 'Fruit & veg', sortOrder: 1 };

const milkResult: CatalogSearchResult = {
  owner: 'catalog',
  amountScale: 'medium',
  id: 'milk-id',
  name: 'Milk',
  defaultUnit: 'l',
  leafCategory: { id: 'm', name: 'Milk' },
  parentCategory: {
    id: 'd',
    name: 'Dairy',
    aisle: { id: 'a4', name: 'Dairy & eggs' },
  },
  defaults: { expiryDays: 7, location: 'fridge' },
};

/** A Suggestion as the API now sends it: `since` is a YYYY-MM-DD expiry date, an ISO timestamp (Used Up) or null (Staple). */
const gone = (
  name: string,
  since: string | null,
  aisle: typeof dairy | null = dairy,
  amount: { quantity: number; unit: 'l' | 'pcs' } | null = null,
) => ({
  ingredientId: `${name.toLowerCase()}-id`,
  name,
  quantity: amount?.quantity ?? null,
  unit: amount?.unit ?? null,
  aisle,
  since,
  ingredient: { ...milkResult, id: `${name.toLowerCase()}-id`, name },
});

/** Local-time timestamps, so the expected "Nd ago" does not depend on the machine's timezone. */
const localStamp = (day: number, hour: number) =>
  new Date(2026, 9, day, hour).toISOString();

const emptyList: ShoppingList = {
  id: 'l1',
  groups: [],
  summary: { remaining: 0, checked: 0 },
};

type Groups = {
  staples?: ReturnType<typeof gone>[];
  usedUp?: ReturnType<typeof gone>[];
  expired?: ReturnType<typeof gone>[];
};

function stubShopping(
  groups: Groups,
  extra: Record<string, () => Response> = {},
) {
  const { fetchMock, calls } = stubApi({
    'GET /api/shopping-list': () => Response.json(emptyList),
    'GET /api/shopping-list/suggestions': () =>
      Response.json({ staples: [], usedUp: [], expired: [], ...groups }),
    'GET /api/catalog/search': () => Response.json({ results: [milkResult] }),
    ...extra,
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

async function openSheet() {
  await userEvent.click(
    await screen.findByRole('button', { name: 'Add items' }),
  );
  return screen.findByRole('dialog', { name: 'Add items' });
}

/** The tiles in grid order. */
const tileNames = (dialog: HTMLElement) =>
  within(within(dialog).getByRole('region', { name: 'Gone from your Pantry' }))
    .getAllByRole('button')
    .filter((tile) => !tile.getAttribute('aria-label')?.startsWith('Dismiss '))
    .map((tile) => tile.getAttribute('aria-label') ?? tile.textContent);

describe('Gone from your Pantry (Shopping add sheet)', () => {
  beforeEach(() => {
    // Only the clock is faked, so timers and promises stay real. "Today" is 14 October 2026, local time.
    vi.useFakeTimers({
      toFake: ['Date'],
      now: new Date(2026, 9, 14, 12, 0, 0),
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('shows a Gone from your Pantry section with the number of tiles', async () => {
    stubShopping({
      expired: [gone('Spinach', '2026-10-13')],
      usedUp: [gone('Eggs', localStamp(12, 12))],
      staples: [gone('Flour', null)],
    });
    renderWithProviders(<ShoppingPage />);

    const dialog = await openSheet();

    const section = await within(dialog).findByRole('region', {
      name: 'Gone from your Pantry',
    });
    expect(
      within(section).getByRole('heading', { name: /Gone from your Pantry/ }),
    ).toBeVisible();
    expect(within(section).getByText('3')).toBeVisible();
    expect(tileNames(dialog)).toHaveLength(3);
  });

  it('orders expired (most recent first), then Used Up (most recent first), then missing Staples by name', async () => {
    stubShopping({
      // The API sends each group in Aisle order, so the client has to sort.
      staples: [gone('Flour', null), gone('Apple', null, produce)],
      usedUp: [
        gone('Eggs', localStamp(12, 12)),
        gone('Butter', localStamp(14, 8)),
      ],
      expired: [
        gone('Yogurt', '2026-10-10'),
        gone('Spinach', '2026-10-13', produce),
      ],
    });
    renderWithProviders(<ShoppingPage />);

    const dialog = await openSheet();
    await within(dialog).findByRole('region', {
      name: 'Gone from your Pantry',
    });

    expect(tileNames(dialog)).toEqual([
      'Spinach, expired 1d ago',
      'Yogurt, expired 4d ago',
      'Butter, used up today',
      'Eggs, used up 2d ago',
      'Apple, missing staple',
      'Flour, missing staple',
    ]);
  });

  it('shows at most 8 tiles, dropping the last Staples first, with no "more" control', async () => {
    stubShopping({
      expired: ['E1', 'E2', 'E3'].map((n, i) => gone(n, `2026-10-1${3 - i}`)),
      usedUp: ['U1', 'U2', 'U3', 'U4'].map((n, i) =>
        gone(n, localStamp(13 - i, 12)),
      ),
      staples: [gone('S3', null), gone('S1', null), gone('S2', null)],
    });
    renderWithProviders(<ShoppingPage />);

    const dialog = await openSheet();
    await within(dialog).findByRole('region', {
      name: 'Gone from your Pantry',
    });

    const names = tileNames(dialog);
    expect(names).toHaveLength(8);
    expect(names.slice(0, 3)).toEqual([
      'E1, expired 1d ago',
      'E2, expired 2d ago',
      'E3, expired 3d ago',
    ]);
    expect(names.at(-1)).toBe('S1, missing staple');
    expect(within(dialog).queryByText(/more/i)).toBeNull();
  });

  it('says why and when on each tile', async () => {
    stubShopping({
      expired: [gone('Spinach', '2026-10-13')],
      usedUp: [gone('Eggs', localStamp(12, 12))],
      staples: [gone('Flour', null)],
    });
    renderWithProviders(<ShoppingPage />);

    const dialog = await openSheet();

    const spinach = await within(dialog).findByRole('button', {
      name: 'Spinach, expired 1d ago',
    });
    expect(spinach).toHaveTextContent('Spinach');
    expect(spinach).toHaveTextContent(/expired · 1d ago/);
    const eggs = within(dialog).getByRole('button', {
      name: 'Eggs, used up 2d ago',
    });
    expect(eggs).toHaveTextContent(/used up · 2d ago/);
    const flour = within(dialog).getByRole('button', {
      name: 'Flour, missing staple',
    });
    expect(flour).toHaveTextContent(/staple/);
    expect(flour).not.toHaveTextContent(/·/);
    for (const [tile, text] of [
      [spinach, /expired · 1d ago/],
      [eggs, /used up · 2d ago/],
      [flour, /staple/],
    ] as const) {
      const line = within(tile).getByText(text).parentElement!;
      const icon = line.querySelector(':scope > [aria-hidden="true"]');
      expect(icon).not.toBeNull();
      expect(icon!.querySelector('svg')).not.toBeNull();
      expect(icon!.textContent).toBe('');
    }
  });

  it('selects the Ingredient on tap, showing the token and the amount panel, and sends no dismissal', async () => {
    const calls = stubShopping({ expired: [gone('Milk', '2026-10-13')] });
    renderWithProviders(<ShoppingPage />);
    const dialog = await openSheet();

    await userEvent.click(
      await within(dialog).findByRole('button', {
        name: 'Milk, expired 1d ago',
      }),
    );

    expect(
      await within(dialog).findByRole('combobox', {
        name: 'Ingredient: Milk. Press Backspace to change',
      }),
    ).toBeVisible();
    expect(
      within(dialog).getByRole('textbox', { name: /Amount of Milk/ }),
    ).toBeVisible();
    expect(calls.filter((c) => /dismiss/.test(c.key))).toEqual([]);
    expect(calls.filter((c) => c.key.startsWith('POST'))).toEqual([]);
  });

  it('says nothing has run out when no Suggestion is gone', async () => {
    stubShopping({});
    renderWithProviders(<ShoppingPage />);

    const dialog = await openSheet();

    const section = await within(dialog).findByRole('region', {
      name: 'Gone from your Pantry',
    });
    expect(
      within(section).getByText('Nothing has run out or expired. Nice.'),
    ).toBeVisible();
    expect(within(section).queryByRole('button')).toBeNull();
  });

  it('counts a timestamp late on the previous local day as 1d ago', async () => {
    stubShopping({ usedUp: [gone('Eggs', localStamp(13, 23))] });
    renderWithProviders(<ShoppingPage />);

    const dialog = await openSheet();

    expect(
      await within(dialog).findByRole('button', {
        name: 'Eggs, used up 1d ago',
      }),
    ).toBeVisible();
  });

  it('selects without a catalog search, since the Suggestion carries the result', async () => {
    const calls = stubShopping({ expired: [gone('Milk', '2026-10-13')] });
    renderWithProviders(<ShoppingPage />);
    const dialog = await openSheet();

    await userEvent.click(
      await within(dialog).findByRole('button', {
        name: 'Milk, expired 1d ago',
      }),
    );

    await within(dialog).findByRole('textbox', { name: /Amount of Milk/ });
    expect(calls.filter((c) => c.key.startsWith('GET /api/catalog'))).toEqual(
      [],
    );
  });

  it('prefills a Staple tile with the Staple amount and unit', async () => {
    stubShopping({
      staples: [gone('Milk', null, dairy, { quantity: 2, unit: 'l' })],
    });
    renderWithProviders(<ShoppingPage />);
    const dialog = await openSheet();

    await userEvent.click(
      await within(dialog).findByRole('button', {
        name: 'Milk, missing staple',
      }),
    );

    expect(
      await within(dialog).findByRole('textbox', { name: /Amount of Milk/ }),
    ).toHaveValue('2');
    expect(
      within(dialog).getByRole('button', { name: /Unit.*L/ }),
    ).toBeVisible();
  });

  it('leaves the amount empty for an expired or Used Up tile', async () => {
    stubShopping({ expired: [gone('Milk', '2026-10-13')] });
    renderWithProviders(<ShoppingPage />);
    const dialog = await openSheet();

    await userEvent.click(
      await within(dialog).findByRole('button', {
        name: 'Milk, expired 1d ago',
      }),
    );

    expect(
      await within(dialog).findByRole('textbox', { name: /Amount of Milk/ }),
    ).toHaveValue('');
  });

  it('links to the Staples page from the Gone heading', async () => {
    stubShopping({});
    renderWithProviders(<ShoppingPage />);
    const dialog = await openSheet();

    const section = await within(dialog).findByRole('region', {
      name: 'Gone from your Pantry',
    });

    expect(
      within(section).getByRole('link', { name: 'Manage' }),
    ).toHaveAttribute('href', '/shopping/staples');
  });

  it('dismisses an expired tile with its own control, without selecting it', async () => {
    const calls = stubShopping(
      { expired: [gone('Milk', '2026-10-13')] },
      {
        'POST /api/shopping-list/suggestions/milk-id/dismiss': () =>
          new Response(null, { status: 204 }),
      },
    );
    renderWithProviders(<ShoppingPage />);
    const dialog = await openSheet();

    await userEvent.click(
      await within(dialog).findByRole('button', { name: 'Dismiss Milk' }),
    );

    expect(await screen.findByText('Dismissed Milk')).toBeVisible();
    expect(
      calls.filter(
        (c) => c.key === 'POST /api/shopping-list/suggestions/milk-id/dismiss',
      ),
    ).toHaveLength(1);
    expect(
      within(dialog).queryByRole('textbox', { name: /Amount of Milk/ }),
    ).toBeNull();
  });

  it('gives every kind of tile a dismiss control named after the Ingredient', async () => {
    stubShopping({
      expired: [gone('Spinach', '2026-10-13')],
      usedUp: [gone('Eggs', localStamp(12, 12))],
      staples: [gone('Flour', null)],
    });
    renderWithProviders(<ShoppingPage />);
    const dialog = await openSheet();
    await within(dialog).findByRole('button', { name: 'Dismiss Spinach' });

    expect(
      within(dialog).getByRole('button', { name: 'Dismiss Eggs' }),
    ).toBeVisible();
    expect(
      within(dialog).getByRole('button', { name: 'Dismiss Flour' }),
    ).toBeVisible();
  });

  it('shows the tile again with an error toast when the dismissal fails', async () => {
    stubShopping(
      { expired: [gone('Milk', '2026-10-13')] },
      {
        'POST /api/shopping-list/suggestions/milk-id/dismiss': () =>
          Response.json({ code: 'server_error' }, { status: 500 }),
      },
    );
    renderWithProviders(<ShoppingPage />);
    const dialog = await openSheet();

    await userEvent.click(
      await within(dialog).findByRole('button', { name: 'Dismiss Milk' }),
    );

    await waitFor(() =>
      expect(screen.queryByText('Dismissed Milk')).toBeNull(),
    );
    expect(
      within(dialog).getByRole('button', { name: 'Milk, expired 1d ago' }),
    ).toBeVisible();
  });
});

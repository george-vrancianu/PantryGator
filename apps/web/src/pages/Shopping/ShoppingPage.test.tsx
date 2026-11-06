import { THEMES } from '@pocket-pantry/ui';
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatalogSearchResult } from '../../lib/catalog';
import {
  SHOPPING_POLL_INTERVAL_MS,
  type ShoppingGroup,
  type ShoppingItem,
  type ShoppingList,
} from '../../lib/shopping';
import type { Template, TemplateLine } from '../../lib/shoppingTemplates';
import { paintedColour } from '@pocket-pantry/ui/test/colour';
import { renderWithProviders, stubApi } from '../../test/render';
import { stubMotion, stubViewport } from '../../test/viewport';
import { Link, Route, Routes } from 'react-router-dom';
import { ShoppingPage } from './ShoppingPage';

const item = (
  overrides: Partial<ShoppingItem> & { id: string },
): ShoppingItem => ({
  ingredientId: null,
  name: 'Item',
  quantity: null,
  unit: null,
  checked: false,
  unmatched: false,
  ...overrides,
});

function list(groups: ShoppingList['groups']): ShoppingList {
  const all = groups.flatMap((g) => g.items);
  const checked = all.filter((i) => i.checked).length;
  return {
    id: 'l1',
    groups,
    summary: { remaining: all.length - checked, checked },
  };
}

/** Removes a row the way a keyboard user does: Delete opens the confirmation, then Remove. */
async function removeRow(
  name: string,
  user: {
    keyboard: (keys: string) => Promise<unknown>;
    click: (element: Element) => Promise<unknown>;
  } = userEvent,
) {
  const row = await screen.findByRole('group', { name });
  act(() => row.focus());
  await user.keyboard('{Delete}');
  await user.click(screen.getByRole('button', { name: 'Remove' }));
  // The row collapses before it is handed to the list.
  await waitFor(() => expect(screen.queryByRole('group', { name })).toBeNull());
}

const produce = { id: 'a1', name: 'Fruit & veg', sortOrder: 1 };
const dairy = { id: 'a4', name: 'Dairy & eggs', sortOrder: 4 };

const tomato = item({ id: 'i1', name: 'Tomato', quantity: 250, unit: 'g' });
const milk = item({
  id: 'i2',
  name: 'Milk',
  quantity: 1,
  unit: 'l',
  checked: true,
});
const base = list([
  { aisle: produce, items: [tomato] },
  { aisle: dairy, items: [milk] },
]);

const parmesan: CatalogSearchResult = {
  owner: 'catalog',
  amountScale: 'medium',
  id: 'parmesan-id',
  name: 'Parmesan',
  defaultUnit: 'g',
  leafCategory: { id: 'hc', name: 'Hard cheese' },
  parentCategory: {
    id: 'd',
    name: 'Dairy',
    aisle: { id: 'aisle', name: 'Dairy & eggs' },
  },
  defaults: { expiryDays: 30, location: 'fridge' },
};

function stubShopping(
  routes: Record<string, () => Response> = {},
  initial: ShoppingList = base,
) {
  let current = initial;
  const { fetchMock, calls } = stubApi({
    'GET /api/shopping-list': () => Response.json(current),
    'GET /api/catalog/search': () => Response.json({ results: [parmesan] }),
    ...routes,
  });
  vi.stubGlobal('fetch', fetchMock);
  return {
    calls,
    setCurrent: (next: ShoppingList) => {
      current = next;
    },
  };
}

describe('ShoppingPage', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('puts Add items alone in the header and Import in the summary card', async () => {
    stubShopping();
    renderWithProviders(<ShoppingPage />);

    const header = await screen.findByRole('banner');
    expect(
      within(header)
        .getAllByRole('button')
        .map((b) => b.getAttribute('aria-label')),
    ).toEqual(['Add items']);
    // The pill sits beside the count: their nearest shared box is the card, not the page.
    const pill = await screen.findByRole('button', {
      name: 'Import from a template',
    });
    const row = screen.getByText('1 to buy').parentElement;
    const bar = screen.getByRole('progressbar');
    // The bar runs the card's full width under that row, not beside the pill.
    expect(row?.contains(bar)).toBe(false);
    let card = row?.parentElement ?? null;
    while (card && !card.contains(bar)) card = card.parentElement;
    expect(card?.contains(pill)).toBe(true);
    expect(card?.contains(header)).toBe(false);
    expect(
      within(header).queryByRole('button', { name: 'Import from a template' }),
    ).toBeNull();
  });

  it('shows the summary card and groups in the order given, with quantities', async () => {
    stubShopping();
    renderWithProviders(<ShoppingPage />);

    expect(await screen.findByText('1 to buy')).toBeVisible();
    expect(screen.getByText('1 of 2 checked')).toBeVisible();
    expect(
      screen.getByRole('progressbar', { name: 'Shopping progress' }),
    ).toHaveAttribute('aria-valuenow', '50');
    expect(
      screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent),
    ).toEqual(['Fruit & veg · 1', 'Dairy & eggs · 1']);
    expect(screen.getByText('250 g')).toBeVisible();
    // Focusing the row announces the state: it is part of the group's description.
    expect(
      screen.getByRole('group', { name: 'Milk' }),
    ).toHaveAccessibleDescription(/Ticked/);
    expect(
      screen.getByRole('group', { name: 'Tomato' }),
    ).not.toHaveAccessibleDescription(/Ticked/);
    expect(
      within(screen.getByRole('group', { name: 'Tomato' })).queryByText(
        'Ticked',
      ),
    ).toBeNull();
  });

  it('checks and unchecks an item through the API', async () => {
    const checkedTomato = { ...tomato, checked: true };
    const { calls } = stubShopping({
      'PATCH /api/shopping-list/items/i1': () =>
        Response.json(
          list([
            { aisle: produce, items: [checkedTomato] },
            { aisle: dairy, items: [milk] },
          ]),
        ),
    });
    renderWithProviders(<ShoppingPage />);

    await userEvent.click(await screen.findByText('Tomato'));

    expect(await screen.findByText('0 to buy')).toBeVisible();
    expect(calls.find((c) => c.key.startsWith('PATCH'))?.body).toEqual({
      checked: true,
    });
  });

  describe('removing an item', () => {
    const REMOVED_TOMATO = list([{ aisle: dairy, items: [milk] }]);
    const deleteTomato = {
      'DELETE /api/shopping-list/items/i1': () => Response.json(REMOVED_TOMATO),
    };
    const deletes = (calls: Array<{ key: string }>) =>
      calls.filter((c) => c.key.startsWith('DELETE')).map((c) => c.key);
    const remove = removeRow;

    it('hides the row at once and offers Undo without calling the API', async () => {
      const { calls } = stubShopping(deleteTomato);
      renderWithProviders(<ShoppingPage />);
      expect(await screen.findByText('1 to buy')).toBeVisible();

      await remove('Tomato');

      expect(screen.queryByRole('group', { name: /^Tomato/ })).toBeNull();
      expect(screen.getByText('0 to buy')).toBeVisible();
      expect(await screen.findByText('Removed Tomato')).toBeVisible();
      expect(screen.getByRole('button', { name: 'Undo' })).toBeVisible();
      expect(deletes(calls)).toEqual([]);
    });

    it('puts the row back on Undo, in its place, with no request', async () => {
      const { calls } = stubShopping(deleteTomato);
      renderWithProviders(<ShoppingPage />);
      await screen.findByText('1 to buy');

      await remove('Tomato');
      await userEvent.click(screen.getByRole('button', { name: 'Undo' }));

      expect(screen.getByText('1 to buy')).toBeVisible();
      const rows = screen.getAllByRole('group', { name: /^(Tomato|Milk)/ });
      expect(rows.map((r) => r.textContent)).toEqual([
        expect.stringContaining('Tomato'),
        expect.stringContaining('Milk'),
      ]);
      expect(deletes(calls)).toEqual([]);
    });

    it('sends the delete when the toast expires after 5 s, not before', async () => {
      const { calls } = stubShopping(deleteTomato);
      vi.useFakeTimers({ shouldAdvanceTime: true });
      renderWithProviders(<ShoppingPage />);
      await screen.findByText('1 to buy');

      await remove('Tomato');
      await act(() => vi.advanceTimersByTimeAsync(4500));
      expect(deletes(calls)).toEqual([]);
      await act(() => vi.advanceTimersByTimeAsync(1000));

      await waitFor(() =>
        expect(deletes(calls)).toEqual(['DELETE /api/shopping-list/items/i1']),
      );
      expect(screen.queryByRole('group', { name: /^Tomato/ })).toBeNull();
    });

    it('sends the first delete at once when a second item is removed, and Undo only restores the second', async () => {
      const { calls } = stubShopping({
        ...deleteTomato,
        'DELETE /api/shopping-list/items/i2': () => Response.json(list([])),
      });
      renderWithProviders(<ShoppingPage />);
      await screen.findByText('1 to buy');

      await remove('Tomato');
      await remove('Milk');

      await waitFor(() =>
        expect(deletes(calls)).toEqual(['DELETE /api/shopping-list/items/i1']),
      );
      expect(await screen.findByText('Removed Milk')).toBeVisible();
      expect(screen.queryByText('Removed Tomato')).toBeNull();

      await userEvent.click(screen.getByRole('button', { name: 'Undo' }));

      expect(await screen.findByRole('group', { name: /^Milk/ })).toBeVisible();
      expect(screen.queryByRole('group', { name: /^Tomato/ })).toBeNull();
      expect(deletes(calls)).toEqual(['DELETE /api/shopping-list/items/i1']);
    });

    it('sends the delete when the toast is dismissed with Escape', async () => {
      const { calls } = stubShopping(deleteTomato);
      renderWithProviders(<ShoppingPage />);
      await screen.findByText('1 to buy');

      await remove('Tomato');
      await userEvent.keyboard('{Escape}');

      await waitFor(() =>
        expect(deletes(calls)).toEqual(['DELETE /api/shopping-list/items/i1']),
      );
    });

    it('ignores Undo clicked while the expired toast fades out', async () => {
      const { calls } = stubShopping(deleteTomato);
      vi.useFakeTimers({ shouldAdvanceTime: true });
      renderWithProviders(<ShoppingPage />);
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      await screen.findByText('1 to buy');

      await removeRow('Tomato', user);
      const undo = screen.getByRole('button', { name: 'Undo' });
      await act(() => vi.advanceTimersByTimeAsync(5050));
      await user.click(undo);

      await waitFor(() =>
        expect(deletes(calls)).toEqual(['DELETE /api/shopping-list/items/i1']),
      );
      expect(screen.queryByRole('group', { name: /^Tomato/ })).toBeNull();
    });

    it('takes the Undo toast down when the Member leaves the page', async () => {
      const { calls } = stubShopping(deleteTomato);
      renderWithProviders(
        <Routes>
          <Route
            path="/"
            element={
              <>
                <ShoppingPage />
                <Link to="/other">Leave</Link>
              </>
            }
          />
          <Route path="/other" element={<p>Elsewhere</p>} />
        </Routes>,
      );
      await screen.findByText('1 to buy');
      await remove('Tomato');
      expect(screen.getByText('Removed Tomato')).toBeVisible();

      await userEvent.click(screen.getByRole('link', { name: 'Leave' }));

      expect(await screen.findByText('Elsewhere')).toBeVisible();
      await waitFor(() =>
        expect(deletes(calls)).toEqual(['DELETE /api/shopping-list/items/i1']),
      );
      await waitFor(() =>
        expect(screen.queryByText('Removed Tomato')).toBeNull(),
      );
    });

    it('sends the delete when another toast replaces the Undo toast', async () => {
      const basil = item({
        id: 'i3',
        name: 'Basil',
        ingredientId: 'ing-basil',
      });
      const { calls } = stubShopping(
        {
          ...deleteTomato,
          'GET /api/staples': () => Response.json({ staples: [] }),
          'POST /api/staples': () =>
            Response.json(
              {
                id: 's1',
                ingredientId: 'ing-basil',
                name: 'Basil',
                quantity: null,
                unit: null,
                aisle: null,
              },
              { status: 201 },
            ),
        },
        list([{ aisle: produce, items: [tomato, basil] }]),
      );
      renderWithProviders(<ShoppingPage />);
      await screen.findByText('2 to buy');

      await remove('Tomato');
      const star = screen.getByRole('button', { name: 'Make Basil a staple' });
      await waitFor(() => expect(star).not.toHaveAttribute('aria-disabled'));
      await userEvent.click(star);

      expect(await screen.findByText('Basil is now a staple')).toBeVisible();
      await waitFor(() =>
        expect(deletes(calls)).toEqual(['DELETE /api/shopping-list/items/i1']),
      );
    });

    it('sends the delete when the Member leaves the page', async () => {
      const { calls } = stubShopping(deleteTomato);
      const { unmount } = renderWithProviders(<ShoppingPage />);
      await screen.findByText('1 to buy');

      await remove('Tomato');
      unmount();

      await waitFor(() =>
        expect(deletes(calls)).toEqual(['DELETE /api/shopping-list/items/i1']),
      );
    });

    it('sends the delete on pagehide', async () => {
      const { calls } = stubShopping(deleteTomato);
      renderWithProviders(<ShoppingPage />);
      await screen.findByText('1 to buy');

      await remove('Tomato');
      act(() => {
        window.dispatchEvent(new Event('pagehide'));
      });

      await waitFor(() =>
        expect(deletes(calls)).toEqual(['DELETE /api/shopping-list/items/i1']),
      );
    });

    it('keeps the item hidden when a refetch lands while the delete waits', async () => {
      const shopping = stubShopping(deleteTomato);
      vi.useFakeTimers({ shouldAdvanceTime: true });
      renderWithProviders(<ShoppingPage />);
      await screen.findByText('1 to buy');

      await remove('Tomato');
      shopping.setCurrent(
        list([
          {
            aisle: produce,
            items: [tomato, item({ id: 'i5', name: 'Basil' })],
          },
          { aisle: dairy, items: [milk] },
        ]),
      );
      act(() => {
        window.dispatchEvent(new Event('visibilitychange'));
      });

      expect(await screen.findByText('Basil')).toBeVisible();
      expect(screen.queryByRole('group', { name: /^Tomato/ })).toBeNull();
      expect(screen.getByText('Removed Tomato')).toBeVisible();
    });

    it('brings the row back with an error toast when the delete fails', async () => {
      stubShopping({
        'DELETE /api/shopping-list/items/i1': () =>
          Response.json({ code: 'unknown', params: {} }, { status: 500 }),
      });
      vi.useFakeTimers({ shouldAdvanceTime: true });
      renderWithProviders(<ShoppingPage />);
      await screen.findByText('1 to buy');

      await remove('Tomato');
      await act(() => vi.advanceTimersByTimeAsync(5500));

      expect(
        await screen.findByRole('group', { name: /^Tomato/ }),
      ).toBeVisible();
      expect(screen.getByText('1 to buy')).toBeVisible();
      expect(screen.queryByText('Removed Tomato')).toBeNull();
      expect(
        screen.getByText('Something went wrong. Please try again.'),
      ).toBeVisible();
    });
  });

  describe('Ingredient Icons', () => {
    const DAIRY_ID = '244cde4d-f9a5-5df8-9f40-5e1f48fd4fcf';
    const PARMESAN_ID = '7d85ad5c-dbd3-527e-ad69-23c2eb53ae6e';
    const dairyAisle = { id: DAIRY_ID, name: 'Dairy & eggs', sortOrder: 4 };
    const rowIcon = (name: RegExp) =>
      screen
        .getByRole('group', { name })
        .querySelector<SVGElement>('[data-ingredient-icon]');
    const show = async (
      items: ShoppingItem[],
      aisle: ShoppingGroup['aisle'] = dairyAisle,
    ) => {
      stubShopping({}, list([{ aisle, items }]));
      renderWithProviders(<ShoppingPage />);
      await screen.findByRole('group', { name: /^Item/ });
    };

    it('shows a mapped Ingredient its icon, tinted by its Aisle', async () => {
      await show([item({ id: 'x', ingredientId: PARMESAN_ID, name: 'Item' })]);
      expect(rowIcon(/^Item/)).toHaveAttribute(
        'data-ingredient-icon',
        'parmesan',
      );
      expect(rowIcon(/^Item/)).toHaveAttribute('data-ingredient-tint', 'dairy');
    });

    it('shows an unmapped Ingredient the Default Icon, tinted by its Aisle', async () => {
      await show([item({ id: 'x', ingredientId: 'not-mapped' })]);
      expect(rowIcon(/^Item/)).toHaveAttribute(
        'data-ingredient-icon',
        'default',
      );
      expect(rowIcon(/^Item/)).toHaveAttribute('data-ingredient-tint', 'dairy');
    });

    it('shows an Unmatched item the Default Icon in the neutral tint', async () => {
      await show([item({ id: 'x', unmatched: true })], null);
      expect(rowIcon(/^Item/)).toHaveAttribute(
        'data-ingredient-icon',
        'default',
      );
      expect(rowIcon(/^Item/)).toHaveAttribute(
        'data-ingredient-tint',
        'neutral',
      );
    });

    it('tints an Aisle without a tint neutral', async () => {
      await show([item({ id: 'x', ingredientId: PARMESAN_ID })], {
        id: 'admin-made-aisle',
        name: 'Admin aisle',
        sortOrder: 99,
      });
      expect(rowIcon(/^Item/)).toHaveAttribute(
        'data-ingredient-icon',
        'parmesan',
      );
      expect(rowIcon(/^Item/)).toHaveAttribute(
        'data-ingredient-tint',
        'neutral',
      );
    });

    it('keeps the icon in a 38px slot', async () => {
      await show([item({ id: 'x', ingredientId: PARMESAN_ID })]);
      expect(rowIcon(/^Item/)?.parentElement).toHaveStyle({
        width: '38px',
        height: '38px',
      });
    });

    it('greys the icon when the item is checked', async () => {
      await show([item({ id: 'x', ingredientId: PARMESAN_ID, checked: true })]);
      // Greyed to the active Theme's muted ink (Warm editorial by default).
      expect(paintedColour(rowIcon(/^Item/)!.parentElement!, 'color')).toBe(
        THEMES.warm.muted,
      );
    });
  });

  describe('Staple star toasts', () => {
    const tomatoItem = item({
      id: 'i1',
      ingredientId: 'ing-tomato',
      name: 'Tomato',
    });
    const withIngredient = list([{ aisle: produce, items: [tomatoItem] }]);
    const stapleRow = {
      id: 's1',
      ingredientId: 'ing-tomato',
      name: 'Tomato',
      quantity: null,
      unit: null,
      aisle: null,
    };

    it('says the item is now a staple when starred', async () => {
      stubShopping(
        {
          'GET /api/staples': () => Response.json({ staples: [] }),
          'POST /api/staples': () => Response.json(stapleRow, { status: 201 }),
        },
        withIngredient,
      );
      renderWithProviders(<ShoppingPage />);

      const star = await screen.findByRole('button', {
        name: 'Make Tomato a staple',
      });
      await waitFor(() => expect(star).not.toHaveAttribute('aria-disabled'));
      await userEvent.click(star);

      expect(await screen.findByText('Tomato is now a staple')).toBeVisible();
    });

    it('says the item was removed from staples when unstarred', async () => {
      stubShopping(
        {
          'GET /api/staples': () => Response.json({ staples: [stapleRow] }),
          'DELETE /api/staples/s1': () => new Response(null, { status: 204 }),
        },
        withIngredient,
      );
      renderWithProviders(<ShoppingPage />);

      const star = await screen.findByRole('button', {
        name: 'Remove Tomato from staples',
      });
      await waitFor(() => expect(star).not.toHaveAttribute('aria-disabled'));
      await userEvent.click(star);

      expect(
        await screen.findByText('Tomato removed from staples'),
      ).toBeVisible();
    });
  });

  describe('editing the amount', () => {
    const rowOf = (name: string) => screen.getByRole('group', { name });
    const afterPut = (id: string, quantity: number | null, unit: ItemUnit) =>
      list([
        {
          aisle: produce,
          items: [{ ...tomato, id, quantity, unit }],
        },
        { aisle: dairy, items: [milk] },
      ]);
    type ItemUnit = ShoppingItem['unit'];
    const openSheet = async (
      user: ReturnType<typeof userEvent.setup>,
      name = 'Tomato',
    ) => {
      act(() => rowOf(name).focus());
      await user.keyboard('{Enter}');
      return screen.findByRole('dialog', { name: `Edit ${name}` });
    };

    it('opens on Enter with the name, context and current amount, without ticking', async () => {
      const user = userEvent.setup();
      const { calls } = stubShopping();
      renderWithProviders(<ShoppingPage />);
      await screen.findByText('1 to buy');

      const dialog = await openSheet(user);

      expect(
        within(dialog).getByRole('heading', { name: 'Tomato' }),
      ).toBeInTheDocument();
      expect(within(dialog).getByText('from your list')).toBeInTheDocument();
      expect(within(dialog).getByLabelText(/^Amount of Tomato/)).toHaveValue(
        '250',
      );
      expect(
        within(dialog).getByRole('button', { name: 'Unit: g' }),
      ).toBeInTheDocument();
      expect(calls.some((c) => c.key.startsWith('PATCH'))).toBe(false);
    });

    it('saves the new amount, closes and says Updated', async () => {
      const user = userEvent.setup();
      const { calls } = stubShopping({
        'PUT /api/shopping-list/items/i1/amount': () =>
          Response.json(afterPut('i1', 3, 'g')),
      });
      renderWithProviders(<ShoppingPage />);
      await screen.findByText('1 to buy');

      const dialog = await openSheet(user);
      const field = within(dialog).getByLabelText(/^Amount of Tomato/);
      await user.clear(field);
      await user.type(field, '3');
      await user.click(within(dialog).getByRole('button', { name: 'Save' }));

      expect(await screen.findByText('Updated Tomato')).toBeVisible();
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(screen.getByText('3 g')).toBeVisible();
      expect(calls.map((c) => c.key)).toContain(
        'PUT /api/shopping-list/items/i1/amount',
      );
    });

    it('sends the quantity and unit, and a typed "2 kg" sets both', async () => {
      const user = userEvent.setup();
      const { calls } = stubShopping({
        'PUT /api/shopping-list/items/i1/amount': () =>
          Response.json(afterPut('i1', 2, 'kg')),
      });
      renderWithProviders(<ShoppingPage />);
      await screen.findByText('1 to buy');

      const dialog = await openSheet(user);
      const field = within(dialog).getByLabelText(/^Amount of Tomato/);
      await user.clear(field);
      await user.type(field, '2 kg');
      await user.click(within(dialog).getByRole('button', { name: 'Save' }));

      await screen.findByText('Updated Tomato');
      expect(calls.find((c) => c.key.startsWith('PUT'))?.body).toEqual({
        quantity: 2,
        unit: 'kg',
      });
    });

    it('rejects an invalid amount without calling the API', async () => {
      const user = userEvent.setup();
      const { calls } = stubShopping();
      renderWithProviders(<ShoppingPage />);
      await screen.findByText('1 to buy');

      const dialog = await openSheet(user);
      const field = within(dialog).getByLabelText(/^Amount of Tomato/);
      await user.clear(field);
      await user.type(field, '0');
      await user.click(within(dialog).getByRole('button', { name: 'Save' }));

      expect(
        await within(dialog).findByText(/Enter an amount from 0.001/),
      ).toBeVisible();
      expect(calls.some((c) => c.key.startsWith('PUT'))).toBe(false);
    });

    it('keeps the sheet open and says why when the save fails', async () => {
      const user = userEvent.setup();
      stubShopping({
        'PUT /api/shopping-list/items/i1/amount': () =>
          Response.json(
            { code: 'shopping.item_not_found', message: 'gone' },
            { status: 404 },
          ),
      });
      renderWithProviders(<ShoppingPage />);
      await screen.findByText('1 to buy');

      const dialog = await openSheet(user);
      await user.type(within(dialog).getByLabelText(/^Amount of Tomato/), '1');
      await user.click(within(dialog).getByRole('button', { name: 'Save' }));

      expect(await within(dialog).findByRole('alert')).toBeVisible();
      expect(screen.queryByText('Updated Tomato')).toBeNull();
    });

    it('changes nothing on Cancel', async () => {
      const user = userEvent.setup();
      const { calls } = stubShopping();
      renderWithProviders(<ShoppingPage />);
      await screen.findByText('1 to buy');

      const dialog = await openSheet(user);
      await user.type(within(dialog).getByLabelText(/^Amount of Tomato/), '9');
      await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(screen.getByText('250 g')).toBeVisible();
      expect(calls.some((c) => c.key.startsWith('PUT'))).toBe(false);
      expect(screen.queryByText('Updated Tomato')).toBeNull();
    });

    it('edits a checked item like any other', async () => {
      const user = userEvent.setup();
      stubShopping({
        'PUT /api/shopping-list/items/i2/amount': () =>
          Response.json(
            list([
              { aisle: produce, items: [tomato] },
              { aisle: dairy, items: [{ ...milk, quantity: 2 }] },
            ]),
          ),
      });
      renderWithProviders(<ShoppingPage />);
      await screen.findByText('1 to buy');

      const dialog = await openSheet(user, 'Milk');
      const field = within(dialog).getByLabelText(/^Amount of Milk/);
      await user.clear(field);
      await user.type(field, '2');
      await user.click(within(dialog).getByRole('button', { name: 'Save' }));

      expect(await screen.findByText('Updated Milk')).toBeVisible();
      expect(screen.getByText('2 L')).toBeVisible();
    });

    it('"Remove from list" closes the sheet and asks on the row', async () => {
      const user = userEvent.setup();
      stubShopping();
      renderWithProviders(<ShoppingPage />);
      await screen.findByText('1 to buy');

      const dialog = await openSheet(user);
      // The app root must not be aria-hidden when Keep takes focus, or a screen reader would not
      // announce the confirmation: so look at the moment it happens, not afterwards.
      const hiddenWhenFocused: boolean[] = [];
      const onFocus = (event: FocusEvent) => {
        if ((event.target as HTMLElement).textContent === 'Keep') {
          hiddenWhenFocused.push(
            document.querySelector('body > [aria-hidden="true"]') !== null,
          );
        }
      };
      document.addEventListener('focusin', onFocus);
      await user.click(
        within(dialog).getByRole('button', { name: 'Remove from list' }),
      );

      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      document.removeEventListener('focusin', onFocus);
      expect(hiddenWhenFocused).toEqual([false]);
      expect(
        await screen.findByRole('group', { name: 'Remove Tomato?' }),
      ).toBeVisible();
      expect(screen.getByRole('button', { name: 'Keep' })).toHaveFocus();
    });

    it('opens when the row is held for 500 ms, the checked ones too', async () => {
      stubShopping();
      renderWithProviders(<ShoppingPage />);
      await screen.findByText('1 to buy');
      const content = rowOf('Milk').querySelector(
        '[data-swipe-row-content]',
      ) as HTMLElement;
      vi.useFakeTimers();

      fireEvent.pointerDown(content, {
        pointerId: 1,
        clientX: 50,
        clientY: 20,
      });
      await act(() => vi.advanceTimersByTimeAsync(600));
      expect(screen.queryByRole('dialog')).toBeNull();
      await act(() => vi.advanceTimersByTimeAsync(200));
      expect(screen.getByRole('dialog', { name: 'Edit Milk' })).toBeVisible();
      await act(() => vi.advanceTimersByTimeAsync(0));
    });

    it('does not hold from the Staple star, which stays its own tab stop', async () => {
      stubShopping(
        { 'GET /api/staples': () => Response.json({ staples: [] }) },
        list([
          {
            aisle: produce,
            items: [{ ...tomato, ingredientId: 'ing-tomato' }],
          },
        ]),
      );
      renderWithProviders(<ShoppingPage />);
      await screen.findByText('1 to buy');
      const star = within(rowOf('Tomato')).getByRole('button', {
        name: /Staple/i,
      });
      vi.useFakeTimers();

      fireEvent.pointerDown(star, { pointerId: 1, clientX: 50, clientY: 20 });
      await act(() => vi.advanceTimersByTimeAsync(1000));

      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('describes the row as holdable', async () => {
      stubShopping();
      renderWithProviders(<ShoppingPage />);
      await screen.findByText('1 to buy');

      expect(rowOf('Tomato')).toHaveAccessibleDescription(
        'Swipe left to remove, hold to edit',
      );
      expect(rowOf('Tomato')).toHaveAttribute(
        'aria-keyshortcuts',
        'Enter Delete Backspace',
      );
    });
  });

  describe('swiping a row', () => {
    const rowOf = (name: string) => screen.getByRole('group', { name });
    const openConfirmation = async (name: string) => {
      act(() => rowOf(name).focus());
      await userEvent.keyboard('{Delete}');
    };
    const keep = () => screen.getByRole('button', { name: 'Keep' });
    const confirmRemove = () => screen.getByRole('button', { name: 'Remove' });

    it('has no remove button on the rows', async () => {
      stubShopping();
      renderWithProviders(<ShoppingPage />);
      await screen.findByText('1 to buy');

      // Only the hidden custom action, which is not a tab stop.
      expect(
        screen.getByRole('button', { name: 'Remove Tomato' }),
      ).toHaveAttribute('tabindex', '-1');
      expect(rowOf('Tomato')).toHaveAttribute('tabindex', '0');
    });

    it('ticks on a tap on the row and on Space, and leaves the star to its own tap', async () => {
      const checkedTomato = { ...tomato, checked: true };
      const { calls } = stubShopping(
        {
          'PATCH /api/shopping-list/items/i1': () =>
            Response.json(
              list([
                { aisle: produce, items: [checkedTomato] },
                { aisle: dairy, items: [milk] },
              ]),
            ),
          'GET /api/staples': () => Response.json({ staples: [] }),
          'POST /api/staples': () =>
            Response.json({
              id: 's1',
              ingredientId: 'ing-tomato',
              name: 'Tomato',
              quantity: null,
              unit: null,
            }),
        },
        list([
          {
            aisle: produce,
            items: [{ ...tomato, ingredientId: 'ing-tomato' }],
          },
        ]),
      );
      renderWithProviders(<ShoppingPage />);
      const star = await screen.findByRole('button', {
        name: 'Make Tomato a staple',
      });
      await waitFor(() => expect(star).not.toHaveAttribute('aria-disabled'));

      await userEvent.click(star);
      expect(await screen.findByText('Tomato is now a staple')).toBeVisible();
      expect(calls.filter((c) => c.key.startsWith('PATCH'))).toEqual([]);

      act(() => rowOf('Tomato').focus());
      await userEvent.keyboard(' ');
      await waitFor(() =>
        expect(calls.filter((c) => c.key.startsWith('PATCH'))).toHaveLength(1),
      );
    });

    it('opens the confirmation with Delete, focusing Keep', async () => {
      stubShopping();
      renderWithProviders(<ShoppingPage />);
      await screen.findByText('1 to buy');

      await openConfirmation('Tomato');

      expect(screen.getByText('Remove Tomato?')).toBeVisible();
      expect(screen.getByText('from your list')).toBeVisible();
      expect(keep()).toHaveFocus();
      await userEvent.tab();
      expect(confirmRemove()).toHaveFocus();
      await userEvent.tab({ shift: true });
      expect(keep()).toHaveFocus();
    });

    it('opens the confirmation with Backspace too', async () => {
      stubShopping();
      renderWithProviders(<ShoppingPage />);
      await screen.findByText('1 to buy');

      act(() => rowOf('Tomato').focus());
      await userEvent.keyboard('{Backspace}');

      expect(keep()).toHaveFocus();
    });

    it('returns to idle on Keep, with the row focused and nothing removed', async () => {
      const { calls } = stubShopping();
      renderWithProviders(<ShoppingPage />);
      await screen.findByText('1 to buy');
      await openConfirmation('Tomato');

      await userEvent.click(keep());

      expect(screen.queryByRole('button', { name: 'Keep' })).toBeNull();
      expect(rowOf('Tomato')).toHaveFocus();
      expect(calls.filter((c) => c.key.startsWith('DELETE'))).toEqual([]);
    });

    it('returns to idle on Escape, without dismissing anything else', async () => {
      stubShopping();
      renderWithProviders(<ShoppingPage />);
      await screen.findByText('1 to buy');
      await openConfirmation('Tomato');

      await userEvent.keyboard('{Escape}');

      expect(screen.queryByRole('button', { name: 'Keep' })).toBeNull();
      expect(rowOf('Tomato')).toHaveFocus();
    });

    it('returns to idle when the 6 s countdown ends', async () => {
      stubShopping();
      vi.useFakeTimers({ shouldAdvanceTime: true });
      renderWithProviders(<ShoppingPage />);
      await screen.findByText('1 to buy');
      await openConfirmation('Tomato');

      await act(() => vi.advanceTimersByTimeAsync(5500));
      expect(keep()).toBeVisible();
      await act(() => vi.advanceTimersByTimeAsync(1000));

      expect(screen.queryByRole('button', { name: 'Keep' })).toBeNull();
    });

    it('confirms one row at a time', async () => {
      stubShopping();
      renderWithProviders(<ShoppingPage />);
      await screen.findByText('1 to buy');

      await openConfirmation('Tomato');
      await openConfirmation('Milk');

      expect(screen.getAllByRole('button', { name: 'Keep' })).toHaveLength(1);
      expect(screen.getByText('Remove Milk?')).toBeVisible();
    });

    it('keeps a confirming row through a refetch', async () => {
      const shopping = stubShopping();
      renderWithProviders(<ShoppingPage />);
      await screen.findByText('1 to buy');
      await openConfirmation('Tomato');

      shopping.setCurrent(
        list([
          {
            aisle: produce,
            items: [tomato, item({ id: 'i5', name: 'Basil' })],
          },
          { aisle: dairy, items: [milk] },
        ]),
      );
      act(() => {
        window.dispatchEvent(new Event('visibilitychange'));
      });

      expect(await screen.findByText('Basil')).toBeVisible();
      expect(screen.getByText('Remove Tomato?')).toBeVisible();
    });

    it('moves focus to the next row when a row is removed from the keyboard', async () => {
      stubShopping(
        {},
        list([
          {
            aisle: produce,
            items: [tomato, item({ id: 'i9', name: 'Basil' })],
          },
        ]),
      );
      renderWithProviders(<ShoppingPage />);
      await screen.findByText('2 to buy');

      act(() => rowOf('Tomato').focus());
      await userEvent.keyboard('{Delete}');
      await userEvent.click(confirmRemove());

      // At once, while the row is still collapsing.
      expect(rowOf('Basil')).toHaveFocus();
    });

    describe('when the last row of a group goes', () => {
      const removeByKeyboard = async (name: string) => {
        act(() => rowOf(name).focus());
        await userEvent.keyboard('{Delete}');
        await userEvent.click(confirmRemove());
      };

      it('focuses the first row of the next group', async () => {
        stubShopping(
          {},
          list([
            { aisle: produce, items: [tomato] },
            { aisle: dairy, items: [milk, item({ id: 'i7', name: 'Eggs' })] },
          ]),
        );
        renderWithProviders(<ShoppingPage />);
        await screen.findByRole('group', { name: /^Milk/ });

        await removeByKeyboard('Tomato');

        expect(rowOf('Milk')).toHaveFocus();
      });

      it('focuses the last row of the previous group when it was the last group', async () => {
        stubShopping(
          {},
          list([
            {
              aisle: produce,
              items: [tomato, item({ id: 'i8', name: 'Kale' })],
            },
            { aisle: dairy, items: [milk] },
          ]),
        );
        renderWithProviders(<ShoppingPage />);
        await screen.findByRole('group', { name: /^Milk/ });

        await removeByKeyboard('Milk');

        expect(rowOf('Kale')).toHaveFocus();
      });

      it('focuses the empty text when it was the last row of the list', async () => {
        const shopping = stubShopping(
          {},
          list([{ aisle: produce, items: [tomato] }]),
        );
        vi.useFakeTimers();
        renderWithProviders(<ShoppingPage />);
        await act(() => vi.advanceTimersByTimeAsync(0));
        void shopping;

        const row = rowOf('Tomato');
        act(() => row.focus());
        fireEvent.keyDown(row, { key: 'Delete' });
        fireEvent.click(confirmRemove());
        await act(() => vi.advanceTimersByTimeAsync(1000));

        expect(
          screen
            .getByRole('heading', { name: 'Start your list' })
            .closest('[tabindex="-1"]'),
        ).toHaveFocus();
      });
    });

    it('removes once on a double click of Remove', async () => {
      const { calls } = stubShopping({
        'DELETE /api/shopping-list/items/i1': () =>
          Response.json(list([{ aisle: dairy, items: [milk] }])),
      });
      vi.useFakeTimers({ shouldAdvanceTime: true });
      renderWithProviders(<ShoppingPage />);
      await screen.findByText('1 to buy');
      await openConfirmation('Tomato');

      const remove = confirmRemove();
      fireEvent.click(remove);
      fireEvent.click(remove);
      await act(() => vi.advanceTimersByTimeAsync(300));

      expect(screen.getAllByText('Removed Tomato')).toHaveLength(1);
      await act(() => vi.advanceTimersByTimeAsync(5500));
      await waitFor(() =>
        expect(calls.filter((c) => c.key.startsWith('DELETE'))).toHaveLength(1),
      );
    });

    it('does not remove a row that leaves the page mid-collapse', async () => {
      stubShopping();
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const view = renderWithProviders(<ShoppingPage />);
      await screen.findByText('1 to buy');
      await openConfirmation('Tomato');

      fireEvent.click(confirmRemove());
      view.unmount();
      await vi.advanceTimersByTimeAsync(500);

      expect(screen.queryByText('Removed Tomato')).toBeNull();
    });

    describe('with the pointer', () => {
      const swipe = (name: string, dx: number) => {
        const content = within(rowOf(name))
          .getByText(name)
          .closest<HTMLElement>('[data-swipe-row-content]') as HTMLElement;
        fireEvent.pointerDown(content, {
          pointerId: 1,
          clientX: 300,
          clientY: 10,
        });
        fireEvent.pointerMove(content, {
          pointerId: 1,
          clientX: 300 + dx,
          clientY: 10,
        });
        fireEvent.pointerUp(content, {
          pointerId: 1,
          clientX: 300 + dx,
          clientY: 10,
        });
      };

      beforeEach(() => {
        // jsdom has no layout: give rows the 350 pt reference width.
        vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
          width: 350,
        } as DOMRect);
      });
      afterEach(() => {
        vi.restoreAllMocks();
      });

      it('springs back after a short swipe, without ticking', async () => {
        const { calls } = stubShopping();
        renderWithProviders(<ShoppingPage />);
        await screen.findByText('1 to buy');

        swipe('Tomato', -50);

        expect(screen.queryByRole('button', { name: 'Keep' })).toBeNull();
        expect(calls.filter((c) => c.key.startsWith('PATCH'))).toEqual([]);
      });

      it('asks for confirmation after a medium swipe', async () => {
        stubShopping();
        renderWithProviders(<ShoppingPage />);
        await screen.findByText('1 to buy');

        swipe('Tomato', -120);

        expect(keep()).toHaveFocus();
        expect(screen.getByText('Remove Tomato?')).toBeVisible();
      });

      it('removes the row and offers Undo after a long swipe', async () => {
        stubShopping();
        renderWithProviders(<ShoppingPage />);
        await screen.findByText('1 to buy');

        swipe('Tomato', -260);

        expect(await screen.findByText('Removed Tomato')).toBeVisible();
        expect(screen.getByRole('button', { name: 'Undo' })).toBeVisible();
        expect(screen.queryByRole('group', { name: 'Tomato' })).toBeNull();
      });

      it('removes at once, with no animation, when the Member prefers reduced motion', async () => {
        stubMotion(true);
        stubShopping();
        renderWithProviders(<ShoppingPage />);
        await screen.findByText('1 to buy');

        swipe('Tomato', -260);

        expect(screen.getByText('Removed Tomato')).toBeVisible();
        expect(screen.queryByRole('group', { name: 'Tomato' })).toBeNull();
      });
    });

    it('removes at once from the confirmation when the Member prefers reduced motion', async () => {
      stubMotion(true);
      stubShopping();
      renderWithProviders(<ShoppingPage />);
      await screen.findByText('1 to buy');
      await openConfirmation('Tomato');

      await userEvent.click(confirmRemove());

      expect(screen.getByText('Removed Tomato')).toBeVisible();
    });
  });

  it('replaces the showing toast instead of queueing', async () => {
    stubShopping({
      'DELETE /api/shopping-list/items/i1': () =>
        Response.json(list([{ aisle: dairy, items: [milk] }])),
      'DELETE /api/shopping-list/items/i2': () => Response.json(list([])),
    });
    renderWithProviders(<ShoppingPage />);

    await removeRow('Tomato');
    expect(await screen.findByText('Removed Tomato')).toBeVisible();
    await removeRow('Milk');

    expect(await screen.findByText('Removed Milk')).toBeVisible();
    await waitFor(() =>
      expect(screen.queryByText('Removed Tomato')).not.toBeInTheDocument(),
    );
  });

  describe('empty list start block', () => {
    const templateRoute = (count: number) => ({
      'GET /api/shopping-templates': () =>
        Response.json({
          templates: Array.from({ length: count }, (_, i) => ({
            id: `t${i}`,
            name: `Template ${i}`,
            lineCount: 1,
            previewNames: ['Milk'],
          })),
        }),
    });

    it('shows a plain summary card and the Start your list block', async () => {
      stubShopping(templateRoute(2), list([]));
      renderWithProviders(<ShoppingPage />);

      expect(await screen.findByText('Nothing to buy')).toBeVisible();
      expect(screen.getByText('Your list is empty')).toBeVisible();
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Add items' })).toBeVisible();
      expect(
        screen.getByRole('heading', { name: 'Start your list' }),
      ).toBeVisible();
      expect(
        screen.getByText(
          'Search for what you need, or start from one of your templates.',
        ),
      ).toBeVisible();
      expect(
        await screen.findByRole('button', { name: /Import a template/ }),
      ).toHaveTextContent('2 templates');
      expect(
        screen.getByRole('button', { name: /Add items.*Search ingredients/ }),
      ).toBeVisible();
    });

    it('uses the singular for one template', async () => {
      stubShopping(templateRoute(1), list([]));
      renderWithProviders(<ShoppingPage />);

      expect(
        await screen.findByRole('button', { name: /Import a template/ }),
      ).toHaveTextContent('1 template');
    });

    it('hides the Import tile when the Family has no templates', async () => {
      stubShopping(templateRoute(0), list([]));
      renderWithProviders(<ShoppingPage />);

      await screen.findByRole('heading', { name: 'Start your list' });
      await waitFor(() =>
        expect(
          screen.queryByRole('button', { name: /Import a template/ }),
        ).not.toBeInTheDocument(),
      );
    });

    it('opens Add items from its tile and returns focus to the tile on close', async () => {
      const user = userEvent.setup();
      stubShopping(templateRoute(1), list([]));
      renderWithProviders(<ShoppingPage />);

      const tile = await screen.findByRole('button', {
        name: /Add items.*Search ingredients/,
      });
      await user.click(tile);
      const dialog = await screen.findByRole('dialog', { name: 'Add items' });
      await user.click(within(dialog).getByRole('button', { name: /Done/ }));

      await waitFor(() => expect(tile).toHaveFocus());
    });

    it('puts focus on the + button when the Add items tile goes away after adding', async () => {
      const user = userEvent.setup();
      const added = list([
        {
          aisle: dairy,
          items: [
            item({ id: 'i3', name: 'Parmesan', quantity: 100, unit: 'g' }),
          ],
        },
      ]);
      const { setCurrent } = stubShopping(
        {
          ...templateRoute(1),
          'POST /api/shopping-list/items': () => {
            setCurrent(added);
            return Response.json(added);
          },
        },
        list([]),
      );
      renderWithProviders(<ShoppingPage />);

      const tile = await screen.findByRole('button', {
        name: /Add items.*Search ingredients/,
      });
      await user.click(tile);
      const dialog = await screen.findByRole('dialog', { name: 'Add items' });
      await user.type(
        within(dialog).getByRole('combobox', { name: 'Search ingredients' }),
        'parm',
      );
      await user.click(
        await within(dialog).findByRole('option', { name: /Parmesan/ }),
      );
      await user.click(
        within(dialog).getByRole('button', {
          name: 'Add Parmesan to the list',
        }),
      );
      await screen.findByText('Added Parmesan');
      await user.click(within(dialog).getByRole('button', { name: /Done/ }));

      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      await waitFor(() => expect(tile).not.toBeInTheDocument());
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Add items' })).toHaveFocus(),
      );
    });

    it('opens Import from its tile and returns focus to the tile on close', async () => {
      const user = userEvent.setup();
      stubShopping(templateRoute(1), list([]));
      renderWithProviders(<ShoppingPage />);

      const tile = await screen.findByRole('button', {
        name: /Import a template/,
      });
      await user.click(tile);
      const dialog = await screen.findByRole('dialog', { name: 'Import' });
      await user.click(within(dialog).getByRole('button', { name: 'Close' }));

      await waitFor(() => expect(tile).toHaveFocus());
    });
  });

  it('shows the Finish row and item counts per Aisle', async () => {
    stubShopping();
    renderWithProviders(<ShoppingPage />);

    expect(await screen.findByText('1 ticked off')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Move 1 to Pantry' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Finish shopping' }),
    ).not.toBeInTheDocument();
    const produceSection = screen.getByRole('region', { name: 'Fruit & veg' });
    expect(
      within(produceSection).getByRole('heading', {
        name: 'Fruit & veg · 1',
      }),
    ).toBeVisible();
  });

  describe('Add sheet', () => {
    const openSheet = async (user = userEvent.setup()) => {
      await screen.findByText(/^\d+ to buy$/);
      await user.click(
        await screen.findByRole('button', { name: 'Add items' }),
      );
      return screen.findByRole('dialog', { name: 'Add items' });
    };

    it('does not offer Recently stocked: that is the Pantry search only', async () => {
      const { calls } = stubShopping();
      renderWithProviders(<ShoppingPage />);

      await openSheet();

      expect(
        screen.queryByRole('region', { name: 'Recently stocked' }),
      ).not.toBeInTheDocument();
      expect(
        calls.some((call) => call.key === 'GET /api/pantry/recently-stocked'),
      ).toBe(false);
    });

    it('opens without tabs, with focus on the sheet on a phone', async () => {
      stubViewport(390);
      stubShopping();
      renderWithProviders(<ShoppingPage />);

      const dialog = await openSheet();

      expect(within(dialog).queryByRole('tab')).toBeNull();
      expect(within(dialog).queryByRole('tablist')).toBeNull();
      // On a phone the sheet keeps focus: a focused field would raise the keyboard mid-slide.
      await waitFor(() => expect(dialog).toHaveFocus());
      expect(search(dialog)).not.toHaveFocus();
    });

    it('shows no template chips on an empty search', async () => {
      stubShopping({
        'GET /api/shopping-templates': () =>
          Response.json({
            templates: [
              {
                id: 't1',
                name: 'Taco night',
                lineCount: 1,
                previewNames: ['Milk'],
              },
            ],
          }),
      });
      renderWithProviders(<ShoppingPage />);

      const dialog = await openSheet();
      await within(dialog).findByText('Nothing has run out or expired. Nice.');

      expect(within(dialog).queryByText('Or start from a template')).toBeNull();
      expect(
        within(dialog).queryByRole('button', { name: /Taco night/ }),
      ).toBeNull();
      expect(
        within(dialog).queryByRole('button', { name: 'See all' }),
      ).toBeNull();
    });

    it('closes with Done, Escape and a scrim tap, returning focus to Add items', async () => {
      stubShopping();
      renderWithProviders(<ShoppingPage />);
      const user = userEvent.setup();
      const opener = () => screen.getByRole('button', { name: 'Add items' });

      let dialog = await openSheet(user);
      await user.click(within(dialog).getByRole('button', { name: 'Done' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(opener()).toHaveFocus();

      await openSheet(user);
      await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(opener()).toHaveFocus();

      dialog = await openSheet(user);
      const scrim = document.querySelector('.MuiBackdrop-root');
      await user.click(scrim as HTMLElement);
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(opener()).toHaveFocus();
    });

    const withParmesan = (
      routes: Record<string, () => Response> = {},
      initial: ShoppingList = base,
    ) => {
      const added = list([
        ...base.groups,
        {
          aisle: dairy,
          items: [
            item({ id: 'i3', name: 'Parmesan', quantity: 100, unit: 'g' }),
          ],
        },
      ]);
      return stubShopping(
        {
          'POST /api/shopping-list/items': () => Response.json(added),
          ...routes,
        },
        initial,
      );
    };
    const search = (dialog: HTMLElement) =>
      within(dialog).getByRole('combobox', { name: 'Search ingredients' });
    const findParmesanRow = async (
      user: ReturnType<typeof userEvent.setup>,
    ) => {
      const dialog = await openSheet(user);
      await user.type(search(dialog), 'parm');
      const option = await within(dialog).findByRole('option', {
        name: /Parmesan/,
      });
      return { dialog, option };
    };
    const posts = (calls: { key: string; body: unknown }[]) =>
      calls.filter((c) => c.key === 'POST /api/shopping-list/items');

    it('announces the matches and shows the name, leaf and aisle of each', async () => {
      withParmesan();
      renderWithProviders(<ShoppingPage />);
      const { dialog, option } = await findParmesanRow(userEvent.setup());

      await waitFor(() =>
        expect(within(dialog).getByRole('status')).toHaveTextContent(
          '1 result',
        ),
      );
      expect(option).toHaveTextContent('Hard cheese · Dairy & eggs');
      expect(search(dialog)).toHaveAttribute('aria-expanded', 'true');
    });

    const DAIRY_AISLE_ID = '244cde4d-f9a5-5df8-9f40-5e1f48fd4fcf';
    const icon = (row: HTMLElement) =>
      row.querySelector<SVGElement>('[data-ingredient-icon]');
    const withResult = (overrides: Partial<CatalogSearchResult>) =>
      withParmesan({
        'GET /api/catalog/search': () =>
          Response.json({ results: [{ ...parmesan, ...overrides }] }),
      });
    const PARMESAN_SEED_ID = '7d85ad5c-dbd3-527e-ad69-23c2eb53ae6e';

    it('shows a mapped Ingredient its icon, tinted by its Aisle', async () => {
      withResult({
        id: PARMESAN_SEED_ID,
        parentCategory: {
          ...parmesan.parentCategory,
          aisle: { id: DAIRY_AISLE_ID, name: 'Dairy & eggs' },
        },
      });
      renderWithProviders(<ShoppingPage />);
      const { option } = await findParmesanRow(userEvent.setup());
      expect(icon(option)).toHaveAttribute('data-ingredient-icon', 'parmesan');
      expect(icon(option)).toHaveAttribute('data-ingredient-tint', 'dairy');
      expect(icon(option)).toHaveAttribute('aria-hidden', 'true');
    });

    it('shows an unmapped Ingredient the Default Icon, tinted by its Aisle', async () => {
      withResult({
        parentCategory: {
          ...parmesan.parentCategory,
          aisle: { id: DAIRY_AISLE_ID, name: 'Dairy & eggs' },
        },
      });
      renderWithProviders(<ShoppingPage />);
      const { option } = await findParmesanRow(userEvent.setup());
      expect(icon(option)).toHaveAttribute('data-ingredient-icon', 'default');
      expect(icon(option)).toHaveAttribute('data-ingredient-tint', 'dairy');
    });

    it('tints an Aisle without a tint neutral', async () => {
      withResult({
        id: PARMESAN_SEED_ID,
        parentCategory: {
          ...parmesan.parentCategory,
          aisle: { id: 'admin-made-aisle', name: 'Dairy & eggs' },
        },
      });
      renderWithProviders(<ShoppingPage />);
      const { option } = await findParmesanRow(userEvent.setup());
      expect(icon(option)).toHaveAttribute('data-ingredient-icon', 'parmesan');
      expect(icon(option)).toHaveAttribute('data-ingredient-tint', 'neutral');
    });

    it('offers Use as typed, with its hint, for a name the Catalog does not have', async () => {
      withParmesan({
        'GET /api/catalog/search': () => Response.json({ results: [] }),
      });
      renderWithProviders(<ShoppingPage />);
      const user = userEvent.setup();
      const dialog = await openSheet(user);
      await user.type(search(dialog), 'Dragon fruit');

      const row = await within(dialog).findByRole('option', {
        name: /Use “Dragon fruit” as typed/,
      });
      expect(row).toHaveTextContent(
        'Not in the catalog · saved as an unmatched item',
      );
      expect(
        await within(dialog).findByText('No match for “Dragon fruit”'),
      ).toBeVisible();
      // The sheet's own free-text row is gone.
      expect(
        within(dialog).queryByRole('option', {
          name: /Add “Dragon fruit” to (the )?list/,
        }),
      ).toBeNull();
    });

    it('shows the shared skeleton rows while the first results load', async () => {
      stubShopping();
      const answerOthers = globalThis.fetch;
      let release = () => {};
      vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
        if (!String(input).includes('/api/catalog/search')) {
          return answerOthers(input, init);
        }
        return new Promise<Response>((resolve) => {
          release = () => resolve(Response.json({ results: [parmesan] }));
        });
      });
      renderWithProviders(<ShoppingPage />);
      const user = userEvent.setup();
      const dialog = await openSheet(user);
      await user.click(search(dialog));
      await user.paste('parm');

      expect(
        (await within(dialog).findAllByTestId('search-skeleton')).length,
      ).toBeGreaterThan(0);
      release();
      expect(
        await within(dialog).findByRole('option', { name: /Parmesan/ }),
      ).toBeVisible();
      expect(within(dialog).queryByTestId('search-skeleton')).toBeNull();
    });

    describe('when the Ingredient is already on the list', () => {
      const onList = (overrides: Partial<ShoppingItem>) =>
        list([
          {
            aisle: produce,
            items: [{ ...tomato, checked: !overrides.checked }],
          },
          {
            aisle: dairy,
            items: [
              item({
                id: 'p1',
                ingredientId: 'parmesan-id',
                name: 'Parmesan',
                quantity: 100,
                unit: 'g',
                ...overrides,
              }),
            ],
          },
        ]);
      const amountHint = (dialog: HTMLElement) =>
        within(dialog).queryByText(/Already on your list/);

      it('shows no tag or hint when it is not on the list or only checked', async () => {
        withParmesan({}, onList({ checked: true }));
        renderWithProviders(<ShoppingPage />);
        const user = userEvent.setup();
        const { dialog, option } = await findParmesanRow(user);

        expect(within(option).queryByText('On list')).toBeNull();
        await user.click(option);
        expect(amountHint(dialog)).toBeNull();
      });

      it('switches to the separate-line hint when a typed unit changes the unit', async () => {
        withParmesan({}, onList({}));
        renderWithProviders(<ShoppingPage />);
        const user = userEvent.setup();
        const { dialog, option } = await findParmesanRow(user);
        await user.click(option);

        await user.type(
          within(dialog).getByRole('textbox', { name: /Amount of Parmesan/ }),
          '200 kg',
        );
        expect(
          within(dialog).getByText(
            'Already on your list in g. This adds a separate line.',
          ),
        ).toBeVisible();
      });

      it('names the other units, or says "other units" when one line has none', async () => {
        const lines = (...units: ShoppingItem['unit'][]) =>
          list([
            { aisle: produce, items: [{ ...tomato, checked: true }] },
            {
              aisle: dairy,
              items: units.map((unit, i) =>
                item({
                  id: `p${i}`,
                  ingredientId: 'parmesan-id',
                  name: 'Parmesan',
                  quantity: 1,
                  unit,
                }),
              ),
            },
          ]);
        withParmesan({}, lines('kg', 'pcs'));
        const view = renderWithProviders(<ShoppingPage />);
        const user = userEvent.setup();
        let found = await findParmesanRow(user);
        await user.click(found.option);
        expect(
          within(found.dialog).getByText(
            'Already on your list in kg and pcs. This adds a separate line.',
          ),
        ).toBeVisible();
        view.unmount();
        vi.unstubAllGlobals();

        withParmesan({}, lines('kg', null));
        const mixed = renderWithProviders(<ShoppingPage />);
        found = await findParmesanRow(user);
        await user.click(found.option);
        expect(
          within(found.dialog).getByText(
            'Already on your list in other units. This adds a separate line.',
          ),
        ).toBeVisible();
        mixed.unmount();
        vi.unstubAllGlobals();

        withParmesan({}, lines(null));
        renderWithProviders(<ShoppingPage />);
        found = await findParmesanRow(user);
        await user.click(found.option);
        expect(
          within(found.dialog).getByText(
            'Already on your list with no unit. This adds a separate line.',
          ),
        ).toBeVisible();
      });

      it('ends the Romanian hint without a double period after an abbreviated unit', async () => {
        withParmesan(
          {},
          list([
            { aisle: produce, items: [{ ...tomato, checked: true }] },
            {
              aisle: dairy,
              items: [
                item({
                  id: 'p1',
                  ingredientId: 'parmesan-id',
                  name: 'Parmesan',
                  quantity: 1,
                  unit: 'pcs',
                }),
              ],
            },
          ]),
        );
        renderWithProviders(<ShoppingPage />, { locale: 'ro' });
        const user = userEvent.setup();
        await screen.findByText('1 de cumpărat');
        await user.click(
          screen.getByRole('button', { name: 'Adaugă produse' }),
        );
        const dialog = await screen.findByRole('dialog', {
          name: 'Adaugă produse',
        });
        await user.type(
          within(dialog).getByRole('combobox', { name: 'Caută ingrediente' }),
          'parm',
        );
        await user.click(
          await within(dialog).findByRole('option', { name: /Parmesan/ }),
        );
        expect(
          within(dialog).getByText(
            'Este deja pe listă în buc.; se adaugă o linie separată.',
          ),
        ).toBeVisible();
      });

      it('explains the merge for a typed name that matches an unchecked Unmatched line', async () => {
        withParmesan(
          {},
          list([
            { aisle: produce, items: [{ ...tomato, checked: true }] },
            {
              aisle: null,
              items: [
                item({
                  id: 'u1',
                  name: 'dragon  Fruit',
                  quantity: 2,
                  unit: 'pcs',
                  unmatched: true,
                }),
              ],
            },
          ]),
        );
        renderWithProviders(<ShoppingPage />);
        const user = userEvent.setup();
        const dialog = await openSheet(user);
        await user.type(search(dialog), ' Dragon fruit ');
        const row = await within(dialog).findByRole('option', {
          name: /Use “Dragon fruit” as typed/,
        });
        expect(within(row).getByText('On list')).toBeVisible();
        await user.click(row);
        expect(
          within(dialog).getByText(
            'Already on your list in pcs. This adds a separate line.',
          ),
        ).toBeVisible();
        await user.click(
          within(
            within(dialog).getByRole('group', { name: 'Choose a unit' }),
          ).getByRole('button', { name: 'pcs' }),
        );
        expect(
          within(dialog).getByText(
            'Already on your list. Adding again increases the amount.',
          ),
        ).toBeVisible();
      });

      it('tags it and explains the merge, following the unit', async () => {
        withParmesan({}, onList({}));
        renderWithProviders(<ShoppingPage />);
        const user = userEvent.setup();
        const { dialog, option } = await findParmesanRow(user);

        expect(within(option).getByText('On list')).toBeVisible();
        expect(amountHint(dialog)).toBeNull();
        await user.click(option);
        expect(
          within(dialog).getByText(
            'Already on your list. Adding again increases the amount.',
          ),
        ).toBeVisible();

        await user.click(
          within(dialog).getByRole('button', { name: 'Unit: g' }),
        );
        await user.click(
          within(dialog).getByRole('menuitemradio', { name: 'kg' }),
        );
        expect(
          within(dialog).getByText(
            'Already on your list in g. This adds a separate line.',
          ),
        ).toBeVisible();

        await user.click(
          within(dialog).getByRole('button', { name: 'Unit: kg' }),
        );
        await user.click(
          within(dialog).getByRole('menuitemradio', { name: 'g' }),
        );
        expect(
          within(dialog).getByText(
            'Already on your list. Adding again increases the amount.',
          ),
        ).toBeVisible();
      });
    });

    describe('Usual amounts', () => {
      beforeEach(() => {
        vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(300);
        vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(
          60,
        );
      });
      afterEach(() => vi.restoreAllMocks());

      const chipLabels = (group: HTMLElement) =>
        within(group)
          .getAllByRole('button')
          .map((chip) => chip.getAttribute('aria-label'));

      it('offers the usual amounts of the picked Ingredient, scaled by its Amount Scale', async () => {
        withParmesan({
          'GET /api/catalog/search': () =>
            Response.json({
              results: [{ ...parmesan, amountScale: 'large' }],
            }),
        });
        renderWithProviders(<ShoppingPage />);
        const user = userEvent.setup();
        const { dialog, option } = await findParmesanRow(user);

        await user.click(option);
        await user.type(
          within(dialog).getByRole('textbox', {
            name: 'Amount of Parmesan, for example 2 or 500 g',
          }),
          '2',
        );

        expect(
          chipLabels(
            within(dialog).getByRole('group', {
              name: 'Usual amounts for Parmesan',
            }),
          ),
        ).toEqual(['500 g', '1,000 g', '2,000 g', '5,000 g']);
      });

      it('splits a typed unit off first, so the chips follow it', async () => {
        withParmesan({
          'GET /api/catalog/search': () =>
            Response.json({
              results: [{ ...parmesan, amountScale: 'large' }],
            }),
        });
        renderWithProviders(<ShoppingPage />);
        const user = userEvent.setup();
        const { dialog, option } = await findParmesanRow(user);

        await user.click(option);
        await user.type(
          within(dialog).getByRole('textbox', {
            name: 'Amount of Parmesan, for example 2 or 500 g',
          }),
          '2 kg',
        );

        expect(
          within(dialog).getByRole('button', { name: 'Unit: kg' }),
        ).toBeVisible();
        expect(
          chipLabels(
            within(dialog).getByRole('group', {
              name: 'Usual amounts for Parmesan',
            }),
          ),
        ).toEqual(['0.5 kg', '1 kg', '2 kg', '5 kg']);
      });

      it('converts the typed number when the unit changes, so 1500 g becomes 1.5 kg', async () => {
        withParmesan();
        renderWithProviders(<ShoppingPage />);
        const user = userEvent.setup();
        const { dialog, option } = await findParmesanRow(user);

        await user.click(option);
        await user.type(
          within(dialog).getByRole('textbox', {
            name: 'Amount of Parmesan, for example 2 or 500 g',
          }),
          '1500 g',
        );
        await user.click(
          within(dialog).getByRole('button', { name: 'Unit: g' }),
        );
        await user.click(
          within(dialog).getByRole('menuitemradio', { name: 'kg' }),
        );

        expect(
          within(dialog).getByRole('textbox', {
            name: 'Amount of Parmesan, for example 2 or 500 g',
          }),
        ).toHaveValue('1.5');
        expect(
          within(dialog).getByRole('button', { name: 'Unit: kg' }),
        ).toBeVisible();
      });
    });

    it('adds a Catalog Match with amount and unit, then resets the search', async () => {
      const { calls } = withParmesan();
      renderWithProviders(<ShoppingPage />);
      const user = userEvent.setup();
      const { dialog, option } = await findParmesanRow(user);

      await user.click(option);
      // The unit defaults to the Ingredient's own.
      expect(
        within(dialog).getByRole('button', { name: 'Unit: g' }),
      ).toBeVisible();
      await user.type(
        within(dialog).getByRole('textbox', {
          name: 'Amount of Parmesan, for example 2 or 500 g',
        }),
        '100',
      );
      await user.click(
        within(dialog).getByRole('button', {
          name: 'Add Parmesan to the list',
        }),
      );

      expect(await screen.findByText('Added Parmesan')).toBeVisible();
      // Announced: the toast lives inside the dialog, not behind its aria-hidden.
      expect(within(dialog).getByRole('alert')).toHaveTextContent(
        'Added Parmesan',
      );
      expect(posts(calls)[0]?.body).toEqual({
        ingredientId: 'parmesan-id',
        quantity: 100,
        unit: 'g',
      });
      expect(
        within(dialog).getByRole('button', { name: 'Done, 1 added' }),
      ).toBeVisible();
      expect(search(dialog)).toHaveValue('');
      expect(search(dialog)).toHaveFocus();
      expect(within(dialog).queryByRole('option')).toBeNull();
      expect(await screen.findByText('100 g')).toBeVisible();
    });

    it('changes the unit from the dropdown menu and returns focus to the amount', async () => {
      const { calls } = withParmesan();
      renderWithProviders(<ShoppingPage />);
      const user = userEvent.setup();
      const { dialog, option } = await findParmesanRow(user);

      await user.click(option);
      const amount = within(dialog).getByRole('textbox', {
        name: /Amount of Parmesan/,
      });
      await user.type(amount, '2');
      await user.click(within(dialog).getByRole('button', { name: 'Unit: g' }));
      expect(
        within(dialog).getByRole('menuitemradio', { name: 'g' }),
      ).toHaveAttribute('aria-checked', 'true');
      await user.click(
        within(dialog).getByRole('menuitemradio', { name: 'kg' }),
      );

      expect(amount).toHaveFocus();
      expect(
        within(dialog).queryByRole('menuitemradio', { name: 'kg' }),
      ).toBeNull();
      await user.keyboard('{Enter}');

      await waitFor(() => expect(posts(calls)).toHaveLength(1));
      // The unit change converts the typed 2 g to 0.002 kg, so the amount stays the same.
      expect(posts(calls)[0]?.body).toEqual({
        ingredientId: 'parmesan-id',
        quantity: 0.002,
        unit: 'kg',
      });
    });

    it('picks the active result with the arrow keys and Enter, and clears the pick with Backspace', async () => {
      withParmesan();
      renderWithProviders(<ShoppingPage />);
      const user = userEvent.setup();
      const { dialog } = await findParmesanRow(user);

      await user.click(search(dialog));
      await user.keyboard('{ArrowDown}{Enter}');
      expect(
        within(dialog).getByRole('textbox', { name: /Amount of Parmesan/ }),
      ).toBeVisible();
      expect(
        within(dialog).getByRole('combobox', {
          name: 'Ingredient: Parmesan. Press Backspace to change',
        }),
      ).toBeVisible();

      await user.keyboard('{Backspace}');
      expect(
        within(dialog).queryByRole('textbox', { name: /Amount of/ }),
      ).toBeNull();
      expect(search(dialog)).toHaveValue('');
    });

    it('adds a typed name as an Unmatched item through Use as typed', async () => {
      const { calls } = stubShopping({
        'GET /api/catalog/search': () => Response.json({ results: [] }),
        'POST /api/shopping-list/items': () => Response.json(base),
      });
      renderWithProviders(<ShoppingPage />);
      const user = userEvent.setup();
      const dialog = await openSheet(user);

      await user.type(search(dialog), 'Dragon fruit');
      await user.click(
        await within(dialog).findByRole('option', {
          name: /Use “Dragon fruit” as typed/,
        }),
      );
      // No unit yet: the unit toggles show, none pressed.
      expect(
        within(dialog).getByRole('group', { name: 'Choose a unit' }),
      ).toBeVisible();
      await user.click(
        within(dialog).getByRole('button', {
          name: 'Add Dragon fruit to the list',
        }),
      );

      await waitFor(() => expect(posts(calls)).toHaveLength(1));
      expect(posts(calls)[0]?.body).toEqual({ name: 'Dragon fruit' });
    });

    it('picks Use as typed with the arrow keys and Enter when nothing matches', async () => {
      const { calls } = stubShopping({
        'GET /api/catalog/search': () => Response.json({ results: [] }),
        'POST /api/shopping-list/items': () => Response.json(base),
      });
      renderWithProviders(<ShoppingPage />);
      const user = userEvent.setup();
      const dialog = await openSheet(user);

      await user.type(search(dialog), 'Dragon fruit');
      await within(dialog).findByRole('option', {
        name: /Use “Dragon fruit” as typed/,
      });
      // "Add to your catalog" is the first option when nothing matches (#270); Use as typed is second.
      await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');
      await user.click(
        within(dialog).getByRole('button', {
          name: 'Add Dragon fruit to the list',
        }),
      );

      await waitFor(() => expect(posts(calls)).toHaveLength(1));
      expect(posts(calls)[0]?.body).toEqual({ name: 'Dragon fruit' });
    });

    it('hides the free-text row when a result has exactly the typed name', async () => {
      withParmesan();
      renderWithProviders(<ShoppingPage />);
      const user = userEvent.setup();
      const dialog = await openSheet(user);

      await user.type(search(dialog), 'parmesan');
      await within(dialog).findByRole('option', { name: /Parmesan/ });
      expect(
        within(dialog).queryByRole('option', { name: /as typed/ }),
      ).toBeNull();
    });

    it('keeps the row open and marks an invalid amount without adding', async () => {
      const { calls } = withParmesan();
      renderWithProviders(<ShoppingPage />);
      const user = userEvent.setup();
      const { dialog, option } = await findParmesanRow(user);

      await user.click(option);
      const amount = within(dialog).getByRole('textbox', {
        name: /Amount of Parmesan/,
      });
      for (const bad of ['0', '-2']) {
        await user.clear(amount);
        await user.type(amount, bad);
        await user.keyboard('{Enter}');
        expect(amount).toBeInvalid();
        expect(amount).toHaveAccessibleDescription(/0.001 to 1,000,000/);
      }
      await user.click(
        within(dialog).getByRole('button', {
          name: 'Add Parmesan to the list',
        }),
      );
      expect(posts(calls)).toHaveLength(0);
      expect(amount).toBeVisible();
    });

    it('shows the amount error only after an add attempt, and clears it once valid', async () => {
      withParmesan();
      renderWithProviders(<ShoppingPage />);
      const user = userEvent.setup();
      const { dialog, option } = await findParmesanRow(user);

      await user.click(option);
      const amount = within(dialog).getByRole('textbox', {
        name: /Amount of Parmesan/,
      });
      await user.type(amount, '-2');
      expect(amount).toBeValid();
      expect(within(dialog).queryByText(/0.001 to 1,000,000/)).toBeNull();

      await user.keyboard('{Enter}');
      expect(amount).toBeInvalid();
      expect(within(dialog).getByText(/0.001 to 1,000,000/)).toBeVisible();

      await user.clear(amount);
      await user.type(amount, '2');
      expect(amount).toBeValid();
      expect(within(dialog).queryByText(/0.001 to 1,000,000/)).toBeNull();
      await user.type(amount, 'x');
      expect(amount).toBeInvalid();
    });

    it.each([
      ['500 g', '500', 500, 'g', 'g'],
      ['1,5 kg', '1,5', 1.5, 'kg', 'kg'],
      ['2 pcs', '2', 2, 'pcs', 'pcs'],
      ['3 stk', '3', 3, 'pcs', 'pcs'],
      ['3 stk.', '3', 3, 'pcs', 'pcs'],
      ['2 PCS', '2', 2, 'pcs', 'pcs'],
      ['4 buc', '4', 4, 'pcs', 'pcs'],
      ['2 pc', '2', 2, 'pcs', 'pcs'],
      ['1 L', '1', 1, 'l', 'L'],
      ['250ml', '250', 250, 'ml', 'ml'],
    ])(
      'splits typed "%s" into the amount and the unit chip',
      async (typed, shown, quantity, unit, label) => {
        const { calls } = withParmesan();
        renderWithProviders(<ShoppingPage />);
        const user = userEvent.setup();
        const { dialog, option } = await findParmesanRow(user);

        await user.click(option);
        const amount = within(dialog).getByRole('textbox', {
          name: /Amount of Parmesan/,
        });
        await user.type(amount, typed);
        expect(amount).toHaveValue(shown);
        expect(
          within(dialog).getByRole('button', { name: `Unit: ${label}` }),
        ).toBeVisible();
        await user.keyboard('{Enter}');

        await waitFor(() => expect(posts(calls)).toHaveLength(1));
        expect(posts(calls)[0]?.body).toEqual({
          ingredientId: 'parmesan-id',
          quantity,
          unit,
        });
      },
    );

    it.each([
      ['500 gram', '500 gram'],
      ['1 liter', '1 liter'],
      ['4 bucăți', '4 bucăți'],
    ])(
      'keeps "%s" as typed, invalid, with the chip unchanged',
      async (typed, shown) => {
        const { calls } = withParmesan();
        renderWithProviders(<ShoppingPage />);
        const user = userEvent.setup();
        const { dialog, option } = await findParmesanRow(user);

        await user.click(option);
        const amount = within(dialog).getByRole('textbox', {
          name: /Amount of Parmesan/,
        });
        await user.type(amount, `${typed}{Enter}`);

        expect(amount).toHaveValue(shown);
        expect(amount).toBeInvalid();
        expect(
          within(dialog).getByRole('button', { name: 'Unit: g' }),
        ).toBeVisible();
        expect(posts(calls)).toHaveLength(0);
      },
    );

    it('keeps typing digits after a split, and splits a pasted amount cleanly', async () => {
      const { calls } = withParmesan();
      renderWithProviders(<ShoppingPage />);
      const user = userEvent.setup();
      const { dialog, option } = await findParmesanRow(user);

      await user.click(option);
      const amount = within(dialog).getByRole('textbox', {
        name: /Amount of Parmesan/,
      });
      await user.type(amount, '50 g0');
      expect(amount).toHaveValue('500');
      expect(
        within(dialog).getByRole('button', { name: 'Unit: g' }),
      ).toBeVisible();

      await user.clear(amount);
      await user.type(amount, '2 kg');
      await user.click(amount);
      await user.keyboard('{Control>}a{/Control}');
      await user.paste('25 ml');
      expect(amount).toHaveValue('25');
      expect(
        within(dialog).getByRole('button', { name: 'Unit: ml' }),
      ).toBeVisible();
      await user.keyboard('{Enter}');
      await waitFor(() => expect(posts(calls)).toHaveLength(1));
      expect(posts(calls)[0]?.body).toEqual({
        ingredientId: 'parmesan-id',
        quantity: 25,
        unit: 'ml',
      });
    });

    it('treats a select-all paste after a split as a fresh amount', async () => {
      withParmesan();
      renderWithProviders(<ShoppingPage />);
      const user = userEvent.setup();
      const { dialog, option } = await findParmesanRow(user);

      await user.click(option);
      const amount = within(dialog).getByRole('textbox', {
        name: /Amount of Parmesan/,
      });
      await user.type(amount, '2 kg');
      await user.click(amount);
      await user.keyboard('{Control>}a{/Control}');
      await user.paste('2g');
      expect(amount).toHaveValue('2');
      expect(
        within(dialog).getByRole('button', { name: 'Unit: g' }),
      ).toBeVisible();
    });

    it('keeps a unit chosen from the chip after a split', async () => {
      const { calls } = withParmesan();
      renderWithProviders(<ShoppingPage />);
      const user = userEvent.setup();
      const { dialog, option } = await findParmesanRow(user);

      await user.click(option);
      const amount = within(dialog).getByRole('textbox', {
        name: /Amount of Parmesan/,
      });
      await user.type(amount, '2 kg');
      await user.click(
        within(dialog).getByRole('button', { name: 'Unit: kg' }),
      );
      await user.click(
        within(dialog).getByRole('menuitemradio', { name: 'g' }),
      );
      await user.type(amount, 'x');
      await user.clear(amount);
      await user.type(amount, '3{Enter}');

      await waitFor(() => expect(posts(calls)).toHaveLength(1));
      expect(posts(calls)[0]?.body).toEqual({
        ingredientId: 'parmesan-id',
        quantity: 3,
        unit: 'g',
      });
    });

    it('lets a typed unit override a chosen chip', async () => {
      const { calls } = withParmesan();
      renderWithProviders(<ShoppingPage />);
      const user = userEvent.setup();
      const { dialog, option } = await findParmesanRow(user);

      await user.click(option);
      await user.click(within(dialog).getByRole('button', { name: 'Unit: g' }));
      await user.click(
        within(dialog).getByRole('menuitemradio', { name: 'kg' }),
      );
      await user.type(
        within(dialog).getByRole('textbox', { name: /Amount of Parmesan/ }),
        '2 g{Enter}',
      );

      await waitFor(() => expect(posts(calls)).toHaveLength(1));
      expect(posts(calls)[0]?.body).toEqual({
        ingredientId: 'parmesan-id',
        quantity: 2,
        unit: 'g',
      });
    });

    it('accepts a plain comma decimal as the quantity', async () => {
      const { calls } = withParmesan();
      renderWithProviders(<ShoppingPage />);
      const user = userEvent.setup();
      const { dialog, option } = await findParmesanRow(user);

      await user.click(option);
      await user.type(
        within(dialog).getByRole('textbox', { name: /Amount of Parmesan/ }),
        '1,5{Enter}',
      );

      await waitFor(() => expect(posts(calls)).toHaveLength(1));
      expect(posts(calls)[0]?.body).toEqual({
        ingredientId: 'parmesan-id',
        quantity: 1.5,
        unit: 'g',
      });
    });

    it('leaves input that is not a number and a unit as it is, and still validates it', async () => {
      const { calls } = withParmesan();
      renderWithProviders(<ShoppingPage />);
      const user = userEvent.setup();
      const { dialog, option } = await findParmesanRow(user);

      await user.click(option);
      const amount = within(dialog).getByRole('textbox', {
        name: /Amount of Parmesan/,
      });
      await user.type(amount, '5 xyz{Enter}');

      expect(amount).toHaveValue('5 xyz');
      expect(amount).toBeInvalid();
      expect(
        within(dialog).getByRole('button', { name: 'Unit: g' }),
      ).toBeVisible();
      expect(posts(calls)).toHaveLength(0);
    });

    it('shows an Alert and keeps everything typed when adding fails', async () => {
      withParmesan({
        'POST /api/shopping-list/items': () =>
          Response.json({ code: 'boom', params: {} }, { status: 500 }),
      });
      renderWithProviders(<ShoppingPage />);
      const user = userEvent.setup();
      const { dialog, option } = await findParmesanRow(user);

      await user.click(option);
      const amount = within(dialog).getByRole('textbox', {
        name: /Amount of Parmesan/,
      });
      await user.type(amount, '100{Enter}');

      expect(await within(dialog).findByRole('alert')).toBeVisible();
      expect(amount).toHaveValue('100');
      // The pick stays a token in the field.
      expect(
        within(dialog).getByRole('combobox', {
          name: 'Ingredient: Parmesan. Press Backspace to change',
        }),
      ).toHaveValue('Parmesan');
      expect(
        within(dialog).getByRole('button', { name: 'Done' }),
      ).toBeVisible();
      expect(screen.queryByText('Added Parmesan')).toBeNull();
    });

    it('shows no stale add error when the sheet is reopened', async () => {
      withParmesan({
        'POST /api/shopping-list/items': () =>
          Response.json({ code: 'boom', params: {} }, { status: 500 }),
      });
      renderWithProviders(<ShoppingPage />);
      const user = userEvent.setup();
      const { dialog, option } = await findParmesanRow(user);
      await user.click(option);
      await user.click(
        within(dialog).getByRole('button', {
          name: 'Add Parmesan to the list',
        }),
      );
      expect(await within(dialog).findByRole('alert')).toBeVisible();

      await user.click(within(dialog).getByRole('button', { name: 'Done' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      const reopened = await openSheet(user);

      expect(within(reopened).queryByRole('alert')).toBeNull();
    });

    it('closes the unit menu on Escape before the sheet', async () => {
      withParmesan();
      renderWithProviders(<ShoppingPage />);
      const user = userEvent.setup();
      const { dialog, option } = await findParmesanRow(user);

      await user.click(option);
      await user.click(within(dialog).getByRole('button', { name: 'Unit: g' }));
      await user.keyboard('{Escape}');

      expect(
        within(dialog).queryByRole('menuitemradio', { name: 'kg' }),
      ).toBeNull();
      expect(
        within(dialog).getByRole('textbox', { name: /Amount of Parmesan/ }),
      ).toHaveFocus();
      expect(screen.getByRole('dialog')).toBeVisible();
      await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });

    it('keeps the query, open row and amount through a background poll', async () => {
      const shopping = withParmesan();
      vi.useFakeTimers({ shouldAdvanceTime: true });
      renderWithProviders(<ShoppingPage />);
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const { dialog, option } = await findParmesanRow(user);
      await user.click(option);
      const amount = within(dialog).getByRole('textbox', {
        name: /Amount of Parmesan/,
      });
      await user.type(amount, '7');

      shopping.setCurrent(
        list([
          {
            aisle: produce,
            items: [tomato, item({ id: 'i5', name: 'Basil' })],
          },
        ]),
      );
      await act(() =>
        vi.advanceTimersByTimeAsync(SHOPPING_POLL_INTERVAL_MS + 100),
      );

      expect(await screen.findByText('Basil')).toBeInTheDocument();
      expect(
        within(dialog).getByRole('combobox', {
          name: 'Ingredient: Parmesan. Press Backspace to change',
        }),
      ).toBeVisible();
      expect(amount).toHaveValue('7');
    });

    it('is a centred dialog from md up', async () => {
      stubViewport(1024);
      stubShopping();
      renderWithProviders(<ShoppingPage />);

      const dialog = await openSheet();

      expect(dialog).toBeVisible();
      await waitFor(() => expect(search(dialog)).toHaveFocus());
    });

    describe('Templates', () => {
      const line = (
        id: string,
        name: string,
        overrides: Partial<TemplateLine> = {},
      ): TemplateLine => ({
        id,
        ingredientId: `${id}-ingredient`,
        name,
        quantity: null,
        unit: null,
        unmatched: false,
        inPantry: false,
        aisle: produce,
        ...overrides,
      });
      const taco: Template = {
        id: 't1',
        name: 'Taco night',
        lines: [
          line('milk', 'Milk', {
            quantity: 1,
            unit: 'l',
            inPantry: true,
            aisle: dairy,
          }),
          line('tomato', 'Tomato', { quantity: 3 }),
          line('flour', 'Flour', { aisle: dairy }),
          line('saffron', 'Saffron', {
            ingredientId: null,
            unmatched: true,
            aisle: null,
          }),
        ],
      };
      const summaries = [
        {
          id: 't1',
          name: 'Taco night',
          lineCount: 4,
          previewNames: ['Milk', 'Tomato', 'Flour', 'Saffron'],
        },
        { id: 't2', name: 'Empty one', lineCount: 0, previewNames: [] },
      ];
      const onList = list([
        {
          aisle: produce,
          items: [
            item({
              id: 'i1',
              name: 'Tomato',
              ingredientId: 'tomato-ingredient',
              quantity: 250,
              unit: 'g',
            }),
            item({
              id: 'i3',
              name: 'Milk',
              ingredientId: 'milk-ingredient',
              checked: true,
            }),
          ],
        },
        {
          aisle: null,
          items: [item({ id: 'i4', name: 'saffron ', unmatched: true })],
        },
      ]);

      const stubTemplates = (routes: Record<string, () => Response> = {}) =>
        stubShopping(
          {
            'GET /api/shopping-templates': () =>
              Response.json({ templates: summaries }),
            'GET /api/shopping-templates/t1': () => Response.json(taco),
            ...routes,
          },
          onList,
        );
      describe('Save as template', () => {
        const withEditor = (
          <Routes>
            <Route path="/" element={<ShoppingPage />} />
            <Route
              path="/shopping/templates/:id"
              element={<h1>Template editor</h1>}
            />
          </Routes>
        );
        const openSave = async (user = userEvent.setup()) => {
          await user.click(
            await screen.findByRole('button', {
              name: /Save this list as a template/,
            }),
          );
          return screen.findByRole('dialog', { name: 'Save as template' });
        };

        it('hides the save row on an empty list', async () => {
          stubShopping({}, list([]));
          renderWithProviders(<ShoppingPage />);
          expect(await screen.findByText('Nothing to buy')).toBeVisible();
          expect(
            screen.queryByRole('button', {
              name: /Save this list as a template/,
            }),
          ).toBeNull();
        });

        it('opens its own sheet from the row under the list', async () => {
          stubTemplates();
          renderWithProviders(<ShoppingPage />);
          const user = userEvent.setup();

          await user.click(
            await screen.findByRole('button', {
              name: /Save this list as a template.*Reuse these 3 items next time/,
            }),
          );

          const dialog = await screen.findByRole('dialog', {
            name: 'Save as template',
          });
          expect(
            within(dialog).getByRole('textbox', { name: 'Template name' }),
          ).toHaveAttribute('placeholder', 'e.g. Weekly shop');
          expect(
            screen.queryByRole('dialog', { name: 'Add items' }),
          ).toBeNull();
        });

        it('focuses the name from md up', async () => {
          stubViewport(1024);
          stubTemplates();
          renderWithProviders(<ShoppingPage />);
          const dialog = await openSave();

          await vi.waitFor(() =>
            expect(
              within(dialog).getByRole('textbox', { name: 'Template name' }),
            ).toHaveFocus(),
          );
        });

        it('previews every item with its amount and leaves the keyboard down on a phone', async () => {
          stubTemplates();
          renderWithProviders(<ShoppingPage />);
          const user = userEvent.setup();
          const dialog = await openSave(user);

          const name = within(dialog).getByRole('textbox', {
            name: 'Template name',
          });
          await vi.waitFor(() => expect(dialog).toHaveFocus());
          expect(name).not.toHaveFocus();
          expect(name).toHaveAttribute('maxlength', '100');
          expect(
            within(dialog).getByText('Saves all 3 items, ticked ones too'),
          ).toBeVisible();
          expect(
            within(dialog).getByText('Tomato (250 g), Milk, Saffron', {
              exact: false,
            }),
          ).toBeVisible();
          expect(
            within(dialog).getByRole('button', { name: 'Save template' }),
          ).toBeDisabled();
        });

        it('saves under the name, closes and offers Edit', async () => {
          const { calls } = stubTemplates({
            'POST /api/shopping-templates/from-list': () =>
              Response.json(
                { id: 't3', name: 'Weekly shop', lines: [] },
                { status: 201 },
              ),
          });
          renderWithProviders(withEditor);
          const user = userEvent.setup();
          const dialog = await openSave(user);

          await user.type(
            within(dialog).getByRole('textbox', { name: 'Template name' }),
            'Weekly shop{Enter}',
          );

          expect(await screen.findByText('Saved “Weekly shop”')).toBeVisible();
          expect(
            calls.find(
              (c) => c.key === 'POST /api/shopping-templates/from-list',
            )?.body,
          ).toEqual({ name: 'Weekly shop' });
          await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
          expect(screen.queryByText('Template editor')).toBeNull();

          await user.click(screen.getByRole('button', { name: 'Edit' }));
          expect(await screen.findByText('Template editor')).toBeVisible();
        });

        it('saves from the footer button too', async () => {
          const { calls } = stubTemplates({
            'POST /api/shopping-templates/from-list': () =>
              Response.json(
                { id: 't3', name: 'Weekly shop', lines: [] },
                { status: 201 },
              ),
          });
          renderWithProviders(<ShoppingPage />);
          const user = userEvent.setup();
          const dialog = await openSave(user);

          await user.type(
            within(dialog).getByRole('textbox', { name: 'Template name' }),
            'Weekly shop',
          );
          await user.click(
            within(dialog).getByRole('button', { name: 'Save template' }),
          );

          await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
          expect(
            calls.some(
              (c) => c.key === 'POST /api/shopping-templates/from-list',
            ),
          ).toBe(true);
        });

        it('closes without saving on Cancel', async () => {
          const { calls } = stubTemplates();
          renderWithProviders(<ShoppingPage />);
          const user = userEvent.setup();
          const dialog = await openSave(user);
          await user.type(
            within(dialog).getByRole('textbox', { name: 'Template name' }),
            'Weekly shop',
          );

          await user.click(
            within(dialog).getByRole('button', { name: 'Cancel' }),
          );

          await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
          expect(
            calls.some(
              (c) => c.key === 'POST /api/shopping-templates/from-list',
            ),
          ).toBe(false);
        });

        it('closes without saving on Escape', async () => {
          const { calls } = stubTemplates();
          renderWithProviders(<ShoppingPage />);
          const user = userEvent.setup();
          await openSave(user);

          await user.keyboard('{Escape}');

          await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
          expect(
            calls.some(
              (c) => c.key === 'POST /api/shopping-templates/from-list',
            ),
          ).toBe(false);
        });

        it('keeps the sheet open with the name and shows the API error', async () => {
          stubTemplates({
            'POST /api/shopping-templates/from-list': () =>
              Response.json(
                {
                  code: 'shopping.template_too_many_lines',
                  params: { max: 100 },
                },
                { status: 400 },
              ),
          });
          renderWithProviders(<ShoppingPage />);
          const user = userEvent.setup();
          const dialog = await openSave(user);
          const name = within(dialog).getByRole('textbox', {
            name: 'Template name',
          });

          await user.type(name, 'Big shop');
          await user.click(
            within(dialog).getByRole('button', { name: 'Save template' }),
          );

          expect(await within(dialog).findByRole('alert')).toBeVisible();
          expect(name).toHaveValue('Big shop');
        });

        it('disables Save and says why at the template limit', async () => {
          stubTemplates({
            'GET /api/shopping-templates': () =>
              Response.json({
                templates: Array.from({ length: 50 }, (_, i) => ({
                  id: `m${i}`,
                  name: `Template ${i}`,
                  lineCount: 0,
                  previewNames: [],
                })),
              }),
          });
          renderWithProviders(<ShoppingPage />);
          const user = userEvent.setup();
          const dialog = await openSave(user);

          await user.type(
            within(dialog).getByRole('textbox', { name: 'Template name' }),
            'One more',
          );

          expect(
            await within(dialog).findByText(/up to 50 templates/),
          ).toBeVisible();
          expect(
            within(dialog).getByRole('button', { name: 'Save template' }),
          ).toBeDisabled();
        });
      });

      it('shows no template section in the empty search without templates', async () => {
        stubShopping({
          'GET /api/shopping-templates': () => Response.json({ templates: [] }),
        });
        renderWithProviders(<ShoppingPage />);

        const dialog = await openSheet();

        expect(
          within(dialog).queryByText('Or start from a template'),
        ).toBeNull();
      });
    });

    it('opens under reduced motion', async () => {
      stubMotion(true);
      stubShopping();
      renderWithProviders(<ShoppingPage />);

      expect(await openSheet()).toBeVisible();
    });
  });

  it('refreshes on an interval and on window focus so other Members changes appear', async () => {
    const shopping = stubShopping();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderWithProviders(<ShoppingPage />);
    expect(await screen.findByText('1 to buy')).toBeVisible();

    shopping.setCurrent(
      list([
        { aisle: produce, items: [tomato, item({ id: 'i5', name: 'Basil' })] },
      ]),
    );
    await act(() =>
      vi.advanceTimersByTimeAsync(SHOPPING_POLL_INTERVAL_MS + 100),
    );
    expect(await screen.findByText('Basil')).toBeVisible();

    shopping.setCurrent(
      list([
        { aisle: produce, items: [tomato, item({ id: 'i6', name: 'Chives' })] },
      ]),
    );
    act(() => {
      window.dispatchEvent(new Event('visibilitychange'));
    });
    expect(await screen.findByText('Chives')).toBeVisible();
  });

  it('translates the copy', async () => {
    stubShopping({}, list([{ aisle: dairy, items: [milk] }]));
    renderWithProviders(<ShoppingPage />, { locale: 'ro' });

    expect(await screen.findByText('0 de cumpărat')).toBeVisible();
  });
});

describe('ShoppingPage add sheet has no Browse by aisle', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('keeps its chips but offers no Browse by aisle and never lists Aisles', async () => {
    const { calls } = stubShopping({
      'GET /api/catalog/aisles': () => Response.json({ aisles: [] }),
    });
    renderWithProviders(<ShoppingPage />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Add items' }),
    );
    const dialog = await screen.findByRole('dialog');
    const search = within(dialog).getByRole('combobox', {
      name: 'Search ingredients',
    });
    await userEvent.click(search);

    expect(screen.queryByText('Browse by aisle')).not.toBeInTheDocument();
    expect(calls.some((c) => c.key === 'GET /api/catalog/aisles')).toBe(false);
  });
});

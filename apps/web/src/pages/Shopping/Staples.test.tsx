import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CatalogSearchResult } from '../../lib/catalog';
import type { ShoppingList } from '../../lib/shopping';
import type { Staple } from '../../lib/staples';
import type { Suggestion } from '../../lib/suggestions';
import { renderWithProviders, stubApi } from '../../test/render';
import { SuggestionsWidget } from '../Dashboard/widgets/SuggestionsWidget';
import { ShoppingPage } from './ShoppingPage';
import { StaplesPage } from './StaplesPage';

const dairy = { id: 'a4', name: 'Dairy & eggs', sortOrder: 4 };
const baking = { id: 'a6', name: 'Baking', sortOrder: 6 };

const suggestion = (overrides: Partial<Suggestion> = {}): Suggestion => {
  const id = overrides.ingredientId ?? 'milk-id';
  const name = overrides.name ?? 'Milk';
  return {
    ingredientId: id,
    name,
    quantity: 2,
    unit: 'l',
    aisle: dairy,
    since: null,
    ingredient: {
      owner: 'catalog',
      amountScale: 'medium',
      id,
      name,
      defaultUnit: 'l',
      leafCategory: { id: 'leaf', name },
      parentCategory: { id: 'p', name: 'Dairy', aisle: dairy },
      defaults: { expiryDays: 7, location: 'fridge' },
    },
    ...overrides,
  };
};
const staple = (overrides: Partial<Staple> = {}): Staple => ({
  id: 's1',
  ingredientId: 'milk-id',
  name: 'Milk',
  quantity: 2,
  unit: 'l',
  aisle: dairy,
  ...overrides,
});

const emptyList = (groups: ShoppingList['groups'] = []): ShoppingList => ({
  id: 'l1',
  groups,
  summary: { remaining: 0, checked: 0 },
});

const flour: CatalogSearchResult = {
  owner: 'catalog',
  amountScale: 'medium',
  id: 'flour-id',
  name: 'Flour',
  defaultUnit: 'g',
  leafCategory: { id: 'f', name: 'Flour' },
  parentCategory: {
    id: 'b',
    name: 'Baking',
    aisle: { id: 'aisle', name: 'Baking' },
  },
  defaults: { expiryDays: 365, location: 'cupboard' },
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Suggestions in the Add sheet', () => {
  const openSheet = async () => {
    await userEvent.click(
      await screen.findByRole('button', { name: 'Add items' }),
    );
    return screen.findByRole('dialog');
  };

  // The Gone from your Pantry tiles (select, dismiss, Staples link) are covered by GoneTiles.test.tsx.
  it('shows the Gone tiles while the search is empty, and they go once the Member types', async () => {
    const { fetchMock } = stubApi({
      'GET /api/shopping-list': () => Response.json(emptyList()),
      'GET /api/shopping-list/suggestions': () =>
        Response.json({ staples: [suggestion()], usedUp: [], expired: [] }),
      'GET /api/catalog/search': () => Response.json({ results: [flour] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<ShoppingPage />);
    const dialog = await openSheet();

    expect(
      await within(dialog).findByRole('button', {
        name: 'Milk, missing staple',
      }),
    ).toBeVisible();

    await userEvent.type(
      within(dialog).getByRole('combobox', { name: 'Search ingredients' }),
      'flo',
    );
    await within(dialog).findByRole('option', { name: /Flour/ });
    expect(
      within(dialog).queryByRole('button', { name: 'Milk, missing staple' }),
    ).toBeNull();
    expect(
      within(dialog).queryByRole('button', { name: /Taco night/ }),
    ).toBeNull();
  });

  it('shows a Running low section below the Gone tiles; picking a tile selects it through the search, with no dismiss control', async () => {
    const { fetchMock } = stubApi({
      'GET /api/shopping-list': () => Response.json(emptyList()),
      'GET /api/shopping-list/suggestions': () =>
        Response.json({
          staples: [suggestion()],
          usedUp: [],
          expired: [],
          runningLow: [
            suggestion({
              ingredientId: 'flour-id',
              name: 'Flour',
              quantity: null,
              unit: null,
            }),
          ],
        }),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<ShoppingPage />);
    const dialog = await openSheet();

    const section = await within(dialog).findByRole('region', {
      name: 'Running low',
    });
    const gone = within(dialog).getByRole('region', {
      name: 'Gone from your Pantry',
    });
    expect(
      gone.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // Not a Gone tile: the Gone section holds Milk only.
    expect(
      within(gone).queryByRole('button', { name: /Flour/ }),
    ).not.toBeInTheDocument();
    expect(
      within(section).queryByRole('button', { name: /Dismiss/ }),
    ).not.toBeInTheDocument();

    await userEvent.click(
      within(section).getByRole('button', { name: 'Flour, running low' }),
    );
    expect(
      await within(dialog).findByRole('textbox', { name: /Amount of Flour/ }),
    ).toBeVisible();
  });

  it('hides the Running low section when no Ingredient is flagged', async () => {
    const { fetchMock } = stubApi({
      'GET /api/shopping-list': () => Response.json(emptyList()),
      'GET /api/shopping-list/suggestions': () =>
        Response.json({ staples: [suggestion()], usedUp: [], runningLow: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<ShoppingPage />);
    const dialog = await openSheet();

    await within(dialog).findByRole('button', { name: 'Milk, missing staple' });
    expect(within(dialog).queryByText(/Running low/)).not.toBeInTheDocument();
  });

  it('has no Suggestions section or header Staples link on the page', async () => {
    const { fetchMock } = stubApi({
      'GET /api/shopping-list': () => Response.json(emptyList()),
      'GET /api/shopping-list/suggestions': () =>
        Response.json({ staples: [suggestion()], usedUp: [], expired: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<ShoppingPage />);

    await screen.findByText(/Your list is empty/);

    expect(
      screen.queryByRole('link', { name: 'Staples' }),
    ).not.toBeInTheDocument();
  });

  it('toggles a Staple from a Shopping Item', async () => {
    const list = emptyList([
      {
        aisle: dairy,
        items: [
          {
            id: 'i1',
            ingredientId: 'milk-id',
            name: 'Milk',
            quantity: null,
            unit: null,
            checked: false,
            unmatched: false,
          },
        ],
      },
    ]);
    const { fetchMock, calls } = stubApi({
      'GET /api/shopping-list': () => Response.json(list),
      'GET /api/shopping-list/suggestions': () =>
        Response.json({ staples: [], usedUp: [], expired: [] }),
      'GET /api/staples': () => Response.json({ staples: [] }),
      'POST /api/staples': () => Response.json(staple(), { status: 201 }),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<ShoppingPage />);

    const star = await screen.findByRole('button', {
      name: 'Make Milk a staple',
    });
    await userEvent.click(star);

    await waitFor(() =>
      expect(calls.find((c) => c.key === 'POST /api/staples')?.body).toEqual({
        ingredientId: 'milk-id',
      }),
    );
  });
});

describe('StaplesPage', () => {
  const rowOf = (name: string) => screen.getByRole('group', { name });
  const deletes = (calls: Array<{ key: string }>) =>
    calls.filter((c) => c.key.startsWith('DELETE')).map((c) => c.key);
  const openSheet = async (
    user: ReturnType<typeof userEvent.setup>,
    name = 'Milk',
  ) => {
    act(() => rowOf(name).focus());
    await user.keyboard('{Enter}');
    return screen.findByRole('dialog', { name: `Edit ${name}` });
  };

  it('shows read-only rows with the preferred amount and no inputs or buttons', async () => {
    const { fetchMock } = stubApi({
      'GET /api/staples': () =>
        Response.json({
          staples: [
            staple(),
            staple({
              id: 's2',
              ingredientId: 'flour-id',
              name: 'Flour',
              quantity: null,
              unit: null,
            }),
          ],
        }),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<StaplesPage />);

    const milk = await screen.findByRole('group', { name: 'Milk' });
    expect(milk).toHaveTextContent('2 L');
    expect(rowOf('Flour')).not.toHaveTextContent(/\d/);
    expect(screen.queryByRole('spinbutton')).toBeNull();
    expect(screen.queryByRole('button', { name: /Save/ })).toBeNull();
    // The custom actions for screen readers are there, but not tab stops.
    for (const button of screen.getAllByRole('button', { name: /Remove/ })) {
      expect(button).toHaveAttribute('tabindex', '-1');
    }
  });

  it('adds a Staple from the Catalog search', async () => {
    let staples: Staple[] = [staple()];
    const { fetchMock, calls } = stubApi({
      'GET /api/staples': () => Response.json({ staples }),
      'GET /api/catalog/search': () => Response.json({ results: [flour] }),
      'POST /api/staples': () => {
        staples = [
          ...staples,
          staple({
            id: 's2',
            ingredientId: 'flour-id',
            name: 'Flour',
            quantity: null,
            unit: null,
            aisle: baking,
          }),
        ];
        return Response.json(staples[1], { status: 201 });
      },
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<StaplesPage />);
    await screen.findByRole('group', { name: 'Milk' });

    await userEvent.type(
      screen.getByRole('combobox', { name: 'Search ingredients' }),
      'flo',
    );
    const option = await screen.findByRole('option', { name: /Flour/ });
    // The Staples search has no use for a unit chip.
    expect(option).toHaveAccessibleName('Flour, Flour · Baking');
    await userEvent.click(option);

    expect(await screen.findByRole('group', { name: 'Flour' })).toBeVisible();
    expect(calls.find((c) => c.key === 'POST /api/staples')?.body).toEqual({
      ingredientId: 'flour-id',
    });
  });

  it('offers no edit or removal on a Staple whose add is still out', async () => {
    const user = userEvent.setup();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const { fetchMock, calls } = stubApi({
      'GET /api/staples': () => Response.json({ staples: [] }),
      'GET /api/catalog/search': () => Response.json({ results: [flour] }),
      'POST /api/staples': async () => {
        await gate;
        return Response.json(staple({ id: 's2', name: 'Flour' }), {
          status: 201,
        });
      },
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<StaplesPage />);

    await user.type(
      screen.getByRole('combobox', { name: 'Search ingredients' }),
      'flo',
    );
    await user.click(await screen.findByRole('option', { name: /Flour/ }));

    const row = await screen.findByRole('group', { name: 'Flour' });
    expect(row).toHaveAttribute('aria-disabled', 'true');
    act(() => row.focus());
    await user.keyboard('{Enter}');
    await user.keyboard('{Delete}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
    expect(deletes(calls)).toEqual([]);
    release();
  });

  it('offers no Use as typed on the Staples page: a Staple must be an Ingredient', async () => {
    const { fetchMock, calls } = stubApi({
      'GET /api/staples': () => Response.json({ staples: [staple()] }),
      'GET /api/catalog/search': () => Response.json({ results: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<StaplesPage />);
    await screen.findByRole('group', { name: 'Milk' });

    await userEvent.type(
      screen.getByRole('combobox', { name: 'Search ingredients' }),
      'zzz',
    );

    expect(await screen.findByText('No match for “zzz”')).toBeVisible();
    expect(screen.queryByRole('option', { name: /as typed/ })).toBeNull();
    for (const call of calls.filter(
      (c) => c.key === 'GET /api/catalog/search',
    )) {
      expect(new URLSearchParams(call.search).get('scope')).not.toBe('shared');
    }
  });

  describe('editing the amount', () => {
    it('opens on Enter, saves the preferred amount and says Updated', async () => {
      const user = userEvent.setup();
      let staples = [staple()];
      const { fetchMock, calls } = stubApi({
        'GET /api/staples': () => Response.json({ staples }),
        'PATCH /api/staples/s1': () => {
          staples = [staple({ quantity: 3 })];
          return Response.json(staples[0]);
        },
      });
      vi.stubGlobal('fetch', fetchMock);
      renderWithProviders(<StaplesPage />);
      await screen.findByRole('group', { name: 'Milk' });

      const dialog = await openSheet(user);
      expect(within(dialog).getByText('from your Staples')).toBeVisible();
      const field = within(dialog).getByLabelText(/^Amount of Milk/);
      expect(field).toHaveValue('2');
      await user.clear(field);
      await user.type(field, '3');
      await user.click(within(dialog).getByRole('button', { name: 'Save' }));

      expect(await screen.findByText('Updated Milk')).toBeVisible();
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(
        calls.find((c) => c.key === 'PATCH /api/staples/s1')?.body,
      ).toEqual({ quantity: 3, unit: 'l' });
      await waitFor(() => expect(rowOf('Milk')).toHaveTextContent('3 L'));
    });

    it('can leave a Staple without a quantity', async () => {
      const user = userEvent.setup();
      const { fetchMock, calls } = stubApi({
        'GET /api/staples': () => Response.json({ staples: [staple()] }),
        'PATCH /api/staples/s1': () =>
          Response.json(staple({ quantity: null, unit: null })),
      });
      vi.stubGlobal('fetch', fetchMock);
      renderWithProviders(<StaplesPage />);
      await screen.findByRole('group', { name: 'Milk' });

      const dialog = await openSheet(user);
      await user.clear(within(dialog).getByLabelText(/^Amount of Milk/));
      await user.click(within(dialog).getByRole('button', { name: 'Save' }));

      await screen.findByText('Updated Milk');
      expect(
        calls.find((c) => c.key === 'PATCH /api/staples/s1')?.body,
      ).toEqual({ quantity: null, unit: 'l' });
    });

    it('asks for a unit when there is a quantity but no unit, and does not save', async () => {
      const user = userEvent.setup();
      const { fetchMock, calls } = stubApi({
        'GET /api/staples': () =>
          Response.json({
            staples: [staple({ quantity: null, unit: null })],
          }),
      });
      vi.stubGlobal('fetch', fetchMock);
      renderWithProviders(<StaplesPage />);
      await screen.findByRole('group', { name: 'Milk' });

      const dialog = await openSheet(user);
      await user.type(within(dialog).getByLabelText(/^Amount of Milk/), '2');
      await user.click(within(dialog).getByRole('button', { name: 'Save' }));

      expect(
        await within(dialog).findByText('Choose a unit for the amount.'),
      ).toBeVisible();
      expect(calls.some((c) => c.key.startsWith('PATCH'))).toBe(false);
      expect(screen.getByRole('dialog')).toBeVisible();
    });

    it('keeps the sheet open and shows the reason when the save fails', async () => {
      const user = userEvent.setup();
      const { fetchMock } = stubApi({
        'GET /api/staples': () => Response.json({ staples: [staple()] }),
        'PATCH /api/staples/s1': () =>
          Response.json({ code: 'shopping.staple_not_found' }, { status: 404 }),
      });
      vi.stubGlobal('fetch', fetchMock);
      renderWithProviders(<StaplesPage />);
      await screen.findByRole('group', { name: 'Milk' });

      const dialog = await openSheet(user);
      await user.click(within(dialog).getByRole('button', { name: 'Save' }));

      expect(await within(dialog).findByRole('alert')).toBeVisible();
      expect(screen.getByRole('dialog')).toBeVisible();
    });

    it('opens the inline confirmation on the row from "Remove Staple"', async () => {
      const user = userEvent.setup();
      const { fetchMock, calls } = stubApi({
        'GET /api/staples': () => Response.json({ staples: [staple()] }),
      });
      vi.stubGlobal('fetch', fetchMock);
      renderWithProviders(<StaplesPage />);
      await screen.findByRole('group', { name: 'Milk' });

      const dialog = await openSheet(user);
      await user.click(
        within(dialog).getByRole('button', { name: 'Remove Staple' }),
      );

      expect(
        await screen.findByRole('group', { name: 'Remove Milk?' }),
      ).toBeVisible();
      expect(screen.getByText('from your Staples')).toBeVisible();
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Keep' })).toHaveFocus(),
      );
      expect(deletes(calls)).toEqual([]);
    });
  });

  describe('removing a Staple', () => {
    const remove = async (user: ReturnType<typeof userEvent.setup>) => {
      act(() => rowOf('Milk').focus());
      await user.keyboard('{Delete}');
      await user.click(screen.getByRole('button', { name: 'Remove' }));
      await waitFor(() =>
        expect(screen.queryByRole('group', { name: 'Milk' })).toBeNull(),
      );
    };

    it('hides the row with Undo and sends no request until the Undo expires', async () => {
      const user = userEvent.setup();
      const { fetchMock, calls } = stubApi({
        'GET /api/staples': () => Response.json({ staples: [staple()] }),
        'DELETE /api/staples/s1': () => new Response(null, { status: 204 }),
      });
      vi.stubGlobal('fetch', fetchMock);
      renderWithProviders(<StaplesPage />);
      await screen.findByRole('group', { name: 'Milk' });

      await remove(user);

      expect(await screen.findByText('Removed Milk')).toBeVisible();
      expect(deletes(calls)).toEqual([]);
      await user.click(screen.getByRole('button', { name: 'Undo' }));
      expect(screen.getByRole('group', { name: 'Milk' })).toBeVisible();
      expect(deletes(calls)).toEqual([]);
    });

    it('sends the delete once the Undo expires and the row stays gone', async () => {
      vi.useFakeTimers();
      const flush = () => act(() => vi.advanceTimersByTimeAsync(0));
      let staples = [staple()];
      const { fetchMock, calls } = stubApi({
        'GET /api/staples': () => Response.json({ staples }),
        'DELETE /api/staples/s1': () => {
          staples = [];
          return new Response(null, { status: 204 });
        },
      });
      vi.stubGlobal('fetch', fetchMock);
      renderWithProviders(<StaplesPage />);
      await flush();
      const row = rowOf('Milk');
      act(() => row.focus());
      fireEvent.keyDown(row, { key: 'Delete' });
      fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
      await act(() => vi.advanceTimersByTimeAsync(1000));
      expect(screen.queryByRole('group', { name: 'Milk' })).toBeNull();

      await act(() => vi.advanceTimersByTimeAsync(3500));
      expect(deletes(calls)).toEqual([]);
      await act(() => vi.advanceTimersByTimeAsync(1500));
      await flush();

      expect(deletes(calls)).toEqual(['DELETE /api/staples/s1']);
      expect(screen.queryByRole('group', { name: 'Milk' })).toBeNull();
      expect(screen.getByText(/No staples yet/)).toBeVisible();
    });
  });

  describe('removing a Staple, leaving and refetching', () => {
    const setup = async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const { fetchMock, calls } = stubApi({
        'GET /api/staples': () => Response.json({ staples: [staple()] }),
        'DELETE /api/staples/s1': () => new Response(null, { status: 204 }),
      });
      vi.stubGlobal('fetch', fetchMock);
      renderWithProviders(
        <Routes>
          <Route
            path="/"
            element={
              <>
                <StaplesPage />
                <Link to="/other">Leave</Link>
              </>
            }
          />
          <Route path="/other" element={<p>Elsewhere</p>} />
        </Routes>,
      );
      await screen.findByRole('group', { name: 'Milk' });
      act(() => rowOf('Milk').focus());
      await user.keyboard('{Delete}');
      await user.click(screen.getByRole('button', { name: 'Remove' }));
      await waitFor(() =>
        expect(screen.queryByRole('group', { name: 'Milk' })).toBeNull(),
      );
      expect(await screen.findByText('Removed Milk')).toBeVisible();
      expect(deletes(calls)).toEqual([]);
      return { user, calls };
    };

    it('sends the delete when the Member leaves the page during the Undo window', async () => {
      const { user, calls } = await setup();

      await user.click(screen.getByRole('link', { name: 'Leave' }));

      expect(await screen.findByText('Elsewhere')).toBeVisible();

      await waitFor(() =>
        expect(deletes(calls)).toEqual(['DELETE /api/staples/s1']),
      );
      await waitFor(() =>
        expect(screen.queryByText('Removed Milk')).toBeNull(),
      );
    });

    it('sends the delete on pagehide', async () => {
      const { calls } = await setup();

      act(() => {
        window.dispatchEvent(new Event('pagehide'));
      });

      await waitFor(() =>
        expect(deletes(calls)).toEqual(['DELETE /api/staples/s1']),
      );
    });

    it('keeps the row hidden when a refetch lands while the delete waits', async () => {
      const { calls } = await setup();

      // The server still lists the Staple (the delete has not been sent), and the list refetches.
      act(() => {
        window.dispatchEvent(new Event('visibilitychange'));
      });
      await waitFor(() =>
        expect(calls.filter((c) => c.key === 'GET /api/staples')).toHaveLength(
          2,
        ),
      );

      expect(screen.queryByRole('group', { name: 'Milk' })).toBeNull();
      expect(screen.getByText('Removed Milk')).toBeVisible();
      expect(deletes(calls)).toEqual([]);
    });
  });

  describe('removing a Staple, further cases', () => {
    const removeMilk = async () => {
      const row = rowOf('Milk');
      act(() => row.focus());
      fireEvent.keyDown(row, { key: 'Delete' });
      fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
      await act(() => vi.advanceTimersByTimeAsync(1000));
    };

    it('brings the row back with an error toast when the delete fails', async () => {
      vi.useFakeTimers();
      const flush = () => act(() => vi.advanceTimersByTimeAsync(0));
      const { fetchMock } = stubApi({
        'GET /api/staples': () => Response.json({ staples: [staple()] }),
        'DELETE /api/staples/s1': () =>
          Response.json({ code: 'unknown', params: {} }, { status: 500 }),
      });
      vi.stubGlobal('fetch', fetchMock);
      renderWithProviders(<StaplesPage />);
      await flush();

      await removeMilk();
      expect(screen.queryByRole('group', { name: 'Milk' })).toBeNull();
      await act(() => vi.advanceTimersByTimeAsync(5500));
      await flush();

      expect(screen.getByRole('group', { name: 'Milk' })).toBeVisible();
      expect(screen.queryByText('Removed Milk')).toBeNull();
      expect(
        screen.getByText('Something went wrong. Please try again.'),
      ).toBeVisible();
    });

    it('hands focus to the empty text when the last Staple goes', async () => {
      vi.useFakeTimers();
      const flush = () => act(() => vi.advanceTimersByTimeAsync(0));
      const { fetchMock } = stubApi({
        'GET /api/staples': () => Response.json({ staples: [staple()] }),
      });
      vi.stubGlobal('fetch', fetchMock);
      renderWithProviders(<StaplesPage />);
      await flush();

      await removeMilk();

      expect(screen.getByText(/No staples yet/)).toHaveFocus();
    });

    it('opens the sheet when the row is held for 500 ms', async () => {
      vi.useFakeTimers();
      const flush = () => act(() => vi.advanceTimersByTimeAsync(0));
      const { fetchMock } = stubApi({
        'GET /api/staples': () => Response.json({ staples: [staple()] }),
      });
      vi.stubGlobal('fetch', fetchMock);
      renderWithProviders(<StaplesPage />);
      await flush();
      const content = rowOf('Milk').querySelector(
        '[data-swipe-row-content]',
      ) as HTMLElement;

      fireEvent.pointerDown(content, {
        pointerId: 1,
        clientX: 50,
        clientY: 20,
      });
      await act(() => vi.advanceTimersByTimeAsync(600));
      expect(screen.queryByRole('dialog')).toBeNull();
      await act(() => vi.advanceTimersByTimeAsync(200));

      expect(screen.getByRole('dialog', { name: 'Edit Milk' })).toBeVisible();
    });
  });

  it('shows a translated error when the Staple limit is reached', async () => {
    const { fetchMock } = stubApi({
      'GET /api/staples': () => Response.json({ staples: [] }),
      'GET /api/catalog/search': () => Response.json({ results: [flour] }),
      'POST /api/staples': () =>
        Response.json(
          { code: 'shopping.staple_limit_reached', params: { max: 200 } },
          { status: 409 },
        ),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<StaplesPage />);

    await userEvent.type(
      await screen.findByRole('combobox', { name: 'Search ingredients' }),
      'flo',
    );
    await userEvent.click(await screen.findByRole('option', { name: /Flour/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You can have up to 200 staples',
    );
  });

  it('shows the empty state', async () => {
    const { fetchMock } = stubApi({
      'GET /api/staples': () => Response.json({ staples: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<StaplesPage />);

    expect(await screen.findByText(/No staples yet/)).toBeVisible();
  });
});

describe('SuggestionsWidget', () => {
  it('counts everything gone from the Pantry, names the first few, and links to Shopping', async () => {
    const { fetchMock } = stubApi({
      'GET /api/shopping-list/suggestions': () =>
        Response.json({
          staples: ['A', 'B', 'C', 'D'].map((name) =>
            suggestion({ ingredientId: name, name }),
          ),
          usedUp: [suggestion({ ingredientId: 'E', name: 'E' })],
          expired: [],
        }),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<SuggestionsWidget size="small" columns={2} />);

    const link = await screen.findByRole('link', { name: 'Suggestions' });
    expect(link).toHaveAttribute('href', '/shopping');
    expect(link).toHaveTextContent('5');
    expect(link).toHaveTextContent('gone from your Pantry');
    expect(link).toHaveTextContent('E, A, B…');
  });

  it('counts the Staples and the Used Up Ingredients it names', async () => {
    const { fetchMock } = stubApi({
      'GET /api/shopping-list/suggestions': () =>
        Response.json({
          staples: [suggestion({ ingredientId: 'A', name: 'A' })],
          usedUp: [suggestion({ ingredientId: 'E', name: 'E' })],
          expired: [],
        }),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<SuggestionsWidget size="small" columns={2} />);

    const link = await screen.findByRole('link', { name: 'Suggestions' });
    expect(link).toHaveTextContent('2');
    expect(link).toHaveTextContent('gone from your Pantry');
    expect(link).toHaveTextContent('E, A');
  });

  it('names expired Suggestions too', async () => {
    const { fetchMock } = stubApi({
      'GET /api/shopping-list/suggestions': () =>
        Response.json({
          staples: [],
          usedUp: [],
          expired: [
            {
              ...suggestion({ ingredientId: 'spinach-id', name: 'Spinach' }),
              since: '2026-10-13',
            },
          ],
        }),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<SuggestionsWidget size="small" columns={2} />);

    const link = await screen.findByRole('link', { name: 'Suggestions' });
    expect(link).toHaveTextContent('Spinach');
    expect(link).not.toHaveTextContent('Nothing suggested');
  });

  it('says nothing is missing', async () => {
    const { fetchMock } = stubApi({
      'GET /api/shopping-list/suggestions': () =>
        Response.json({ staples: [], usedUp: [], expired: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<SuggestionsWidget size="small" columns={2} />);

    expect(await screen.findByText('Nothing suggested')).toBeVisible();
  });
});

describe('StaplesPage Browse by aisle', () => {
  afterEach(() => vi.unstubAllGlobals());
  const browseAisles = {
    aisles: [
      {
        id: 'aisle-dairy',
        name: 'Dairy & eggs',
        parentCategories: [{ id: 'p-dairy', name: 'Dairy' }],
      },
    ],
  };

  it('shows Browse by aisle in the Staples search', async () => {
    const { fetchMock } = stubApi({
      'GET /api/staples': () => Response.json({ staples: [] }),
      'GET /api/catalog/aisles': () => Response.json(browseAisles),
      'GET /api/catalog/search': () => Response.json({ results: [flour] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<StaplesPage />);

    await userEvent.click(
      await screen.findByRole('combobox', { name: 'Search ingredients' }),
    );

    expect(await screen.findByText('Browse by aisle')).toBeVisible();
    expect(
      await screen.findByRole('button', { name: 'Dairy & eggs' }),
    ).toBeVisible();
  });
});

describe('Add to your catalog (#270)', () => {
  it('is offered in the Staples search, which has no Use as typed', async () => {
    const { fetchMock } = stubApi({
      'GET /api/staples': () => Response.json({ staples: [staple()] }),
      'GET /api/catalog/search': () => Response.json({ results: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<StaplesPage />);
    await screen.findByRole('group', { name: 'Milk' });

    await userEvent.click(
      screen.getByRole('combobox', { name: 'Search ingredients' }),
    );
    await userEvent.paste('kombucha');

    const options = await screen.findAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveAccessibleName(/Add “kombucha” to your catalog/);
    expect(
      screen.getByRole('button', { name: 'Add “kombucha” to your catalog' }),
    ).toBeVisible();
  });

  it('is offered in the Shopping add sheet, above Use as typed', async () => {
    const { fetchMock } = stubApi({
      'GET /api/shopping-list': () => Response.json(emptyList()),
      'GET /api/shopping-list/suggestions': () =>
        Response.json({ staples: [], usedUp: [], expired: [] }),
      'GET /api/shopping-templates': () => Response.json({ templates: [] }),
      'GET /api/catalog/search': () => Response.json({ results: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<ShoppingPage />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Add items' }),
    );
    const dialog = await screen.findByRole('dialog');

    await userEvent.click(
      within(dialog).getByRole('combobox', { name: 'Search ingredients' }),
    );
    await userEvent.paste('kombucha');

    const options = await within(dialog).findAllByRole('option');
    expect(options[0]).toHaveAccessibleName(/Add “kombucha” to your catalog/);
    expect(options[1]).toHaveAccessibleName(/Use “kombucha” as typed/);
  });
});

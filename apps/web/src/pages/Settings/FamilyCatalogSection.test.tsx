import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  FamilyCatalog,
  FamilyCatalogIngredient,
} from '../../lib/familyCatalog';
import { UNDO_WINDOW_MS } from '../../lib/useDeferredRemoval';
import { renderWithProviders, stubApi } from '../../test/render';
import { FamilyCatalogSection } from './components/FamilyCatalogSection';

const PRODUCE_AISLE_ID = '1dff107d-5280-500f-807e-d694a53e24d9';

const usage = {
  batches: 0,
  shoppingItems: 0,
  templateLines: 0,
  recipeLines: 0,
  staples: 0,
};
const kombucha: FamilyCatalogIngredient = {
  id: 'k1',
  name: 'Kombucha',
  owner: 'family' as const,
  defaultUnit: 'ml' as const,
  amountScale: 'medium' as const,
  leafCategory: { id: 'soft-drinks', name: 'Soft drinks' },
  parentCategory: {
    id: 'drinks',
    name: 'Drinks',
    aisle: { id: 'a-drinks', name: 'Drinks aisle' },
  },
  defaults: { expiryDays: null, location: null },
  allergensChecked: true,
  allergenIds: [],
  allergens: [],
  usage: { ...usage, batches: 3, staples: 1 },
};
const tempeh = {
  ...kombucha,
  id: 't1',
  name: 'Tempeh',
  defaultUnit: 'g' as const,
  usage,
};

const catalog: FamilyCatalog = {
  ingredients: [kombucha, tempeh],
  synonyms: [
    // A Synonym of a Family Ingredient: a chip in its sheet, never a row.
    { id: 's1', name: 'Booch', ingredient: { id: 'k1', name: 'Kombucha' } },
    // A Synonym of a shared Catalog Ingredient: a row of Other names.
    {
      id: 's2',
      name: 'Scallion',
      ingredient: { id: 'c1', name: 'Spring onion' },
    },
  ],
};

function stub(
  data: FamilyCatalog = catalog,
  extra: Parameters<typeof stubApi>[0] = {},
) {
  const { fetchMock, calls } = stubApi({
    'GET /api/catalog/family': () => Response.json(data),
    'GET /api/settings/categories': () =>
      Response.json({
        parents: [
          {
            id: 'drinks',
            name: 'Drinks',
            leaves: [
              { id: 'soft-drinks', name: 'Soft drinks' },
              { id: 'tea', name: 'Tea' },
            ],
          },
          {
            id: 'fresh',
            name: 'Fresh herbs',
            leaves: [{ id: 'basil', name: 'Basil' }],
          },
        ],
      }),
    // Aisle ids differ from Parent Category ids; the produce id is the one the tints know.
    'GET /api/catalog/aisles': () =>
      Response.json({
        aisles: [
          {
            id: 'a-drinks',
            name: 'Drinks aisle',
            parentCategories: [{ id: 'drinks', name: 'Drinks' }],
          },
          {
            id: PRODUCE_AISLE_ID,
            name: 'Fruit & veg',
            parentCategories: [{ id: 'fresh', name: 'Fresh herbs' }],
          },
        ],
      }),
    'PATCH /api/catalog/family-ingredients/k1': () => Response.json(kombucha),
    'DELETE /api/catalog/family-ingredients/k1': () =>
      new Response(null, { status: 204 }),
    'DELETE /api/catalog/family-synonyms/s1': () =>
      new Response(null, { status: 204 }),
    'DELETE /api/catalog/family-synonyms/s2': () =>
      new Response(null, { status: 204 }),
    'PUT /api/catalog/family-ingredients/k1/allergens': () =>
      Response.json({
        id: 'k1',
        allergensChecked: true,
        allergenIds: ['al-milk'],
      }),
    'GET /api/catalog/allergens': () =>
      Response.json({ allergens: [{ id: 'al-milk', name: 'Milk' }] }),
    'POST /api/catalog/family-synonyms': () => Response.json(kombucha),
    ...extra,
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

const writes = (calls: { key: string }[]) =>
  calls.map((c) => c.key).filter((k) => !k.startsWith('GET '));

type User = ReturnType<typeof userEvent.setup>;

const focusRow = async (name: string) => {
  const row = await screen.findByRole('group', { name });
  act(() => row.focus());
  return row;
};

/** Focus the row and press Enter: the keyboard path to the edit sheet. */
async function openSheet(user: User, name = 'Kombucha') {
  await focusRow(name);
  await user.keyboard('{Enter}');
  return screen.findByRole('dialog');
}

/** Focus a control and press Enter: the keyboard path inside a sheet. */
async function press(user: User, control: HTMLElement) {
  act(() => control.focus());
  await user.keyboard('{Enter}');
}

describe('FamilyCatalogSection', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it('lists Family Ingredients in one list by name, with category, aisle and unit', async () => {
    stub();
    renderWithProviders(<FamilyCatalogSection />);

    expect(
      await screen.findByRole('heading', { name: 'Family catalog' }),
    ).toBeInTheDocument();
    const row = await screen.findByRole('group', { name: 'Kombucha' });
    expect(
      within(row).getByText('Soft drinks · Drinks aisle · ml'),
    ).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Tempeh' })).toBeInTheDocument();
    // None: allergens checked and none tagged, so no tag on the row.
    expect(row).not.toHaveTextContent(/allergens/i);
  });

  it('shows the empty card only with no ingredients and no synonyms', async () => {
    stub({ ingredients: [], synonyms: [] });
    renderWithProviders(<FamilyCatalogSection />);
    expect(await screen.findByText('Nothing added yet')).toBeInTheDocument();
  });

  it('does not show the empty card when only an Other name exists', async () => {
    stub({ ingredients: [], synonyms: [catalog.synonyms[1]] });
    renderWithProviders(<FamilyCatalogSection />);
    await screen.findByRole('group', { name: 'Scallion' });
    expect(screen.queryByText('Nothing added yet')).toBeNull();
  });

  it('opens the sheet with Enter, and with Space', async () => {
    stub();
    renderWithProviders(<FamilyCatalogSection />);
    const user = userEvent.setup();

    const dialog = await openSheet(user);
    expect(within(dialog).getByText('In your family’s catalog')).toBeVisible();
    await user.keyboard('{Escape}');
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await focusRow('Tempeh');
    await user.keyboard(' ');
    expect(await screen.findByRole('dialog')).toHaveTextContent('Tempeh');
  });

  it('renames: Save sends a PATCH with only the name', async () => {
    const calls = stub();
    renderWithProviders(<FamilyCatalogSection />);
    const user = userEvent.setup();

    const dialog = await openSheet(user);
    const name = within(dialog).getByLabelText('Name');
    await user.clear(name);
    await user.type(name, 'Booch tea');
    expect(writes(calls)).toEqual([]);
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await vi.waitFor(() =>
      expect(calls).toContainEqual(
        expect.objectContaining({
          key: 'PATCH /api/catalog/family-ingredients/k1',
          body: { name: 'Booch tea' },
        }),
      ),
    );
    expect(await screen.findByText('Updated Booch tea')).toBeVisible();
    expect(writes(calls)).toEqual(['PATCH /api/catalog/family-ingredients/k1']);
  });

  it('moves to another category through the picker, sending leafCategoryId', async () => {
    const calls = stub();
    renderWithProviders(<FamilyCatalogSection />);
    const user = userEvent.setup();

    const dialog = await openSheet(user);
    await user.click(within(dialog).getByRole('button', { name: /Category/ }));
    expect(await screen.findByText('Pick a category')).toBeVisible();
    // Leaves only: no "All Drinks" row; the current leaf is marked.
    expect(screen.queryByText(/^All /)).toBeNull();
    expect(screen.getByRole('button', { name: /Soft drinks/ })).toHaveAttribute(
      'aria-current',
      'true',
    );
    await user.click(await screen.findByRole('button', { name: /Tea/ }));
    expect(writes(calls)).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await vi.waitFor(() =>
      expect(calls).toContainEqual(
        expect.objectContaining({
          key: 'PATCH /api/catalog/family-ingredients/k1',
          body: { leafCategoryId: 'tea' },
        }),
      ),
    );
  });

  it("shows the new leaf's Aisle, not its Parent Category, and tints the picker rows by Aisle", async () => {
    stub();
    renderWithProviders(<FamilyCatalogSection />);
    const user = userEvent.setup();

    const dialog = await openSheet(user);
    await user.click(within(dialog).getByRole('button', { name: /Category/ }));
    const tint = (button: HTMLElement) =>
      button
        .querySelector('[data-ingredient-tint]')
        ?.getAttribute('data-ingredient-tint');
    const basil = await screen.findByRole('button', { name: /Basil/ });
    expect(tint(basil)).toBe('produce');
    expect(tint(screen.getByRole('button', { name: /Tea/ }))).toBe('neutral');

    await user.click(basil);
    const field = screen.getByRole('button', { name: /Category/ });
    expect(field).toHaveTextContent('Fruit & veg · ml');
    expect(field).not.toHaveTextContent('Fresh herbs');
    expect(tint(field)).toBe('produce');
  });

  it('goes back from the picker with Escape, keeping the sheet open', async () => {
    stub();
    renderWithProviders(<FamilyCatalogSection />);
    const user = userEvent.setup();

    const dialog = await openSheet(user);
    await user.click(within(dialog).getByRole('button', { name: /Category/ }));
    await screen.findByText('Pick a category');
    await user.keyboard('{Escape}');

    expect(await screen.findByLabelText('Name')).toBeVisible();
  });

  it('keeps Save disabled with no change and with a blank name', async () => {
    stub();
    renderWithProviders(<FamilyCatalogSection />);
    const user = userEvent.setup();

    const dialog = await openSheet(user);
    const save = within(dialog).getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    const name = within(dialog).getByLabelText('Name');
    await user.type(name, 'x');
    expect(save).toBeEnabled();
    await user.clear(name);
    expect(save).toBeDisabled();
    expect(within(dialog).getByText('Give it a name.')).toBeVisible();
  });

  it('sends an allergen pick as a PUT', async () => {
    const calls = stub();
    renderWithProviders(<FamilyCatalogSection />);
    const user = userEvent.setup();

    const dialog = await openSheet(user);
    await user.click(
      await within(dialog).findByRole('button', { name: 'Milk' }),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await vi.waitFor(() =>
      expect(
        calls.find(
          (c) => c.key === 'PUT /api/catalog/family-ingredients/k1/allergens',
        )?.body,
      ).toEqual({ allergenIds: ['al-milk'] }),
    );
  });

  it('explains a name that is already taken and keeps the sheet open', async () => {
    stub(catalog, {
      'PATCH /api/catalog/family-ingredients/k1': () =>
        Response.json(
          {
            code: 'catalog.family_ingredient_exists',
            params: { existing: tempeh },
          },
          { status: 409 },
        ),
    });
    renderWithProviders(<FamilyCatalogSection />);
    const user = userEvent.setup();

    const dialog = await openSheet(user);
    const name = within(dialog).getByLabelText('Name');
    await user.clear(name);
    await user.type(name, 'Tempeh');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(
      await within(dialog).findByText(
        '“Tempeh” is already in the catalog. Pick another name.',
      ),
    ).toBeVisible();
    expect(screen.getByRole('dialog')).toBeVisible();
    expect(name).toHaveFocus();
  });

  describe('other names in the sheet (a draft)', () => {
    it('shows only this Ingredient’s names as chips', async () => {
      stub();
      renderWithProviders(<FamilyCatalogSection />);
      const user = userEvent.setup();

      const dialog = await openSheet(user);
      expect(within(dialog).getByText('Booch')).toBeVisible();
      expect(within(dialog).queryByText('Scallion')).toBeNull();
    });

    it('sends nothing for an added name or a removed chip until Save, then PATCH, PUT, DELETE, POST in order', async () => {
      const calls = stub();
      renderWithProviders(<FamilyCatalogSection />);
      const user = userEvent.setup();

      const dialog = await openSheet(user);
      const name = within(dialog).getByLabelText('Name');
      await user.clear(name);
      await user.type(name, 'Booch tea');
      await user.click(
        await within(dialog).findByRole('button', { name: 'Milk' }),
      );
      await press(
        user,
        within(dialog).getByRole('button', { name: 'Remove the name Booch' }),
      );
      await press(
        user,
        within(dialog).getByRole('button', { name: 'Add a name' }),
      );
      await user.type(
        within(dialog).getByRole('textbox', { name: 'Add a name' }),
        'Kefir tea{Enter}',
      );
      expect(within(dialog).getByText('Kefir tea')).toBeVisible();
      expect(within(dialog).queryByText('Booch')).toBeNull();
      expect(writes(calls)).toEqual([]);

      await press(user, within(dialog).getByRole('button', { name: 'Save' }));

      await vi.waitFor(() =>
        expect(writes(calls)).toEqual([
          'PATCH /api/catalog/family-ingredients/k1',
          'PUT /api/catalog/family-ingredients/k1/allergens',
          'DELETE /api/catalog/family-synonyms/s1',
          'POST /api/catalog/family-synonyms',
        ]),
      );
      expect(
        calls.find((c) => c.key === 'POST /api/catalog/family-synonyms')?.body,
      ).toEqual({
        name: 'Kefir tea',
        ingredientId: 'k1',
      });
    });

    it('keeps a name that is removed and added back, and sends DELETE then POST on Save', async () => {
      const calls = stub();
      renderWithProviders(<FamilyCatalogSection />);
      const user = userEvent.setup();

      const dialog = await openSheet(user);
      await user.click(
        within(dialog).getByRole('button', { name: 'Remove the name Booch' }),
      );
      expect(within(dialog).queryByText('Booch')).toBeNull();
      await user.click(
        within(dialog).getByRole('button', { name: 'Add a name' }),
      );
      await user.type(
        within(dialog).getByRole('textbox', { name: 'Add a name' }),
        'Booch{Enter}',
      );
      expect(within(dialog).getByText('Booch')).toBeVisible();

      await user.click(within(dialog).getByRole('button', { name: 'Save' }));
      await vi.waitFor(() =>
        expect(writes(calls)).toEqual([
          'DELETE /api/catalog/family-synonyms/s1',
          'POST /api/catalog/family-synonyms',
        ]),
      );
      expect(
        calls.find((c) => c.key === 'POST /api/catalog/family-synonyms')?.body,
      ).toEqual({ name: 'Booch', ingredientId: 'k1' });
    });

    it('keeps focus in the chips when one is removed', async () => {
      stub();
      renderWithProviders(<FamilyCatalogSection />);
      const user = userEvent.setup();

      const dialog = await openSheet(user);
      for (const added of ['Kefir tea', 'Scoby']) {
        await user.click(
          within(dialog).getByRole('button', { name: 'Add a name' }),
        );
        await user.type(
          within(dialog).getByRole('textbox', { name: 'Add a name' }),
          `${added}{Enter}{Escape}`,
        );
        await vi.waitFor(() =>
          expect(
            within(dialog).getByRole('button', { name: 'Add a name' }),
          ).toHaveFocus(),
        );
      }
      const remove = (name: string) =>
        within(dialog).getByRole('button', { name: `Remove the name ${name}` });
      // A middle chip hands focus to the next one.
      act(() => remove('Kefir tea').focus());
      await user.keyboard('{Enter}');
      expect(remove('Scoby')).toHaveFocus();
      // The last chip hands it to the one before.
      await user.keyboard('{Enter}');
      expect(remove('Booch')).toHaveFocus();
      // The only chip hands it to "Add a name".
      await user.keyboard('{Enter}');
      expect(
        within(dialog).getByRole('button', { name: 'Add a name' }),
      ).toHaveFocus();
    });

    it('closes only the add-name field on Escape', async () => {
      stub();
      renderWithProviders(<FamilyCatalogSection />);
      const user = userEvent.setup();

      const dialog = await openSheet(user);
      await user.click(
        within(dialog).getByRole('button', { name: 'Add a name' }),
      );
      await vi.waitFor(() =>
        expect(
          within(dialog).getByRole('textbox', { name: 'Add a name' }),
        ).toHaveFocus(),
      );
      await user.keyboard('{Escape}');

      expect(screen.getByRole('dialog')).toBeVisible();
      await vi.waitFor(() =>
        expect(
          within(dialog).getByRole('button', { name: 'Add a name' }),
        ).toHaveFocus(),
      );
    });

    it('toasts the new name after a rename', async () => {
      stub();
      renderWithProviders(<FamilyCatalogSection />);
      const user = userEvent.setup();

      const dialog = await openSheet(user);
      const name = within(dialog).getByLabelText('Name');
      await user.clear(name);
      await user.type(name, 'Booch tea');
      await user.click(within(dialog).getByRole('button', { name: 'Save' }));

      expect(
        within(await screen.findByRole('status')).getByText(
          'Updated Booch tea',
        ),
      ).toBeVisible();
    });

    it('sends nothing when the X discards the draft', async () => {
      const calls = stub();
      renderWithProviders(<FamilyCatalogSection />);
      const user = userEvent.setup();

      const dialog = await openSheet(user);
      await user.click(
        within(dialog).getByRole('button', { name: 'Remove the name Booch' }),
      );
      expect(
        within(dialog).queryByRole('button', { name: 'Cancel' }),
      ).toBeNull();
      await user.click(within(dialog).getByRole('button', { name: 'Close' }));
      await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

      expect(writes(calls)).toEqual([]);
    });

    it('refuses a name the family already uses, on the device', async () => {
      const calls = stub();
      renderWithProviders(<FamilyCatalogSection />);
      const user = userEvent.setup();

      const dialog = await openSheet(user);
      await user.click(
        within(dialog).getByRole('button', { name: 'Add a name' }),
      );
      const field = within(dialog).getByRole('textbox', { name: 'Add a name' });
      // Another Family Ingredient's name, and another Synonym, ignoring case.
      await user.type(field, 'tempeh{Enter}');
      expect(
        within(dialog).getByText('“tempeh” is already a name for Tempeh.'),
      ).toBeVisible();
      await user.clear(field);
      await user.type(field, 'SCALLION{Enter}');
      expect(
        within(dialog).getByText(
          '“SCALLION” is already a name for Spring onion.',
        ),
      ).toBeVisible();
      expect(writes(calls)).toEqual([]);
    });

    it('shows a Synonym 409 on its chip, keeps the sheet open, and a second Save resends only what failed', async () => {
      let postStatus = 409;
      // The server keeps what the first Save managed to save.
      let current: typeof kombucha = kombucha;
      const calls = stub(catalog, {
        'GET /api/catalog/family': () =>
          Response.json({ ...catalog, ingredients: [current, tempeh] }),
        'PUT /api/catalog/family-ingredients/k1/allergens': () => {
          current = {
            ...kombucha,
            allergenIds: ['al-milk'],
            allergens: [{ id: 'al-milk', name: 'Milk' }],
          };
          return Response.json({
            id: 'k1',
            allergensChecked: true,
            allergenIds: ['al-milk'],
          });
        },
        'POST /api/catalog/family-synonyms': () =>
          postStatus === 409
            ? Response.json(
                {
                  code: 'catalog.family_synonym_exists',
                  params: { existing: { id: 'c9', name: 'Kefir' } },
                },
                { status: 409 },
              )
            : Response.json(kombucha),
      });
      renderWithProviders(<FamilyCatalogSection />);
      const user = userEvent.setup();

      const dialog = await openSheet(user);
      await user.click(
        await within(dialog).findByRole('button', { name: 'Milk' }),
      );
      await user.click(
        within(dialog).getByRole('button', { name: 'Add a name' }),
      );
      await user.type(
        within(dialog).getByRole('textbox', { name: 'Add a name' }),
        'Kefir tea{Enter}',
      );
      await user.click(within(dialog).getByRole('button', { name: 'Save' }));

      expect(
        await within(dialog).findByText(
          '“Kefir tea” is already a name for Kefir.',
        ),
      ).toBeVisible();
      expect(screen.getByRole('dialog')).toBeVisible();
      expect(within(dialog).getByText('Kefir tea')).toBeVisible();

      postStatus = 200;
      const before = calls.length;
      await user.click(
        await vi.waitFor(() => {
          const save = within(dialog).getByRole('button', { name: 'Save' });
          expect(save).toBeEnabled();
          return save;
        }),
      );
      await vi.waitFor(() =>
        expect(
          writes(calls.slice(before)).filter((k) => k.startsWith('POST')),
        ).toEqual(['POST /api/catalog/family-synonyms']),
      );
      expect(
        calls.slice(before).find((c) => c.key.startsWith('POST'))?.body,
      ).toEqual({ name: 'Kefir tea', ingredientId: 'k1' });
      // The allergens already saved are not sent again...
      expect(
        writes(calls.slice(before)).filter((k) => k.startsWith('PUT')),
      ).toEqual([]);
    });
  });

  describe('Other names card', () => {
    it('lists only Synonyms of shared Ingredients', async () => {
      stub();
      renderWithProviders(<FamilyCatalogSection />);

      const row = await screen.findByRole('group', { name: 'Scallion' });
      expect(
        within(row).getByText('Another name for Spring onion'),
      ).toBeVisible();
      expect(screen.getByText('Other names · 1')).toBeVisible();
      expect(screen.queryByRole('group', { name: 'Booch' })).toBeNull();
    });

    it('opens a read-only sheet on Enter', async () => {
      const calls = stub();
      renderWithProviders(<FamilyCatalogSection />);
      const user = userEvent.setup();

      await focusRow('Scallion');
      await user.keyboard('{Enter}');
      const dialog = await screen.findByRole('dialog');

      expect(within(dialog).getByText('In the Catalog')).toBeVisible();
      expect(
        within(dialog).getByRole('button', { name: 'Close' }),
      ).toBeVisible();
      expect(within(dialog).queryByRole('button', { name: 'Done' })).toBeNull();
      expect(writes(calls)).toEqual([]);
    });

    it('removes a Synonym with the Delete key, sending the DELETE only after the Undo window', async () => {
      vi.useFakeTimers();
      const flush = () => act(() => vi.advanceTimersByTimeAsync(0));
      const calls = stub();
      renderWithProviders(<FamilyCatalogSection />);
      await flush();
      const row = screen.getByRole('group', { name: 'Scallion' });
      act(() => row.focus());
      fireEvent.keyDown(row, { key: 'Delete' });
      expect(screen.getByText('It stops meaning Spring onion')).toBeVisible();
      fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
      await act(() => vi.advanceTimersByTimeAsync(1000));

      expect(screen.getByText('Removed “Scallion”')).toBeVisible();
      expect(writes(calls)).toEqual([]);
      await act(() => vi.advanceTimersByTimeAsync(5000));
      await flush();

      expect(writes(calls)).toEqual(['DELETE /api/catalog/family-synonyms/s2']);
    });
  });

  describe('removing a Synonym, undone', () => {
    it('sends nothing on Undo, even after the window would have ended', async () => {
      vi.useFakeTimers();
      const flush = () => act(() => vi.advanceTimersByTimeAsync(0));
      const calls = stub();
      renderWithProviders(<FamilyCatalogSection />);
      await flush();

      const row = screen.getByRole('group', { name: 'Scallion' });
      act(() => row.focus());
      fireEvent.keyDown(row, { key: 'Delete' });
      fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
      await act(() => vi.advanceTimersByTimeAsync(1000));
      expect(
        within(screen.getByRole('status')).getByText('Removed “Scallion”'),
      ).toBeVisible();
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
      await act(() => vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS + 1000));
      await flush();

      expect(screen.getByRole('group', { name: 'Scallion' })).toBeVisible();
      expect(writes(calls)).toEqual([]);
    });
  });

  it('shows the empty card while the last entry waits for its delete', async () => {
    vi.useFakeTimers();
    const flush = () => act(() => vi.advanceTimersByTimeAsync(0));
    stub({ ingredients: [tempeh], synonyms: [] });
    renderWithProviders(<FamilyCatalogSection />);
    await flush();

    const row = screen.getByRole('group', { name: 'Tempeh' });
    act(() => row.focus());
    fireEvent.keyDown(row, { key: 'Delete' });
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await act(() => vi.advanceTimersByTimeAsync(1000));

    expect(screen.getByText('Nothing added yet')).toBeVisible();
  });

  describe('deleting an Ingredient', () => {
    it('asks with the usage total, hides the row with Undo and deletes only after the window', async () => {
      vi.useFakeTimers();
      const flush = () => act(() => vi.advanceTimersByTimeAsync(0));
      let ingredients = [kombucha, tempeh];
      const calls = stub(catalog, {
        'GET /api/catalog/family': () =>
          Response.json({ ingredients, synonyms: [] }),
        'DELETE /api/catalog/family-ingredients/k1': () => {
          ingredients = [tempeh];
          return new Response(null, { status: 204 });
        },
      });
      renderWithProviders(<FamilyCatalogSection />);
      await flush();
      const row = screen.getByRole('group', { name: 'Kombucha' });
      act(() => row.focus());
      fireEvent.keyDown(row, { key: 'Delete' });
      expect(screen.getByText('Delete Kombucha?')).toBeVisible();
      expect(screen.getByText('Used 4 times')).toBeVisible();
      expect(writes(calls)).toEqual([]);
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
      await act(() => vi.advanceTimersByTimeAsync(1000));

      expect(screen.queryByRole('group', { name: 'Kombucha' })).toBeNull();
      expect(screen.getByText('Deleted Kombucha')).toBeVisible();
      // A polite live region, not an alert.
      expect(
        within(screen.getByRole('status')).getByText('Deleted Kombucha'),
      ).toBeVisible();
      expect(screen.getByRole('button', { name: 'Undo' })).toBeVisible();
      await act(() => vi.advanceTimersByTimeAsync(3500));
      expect(writes(calls)).toEqual([]);
      await act(() => vi.advanceTimersByTimeAsync(1500));
      await flush();

      expect(writes(calls)).toEqual([
        'DELETE /api/catalog/family-ingredients/k1',
      ]);
      expect(screen.queryByRole('group', { name: 'Kombucha' })).toBeNull();
    });

    it('says "Nothing uses it" for an unused Ingredient', async () => {
      stub();
      renderWithProviders(<FamilyCatalogSection />);
      const row = await focusRow('Tempeh');
      fireEvent.keyDown(row, { key: 'Delete' });
      expect(screen.getByText('Nothing uses it')).toBeVisible();
    });

    it('sends nothing on Undo, even after the window would have ended', async () => {
      vi.useFakeTimers();
      const flush = () => act(() => vi.advanceTimersByTimeAsync(0));
      const calls = stub();
      renderWithProviders(<FamilyCatalogSection />);
      await flush();

      const row = screen.getByRole('group', { name: 'Kombucha' });
      act(() => row.focus());
      fireEvent.keyDown(row, { key: 'Delete' });
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
      await act(() => vi.advanceTimersByTimeAsync(1000));
      expect(screen.queryByRole('group', { name: 'Kombucha' })).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
      await act(() => vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS + 1000));
      await flush();

      expect(screen.getByRole('group', { name: 'Kombucha' })).toBeVisible();
      expect(writes(calls)).toEqual([]);
    });

    it('deletes from the sheet link: the draft is dropped and the row asks', async () => {
      const calls = stub();
      renderWithProviders(<FamilyCatalogSection />);
      const user = userEvent.setup();

      const dialog = await openSheet(user);
      await user.type(within(dialog).getByLabelText('Name'), ' x');
      await user.click(
        within(dialog).getByRole('button', {
          name: 'Delete from family catalog',
        }),
      );

      expect(await screen.findByText('Delete Kombucha?')).toBeVisible();
      expect(writes(calls)).toEqual([]);
    });

    it('describes the usage in the sheet', async () => {
      stub();
      renderWithProviders(<FamilyCatalogSection />);
      const user = userEvent.setup();

      const dialog = await openSheet(user);
      expect(
        within(dialog).getByText('Used by 3 Batches and 1 Staple.'),
      ).toBeVisible();
      await user.keyboard('{Escape}');
      await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      const other = await openSheet(user, 'Tempeh');
      expect(within(other).getByText('Nothing uses it yet.')).toBeVisible();
    });
  });

  it('counts the usage total in Romanian', async () => {
    stub();
    renderWithProviders(<FamilyCatalogSection />, { locale: 'ro' });
    const row = await focusRow('Kombucha');
    fireEvent.keyDown(row, { key: 'Delete' });
    expect(screen.getByText('Folosit în 4 locuri')).toBeVisible();
  });

  it('teaches tap in the first-use hint', async () => {
    vi.useFakeTimers();
    stub();
    renderWithProviders(<FamilyCatalogSection />);
    await act(() => vi.advanceTimersByTimeAsync(1500));
    expect(
      screen.getByText('Swipe left to delete · tap to edit'),
    ).toBeVisible();
  });
});

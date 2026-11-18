import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminCatalog, AdminIngredient } from '@/lib/admin';
import { renderWithProviders, stubApi } from '@/test/render';
import { IngredientEditor } from './IngredientEditor';

const catalog: AdminCatalog = {
  aisles: [{ id: 'a1', name: 'Dairy & eggs', sortOrder: 1, translations: [] }],
  tagGroups: [],
  tags: [],
  allergens: [],
  eatingMoments: [],
  parentCategories: [
    {
      id: 'p1',
      name: 'Dairy',
      aisleId: 'a1',
      defaultExpiryDays: 10,
      defaultLocation: 'fridge',
      translations: [
        { id: 't-p1', locale: 'ro', kind: 'name', value: 'Lactate' },
      ],
    },
  ],
  leafCategories: [
    {
      id: 'l1',
      name: 'Hard cheese',
      parentId: 'p1',
      isOther: false,
      defaultExpiryDays: null,
      defaultLocation: null,
      translations: [],
    },
    {
      id: 'l2',
      name: 'Butter',
      parentId: 'p1',
      isOther: false,
      defaultExpiryDays: 30,
      defaultLocation: null,
      translations: [],
    },
  ],
  ingredients: [],
};

const parmesan: AdminIngredient = {
  id: 'i1',
  name: 'Parmesan',
  leafCategoryId: 'l1',
  defaultUnit: 'g',
  pantryBasic: false,
  allergenIds: [],
  allergensReviewPending: false,
  translations: [
    { id: 't1', locale: 'en', kind: 'name', value: 'Parmesan' },
    { id: 't2', locale: 'ro', kind: 'name', value: 'Parmezan' },
    { id: 't3', locale: 'en', kind: 'synonym', value: 'Parmigiano' },
  ],
};

function stub(routes: Parameters<typeof stubApi>[0] = {}) {
  const api = stubApi({
    'GET /api/admin/catalog': () => Response.json(catalog),
    ...routes,
  });
  vi.stubGlobal('fetch', api.fetchMock);
  return api.calls;
}

describe('IngredientEditor', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the Leaf Category as a field-button with its Aisle, and the unit as pressed chips', async () => {
    stub();
    renderWithProviders(
      <IngredientEditor
        ingredient={parmesan}
        catalog={catalog}
        onDone={vi.fn()}
      />,
    );
    const user = userEvent.setup();

    const field = screen.getByRole('button', { name: /Leaf Category/ });
    expect(field).toHaveTextContent('Hard cheese');
    expect(field).toHaveTextContent('Dairy & eggs');
    const units = within(screen.getByRole('group', { name: 'Default unit' }));
    expect(units.getByRole('button', { name: 'g' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(units.getByRole('button', { name: 'kg' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    await user.click(field);
    expect(screen.getByRole('button', { name: 'Hard cheese' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(screen.getByRole('button', { name: 'Butter' }));
    expect(
      await screen.findByRole('button', { name: /Leaf Category/ }),
    ).toHaveTextContent('Butter');
  });

  it('creates an Ingredient with a Leaf Category and default unit', async () => {
    const calls = stub({
      'POST /api/admin/catalog/ingredients': () =>
        Response.json({ id: 'new' }, { status: 201 }),
    });
    const onDone = vi.fn();
    renderWithProviders(<IngredientEditor catalog={catalog} onDone={onDone} />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/Name \(English\)/), 'Gouda');
    await user.click(screen.getByRole('button', { name: /Leaf Category/ }));
    await user.click(screen.getByRole('button', { name: 'Butter' }));
    await user.click(
      within(
        await screen.findByRole('group', { name: 'Default unit' }),
      ).getByRole('button', { name: 'kg' }),
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await vi.waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(calls.find((c) => c.key.startsWith('POST'))?.body).toEqual({
      name: 'Gouda',
      leafCategoryId: 'l2',
      defaultUnit: 'kg',
      pantryBasic: false,
    });
    // No translation controls until the Ingredient exists.
    expect(screen.queryByText('Translations and Synonyms')).toBeNull();
  });

  it('edits an existing Ingredient and shows its translations and Synonyms', async () => {
    const calls = stub({
      'PATCH /api/admin/catalog/ingredients/i1': () => Response.json({}),
    });
    renderWithProviders(
      <IngredientEditor
        ingredient={parmesan}
        catalog={catalog}
        onDone={vi.fn()}
      />,
    );
    const user = userEvent.setup();

    expect(screen.getByLabelText(/Name \(English\)/)).toHaveValue('Parmesan');
    expect(screen.getByLabelText('Name (Romanian)')).toHaveValue('Parmezan');
    expect(screen.getByText('Parmigiano')).toBeVisible();

    await user.clear(screen.getByLabelText(/Name \(English\)/));
    await user.type(
      screen.getByLabelText(/Name \(English\)/),
      'Parmigiano Reggiano',
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await vi.waitFor(() =>
      expect(calls.some((c) => c.key.startsWith('PATCH'))).toBe(true),
    );
    expect(calls.find((c) => c.key.startsWith('PATCH'))?.body).toEqual({
      name: 'Parmigiano Reggiano',
      leafCategoryId: 'l1',
      defaultUnit: 'g',
      pantryBasic: false,
    });
  });

  it('tags the Allergens a shared Ingredient contains and saves them at once', async () => {
    const withAllergens: AdminCatalog = {
      ...catalog,
      allergens: [
        {
          id: 'al-milk',
          name: 'Milk',
          sortOrder: 1,
          archived: false,
          translations: [],
        },
        {
          id: 'al-soy',
          name: 'Soy',
          sortOrder: 2,
          archived: false,
          translations: [],
        },
        {
          id: 'al-old',
          name: 'Lupin',
          sortOrder: 3,
          archived: true,
          translations: [],
        },
      ],
    };
    const calls = stub({
      'PUT /api/admin/catalog/ingredients/i1/allergens': () =>
        Response.json({ id: 'i1', allergenIds: ['al-milk', 'al-soy'] }),
    });
    renderWithProviders(
      <IngredientEditor
        ingredient={{ ...parmesan, allergenIds: ['al-milk'] }}
        catalog={withAllergens}
        onDone={vi.fn()}
      />,
    );
    const user = userEvent.setup();

    const group = screen.getByRole('group', { name: 'Contains' });
    // A retired Allergen nobody tagged is not offered.
    expect(within(group).queryByRole('button', { name: 'Lupin' })).toBeNull();
    expect(within(group).getByRole('button', { name: 'Milk' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(within(group).getByRole('button', { name: 'Soy' }));
    await user.click(screen.getByRole('button', { name: 'Save Allergens' }));

    await screen.findByText('Allergens saved.');
    expect(calls.find((c) => c.key.startsWith('PUT'))?.body).toEqual({
      allergenIds: ['al-milk', 'al-soy'],
    });
  });

  it('flags tags carried over from a Family Ingredient for review until they are saved', async () => {
    const withAllergens: AdminCatalog = {
      ...catalog,
      allergens: [
        {
          id: 'al-milk',
          name: 'Milk',
          sortOrder: 1,
          archived: false,
          translations: [],
        },
      ],
    };
    stub({
      'PUT /api/admin/catalog/ingredients/i1/allergens': () =>
        Response.json({ id: 'i1', allergenIds: ['al-milk'] }),
    });
    renderWithProviders(
      <IngredientEditor
        ingredient={{
          ...parmesan,
          allergenIds: ['al-milk'],
          allergensReviewPending: true,
        }}
        catalog={withAllergens}
        onDone={vi.fn()}
      />,
    );
    const user = userEvent.setup();

    expect(
      screen.getByRole('status', { name: 'Needs review' }),
    ).toHaveTextContent('Carried over from a Family');
    await user.click(screen.getByRole('button', { name: 'Save Allergens' }));
    await screen.findByText('Allergens saved.');
    expect(screen.queryByRole('status', { name: 'Needs review' })).toBeNull();
  });

  it('saves an empty selection as containing none', async () => {
    const withAllergens: AdminCatalog = {
      ...catalog,
      allergens: [
        {
          id: 'al-milk',
          name: 'Milk',
          sortOrder: 1,
          archived: false,
          translations: [],
        },
      ],
    };
    const calls = stub({
      'PUT /api/admin/catalog/ingredients/i1/allergens': () =>
        Response.json({ id: 'i1', allergenIds: [] }),
    });
    renderWithProviders(
      <IngredientEditor
        ingredient={{ ...parmesan, allergenIds: ['al-milk'] }}
        catalog={withAllergens}
        onDone={vi.fn()}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Milk' }));
    await user.click(screen.getByRole('button', { name: 'Save Allergens' }));
    await vi.waitFor(() =>
      expect(calls.find((c) => c.key.startsWith('PUT'))?.body).toEqual({
        allergenIds: [],
      }),
    );
  });

  it('flags an Ingredient as a Pantry Basic', async () => {
    const calls = stub({
      'PATCH /api/admin/catalog/ingredients/i1': () => Response.json({}),
    });
    renderWithProviders(
      <IngredientEditor
        ingredient={parmesan}
        catalog={catalog}
        onDone={vi.fn()}
      />,
    );
    const user = userEvent.setup();

    const toggle = screen.getByLabelText('Pantry Basic');
    expect(toggle).not.toBeChecked();
    await user.click(toggle);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await vi.waitFor(() =>
      expect(calls.find((c) => c.key.startsWith('PATCH'))?.body).toEqual({
        name: 'Parmesan',
        leafCategoryId: 'l1',
        defaultUnit: 'g',
        pantryBasic: true,
      }),
    );
  });

  it('shows an existing Pantry Basic as checked and labels it in Romanian', () => {
    stub();
    renderWithProviders(
      <IngredientEditor
        ingredient={{ ...parmesan, pantryBasic: true }}
        catalog={catalog}
        onDone={vi.fn()}
      />,
      { locale: 'ro' },
    );
    expect(screen.getByLabelText(/Nelipsit din Cămară/)).toBeChecked();
  });

  it('adds a Synonym, saves a translated name, and removes a Synonym', async () => {
    const calls = stub({
      'POST /api/admin/catalog/translations': () =>
        Response.json({}, { status: 201 }),
      'PATCH /api/admin/catalog/translations/t2': () => Response.json({}),
      'DELETE /api/admin/catalog/translations/t3': () =>
        new Response(null, { status: 204 }),
    });
    renderWithProviders(
      <IngredientEditor
        ingredient={parmesan}
        catalog={catalog}
        onDone={vi.fn()}
      />,
    );
    const user = userEvent.setup();

    await user.type(
      screen.getByLabelText('New Synonym (Romanian)'),
      'parmezan tare',
    );
    await user.click(
      screen.getByRole('button', { name: 'Add Romanian Synonym' }),
    );
    await vi.waitFor(() =>
      expect(
        calls.find((c) => c.key === 'POST /api/admin/catalog/translations'),
      ).toBeDefined(),
    );
    expect(calls.find((c) => c.key.startsWith('POST'))?.body).toEqual({
      entityType: 'ingredient',
      entityId: 'i1',
      locale: 'ro',
      kind: 'synonym',
      value: 'parmezan tare',
    });

    await user.clear(screen.getByLabelText('Name (Romanian)'));
    await user.type(screen.getByLabelText('Name (Romanian)'), 'Parmezan DOP');
    await user.click(
      screen.getByRole('button', { name: 'Save Romanian name' }),
    );
    await vi.waitFor(() =>
      expect(calls.find((c) => c.key.startsWith('PATCH'))?.body).toEqual({
        value: 'Parmezan DOP',
      }),
    );

    await user.click(
      screen.getByRole('button', { name: 'Remove Synonym Parmigiano' }),
    );
    await vi.waitFor(() =>
      expect(calls.some((c) => c.key.startsWith('DELETE'))).toBe(true),
    );
  });

  it('takes a Danish display name and Danish Synonyms', async () => {
    const calls = stub({
      'POST /api/admin/catalog/translations': () =>
        Response.json({}, { status: 201 }),
    });
    renderWithProviders(
      <IngredientEditor
        ingredient={parmesan}
        catalog={catalog}
        onDone={vi.fn()}
      />,
    );
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Name (Danish)'), 'Parmesanost');
    await user.click(screen.getByRole('button', { name: 'Save Danish name' }));
    await vi.waitFor(() =>
      expect(calls.find((c) => c.key.startsWith('POST'))?.body).toEqual({
        entityType: 'ingredient',
        entityId: 'i1',
        locale: 'da',
        kind: 'name',
        value: 'Parmesanost',
      }),
    );
    await user.type(
      screen.getByLabelText('New Synonym (Danish)'),
      'parmesan ost',
    );
    await user.click(
      screen.getByRole('button', { name: 'Add Danish Synonym' }),
    );
    await vi.waitFor(() =>
      expect(
        calls.filter((c) => c.key.startsWith('POST')).at(-1)?.body,
      ).toEqual({
        entityType: 'ingredient',
        entityId: 'i1',
        locale: 'da',
        kind: 'synonym',
        value: 'parmesan ost',
      }),
    );
  });

  it('explains in the Member language why an Ingredient in use cannot be deleted', async () => {
    stub({
      'DELETE /api/admin/catalog/ingredients/i1': () =>
        Response.json(
          {
            code: 'catalog.ingredient_in_use',
            params: {},
          },
          { status: 409 },
        ),
    });
    renderWithProviders(
      <IngredientEditor
        ingredient={parmesan}
        catalog={catalog}
        onDone={vi.fn()}
      />,
      { locale: 'ro' },
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Șterge' }));
    await user.click(screen.getByRole('button', { name: 'Confirmă' }));

    expect(await screen.findByText(/încă folosit în Cămară/)).toBeVisible();
  });

  it('shows the duplicate-name error from the API', async () => {
    stub({
      'POST /api/admin/catalog/ingredients': () =>
        Response.json(
          { code: 'catalog.name_taken', params: {} },
          { status: 409 },
        ),
    });
    renderWithProviders(
      <IngredientEditor catalog={catalog} onDone={vi.fn()} />,
    );
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/Name \(English\)/), 'Parmesan');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText(/already used/)).toBeVisible();
  });

  it('focuses a heading when the editor opens', () => {
    stub();
    renderWithProviders(
      <IngredientEditor
        ingredient={parmesan}
        catalog={catalog}
        onDone={vi.fn()}
      />,
    );
    expect(
      screen.getByRole('heading', { name: 'Edit Parmesan' }),
    ).toHaveFocus();
  });

  it('keeps visible button text inside the accessible name', () => {
    stub();
    renderWithProviders(
      <IngredientEditor
        ingredient={parmesan}
        catalog={catalog}
        onDone={vi.fn()}
      />,
    );
    const add = screen.getByRole('button', { name: 'Add Romanian Synonym' });
    expect(add).toHaveTextContent('Add');
    const remove = screen.getByRole('button', {
      name: 'Remove Synonym Parmigiano',
    });
    expect(remove).toHaveTextContent('Remove');
  });
});

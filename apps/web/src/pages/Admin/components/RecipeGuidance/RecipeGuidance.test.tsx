import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminCatalog } from '@/lib/admin';
import type { AdminRecipe } from '@/lib/adminRecipes';
import { renderWithProviders, stubApi } from '@/test/render';
import { RecipeGuidance } from './RecipeGuidance';

const catalog: AdminCatalog = {
  aisles: [],
  tagGroups: [],
  tags: [],
  allergens: [],
  eatingMoments: [
    {
      id: 'em1',
      name: 'Breakfast',
      sortOrder: 1,
      archived: false,
      translations: [],
    },
    {
      id: 'em2',
      name: 'Before bed',
      sortOrder: 2,
      archived: true,
      translations: [],
    },
    {
      id: 'em3',
      name: 'Lunch',
      sortOrder: 3,
      archived: false,
      translations: [],
    },
  ],
  parentCategories: [],
  leafCategories: [],
  ingredients: [
    {
      id: 'i-milk',
      name: 'Milk',
      leafCategoryId: 'l1',
      defaultUnit: 'ml',
      pantryBasic: false,
      allergenIds: [],
      allergensReviewPending: false,
      translations: [],
    },
  ],
};

const recipe: AdminRecipe = {
  id: 'r1',
  parentId: null,
  title: 'Soup',
  servings: 4,
  prepMinutes: null,
  cookMinutes: null,
  difficulty: null,
  tagIds: [],
  archived: false,
  lines: [],
  steps: [],
  tips: [],
  parentTips: null,
  nutritionNote: null,
  pairings: [],
  eatingMoments: [],
  translations: {},
};

const milk = {
  id: 'i-milk',
  name: 'Milk',
  defaultUnit: 'ml',
  leafCategory: { id: 'l1', name: 'Milk' },
  parentCategory: {
    id: 'p1',
    name: 'Dairy',
    aisle: { id: 'aisle', name: 'Dairy' },
  },
  defaults: { expiryDays: 7, location: 'fridge' },
};

const recipeList = [
  { id: 'r1', title: 'Soup', archived: false },
  { id: 'r4', title: 'Zucchini bake', archived: false },
  { id: 'r2', title: 'Bread', archived: false },
  { id: 'r3', title: 'Old stew', archived: true },
].map((r) => ({
  ...r,
  parentId: null,
  servings: 2,
  difficulty: null,
  tagIds: [],
}));

function open(
  value: AdminRecipe = recipe,
  extra: Record<string, () => Response> = {},
) {
  const api = stubApi({
    'GET /api/admin/recipes': () => Response.json(recipeList),
    'PUT /api/admin/recipes/r1/guidance': () => Response.json(value),
    ...extra,
  });
  vi.stubGlobal('fetch', api.fetchMock);
  renderWithProviders(<RecipeGuidance recipe={value} catalog={catalog} />);
  return api.calls;
}

const saved = (calls: ReturnType<typeof open>) =>
  calls.find((c) => c.key === 'PUT /api/admin/recipes/r1/guidance');

describe('RecipeGuidance', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends a Pairing with kind, label, reason and Principle', async () => {
    const calls = open();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Add a Pairing' }));
    await user.selectOptions(
      screen.getByLabelText('Kind of Pairing 1'),
      'drink',
    );
    await user.click(screen.getByLabelText('Label of Pairing 1'));
    await user.paste('A glass of dry white wine');
    await user.click(screen.getByLabelText('Reason for Pairing 1'));
    await user.paste('Its acidity cuts through the butter');
    await user.selectOptions(
      screen.getByLabelText('Principle of Pairing 1'),
      'Acid cuts fat',
    );
    await user.click(screen.getByRole('button', { name: 'Save guidance' }));

    await vi.waitFor(() => expect(saved(calls)).toBeDefined());
    expect(saved(calls)?.body).toEqual({
      nutritionNote: null,
      pairings: [
        {
          kind: 'drink',
          label: 'A glass of dry white wine',
          reason: 'Its acidity cuts through the butter',
          principle: 'acid_cuts_fat',
          linkedIngredientId: null,
          linkedRecipeId: null,
        },
      ],
      eatingMoments: [],
    });
    expect(await screen.findByText('Guidance saved.')).toBeInTheDocument();
  });

  it('sends the Nutrition Note and Eating Moments', async () => {
    const calls = open();
    const user = userEvent.setup();

    await user.click(screen.getByLabelText('Nutrition Note'));
    await user.paste('Rich in fat; keep portions modest.');
    await user.selectOptions(
      screen.getByLabelText('Add an Eating Moment'),
      'Lunch',
    );
    await user.selectOptions(
      screen.getByLabelText('Good for or Avoid: Lunch'),
      'avoid',
    );
    await user.type(screen.getByLabelText('Reason for Lunch'), 'Heavy');
    await user.click(screen.getByRole('button', { name: 'Save guidance' }));

    await vi.waitFor(() => expect(saved(calls)).toBeDefined());
    expect(saved(calls)?.body).toEqual({
      nutritionNote: 'Rich in fat; keep portions modest.',
      pairings: [],
      eatingMoments: [
        { eatingMomentId: 'em3', polarity: 'avoid', reason: 'Heavy' },
      ],
    });
  });

  it('loads saved guidance and keeps Pairing ids so their translations survive', async () => {
    const calls = open({
      ...recipe,
      nutritionNote: 'Light.',
      pairings: [
        {
          id: 'p1',
          kind: 'food',
          label: 'Crusty bread',
          reason: 'Soaks up the broth',
          principle: null,
          linkedIngredientId: null,
          linkedRecipeId: 'r2',
        },
      ],
      eatingMoments: [
        { eatingMomentId: 'em1', polarity: 'good_for', reason: null },
      ],
    });
    const user = userEvent.setup();

    expect(screen.getByLabelText('Label of Pairing 1')).toHaveValue(
      'Crusty bread',
    );
    expect(screen.getByLabelText('Nutrition Note')).toHaveValue('Light.');
    await user.clear(screen.getByLabelText('Label of Pairing 1'));
    await user.type(screen.getByLabelText('Label of Pairing 1'), 'Sourdough');
    await user.click(screen.getByRole('button', { name: 'Save guidance' }));

    await vi.waitFor(() => expect(saved(calls)).toBeDefined());
    expect(saved(calls)?.body).toMatchObject({
      pairings: [
        {
          id: 'p1',
          label: 'Sourdough',
          linkedRecipeId: 'r2',
          linkedIngredientId: null,
        },
      ],
      eatingMoments: [
        { eatingMomentId: 'em1', polarity: 'good_for', reason: null },
      ],
    });
  });

  it('links a Pairing to an Ingredient or a Recipe, one at a time', async () => {
    const calls = open(recipe, {
      'GET /api/catalog/search': () => Response.json({ results: [milk] }),
    });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Add a Pairing' }));
    await user.type(screen.getByLabelText('Label of Pairing 1'), 'Milk');
    await user.type(screen.getByLabelText('Reason for Pairing 1'), 'Cools');

    await user.selectOptions(
      screen.getByLabelText('Link of Pairing 1'),
      'An Ingredient',
    );
    await user.type(
      screen.getByRole('combobox', { name: 'Linked Ingredient of Pairing 1' }),
      'milk',
    );
    const option = await screen.findByRole('option', { name: /Milk/ });
    // The link target has no use for a unit chip.
    expect(option).toHaveAccessibleName('Milk, Milk · Dairy');
    await user.click(option);
    expect(screen.getByText('Linked Ingredient: Milk')).toBeInTheDocument();
    expect(
      screen.getByRole('combobox', { name: 'Linked Ingredient of Pairing 1' }),
    ).toHaveAccessibleDescription('Linked Ingredient: Milk');
    await user.selectOptions(
      screen.getByLabelText('Link of Pairing 1'),
      'A Recipe',
    );
    expect(screen.queryByText(/Linked Ingredient/)).toBeNull();
    await user.selectOptions(
      screen.getByLabelText('Linked Recipe of Pairing 1'),
      'Bread',
    );
    await user.click(screen.getByRole('button', { name: 'Save guidance' }));
    await vi.waitFor(() => expect(saved(calls)).toBeDefined());
    expect(saved(calls)?.body).toMatchObject({
      pairings: [{ linkedIngredientId: null, linkedRecipeId: 'r2' }],
    });
  });

  it('searches the shared Catalog only for an Ingredient link, with no Use as typed', async () => {
    const calls = open(recipe, {
      'GET /api/catalog/search': () => Response.json({ results: [milk] }),
    });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Add a Pairing' }));
    await user.selectOptions(
      screen.getByLabelText('Link of Pairing 1'),
      'An Ingredient',
    );
    await user.type(
      screen.getByRole('combobox', { name: 'Linked Ingredient of Pairing 1' }),
      'mi',
    );
    await screen.findByRole('option', { name: /Milk/ });

    expect(screen.queryByRole('option', { name: /as typed/ })).toBeNull();
    const searches = calls.filter((c) => c.key === 'GET /api/catalog/search');
    expect(searches.length).toBeGreaterThan(0);
    for (const call of searches) {
      expect(new URLSearchParams(call.search).get('scope')).toBe('shared');
    }
  });

  it('sends an Ingredient link picked by search', async () => {
    const calls = open(recipe, {
      'GET /api/catalog/search': () => Response.json({ results: [milk] }),
    });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Add a Pairing' }));
    await user.type(screen.getByLabelText('Label of Pairing 1'), 'Milk');
    await user.type(screen.getByLabelText('Reason for Pairing 1'), 'Cools');
    await user.selectOptions(
      screen.getByLabelText('Link of Pairing 1'),
      'An Ingredient',
    );
    await user.type(
      screen.getByRole('combobox', { name: 'Linked Ingredient of Pairing 1' }),
      'milk',
    );
    await user.click(await screen.findByRole('option', { name: /Milk/ }));
    await user.click(screen.getByRole('button', { name: 'Save guidance' }));
    await vi.waitFor(() => expect(saved(calls)).toBeDefined());
    expect(saved(calls)?.body).toMatchObject({
      pairings: [{ linkedIngredientId: 'i-milk', linkedRecipeId: null }],
    });
  });

  it('blocks saving a link type with no target', async () => {
    open();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Add a Pairing' }));
    await user.type(screen.getByLabelText('Label of Pairing 1'), 'Milk');
    await user.type(screen.getByLabelText('Reason for Pairing 1'), 'Cools');
    await user.selectOptions(
      screen.getByLabelText('Link of Pairing 1'),
      'A Recipe',
    );
    expect(
      screen.getByText(
        'Choose what Pairing 1 links to, or set its link to No link.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Save guidance' }),
    ).toBeDisabled();
  });

  it('limits label and reason length like the API', async () => {
    open();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Add a Pairing' }));
    expect(screen.getByLabelText('Label of Pairing 1')).toHaveAttribute(
      'maxlength',
      '200',
    );
    expect(screen.getByLabelText('Reason for Pairing 1')).toHaveAttribute(
      'maxlength',
      '1000',
    );
  });

  it('offers only live Recipes other than this one, and the 8 labelled Principles', async () => {
    open();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Add a Pairing' }));
    await user.selectOptions(
      screen.getByLabelText('Link of Pairing 1'),
      'A Recipe',
    );

    const recipes = await screen.findByLabelText('Linked Recipe of Pairing 1');
    await vi.waitFor(() =>
      expect(
        Array.from(recipes.querySelectorAll('option')).map(
          (o) => o.textContent,
        ),
      ).toEqual(['Choose…', 'Bread', 'Zucchini bake']),
    );
    const principles = screen.getByLabelText('Principle of Pairing 1');
    expect(principles.querySelectorAll('option')).toHaveLength(9);
    expect(
      screen.getByRole('option', { name: 'Regional tradition' }),
    ).toBeInTheDocument();
  });

  it('removes and reorders Pairings, and stops at 10', async () => {
    const calls = open();
    const user = userEvent.setup();
    // Looked up once: a role query re-scans every Pairing's buttons, and this one stays put.
    const add = screen.getByRole('button', { name: 'Add a Pairing' });
    await user.click(add);
    await user.type(screen.getByLabelText('Label of Pairing 1'), 'One');
    await user.type(screen.getByLabelText('Reason for Pairing 1'), 'r');
    await user.click(add);
    await user.type(screen.getByLabelText('Label of Pairing 2'), 'Two');
    await user.type(screen.getByLabelText('Reason for Pairing 2'), 'r');
    await user.click(screen.getByRole('button', { name: 'Move Pairing 2 up' }));
    expect(screen.getByLabelText('Label of Pairing 1')).toHaveValue('Two');
    await user.click(screen.getByRole('button', { name: 'Remove Pairing 2' }));
    expect(screen.queryByLabelText('Label of Pairing 2')).toBeNull();

    for (let i = 0; i < 9; i++) await user.click(add);
    expect(screen.getByLabelText('Label of Pairing 10')).toBeInTheDocument();
    expect(add).toBeDisabled();
    expect(
      screen.getByText('A Recipe can have at most 10 Pairings.'),
    ).toBeInTheDocument();
    expect(saved(calls)).toBeUndefined();
  });

  it('blocks saving a Pairing without label or reason', async () => {
    open();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Add a Pairing' }));
    expect(
      screen.getByRole('button', { name: 'Save guidance' }),
    ).toBeDisabled();
    expect(
      screen.getByText('Every Pairing needs a label and a reason.'),
    ).toBeInTheDocument();
  });

  it('explains the Nutrition Note and counts characters up to 500', async () => {
    open();
    const user = userEvent.setup();
    expect(
      screen.getByText(/general direction, never values/i),
    ).toBeInTheDocument();
    expect(screen.getByText('0 of 500 characters')).toBeInTheDocument();
    await user.click(screen.getByLabelText('Nutrition Note'));
    await user.paste('x'.repeat(501));
    expect(screen.getByText('501 of 500 characters')).toBeInTheDocument();
    expect(
      screen.getByText('The Nutrition Note is over 500 characters.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Save guidance' }),
    ).toBeDisabled();
  });

  it('keeps archived and already-used Eating Moments out of the picker, and stops at 10', async () => {
    open({
      ...recipe,
      eatingMoments: [
        { eatingMomentId: 'em1', polarity: 'good_for', reason: null },
      ],
    });
    const user = userEvent.setup();
    const picker = screen.getByLabelText('Add an Eating Moment');
    expect(
      Array.from(picker.querySelectorAll('option')).map((o) => o.textContent),
    ).toEqual(['Choose…', 'Lunch']);

    await user.selectOptions(picker, 'Lunch');
    expect(screen.getByLabelText('Reason for Lunch')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove Breakfast' }));
    expect(screen.queryByLabelText('Reason for Breakfast')).toBeNull();
    expect(
      Array.from(
        screen
          .getByLabelText('Add an Eating Moment')
          .querySelectorAll('option'),
      ).map((o) => o.textContent),
    ).toEqual(['Choose…', 'Breakfast']);
  });

  it('shows a coded API error', async () => {
    open(recipe, {
      'PUT /api/admin/recipes/r1/guidance': () =>
        Response.json(
          { code: 'recipes.pairing_link_not_allowed', params: {} },
          { status: 422 },
        ),
    });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Nutrition Note'), 'Fine');
    await user.click(screen.getByRole('button', { name: 'Save guidance' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /cannot link to that Recipe/,
    );
  });
});

describe('RecipeGuidance Browse by aisle', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows Browse by aisle in the linked Ingredient search, on the shared Catalog', async () => {
    const calls = open(recipe, {
      'GET /api/catalog/aisles': () =>
        Response.json({
          aisles: [{ id: 'a1', name: 'Dairy & eggs', parentCategories: [] }],
        }),
      'GET /api/catalog/search': () => Response.json({ results: [milk] }),
    });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Add a Pairing' }));
    await user.selectOptions(
      screen.getByLabelText('Link of Pairing 1'),
      'An Ingredient',
    );

    await user.click(
      screen.getByRole('combobox', { name: 'Linked Ingredient of Pairing 1' }),
    );
    expect(await screen.findByText('Browse by aisle')).toBeVisible();
    await user.click(
      await screen.findByRole('button', { name: 'Dairy & eggs' }),
    );

    await vi.waitFor(() => {
      const search = calls.filter((c) => c.key === 'GET /api/catalog/search');
      const params = new URLSearchParams(search.at(-1)?.search);
      expect(params.get('aisleId')).toBe('a1');
      expect(params.get('scope')).toBe('shared');
    });
    for (const call of calls.filter(
      (c) => c.key === 'GET /api/catalog/aisles',
    )) {
      expect(new URLSearchParams(call.search).get('scope')).toBe('shared');
    }
  });
});

describe('RecipeGuidance: no Add to your catalog (#270)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('offers neither the button nor the option in a Pairing link search', async () => {
    open(recipe, {
      'GET /api/catalog/search': () => Response.json({ results: [] }),
    });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Add a Pairing' }));
    await user.selectOptions(
      screen.getByLabelText('Link of Pairing 1'),
      'An Ingredient',
    );

    await user.click(
      screen.getByRole('combobox', { name: 'Linked Ingredient of Pairing 1' }),
    );
    await user.paste('kombucha');

    expect(await screen.findByText('No match for “kombucha”')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /to your catalog/ }),
    ).toBeNull();
    expect(
      screen.queryByRole('option', { name: /to your catalog/ }),
    ).toBeNull();
  });
});

import { useState } from 'react';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminCatalog } from '@/lib/admin';
import type { AdminRecipe } from '@/lib/adminRecipes';
import { UNDO_WINDOW_MS } from '@/lib/useDeferredRemoval';
import { renderWithProviders, stubApi } from '@/test/render';
import { RecipeForm } from './RecipeForm';

const catalog: AdminCatalog = {
  aisles: [],
  tagGroups: [],
  tags: [],
  allergens: [],
  eatingMoments: [],
  parentCategories: [],
  leafCategories: [],
  ingredients: [
    {
      id: 'i-salt',
      name: 'Salt',
      leafCategoryId: 'l1',
      defaultUnit: 'g',
      pantryBasic: false,
      allergenIds: [],
      allergensReviewPending: false,
      translations: [],
    },
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

const adminTag = (
  id: string,
  name: string,
  groupName: string,
  order: number,
) => ({
  id,
  name,
  kind: 'catalog' as const,
  groupId: `g-${order}`,
  groupName,
  groupOrder: order,
});
const adminTags = [
  adminTag('cu1', 'Italian', 'Cuisine', 3),
  adminTag('me1', 'Baking', 'Method', 4),
];

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

const saved: AdminRecipe = {
  id: 'r1',
  parentId: null,
  title: 'Soup',
  servings: 4,
  prepMinutes: 10,
  cookMinutes: null,
  difficulty: 'easy',
  tagIds: ['cu1'],
  archived: false,
  lines: [
    {
      id: 'l1',
      ingredientId: 'i-salt',
      quantity: null,
      unit: null,
      optional: false,
      note: null,
    },
    {
      id: 'l2',
      ingredientId: 'i-milk',
      quantity: 500,
      unit: 'ml',
      optional: true,
      note: 'warm',
    },
  ],
  steps: [
    { id: 's1', text: 'Chop', timerSeconds: null },
    { id: 's2', text: 'Simmer', timerSeconds: 600 },
  ],
  tips: [],
  parentTips: null,
  nutritionNote: null,
  pairings: [],
  eatingMoments: [],
  translations: {},
};

describe('RecipeForm', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('searches the shared Catalog only, and offers no Use as typed', async () => {
    const { fetchMock, calls } = stubApi({
      'GET /api/catalog/search': () => Response.json({ results: [milk] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <RecipeForm catalog={catalog} onSaved={vi.fn()} onCancel={vi.fn()} />,
    );
    const user = userEvent.setup();

    await user.type(
      screen.getByRole('combobox', { name: 'Add an ingredient' }),
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

  it('offers neither Add to your catalog nor Use as typed when nothing matches (#590)', async () => {
    const { fetchMock } = stubApi({
      'GET /api/catalog/search': () => Response.json({ results: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <RecipeForm catalog={catalog} onSaved={vi.fn()} onCancel={vi.fn()} />,
    );
    const user = userEvent.setup();

    await user.type(
      screen.getByRole('combobox', { name: 'Add an ingredient' }),
      'kombucha',
    );

    expect(await screen.findByText(/No match for/)).toBeVisible();
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(
      screen.queryByRole('button', { name: /to your catalog/ }),
    ).toBeNull();
  });

  it('creates a Base Recipe from title, an Ingredient with its default unit, and a Step', async () => {
    const { fetchMock, calls } = stubApi({
      'GET /api/catalog/search': () => Response.json({ results: [milk] }),
      'GET /api/admin/recipes/tags': () => Response.json(adminTags),
      'POST /api/admin/recipes': () => Response.json(saved, { status: 201 }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const onSaved = vi.fn();
    renderWithProviders(
      <RecipeForm catalog={catalog} onSaved={onSaved} onCancel={vi.fn()} />,
    );
    const user = userEvent.setup();

    expect(
      screen.getByRole('heading', { name: 'New Base Recipe' }),
    ).toHaveFocus();
    await user.type(screen.getByLabelText(/Title \(English\)/), ' Pancakes ');
    await user.selectOptions(screen.getByLabelText('Difficulty'), 'Medium');
    const tags = await screen.findByRole('combobox', { name: 'Tags' });
    await user.click(tags);
    // Catalog Tags sit under their Tag Group, in Admin order.
    expect(
      within(screen.getByRole('listbox'))
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Italian', 'Baking']);
    // A Catalog Recipe takes Catalog Tags only: no Create row.
    await user.type(tags, 'Sunday roast');
    expect(
      screen.queryByRole('option', { name: /^Create/ }),
    ).not.toBeInTheDocument();
    await user.clear(tags);
    await user.click(await screen.findByRole('option', { name: 'Italian' }));
    await user.click(screen.getByRole('option', { name: 'Baking' }));
    await user.keyboard('{Escape}');
    await user.type(screen.getByLabelText('Prep (minutes)'), '5');

    await user.type(
      screen.getByRole('combobox', { name: 'Add an ingredient' }),
      'milk',
    );
    await user.click(await screen.findByRole('option', { name: /Milk/ }));
    expect(screen.getByLabelText('Unit of Milk')).toHaveValue('ml');
    await user.type(screen.getByLabelText('Quantity of Milk'), '250');
    await user.click(screen.getByRole('button', { name: 'More for Milk' }));
    await user.click(screen.getByRole('switch', { name: 'Optional: Milk' }));
    await user.type(screen.getByLabelText('Note for Milk'), 'cold');

    await user.click(
      screen.getByRole('button', { name: 'Add the first Step' }),
    );
    await user.type(screen.getByLabelText('Step 1'), 'Whisk it');
    await user.click(
      screen.getByRole('button', { name: 'Add a timer to Step 1' }),
    );
    await user.clear(screen.getByLabelText(/Timer for Step 1/));
    await user.type(screen.getByLabelText(/Timer for Step 1/), '1.5');
    await user.click(screen.getByRole('button', { name: 'Create Recipe' }));

    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved));
    expect(
      calls.find((c) => c.key === 'POST /api/admin/recipes')?.body,
    ).toEqual({
      title: 'Pancakes',
      servings: 4,
      prepMinutes: 5,
      cookMinutes: null,
      difficulty: 'medium',
      tagIds: ['cu1', 'me1'],
      lines: [
        {
          ingredientId: 'i-milk',
          quantity: 250,
          unit: 'ml',
          optional: true,
          note: 'cold',
        },
      ],
      steps: [{ text: 'Whisk it', timerSeconds: 90 }],
    });
  });

  it('edits a saved Recipe keeping ids, order and "to taste" lines', async () => {
    const { fetchMock, calls } = stubApi({
      'GET /api/admin/recipes/tags': () => Response.json(adminTags),
      'PUT /api/admin/recipes/r1': () => Response.json(saved),
    });
    vi.stubGlobal('fetch', fetchMock);
    const onSaved = vi.fn();
    renderWithProviders(
      <RecipeForm
        recipe={saved}
        catalog={catalog}
        onSaved={onSaved}
        onCancel={vi.fn()}
      />,
    );
    const user = userEvent.setup();

    // The unit of a line without a quantity still shows the Ingredient's default.
    expect(screen.getByLabelText('Unit of Salt')).toHaveValue('g');
    expect(screen.getByLabelText('Timer for Step 2 (minutes)')).toHaveValue(
      '10',
    );
    await user.click(screen.getByRole('button', { name: 'Move Step 2 up' }));
    await user.click(screen.getByRole('button', { name: 'More for Milk' }));
    await user.click(screen.getByRole('button', { name: 'Move Milk up' }));
    await user.click(screen.getByRole('button', { name: 'Remove Step 2' }));
    await user.click(screen.getByRole('button', { name: 'Save Recipe' }));

    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(
      calls.find((c) => c.key === 'PUT /api/admin/recipes/r1'),
    ).toMatchObject({
      key: 'PUT /api/admin/recipes/r1',
      body: {
        // Saving a Recipe edited for something else keeps its Tags.
        tagIds: ['cu1'],
        lines: [
          { id: 'l2', ingredientId: 'i-milk', quantity: 500, unit: 'ml' },
          {
            id: 'l1',
            ingredientId: 'i-salt',
            quantity: null,
            unit: null,
            optional: false,
          },
        ],
        steps: [{ id: 's2', text: 'Simmer', timerSeconds: 600 }],
      },
    });
  });

  it('blocks a bad quantity and shows the API error for a refused save', async () => {
    const { fetchMock } = stubApi({
      'PUT /api/admin/recipes/r1': () =>
        Response.json(
          { code: 'recipes.parent_archived', params: {} },
          { status: 409 },
        ),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <RecipeForm
        recipe={saved}
        catalog={catalog}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const user = userEvent.setup();

    const quantity = screen.getByLabelText('Quantity of Milk');
    await user.clear(quantity);
    await user.type(quantity, 'lots');
    expect(screen.getByRole('button', { name: 'Save Recipe' })).toBeDisabled();
    expect(screen.getByText(/Quantity must be/)).toBeInTheDocument();

    await user.clear(quantity);
    await user.type(quantity, '1,5');
    await user.click(screen.getByRole('button', { name: 'Save Recipe' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /archived, so it cannot get new Variants/,
    );
  });

  it('shows field errors for out-of-range values, blank title and blank Step', async () => {
    vi.stubGlobal('fetch', stubApi({}).fetchMock);
    renderWithProviders(
      <RecipeForm
        recipe={saved}
        catalog={catalog}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const user = userEvent.setup();
    const save = screen.getByRole('button', { name: 'Save Recipe' });
    // Each typed character re-renders the whole form; only the final value matters here, so paste it.
    const enter = async (field: HTMLElement, text: string) => {
      await user.click(field);
      await user.paste(text);
    };

    await user.clear(screen.getByLabelText(/Title \(English\)/));
    expect(screen.getByText('Enter a title.')).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Title \(English\)/), 'Soup');

    await user.clear(screen.getByLabelText('Step 1'));
    expect(screen.getByText('Enter the Step text.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Step 1'), 'Chop');

    await user.click(
      screen.getByRole('button', { name: 'Add a timer to Step 1' }),
    );
    const timer = screen.getByLabelText('Timer for Step 1 (minutes)');
    await user.clear(timer);
    expect(screen.queryByText(/The timer must be a positive/)).toBeNull();
    await enter(timer, '0.001');
    expect(
      screen.getByText(/The timer must be a positive/),
    ).toBeInTheDocument();
    expect(save).toBeDisabled();
    await user.clear(timer);
    await enter(timer, '0.0167');
    expect(save).toBeEnabled();
    await user.clear(timer);

    await enter(screen.getByLabelText('Prep (minutes)'), '100001');
    expect(save).toBeDisabled();
    await user.clear(screen.getByLabelText('Prep (minutes)'));
    const quantity = screen.getByLabelText('Quantity of Milk');
    await user.clear(quantity);
    await enter(quantity, '1000001');
    expect(save).toBeDisabled();
  });

  it('shows timers in tidy minutes', () => {
    vi.stubGlobal('fetch', stubApi({}).fetchMock);
    renderWithProviders(
      <RecipeForm
        recipe={{
          ...saved,
          steps: [{ id: 's1', text: 'Chop', timerSeconds: 100 }],
        }}
        catalog={catalog}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Timer for Step 1 (minutes)')).toHaveValue(
      '1.67',
    );
  });

  it('warns before removing a saved Step that has Tips', async () => {
    vi.stubGlobal('fetch', stubApi({}).fetchMock);
    renderWithProviders(
      <RecipeForm
        recipe={{
          ...saved,
          tips: [{ id: 't1', stepId: 's1', text: 'Sharp knife' }],
        }}
        catalog={catalog}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Remove Step 2' }));
    expect(screen.queryByLabelText('Step 2')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Remove Step 1' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Removing Step 1 deletes its 1 Tip when you save.',
    );
    expect(screen.getByLabelText('Step 1')).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Remove Step and Tips' }),
    );
    expect(screen.queryByLabelText('Step 1')).toBeNull();
  });
});

describe('RecipeForm Browse by aisle', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows Browse by aisle, and its Aisle searches stay on the shared Catalog', async () => {
    const { fetchMock, calls } = stubApi({
      'GET /api/catalog/aisles': () =>
        Response.json({
          aisles: [{ id: 'a1', name: 'Dairy & eggs', parentCategories: [] }],
        }),
      'GET /api/catalog/search': () => Response.json({ results: [milk] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <RecipeForm catalog={catalog} onSaved={vi.fn()} onCancel={vi.fn()} />,
    );
    const user = userEvent.setup();

    await user.click(
      screen.getByRole('combobox', { name: 'Add an ingredient' }),
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

describe('RecipeForm: no Add to your catalog (#270)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('offers neither the button nor the option when nothing matches', async () => {
    const { fetchMock } = stubApi({
      'GET /api/catalog/search': () => Response.json({ results: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <RecipeForm catalog={catalog} onSaved={vi.fn()} onCancel={vi.fn()} />,
    );

    await userEvent.type(
      screen.getByRole('combobox', { name: 'Add an ingredient' }),
      'kombucha',
    );

    expect(await screen.findByText('No match for “kombucha”')).toBeVisible();
    expect(screen.queryByText(/to your catalog/)).toBeNull();
    expect(
      screen.queryByRole('button', { name: /to your catalog/ }),
    ).toBeNull();
    expect(
      screen.queryByRole('option', { name: /to your catalog/ }),
    ).toBeNull();
  });
});

describe('RecipeForm Steps (#591)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const show = (withTip = false, hideable = false) => {
    vi.stubGlobal('fetch', stubApi({}).fetchMock);
    const form = (
      <RecipeForm
        recipe={
          withTip
            ? {
                ...saved,
                tips: [{ id: 't1', stepId: 's1', text: 'Sharp knife' }],
              }
            : saved
        }
        catalog={catalog}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    /** Unmounts only the form, keeping the toast provider up. */
    const Hideable = () => {
      const [hidden, setHidden] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setHidden(true)}>
            Hide form
          </button>
          {hidden ? null : form}
        </>
      );
    };
    return renderWithProviders(hideable ? <Hideable /> : form);
  };

  it('turns the Timer chip into a minutes field starting at 5, and × back', async () => {
    show();
    const user = userEvent.setup();
    expect(screen.getByLabelText('Timer for Step 2 (minutes)')).toHaveValue(
      '10',
    );
    await user.click(
      screen.getByRole('button', { name: 'Add a timer to Step 1' }),
    );
    const timer = screen.getByLabelText('Timer for Step 1 (minutes)');
    expect(timer).toHaveValue('5');
    await user.clear(timer);
    expect(screen.queryByText(/The timer must be a positive/)).toBeNull();
    await user.type(timer, 'x');
    const error = screen.getByText(/The timer must be a positive number/);
    expect(timer).toHaveAttribute('aria-describedby', error.id);
    await user.clear(timer);
    await user.type(timer, '  ');
    await user.tab();
    expect(screen.queryByLabelText('Timer for Step 1 (minutes)')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Add a timer to Step 1' }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Add a timer to Step 1' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Remove the timer from Step 1' }),
    );
    expect(screen.queryByLabelText('Timer for Step 1 (minutes)')).toBeNull();
  });

  it('adds a Step at the start and at the end, focusing its text', async () => {
    show();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Add a Step' }));
    expect(screen.getByLabelText('Step 3')).toHaveFocus();
    await user.click(
      screen.getByRole('button', { name: 'Add a Step at the start' }),
    );
    expect(screen.getByLabelText('Step 1')).toHaveFocus();
    expect(screen.getByLabelText('Step 2')).toHaveValue('Chop');
    expect(screen.getByLabelText('Step 3')).toHaveValue('Simmer');
    expect(screen.getByLabelText('Step 1')).toHaveAttribute(
      'placeholder',
      'What to do in Step 1',
    );
  });

  it('confirms inline before removing a Step with Tips, with no Undo', async () => {
    show(true);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Remove Step 1' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Removing Step 1 deletes its 1 Tip when you save.',
    );
    await user.click(
      screen.getByRole('button', { name: 'Remove Step and Tips' }),
    );
    expect(screen.getByLabelText('Step 1')).toHaveValue('Simmer');
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  });

  it('removes a Step with an Undo toast that restores it, and closes the toast on unmount', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    show(false, true);
    const user = userEvent.setup({
      advanceTimers: vi.advanceTimersByTime,
    });
    await user.click(screen.getByRole('button', { name: 'Remove Step 1' }));
    expect(screen.getByLabelText('Step 1')).toHaveValue('Simmer');
    expect(
      screen.getByText('Removed Step 1').closest('[role="status"]'),
    ).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByLabelText('Step 1')).toHaveValue('Chop');
    expect(screen.getByLabelText('Step 2')).toHaveValue('Simmer');

    await user.click(screen.getByRole('button', { name: 'Remove Step 2' }));
    expect(screen.getByRole('button', { name: 'Undo' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Hide form' }));
    expect(screen.queryByLabelText('Step 1')).toBeNull();
    // Gone within the toast's exit animation, well before its 5 s window ends.
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull(),
    );
  });
});

describe('RecipeForm Ingredient Lines (#589)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const renderSaved = (routes: Parameters<typeof stubApi>[0] = {}) => {
    const { fetchMock } = stubApi(routes);
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <RecipeForm
        recipe={saved}
        catalog={catalog}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
  };

  it('shows a row with a subline, opens one strip at a time and moves a line', async () => {
    renderSaved();
    const user = userEvent.setup({ delay: null });
    expect(screen.getByText('optional \u00b7 warm')).toBeVisible();
    const salt = screen.getByRole('button', { name: 'More for Salt' });
    const milk = screen.getByRole('button', { name: 'More for Milk' });
    await user.click(salt);
    expect(salt).toHaveAttribute('aria-expanded', 'true');
    expect(
      screen.getByRole('button', { name: 'Move Salt up' }),
    ).toHaveAttribute('aria-disabled', 'true');
    await user.click(milk);
    expect(salt).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.getByRole('button', { name: 'Move Milk down' }),
    ).toHaveAttribute('aria-disabled', 'true');
    await user.click(screen.getByRole('button', { name: 'Move Milk up' }));
    expect(screen.getAllByRole('listitem')[0]).toHaveTextContent('Milk');
  });

  it('removes a line with Undo that puts it back, and drops the toast after the window', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderSaved();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByRole('button', { name: 'More for Salt' }));
    await user.click(screen.getByRole('button', { name: 'Remove Salt' }));
    expect(screen.queryByLabelText('Quantity of Salt')).toBeNull();
    expect(
      (await screen.findByText('Removed Salt')).closest('[role="status"]'),
    ).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getAllByRole('listitem')[0]).toHaveTextContent('Salt');

    await user.click(screen.getByRole('button', { name: 'More for Salt' }));
    await user.click(screen.getByRole('button', { name: 'Remove Salt' }));
    await screen.findByText('Removed Salt');
    await act(() => vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS + 500));
    await waitFor(() => expect(screen.queryByText('Removed Salt')).toBeNull());
  });

  it('drops the Undo toast when a Save reseeds the form, so Undo cannot restore a stale id', async () => {
    renderSaved({
      'PUT /api/admin/recipes/r1': () =>
        Response.json({ ...saved, lines: saved.lines.slice(1) }),
    });
    const user = userEvent.setup({ delay: null });
    await user.click(screen.getByRole('button', { name: 'More for Salt' }));
    await user.click(screen.getByRole('button', { name: 'Remove Salt' }));
    expect(screen.getByRole('button', { name: 'Undo' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Save Recipe' }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull(),
    );
    expect(screen.queryByLabelText('Quantity of Salt')).toBeNull();
  });
});

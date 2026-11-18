import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminCatalog } from '@/lib/admin';
import type { AdminRecipe } from '@/lib/adminRecipes';
import { stubRowLayout } from '@/test/layout';
import { renderWithProviders, stubApi } from '@/test/render';
import { RecipeEditor } from './RecipeEditor';

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

const base: AdminRecipe = {
  id: 'r1',
  parentId: null,
  title: 'Soup',
  servings: 4,
  prepMinutes: null,
  cookMinutes: null,
  difficulty: null,
  tagIds: [],
  archived: false,
  lines: [
    {
      id: 'l1',
      ingredientId: 'i-milk',
      quantity: 500,
      unit: 'ml',
      optional: false,
      note: 'warm',
    },
  ],
  steps: [
    { id: 's1', text: 'Chop', timerSeconds: null },
    { id: 's2', text: 'Simmer', timerSeconds: null },
  ],
  tips: [
    { id: 't1', stepId: null, text: 'Serve hot' },
    { id: 't2', stepId: 's1', text: 'Sharp knife' },
    { id: 't3', stepId: null, text: 'Freezes well' },
  ],
  parentTips: null,
  nutritionNote: null,
  pairings: [],
  eatingMoments: [],
  translations: {
    da: {
      title: 'Suppe',
      steps: { s1: 'Hak' },
      lines: {},
      tips: {},
      nutritionNote: null,
      pairings: {},
      eatingMoments: {},
    },
  },
};

const variant: AdminRecipe = {
  ...base,
  id: 'r2',
  parentId: 'r1',
  title: 'Spicy soup',
  tips: [],
  parentTips: [
    { id: 't1', stepId: null, text: 'Serve hot', hidden: false },
    { id: 't3', stepId: null, text: 'Freezes well', hidden: true },
  ],
};

function open(
  recipe: AdminRecipe,
  extra: Record<string, () => Response> = {},
  onOpen = vi.fn(),
) {
  const stub = stubApi({
    [`GET /api/admin/recipes/${recipe.id}`]: () => Response.json(recipe),
    [`GET /api/admin/recipes/${recipe.id}/allergens`]: () =>
      Response.json({ items: [], uncheckedCount: 0 }),
    ...extra,
  });
  vi.stubGlobal('fetch', stub.fetchMock);
  renderWithProviders(
    <RecipeEditor
      recipeId={recipe.id}
      catalog={catalog}
      onOpen={onOpen}
      onClose={vi.fn()}
    />,
  );
  return { ...stub, onOpen };
}

describe('RecipeEditor', () => {
  it('shows the Allergens derived from the Ingredient Lines, read-only', async () => {
    open(base, {
      'GET /api/admin/recipes/r1/allergens': () =>
        Response.json({
          items: [
            {
              allergen: { id: 'al-milk', name: 'Milk' },
              lines: [{ id: 'l1', ingredientName: 'Milk', optional: false }],
              optionalOnly: false,
            },
            {
              allergen: { id: 'al-soy', name: 'Soy' },
              lines: [{ id: 'l2', ingredientName: 'Tofu', optional: true }],
              optionalOnly: true,
            },
          ],
          uncheckedCount: 2,
        }),
    });
    const section = (
      await screen.findByRole('heading', { name: 'Allergens' })
    ).closest('section') as HTMLElement;
    expect(
      await within(section).findByText('Milk', { selector: 'strong' }),
    ).toBeVisible();
    expect(within(section).getAllByRole('listitem')[1]).toHaveTextContent(
      'Soy (optional): Tofu',
    );
    expect(
      within(section).getByText("2 ingredients couldn't be checked"),
    ).toBeVisible();
    expect(within(section).queryByRole('button')).toBeNull();
  });

  it('says so when no common allergens are found, never that the Recipe is free of them', async () => {
    open(base);
    const section = (
      await screen.findByRole('heading', { name: 'Allergens' })
    ).closest('section') as HTMLElement;
    expect(
      await within(section).findByText('No common allergens found'),
    ).toBeVisible();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('makes a variant from a Base Recipe and opens it', async () => {
    const { calls, onOpen } = open(base, {
      'POST /api/admin/recipes/r1/variants': () =>
        Response.json(variant, { status: 201 }),
    });
    const user = userEvent.setup();

    await user.type(
      await screen.findByLabelText('Variant title'),
      'Spicy soup',
    );
    await user.click(screen.getByRole('button', { name: 'Make a Variant' }));

    await vi.waitFor(() => expect(onOpen).toHaveBeenCalledWith('r2'));
    expect(
      calls.find((c) => c.key === 'POST /api/admin/recipes/r1/variants')?.body,
    ).toEqual({ title: 'Spicy soup' });
  });

  it('does not offer a variant of a Variant or of an archived base', async () => {
    open(variant);
    await screen.findByRole('heading', { name: /Spicy soup/ });
    expect(screen.queryByRole('button', { name: 'Make a Variant' })).toBeNull();
  });

  it('archives a Recipe after confirmation, then drops the archive and variant actions', async () => {
    let archived = false;
    const { calls } = open(base, {
      'GET /api/admin/recipes/r1': () => Response.json({ ...base, archived }),
      'POST /api/admin/recipes/r1/archive': () => {
        archived = true;
        return Response.json({ ...base, archived });
      },
    });
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('button', { name: 'Archive Recipe' }),
    );
    expect(calls.some((c) => c.key.endsWith('/archive'))).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(await screen.findByText('This Recipe is archived.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Archive Recipe' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Make a Variant' })).toBeNull();
  });

  it('adds Tips to the Recipe and to a Step, and deletes one', async () => {
    const { calls } = open(base, {
      'POST /api/admin/recipes/r1/tips': () =>
        Response.json({ id: 't9' }, { status: 201 }),
      'DELETE /api/admin/recipes/r1/tips/t1': () =>
        new Response(null, { status: 204 }),
    });
    const user = userEvent.setup();

    const recipeTips = within(
      await screen.findByRole('group', { name: 'Recipe Tips' }),
    );
    await user.type(recipeTips.getByLabelText('New Tip'), 'Use stock');
    await user.click(recipeTips.getByRole('button', { name: 'Add Tip' }));
    await vi.waitFor(() =>
      expect(calls.some((c) => c.key === 'POST /api/admin/recipes/r1/tips')),
    );

    const stepTips = within(
      screen.getByRole('group', { name: 'Tips for Step 2' }),
    );
    await user.type(stepTips.getByLabelText('New Tip for Step 2'), 'Low heat');
    await user.click(stepTips.getByRole('button', { name: 'Add Tip' }));
    await vi.waitFor(() =>
      expect(
        calls.filter((c) => c.key === 'POST /api/admin/recipes/r1/tips'),
      ).toHaveLength(2),
    );
    const posts = calls.filter(
      (c) => c.key === 'POST /api/admin/recipes/r1/tips',
    );
    expect(posts[0].body).toEqual({ text: 'Use stock', stepId: null });
    expect(posts[1].body).toEqual({ text: 'Low heat', stepId: 's2' });

    await user.click(
      recipeTips.getByRole('button', { name: 'Delete Tip 1 (Recipe)' }),
    );
    await vi.waitFor(() =>
      expect(
        calls.some((c) => c.key === 'DELETE /api/admin/recipes/r1/tips/t1'),
      ).toBe(true),
    );
  });

  it('reorders Recipe Tips by sending every Tip id, step Tips in place', async () => {
    const { calls } = open(base, {
      'PUT /api/admin/recipes/r1/tips/order': () => Response.json({}),
    });
    const user = userEvent.setup();
    const recipeTips = within(
      await screen.findByRole('group', { name: 'Recipe Tips' }),
    );

    await user.click(
      recipeTips.getByRole('button', { name: 'Move Tip 2 up (Recipe)' }),
    );

    await vi.waitFor(() =>
      expect(
        calls.find((c) => c.key === 'PUT /api/admin/recipes/r1/tips/order')
          ?.body,
      ).toEqual({ ids: ['t3', 't2', 't1'] }),
    );
  });

  it('lets a Variant hide inherited Base Recipe Tips', async () => {
    const { calls } = open(variant, {
      'PUT /api/admin/recipes/r2/hidden-tips': () => Response.json({}),
    });
    const user = userEvent.setup();

    const shown = await screen.findByLabelText('Show: Serve hot');
    expect(shown).toBeChecked();
    expect(screen.getByLabelText('Show: Freezes well')).not.toBeChecked();
    await user.click(shown);

    await vi.waitFor(() =>
      expect(
        calls.find((c) => c.key === 'PUT /api/admin/recipes/r2/hidden-tips')
          ?.body,
      ).toEqual({ tipIds: ['t3', 't1'] }),
    );
  });

  it('saves one locale of translations, clearing what was blanked', async () => {
    const { calls } = open(base, {
      'PUT /api/admin/recipes/r1/translations/da': () => Response.json({}),
    });
    const user = userEvent.setup();

    const danish = within(await screen.findByRole('group', { name: 'Danish' }));
    expect(danish.getByLabelText('Title (Danish)')).toHaveValue('Suppe');
    expect(danish.getByText('English: warm')).toBeInTheDocument();
    expect(danish.getByLabelText('Tip 1 (Recipe, Danish)')).toBeInTheDocument();
    expect(danish.getByLabelText('Tip 1 (Step 1, Danish)')).toBeInTheDocument();
    await user.clear(danish.getByLabelText('Step 1 (Danish)'));
    await user.type(danish.getByLabelText('Step 2 (Danish)'), 'Simre');
    await user.type(danish.getByLabelText('Note for Milk (Danish)'), 'varm');
    await user.click(
      danish.getByRole('button', { name: 'Save Danish translations' }),
    );

    await vi.waitFor(() =>
      expect(
        calls.find((c) => c.key === 'PUT /api/admin/recipes/r1/translations/da')
          ?.body,
      ).toEqual({
        steps: { s1: null, s2: 'Simre' },
        lines: { l1: 'varm' },
        tips: {},
      }),
    );
  });
});

describe('RecipeEditor Suggest Guidance', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const NOTE = 'Warming and filling. Light on greens.';
  const suggestRoute = 'POST /api/admin/recipes/suggest-guidance';
  const answer = () =>
    Response.json({
      guidance: { nutritionNote: NOTE },
      noSuggestions: ['pairings', 'eatingMoments'],
    });

  it('fills an empty Nutrition Note from the editor as it is now, marked Suggested, and stores nothing until Save', async () => {
    const { calls } = open(base, {
      [suggestRoute]: answer,
      'PUT /api/admin/recipes/r1/guidance': () => Response.json(base),
    });
    const user = userEvent.setup();

    const [title] = await screen.findAllByLabelText(/^Title/);
    await user.clear(title);
    await user.type(title, 'Winter soup');
    await user.click(screen.getByRole('button', { name: 'Suggest Guidance' }));

    const note = await screen.findByLabelText('Nutrition Note');
    await vi.waitFor(() => expect(note).toHaveValue(NOTE));
    expect(
      within(screen.getByRole('group', { name: /Nutrition Note/ })).getByText(
        'Suggested',
      ),
    ).toBeVisible();
    // The unsaved edit reaches the API, with the recipe id and the Guidance on the form.
    expect(calls.find((c) => c.key === suggestRoute)?.body).toMatchObject({
      recipe: { title: 'Winter soup', servings: 4 },
      guidance: { nutritionNote: null, pairings: [], eatingMoments: [] },
      recipeId: 'r1',
    });
    // Nothing is stored by suggesting.
    expect(calls.some((c) => c.key.startsWith('PUT'))).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Save guidance' }));
    await vi.waitFor(() =>
      expect(
        calls.some((c) => c.key === 'PUT /api/admin/recipes/r1/guidance'),
      ).toBe(true),
    );
    const saved = calls.find(
      (c) => c.key === 'PUT /api/admin/recipes/r1/guidance',
    )?.body;
    expect(saved).toMatchObject({ nutritionNote: NOTE });
    expect(JSON.stringify(saved)).not.toMatch(/suggested/i);
  });

  it('does not fill a field that already has content', async () => {
    const { calls } = open(
      { ...base, nutritionNote: 'Mine' },
      {
        [suggestRoute]: () =>
          Response.json({
            guidance: {
              pairings: [
                {
                  kind: 'food',
                  label: 'Crusty bread',
                  reason: 'Soaks it up',
                  principle: null,
                  linkedIngredientId: null,
                  linkedRecipeId: null,
                  linkedIngredientName: null,
                  linkedRecipeTitle: null,
                },
              ],
            },
            noSuggestions: [],
          }),
      },
    );
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('button', { name: 'Suggest Guidance' }),
    );

    expect(await screen.findByDisplayValue('Crusty bread')).toBeVisible();
    expect(calls.find((c) => c.key === suggestRoute)?.body).toMatchObject({
      guidance: { nutritionNote: 'Mine' },
    });
    expect(screen.getByLabelText('Nutrition Note')).toHaveValue('Mine');
    // Only the Pairings got a mark; the Nutrition Note was left alone.
    expect(screen.getAllByText('Suggested')).toHaveLength(1);
    expect(
      within(screen.getByRole('group', { name: /Nutrition Note/ })).queryByText(
        'Suggested',
      ),
    ).toBeNull();
  });

  it('is not offered on the translations screen', async () => {
    open(base);
    const translations = await screen.findByRole('region', {
      name: 'Recipe translations',
    });
    expect(
      within(translations).queryByRole('button', { name: 'Suggest Guidance' }),
    ).toBeNull();
    expect(
      screen.getAllByRole('button', { name: 'Suggest Guidance' }),
    ).toHaveLength(1);
  });
});

describe('RecipeEditor reorder (#592)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('reorders a Step with the keyboard and saves the new order with ids kept', async () => {
    stubRowLayout();
    const { calls } = open(base, {
      'PUT /api/admin/recipes/r1': () => Response.json(base),
    });
    const user = userEvent.setup({ delay: null });
    const grip = await screen.findByRole('button', { name: 'Move Step 1' });
    grip.focus();
    await user.keyboard(' ');
    await user.keyboard('{ArrowDown}');
    await user.keyboard(' ');
    expect(screen.getByLabelText('Step 1')).toHaveValue('Simmer');
    expect(screen.getByLabelText('Step 2')).toHaveValue('Chop');
    await user.click(screen.getByRole('button', { name: 'Save Recipe' }));
    await vi.waitFor(() =>
      expect(calls.some((c) => c.key === 'PUT /api/admin/recipes/r1')).toBe(
        true,
      ),
    );
    const put = calls.find((c) => c.key === 'PUT /api/admin/recipes/r1')!;
    expect(
      (put.body as { steps: { id: string }[] }).steps.map((s) => s.id),
    ).toEqual(['s2', 's1']);
  });
});

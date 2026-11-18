import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminCatalog } from '@/lib/admin';
import type { AdminRecipe } from '@/lib/adminRecipes';
import { renderWithProviders, stubApi } from '@/test/render';
import { RecipeTranslations } from './RecipeTranslations';

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
      name: 'Lunch',
      sortOrder: 2,
      archived: false,
      translations: [],
    },
  ],
  parentCategories: [],
  leafCategories: [],
  ingredients: [],
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
  nutritionNote: 'Rich in fat; keep portions modest.',
  pairings: [
    {
      id: 'p1',
      kind: 'drink',
      label: 'Dry white wine',
      reason: 'Its acidity cuts the butter',
      principle: 'acid_cuts_fat',
      linkedIngredientId: null,
      linkedRecipeId: null,
    },
    {
      id: 'p2',
      kind: 'food',
      label: 'Bread',
      reason: 'Soaks up the broth',
      principle: null,
      linkedIngredientId: null,
      linkedRecipeId: null,
    },
  ],
  eatingMoments: [
    { eatingMomentId: 'em1', polarity: 'good_for', reason: 'Warming' },
    { eatingMomentId: 'em2', polarity: 'avoid', reason: null },
  ],
  translations: {
    ro: {
      title: null,
      steps: {},
      lines: {},
      tips: {},
      nutritionNote: 'Bogat în grăsimi.',
      pairings: {
        p1: { label: 'Vin alb sec', reason: 'Aciditatea taie untul' },
      },
      eatingMoments: { em1: 'Încălzește' },
    },
  },
};

function open() {
  const api = stubApi({
    'PUT /api/admin/recipes/r1/translations/ro': () => Response.json({}),
  });
  vi.stubGlobal('fetch', api.fetchMock);
  renderWithProviders(<RecipeTranslations recipe={recipe} catalog={catalog} />);
  return api.calls;
}

describe('RecipeTranslations guidance fields', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows saved Pairing, Eating Moment and Nutrition Note translations with their English source', () => {
    open();
    const romanian = within(screen.getByRole('group', { name: 'Romanian' }));
    expect(romanian.getByLabelText('Pairing 1 label (Romanian)')).toHaveValue(
      'Vin alb sec',
    );
    expect(romanian.getByLabelText('Pairing 1 reason (Romanian)')).toHaveValue(
      'Aciditatea taie untul',
    );
    expect(romanian.getByLabelText('Pairing 2 label (Romanian)')).toHaveValue(
      '',
    );
    expect(
      romanian.getByText('English: Soaks up the broth'),
    ).toBeInTheDocument();
    expect(
      romanian.getByLabelText('Reason for Breakfast (Romanian)'),
    ).toHaveValue('Încălzește');
    // A use without a source reason has nothing to translate.
    expect(romanian.queryByLabelText('Reason for Lunch (Romanian)')).toBeNull();
    expect(romanian.getByLabelText('Nutrition Note (Romanian)')).toHaveValue(
      'Bogat în grăsimi.',
    );
  });

  it('sends only what changed, a Pairing as label and reason together, blanks as null', async () => {
    const calls = open();
    const user = userEvent.setup();
    const romanian = within(screen.getByRole('group', { name: 'Romanian' }));

    await user.type(
      romanian.getByLabelText('Pairing 2 label (Romanian)'),
      'Pâine',
    );
    await user.type(
      romanian.getByLabelText('Pairing 2 reason (Romanian)'),
      'Absoarbe supa',
    );
    await user.clear(
      romanian.getByLabelText('Reason for Breakfast (Romanian)'),
    );
    await user.clear(romanian.getByLabelText('Nutrition Note (Romanian)'));
    await user.click(
      romanian.getByRole('button', { name: 'Save Romanian translations' }),
    );

    await vi.waitFor(() =>
      expect(
        calls.find((c) => c.key === 'PUT /api/admin/recipes/r1/translations/ro')
          ?.body,
      ).toEqual({
        steps: {},
        lines: {},
        tips: {},
        nutritionNote: null,
        pairings: { p2: { label: 'Pâine', reason: 'Absoarbe supa' } },
        eatingMoments: { em1: null },
      }),
    );
  });

  it('does not send a Pairing translation with only one of label and reason', async () => {
    open();
    const user = userEvent.setup();
    const romanian = within(screen.getByRole('group', { name: 'Romanian' }));
    await user.type(
      romanian.getByLabelText('Pairing 2 label (Romanian)'),
      'Pâine',
    );
    expect(
      romanian.getByText(
        'Pairing 2 needs both a label and a reason (Romanian).',
      ),
    ).toBeInTheDocument();
    expect(
      romanian.getByRole('button', { name: 'Save Romanian translations' }),
    ).toBeDisabled();
  });
});

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, Route, Routes } from 'react-router-dom';
import { EditFamilyRecipePage } from './EditFamilyRecipePage';
import { NewRecipePage } from './NewRecipePage';
import { NewVariantPage } from './NewVariantPage';
import type { InitialEntry } from 'react-router-dom';
import type { NewRecipeState } from './NewRecipePage';
import { vi } from 'vitest';
import type { FamilyRecipeDraft, FamilyRecipeEdit } from '@/lib/familyRecipes';
import { renderWithProviders, stubApi } from '@/test/render';
import { useRecipe } from '@/lib/recipes';
import type { RecipeTag } from '@/lib/tags';

export const filters = {
  eatingMoments: [
    { id: 'em1', name: 'Breakfast' },
    { id: 'em2', name: 'Lunch' },
  ],
};

export const tag = (
  id: string,
  name: string,
  group: [string, number] | null,
): RecipeTag => ({
  id,
  name,
  kind: group ? 'catalog' : 'family',
  groupId: group ? `g-${group[1]}` : null,
  groupName: group ? group[0] : null,
  groupOrder: group ? group[1] : null,
});
/** What `GET /api/recipes/tags` returns: the Family's Tag first, then the Catalog Tags by group. */
export const pickable: RecipeTag[] = [
  tag('t-mine', 'Meal prep', null),
  tag('t-dinner', 'Dinner', ['Meal', 1]),
  tag('c-fr', 'French', ['Cuisine', 3]),
  tag('m-pan', 'Pan frying', ['Method', 4]),
];

export const draft: FamilyRecipeDraft = {
  parentId: 'base',
  title: 'Omelette',
  servings: 2,
  prepMinutes: 5,
  cookMinutes: null,
  difficulty: 'easy',
  // The Base Recipe's Tags: a new Variant starts with them.
  tagIds: ['t-dinner'],
  lines: [
    {
      ingredientId: 'egg',
      rawName: null,
      ingredientName: 'Egg',
      quantity: 3,
      unit: 'pcs',
      optional: false,
      note: null,
    },
  ],
  steps: [{ text: 'Whisk the eggs', timerSeconds: 90 }],
  tips: [],
  guidance: {
    nutritionNote: 'Rich in protein',
    pairings: [
      {
        kind: 'drink',
        label: 'Orange juice',
        reason: 'Fresh against the butter',
        principle: null,
        linkedIngredientId: null,
        linkedRecipeId: null,
      },
    ],
    eatingMoments: [
      { eatingMomentId: 'em1', polarity: 'good_for', reason: 'Quick start' },
    ],
  },
};

export const saved: FamilyRecipeEdit = {
  id: 'g',
  parentId: 'base',
  title: "Grandma's omelette",
  servings: 2,
  prepMinutes: 5,
  cookMinutes: null,
  difficulty: 'easy',
  tagIds: [],
  archived: false,
  sourceLink: null,
  sourceLanguage: null,
  lines: [
    {
      id: 'l1',
      ingredientId: 'egg',
      rawName: null,
      ingredientName: 'Egg',
      quantity: 3,
      unit: 'pcs',
      optional: false,
      note: null,
    },
    {
      id: 'l2',
      ingredientId: null,
      rawName: 'Gran’s herbs',
      ingredientName: 'Gran’s herbs',
      quantity: null,
      unit: null,
      optional: false,
      note: null,
    },
  ],
  steps: [{ id: 's1', text: 'Whisk the eggs', timerSeconds: 90 }],
  tips: [{ id: 't1', stepId: null, text: 'Use butter' }],
  parentTips: [
    { id: 'bt1', stepId: null, text: 'Nonstick pan', hidden: false },
  ],
  nutritionNote: 'Rich in protein',
  pairings: [
    {
      id: 'p1',
      kind: 'drink',
      label: 'Orange juice',
      reason: 'Fresh against the butter',
      principle: null,
      linkedIngredientId: 'i-oj',
      linkedRecipeId: null,
      linkedIngredientName: 'Orange',
      linkedRecipeTitle: null,
    },
    {
      id: 'p2',
      kind: 'food',
      label: 'Toast',
      reason: 'Soaks it up',
      principle: null,
      linkedIngredientId: null,
      linkedRecipeId: 'r-toast',
      linkedIngredientName: null,
      linkedRecipeTitle: 'Buttered toast',
    },
  ],
  eatingMoments: [
    { eatingMomentId: 'em1', polarity: 'good_for', reason: 'Quick start' },
  ],
};

/** The source Recipe's own view, which names the links of a Variant draft. */
export const sourceDetail = {
  id: 'x',
  guidance: { nutritionNote: null, pairings: [], eatingMoments: [] },
};

/** Reads the Recipe's detail query, as the detail page does, so a save's refresh can be seen. */
export function DetailProbe() {
  const { data } = useRecipe('g');
  return (
    <p>{data ? `detail link: ${data.sourceLink ?? 'none'}` : 'loading'}</p>
  );
}

export function setup(
  route: InitialEntry,
  routes: Parameters<typeof stubApi>[0],
) {
  const { fetchMock, calls } = stubApi({
    'GET /api/recipes/filters': () => Response.json(filters),
    'GET /api/recipes/tags': () => Response.json(pickable),
    // Edit's Save also stores the Guidance (#595).
    'PUT /api/recipes/g/guidance': () => Response.json(saved),
    ...routes,
  });
  vi.stubGlobal('fetch', fetchMock);
  renderWithProviders(
    <Routes>
      <Route
        path="/recipes/new"
        element={
          <>
            <Link to="/recipes/new">go blank</Link>
            <NewRecipePage />
          </>
        }
      />
      <Route path="/recipes/:id/variant/new" element={<NewVariantPage />} />
      <Route path="/recipes/:id/edit" element={<EditFamilyRecipePage />} />
      <Route
        path="/recipes/:id/edit-and-detail"
        element={
          <>
            <EditFamilyRecipePage />
            <DetailProbe />
          </>
        }
      />
      <Route path="/recipes/:id" element={<p>Detail of the recipe</p>} />
    </Routes>,
    { route },
  );
  return calls;
}

/** Opens one of the editor's tabs by its name ("Details", "Ingredients" or "Steps"). */
export async function openTab(
  user: ReturnType<typeof userEvent.setup>,
  name: 'Details' | 'Ingredients' | 'Steps',
) {
  await user.click(
    await screen.findByRole('tab', { name: new RegExp(`^${name}`) }),
  );
}

/** What a read-from-source flow hands the New Recipe page: a draft without a Servings count, and the closest Base Recipes. */
export const sourced: NewRecipeState = {
  draft: {
    title: 'Pancakes from a blog',
    servings: null,
    prepMinutes: 10,
    cookMinutes: 15,
    difficulty: null,
    tagIds: ['c-fr', 'm-pan'],
    lines: [
      {
        ingredientId: 'egg',
        rawName: null,
        ingredientName: 'Egg',
        quantity: 2,
        unit: 'pcs',
        optional: false,
        note: null,
      },
      {
        ingredientId: null,
        rawName: 'Maple syrup',
        ingredientName: 'Maple syrup',
        quantity: null,
        unit: null,
        optional: false,
        note: 'to serve',
      },
    ],
    steps: [{ text: 'Whisk and fry', timerSeconds: 120 }],
    tips: [],
    guidance: { nutritionNote: null, pairings: [], eatingMoments: [] },
  },
  closestBases: [
    { id: 'base-crepes', title: 'Crepes', allergyWarning: null },
    { id: 'base-waffles', title: 'Waffles', allergyWarning: null },
  ],
};

export const newRecipeWith = (state: NewRecipeState) => ({
  pathname: '/recipes/new',
  state,
});

export const guidanceToggle = () =>
  screen.getByRole('button', { name: /^Pairings, nutrition & moments/ });
export const openGuidance = async (
  user: ReturnType<typeof userEvent.setup>,
) => {
  const toggle = await screen.findByRole('button', {
    name: /^Pairings, nutrition & moments/,
  });
  if (toggle.getAttribute('aria-expanded') !== 'true') await user.click(toggle);
};

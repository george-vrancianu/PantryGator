import {
  act,
  waitFor,
  fireEvent,
  screen,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AUTOSAVE_DELAY_MS } from '../../lib/recipeDraftAutosave';
import { Link, Route, Routes } from 'react-router-dom';
import type { InitialEntry } from 'react-router-dom';
import type { NewRecipeState } from './FamilyRecipePages';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  FamilyRecipeDraft,
  FamilyRecipeEdit,
} from '../../lib/familyRecipes';
import { UNDO_WINDOW_MS } from '../../lib/useDeferredRemoval';
import { stubRowLayout } from '../../test/layout';
import { stubMatchMedia, stubViewport } from '../../test/viewport';
import { renderWithProviders, stubApi } from '../../test/render';
import { expectSticksBelowTopInset } from '../../test/stickyHeader';
import { useRecipe } from '../../lib/recipes';
import type { RecipeTag } from '../../lib/tags';
import {
  EditFamilyRecipePage,
  NewRecipePage,
  NewVariantPage,
} from './FamilyRecipePages';

const filters = {
  eatingMoments: [
    { id: 'em1', name: 'Breakfast' },
    { id: 'em2', name: 'Lunch' },
  ],
};

const tag = (
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
const pickable: RecipeTag[] = [
  tag('t-mine', 'Meal prep', null),
  tag('t-dinner', 'Dinner', ['Meal', 1]),
  tag('c-fr', 'French', ['Cuisine', 3]),
  tag('m-pan', 'Pan frying', ['Method', 4]),
];

const draft: FamilyRecipeDraft = {
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

const saved: FamilyRecipeEdit = {
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
const sourceDetail = {
  id: 'x',
  guidance: { nutritionNote: null, pairings: [], eatingMoments: [] },
};

/** Reads the Recipe's detail query, as the detail page does, so a save's refresh can be seen. */
function DetailProbe() {
  const { data } = useRecipe('g');
  return (
    <p>{data ? `detail link: ${data.sourceLink ?? 'none'}` : 'loading'}</p>
  );
}

function setup(route: InitialEntry, routes: Parameters<typeof stubApi>[0]) {
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
async function openTab(
  user: ReturnType<typeof userEvent.setup>,
  name: 'Details' | 'Ingredients' | 'Steps',
) {
  await user.click(
    await screen.findByRole('tab', { name: new RegExp(`^${name}`) }),
  );
}

/** What a read-from-source flow hands the New Recipe page: a draft without a Servings count, and the closest Base Recipes. */
const sourced: NewRecipeState = {
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

const newRecipeWith = (state: NewRecipeState) => ({
  pathname: '/recipes/new',
  state,
});

const guidanceToggle = () =>
  screen.getByRole('button', { name: /^Pairings, nutrition & moments/ });
const openGuidance = async (user: ReturnType<typeof userEvent.setup>) => {
  const toggle = await screen.findByRole('button', {
    name: /^Pairings, nutrition & moments/,
  });
  if (toggle.getAttribute('aria-expanded') !== 'true') await user.click(toggle);
};

describe('NewRecipePage with a supplied draft', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sticks the editor tabs below the top inset', async () => {
    setup(newRecipeWith(sourced), {});
    await screen.findByLabelText(/^Title/);
    expectSticksBelowTopInset(screen.getByRole('tablist'));
  });

  it('opens filled from the draft and requires Servings before saving', async () => {
    const user = userEvent.setup({ delay: null });
    const calls = setup(newRecipeWith(sourced), {
      'POST /api/recipes': () => Response.json(saved, { status: 201 }),
    });
    expect(await screen.findByLabelText(/^Title/)).toHaveValue(
      'Pancakes from a blog',
    );
    expect(screen.getByRole('tab', { name: 'Ingredients, 2' })).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Steps, 1' })).toBeVisible();
    await openTab(user, 'Ingredients');
    expect(screen.getByLabelText('Quantity of Egg')).toHaveValue('2');
    expect(screen.getByText('Maple syrup')).toBeVisible();
    await openTab(user, 'Steps');
    expect(screen.getByDisplayValue('Whisk and fry')).toBeVisible();
    await openTab(user, 'Details');
    const servings = screen.getByLabelText(/^Serves/);
    expect(servings).toHaveValue('');
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();

    await user.type(servings, '4');
    expect(save).toBeEnabled();
    await user.click(save);
    await vi.waitFor(() =>
      expect(
        calls.find((c) => c.key === 'POST /api/recipes')?.body,
      ).toMatchObject({
        title: 'Pancakes from a blog',
        servings: 4,
        prepMinutes: 10,
        cookMinutes: 15,
        tagIds: ['c-fr', 'm-pan'],
      }),
    );
  });

  it('saves a Variant of the closest Base Recipe by default', async () => {
    const user = userEvent.setup({ delay: null });
    const calls = setup(newRecipeWith(sourced), {
      'POST /api/recipes': () => Response.json(saved, { status: 201 }),
    });
    await user.type(await screen.findByLabelText(/^Serves/), '4');
    expect(screen.getByRole('radio', { name: /Crepes/ })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Detail of the recipe')).toBeVisible();
    expect(
      calls.find((c) => c.key === 'POST /api/recipes')?.body,
    ).toMatchObject({ parentId: 'base-crepes' });
  });

  it('saves a Variant of another picked Base Recipe', async () => {
    const user = userEvent.setup({ delay: null });
    const calls = setup(newRecipeWith(sourced), {
      'POST /api/recipes': () => Response.json(saved, { status: 201 }),
    });
    await user.type(await screen.findByLabelText(/^Serves/), '4');
    await user.click(screen.getByRole('radio', { name: 'Waffles' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() =>
      expect(
        calls.find((c) => c.key === 'POST /api/recipes')?.body,
      ).toMatchObject({ parentId: 'base-waffles' }),
    );
  });

  it('saves a standalone Base Recipe when standalone is picked', async () => {
    const user = userEvent.setup({ delay: null });
    const calls = setup(newRecipeWith(sourced), {
      'POST /api/recipes': () => Response.json(saved, { status: 201 }),
    });
    await user.type(await screen.findByLabelText(/^Serves/), '4');
    await user.click(screen.getByRole('radio', { name: /standalone/i }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() =>
      expect(
        calls.find((c) => c.key === 'POST /api/recipes')?.body,
      ).toMatchObject({ parentId: null }),
    );
  });

  const fromLink: NewRecipeState = {
    ...sourced,
    sourceLink: 'https://www.example.com/tortilla',
    sourceLanguage: 'es',
  };

  it('saves a Variant of the picked base with the Source Link and language', async () => {
    const user = userEvent.setup({ delay: null });
    const calls = setup(newRecipeWith(fromLink), {
      'POST /api/recipes': () => Response.json(saved, { status: 201 }),
    });
    await user.type(await screen.findByLabelText(/^Serves/), '4');
    await user.click(screen.getByRole('radio', { name: 'Waffles' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() =>
      expect(
        calls.find((c) => c.key === 'POST /api/recipes')?.body,
      ).toMatchObject({
        parentId: 'base-waffles',
        sourceLink: 'https://www.example.com/tortilla',
        sourceLanguage: 'es',
      }),
    );
  });

  it('saves a standalone Base Recipe with the Source Link and no parent', async () => {
    const user = userEvent.setup({ delay: null });
    const calls = setup(newRecipeWith(fromLink), {
      'POST /api/recipes': () => Response.json(saved, { status: 201 }),
    });
    await user.type(await screen.findByLabelText(/^Serves/), '4');
    await user.click(screen.getByRole('radio', { name: /standalone/i }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() =>
      expect(
        calls.find((c) => c.key === 'POST /api/recipes')?.body,
      ).toMatchObject({
        parentId: null,
        sourceLink: 'https://www.example.com/tortilla',
      }),
    );
  });

  it('drops the Source Link and language, keeping the pick, when the link is removed', async () => {
    const user = userEvent.setup({ delay: null });
    const calls = setup(newRecipeWith(fromLink), {
      'POST /api/recipes': () => Response.json(saved, { status: 201 }),
    });
    await user.type(await screen.findByLabelText(/^Serves/), '4');
    await user.click(screen.getByRole('button', { name: 'Remove link' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() =>
      expect(calls.some((c) => c.key === 'POST /api/recipes')).toBe(true),
    );
    const body = calls.find((c) => c.key === 'POST /api/recipes')?.body as {
      parentId: string;
    };
    expect(body.parentId).toBe('base-crepes');
    expect(body).not.toHaveProperty('sourceLink');
    expect(body).not.toHaveProperty('sourceLanguage');
  });

  it('says how many matches Allergies hid, and Show offers them from the draft as it arrived', async () => {
    const user = userEvent.setup({ delay: null });
    const calls = setup(
      newRecipeWith({ ...fromLink, hiddenByAllergiesCount: 1 }),
      {
        'POST /api/recipes/plate-matches': () =>
          Response.json({
            matches: [
              {
                id: 'base-satay',
                title: 'Satay',
                score: 0.9,
                allergyWarning: null,
              },
              ...(sourced.closestBases ?? []).map((b) => ({
                ...b,
                score: 0.3,
              })),
            ],
            hiddenByAllergiesCount: 0,
          }),
        'POST /api/recipes': () => Response.json(saved, { status: 201 }),
      },
    );
    await user.type(await screen.findByLabelText(/^Serves/), '4');
    // Edits to the form do not change what is asked.
    await user.type(screen.getByLabelText(/^Title/), ' edited');
    expect(screen.getByText('1 Recipe hidden by your Allergies')).toBeVisible();
    expect(calls.some((c) => c.key === 'POST /api/recipes/plate-matches')).toBe(
      false,
    );
    expect(screen.getByRole('radio', { name: /Crepes/ })).toBeChecked();

    await user.click(screen.getByRole('button', { name: 'Show' }));
    expect(await screen.findByRole('radio', { name: /Satay/ })).toBeVisible();
    expect(screen.queryByText(/hidden by your Allergies/)).toBeNull();
    expect(
      calls.find((c) => c.key === 'POST /api/recipes/plate-matches')?.body,
    ).toEqual({
      dishTitle: 'Pancakes from a blog',
      ingredientIds: ['egg'],
      showHidden: true,
    });
    // The pick made before Show stays, though Satay now ranks first.
    expect(screen.getByRole('radio', { name: 'Crepes' })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() =>
      expect(
        calls.find((c) => c.key === 'POST /api/recipes')?.body,
      ).toMatchObject({ parentId: 'base-crepes' }),
    );
  });

  it('keeps a picked base the revealed list no longer holds', async () => {
    const user = userEvent.setup({ delay: null });
    const five = ['a', 'b', 'c', 'd', 'e'].map((k, i) => ({
      id: `base-${k}`,
      title: `Base ${k}`,
      allergyWarning: null,
      score: 1 - i / 10,
    }));
    const calls = setup(
      newRecipeWith({
        ...sourced,
        closestBases: five,
        hiddenByAllergiesCount: 1,
      }),
      {
        'POST /api/recipes/plate-matches': () =>
          Response.json({
            matches: [
              {
                id: 'base-hidden',
                title: 'Hidden one',
                score: 2,
                allergyWarning: null,
              },
              ...five.slice(0, 4),
            ],
            hiddenByAllergiesCount: 0,
          }),
        'POST /api/recipes': () => Response.json(saved, { status: 201 }),
      },
    );
    await user.type(await screen.findByLabelText(/^Serves/), '4');
    await user.click(screen.getByRole('radio', { name: 'Base e' }));
    await user.click(screen.getByRole('button', { name: 'Show' }));
    expect(
      await screen.findByRole('radio', { name: /Hidden one/ }),
    ).toBeVisible();
    expect(screen.getByRole('radio', { name: 'Base e' })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() =>
      expect(
        calls.find((c) => c.key === 'POST /api/recipes')?.body,
      ).toMatchObject({ parentId: 'base-e' }),
    );
  });

  it('says it is looking between Show and the answer', async () => {
    const user = userEvent.setup({ delay: null });
    setup(newRecipeWith({ ...fromLink, hiddenByAllergiesCount: 1 }), {
      'POST /api/recipes/plate-matches': () =>
        new Promise<Response>(() => {}) as never,
    });
    await user.click(await screen.findByRole('button', { name: 'Show' }));
    expect(await screen.findByText('Finding Base Recipes…')).toBeVisible();
  });

  it('asks again when Show failed and is pressed again', async () => {
    const user = userEvent.setup({ delay: null });
    let asked = 0;
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    setup(newRecipeWith({ ...fromLink, hiddenByAllergiesCount: 1 }), {
      'POST /api/recipes/plate-matches': () =>
        ++asked === 1
          ? Response.json({ code: 'boom' }, { status: 500 })
          : gate.then(() =>
              Response.json({
                matches: [
                  {
                    id: 'base-satay',
                    title: 'Satay',
                    score: 1,
                    allergyWarning: null,
                  },
                ],
                hiddenByAllergiesCount: 0,
              }),
            ),
    });
    await user.click(await screen.findByRole('button', { name: 'Show' }));
    await vi.waitFor(() => expect(asked).toBeGreaterThanOrEqual(1));
    // Settled in error: the loading text is gone before Show is pressed again.
    await vi.waitFor(() =>
      expect(screen.queryByText('Finding Base Recipes…')).toBeNull(),
    );
    await user.click(await screen.findByRole('button', { name: 'Show' }));
    expect(await screen.findByText('Finding Base Recipes…')).toBeVisible();
    release();
    expect(await screen.findByRole('radio', { name: /Satay/ })).toBeVisible();
  });

  it('shows the picker for the hidden note and Show even when no base is left', async () => {
    const user = userEvent.setup({ delay: null });
    const calls = setup(
      newRecipeWith({
        ...sourced,
        closestBases: [],
        hiddenByAllergiesCount: 2,
      }),
      {
        'POST /api/recipes/plate-matches': () =>
          Response.json({
            matches: [
              {
                id: 'base-satay',
                title: 'Satay',
                score: 0.9,
                allergyWarning: null,
              },
            ],
            hiddenByAllergiesCount: 0,
          }),
        'POST /api/recipes': () => Response.json(saved, { status: 201 }),
      },
    );
    await user.type(await screen.findByLabelText(/^Serves/), '4');
    expect(
      screen.getByText('2 Recipes hidden by your Allergies'),
    ).toBeVisible();
    expect(screen.getByRole('radio', { name: /standalone/i })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Show' }));
    expect(await screen.findByRole('radio', { name: /Satay/ })).toBeVisible();
    expect(screen.getByRole('radio', { name: /standalone/i })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() =>
      expect(
        calls.find((c) => c.key === 'POST /api/recipes')?.body,
      ).toMatchObject({ parentId: null }),
    );
  });

  it('ignores route state whose hidden count is not a number', async () => {
    setup(
      {
        pathname: '/recipes/new',
        state: { ...sourced, hiddenByAllergiesCount: 'many' },
      },
      {},
    );
    expect(await screen.findByLabelText(/^Title/)).toHaveValue('');
  });

  it('shows the Source Link on the filled form', async () => {
    setup(
      newRecipeWith({ ...sourced, sourceLink: 'https://www.example.com/p' }),
      {},
    );
    const link = await screen.findByRole('link', {
      name: 'From example.com ↗',
    });
    expect(link).toHaveAttribute('href', 'https://www.example.com/p');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('ignores route state whose Source Link is not text', async () => {
    setup(
      {
        pathname: '/recipes/new',
        state: { ...sourced, sourceLink: { href: 'x' } },
      },
      {},
    );
    expect(await screen.findByLabelText(/^Title/)).toHaveValue('');
  });

  it('ignores route state whose source language is not text', async () => {
    setup(
      {
        pathname: '/recipes/new',
        state: {
          ...sourced,
          sourceLink: 'https://www.example.com/p',
          sourceLanguage: 7,
        },
      },
      {},
    );
    expect(await screen.findByLabelText(/^Title/)).toHaveValue('');
  });

  it.each([
    ['tips', { tips: 'nope' }],
    ['guidance', { guidance: 'nope' }],
    ['guidance (null)', { guidance: null }],
  ])('ignores route state whose draft %s is malformed', async (_name, bad) => {
    setup(
      newRecipeWith({
        ...sourced,
        draft: { ...sourced.draft, ...bad },
      } as unknown as NewRecipeState),
      {},
    );
    expect(await screen.findByLabelText(/^Title/)).toHaveValue('');
  });

  it('ignores route state whose Source Link is not a web address', async () => {
    setup(newRecipeWith({ ...sourced, sourceLink: 'not a link' }), {});
    expect(await screen.findByLabelText(/^Title/)).toHaveValue('');
    expect(screen.queryByRole('button', { name: 'Remove link' })).toBeNull();
  });

  it('shows no Base Recipe picker when there are no closest Base Recipes', async () => {
    const user = userEvent.setup({ delay: null });
    const calls = setup(newRecipeWith({ ...sourced, closestBases: [] }), {
      'POST /api/recipes': () => Response.json(saved, { status: 201 }),
    });
    await user.type(await screen.findByLabelText(/^Serves/), '4');
    expect(screen.queryByRole('radio')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() =>
      expect(
        calls.find((c) => c.key === 'POST /api/recipes')?.body,
      ).toMatchObject({ parentId: null }),
    );
  });

  it('ignores route state that is not a supplied draft', async () => {
    setup({ pathname: '/recipes/new', state: { from: 'elsewhere' } }, {});
    expect(await screen.findByLabelText(/^Title/)).toHaveValue('');
    expect(screen.queryByRole('radio')).toBeNull();
  });

  it('starts afresh when navigated to again without a draft', async () => {
    const user = userEvent.setup({ delay: null });
    setup(newRecipeWith(sourced), {});
    expect(await screen.findByLabelText(/^Title/)).toHaveValue(
      'Pancakes from a blog',
    );
    await user.click(screen.getByRole('link', { name: 'go blank' }));
    expect(await screen.findByLabelText(/^Title/)).toHaveValue('');
    expect(screen.queryByRole('radio')).toBeNull();
  });

  it('shows no Base Recipe picker on the blank page', async () => {
    setup('/recipes/new', {});
    await screen.findByLabelText(/^Title/);
    expect(screen.queryByRole('radio')).toBeNull();
  });
});

describe('NewRecipePage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('starts blank and saves a Base Recipe with no parent', async () => {
    const user = userEvent.setup({ delay: null });
    const calls = setup('/recipes/new', {
      'POST /api/recipes': () => Response.json(saved, { status: 201 }),
    });
    const title = await screen.findByLabelText(/^Title/);
    expect(title).toHaveValue('');
    await user.type(title, 'Gran stew');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Detail of the recipe')).toBeVisible();
    const post = calls.find((c) => c.key === 'POST /api/recipes');
    expect(post?.body).toMatchObject({ parentId: null, title: 'Gran stew' });
  });

  it('adds an ingredient line by Use as typed, saved by its name with no Ingredient', async () => {
    const user = userEvent.setup({ delay: null });
    const calls = setup('/recipes/new', {
      'GET /api/catalog/search': () => Response.json({ results: [] }),
      'POST /api/recipes': () => Response.json(saved, { status: 201 }),
    });
    await user.type(await screen.findByLabelText(/^Title/), 'Gran stew');

    await openTab(user, 'Ingredients');
    await user.type(
      screen.getByRole('combobox', { name: 'Add an ingredient' }),
      'Dragon fruit',
    );
    const useTyped = await screen.findByRole('option', {
      name: /Use “Dragon fruit” as typed/,
    });
    expect(useTyped).toHaveTextContent(
      'Not in the catalog · saved as an unmatched item',
    );
    await user.click(useTyped);

    expect(
      await screen.findByLabelText('Quantity of Dragon fruit'),
    ).toBeVisible();
    expect(screen.getByText(/Not in the Catalog/)).toBeVisible();
    // The search is ready for the next ingredient.
    expect(
      screen.getByRole('combobox', { name: 'Add an ingredient' }),
    ).toHaveValue('');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() =>
      expect(
        calls.find((c) => c.key === 'POST /api/recipes')?.body,
      ).toMatchObject({
        lines: [{ ingredientId: null, rawName: 'Dragon fruit' }],
      }),
    );
  });

  it("offers Use as typed in a new Recipe's search, still on the Family scope", async () => {
    const user = userEvent.setup({ delay: null });
    const calls = setup('/recipes/new', {
      'GET /api/catalog/search': () => Response.json({ results: [] }),
    });
    await openTab(user, 'Ingredients');
    await user.type(
      await screen.findByRole('combobox', { name: 'Add an ingredient' }),
      'zzz',
    );
    await screen.findByRole('option', { name: /as typed/ });

    const searches = calls.filter((c) => c.key === 'GET /api/catalog/search');
    expect(searches.length).toBeGreaterThan(0);
    for (const call of searches) {
      expect(new URLSearchParams(call.search).get('scope')).not.toBe('shared');
    }
  });

  it('words the Guidance card and the editor hint for a Recipe, not a Variant', async () => {
    setup('/recipes/new', {});
    await screen.findByLabelText(/^Title/);
    expect(guidanceToggle()).toHaveTextContent('Optional');
    expect(guidanceToggle()).not.toHaveTextContent(/Variant/);
    expect(
      screen.getByText(
        "Kept as your draft until you save it as one of your family's Recipes.",
      ),
    ).toBeInTheDocument();
  });

  it('blocks saving without a title', async () => {
    setup('/recipes/new', {});
    expect(await screen.findByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('shows a coded error in the Member locale and stays on the form', async () => {
    const user = userEvent.setup({ delay: null });
    setup('/recipes/new', {
      // The Recipe Draft saves quietly; an unanswered one would show its own error.
      'POST /api/recipe-drafts': () =>
        Response.json({ id: 'draft-id', version: 1 }, { status: 201 }),
      'POST /api/recipes': () =>
        Response.json(
          { code: 'recipes.parent_archived', params: {} },
          { status: 409 },
        ),
    });
    await user.type(await screen.findByLabelText(/^Title/), 'Gran stew');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This Base Recipe is archived, so it cannot get new Variants.',
    );
    expect(screen.queryByText('Detail of the recipe')).not.toBeInTheDocument();
  });
});

describe('NewVariantPage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('does not move focus to the Guidance row when the draft arrives fully filled', async () => {
    setup('/recipes/x/variant/new', {
      'GET /api/recipes/x/variant-draft': () => Response.json(draft),
    });
    await screen.findByLabelText(/^Title/);
    expect(
      screen.queryByRole('button', { name: 'Suggest' }),
    ).not.toBeInTheDocument();
    expect(guidanceToggle()).not.toHaveFocus();
  });

  it('prefills from the draft', async () => {
    const user = userEvent.setup({ delay: null });
    setup('/recipes/x/variant/new', {
      'GET /api/recipes/x/variant-draft': () => Response.json(draft),
    });
    expect(await screen.findByLabelText(/^Title/)).toHaveValue('Omelette');
    expect(
      screen.getByText(
        /^Copied from .*\. It becomes a Recipe when you save it\.$/,
      ),
    ).toBeInTheDocument();
    // No owner, and nothing about the Variant not being saved yet.
    expect(screen.queryByText(/Catalog|Nothing is saved/)).toBeNull();
    await openTab(user, 'Ingredients');
    expect(screen.getByLabelText('Quantity of Egg')).toHaveValue('3');
    await openTab(user, 'Steps');
    expect(screen.getByLabelText('Step 1')).toHaveValue('Whisk the eggs');
    expect(screen.getByLabelText('Timer for Step 1 (minutes)')).toHaveValue(
      '1.5',
    );
  });

  it('shows the copied step Tips, keeps them with their step and sends them', async () => {
    const user = userEvent.setup({ delay: null });
    const twoSteps: FamilyRecipeDraft = {
      ...draft,
      steps: [
        { text: 'Whisk the eggs', timerSeconds: null },
        { text: 'Fry', timerSeconds: null },
        { text: 'Plate', timerSeconds: null },
      ],
      tips: [
        { stepIndex: 0, text: 'Room-temperature eggs' },
        { stepIndex: 1, text: 'Medium heat' },
        { stepIndex: 1, text: 'Do not stir' },
        { stepIndex: 2, text: 'Warm plate' },
      ],
    };
    const calls = setup('/recipes/x/variant/new', {
      'GET /api/recipes/x/variant-draft': () => Response.json(twoSteps),
      'POST /api/recipes': () => Response.json(saved, { status: 201 }),
    });
    await openTab(user, 'Steps');
    expect(await screen.findByText('2 tips')).toBeVisible();

    // Reordering moves the Tips with their step.
    await user.click(screen.getByRole('button', { name: 'Move Step 2 up' }));
    // The step "Plate" and its Tip are dropped together.
    await user.click(screen.getByRole('button', { name: 'Remove Step 3' }));
    // Its copied Tip is counted in the warning before anything is dropped.
    expect(
      screen.getByText('Removing Step 3 deletes its 1 Tip when you save.'),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: /^Remove Step and/ }));
    // Step 1 (Fry) keeps its two copied Tips, now ahead of the Step that moved down.
    expect(screen.getAllByText('2 tips')).toHaveLength(1);
    expect(screen.getAllByText('1 tip')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Detail of the recipe')).toBeInTheDocument();
    const post = calls.find((call) => call.key === 'POST /api/recipes')!;
    expect(post.body).toMatchObject({
      steps: [{ text: 'Fry' }, { text: 'Whisk the eggs' }],
      tips: [
        { stepIndex: 0, text: 'Medium heat' },
        { stepIndex: 0, text: 'Do not stir' },
        { stepIndex: 1, text: 'Room-temperature eggs' },
      ],
    });
  });

  it('saves a Variant under the draft parent and opens it', async () => {
    const user = userEvent.setup({ delay: null });
    const calls = setup('/recipes/x/variant/new', {
      'GET /api/recipes/x/variant-draft': () => Response.json(draft),
      'GET /api/catalog/search': () => Response.json({ results: [] }),
      'POST /api/recipes': () => Response.json(saved, { status: 201 }),
    });
    fireEvent.change(await screen.findByLabelText(/^Title/), {
      target: { value: "Grandma's omelette" },
    });
    // The Variant starts with its Base's Tags; one more is picked from the Tag field.
    const tags = await screen.findByRole('combobox', { name: 'Tags' });
    await user.click(tags);
    await user.click(await screen.findByRole('option', { name: 'French' }));
    await openTab(user, 'Ingredients');
    await user.type(
      screen.getByRole('combobox', { name: 'Add an ingredient' }),
      'Gran’s herbs',
    );
    await user.click(
      await screen.findByRole('option', {
        name: /Use “Gran’s herbs” as typed/,
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Detail of the recipe')).toBeInTheDocument();
    const post = calls.find((call) => call.key === 'POST /api/recipes')!;
    expect(post.body).toMatchObject({
      parentId: 'base',
      title: "Grandma's omelette",
      tagIds: ['t-dinner', 'c-fr'],
      lines: [
        { ingredientId: 'egg', rawName: null, quantity: 3, unit: 'pcs' },
        { ingredientId: null, rawName: 'Gran’s herbs', quantity: null },
      ],
      steps: [{ text: 'Whisk the eggs', timerSeconds: 90 }],
    });
  });

  it('neither shows nor sends the Source Link of a linked source Recipe', async () => {
    const user = userEvent.setup({ delay: null });
    const calls = setup('/recipes/x/variant/new', {
      'GET /api/recipes/x/variant-draft': () => Response.json(draft),
      'GET /api/recipes/x': () =>
        Response.json({
          ...sourceDetail,
          sourceLink: 'https://www.example.com/p',
          sourceLanguage: 'fr',
        }),
      'POST /api/recipes': () => Response.json(saved, { status: 201 }),
    });
    await screen.findByLabelText(/^Title/);
    expect(
      screen.queryByRole('link', { name: /From example\.com/ }),
    ).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove link' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Detail of the recipe')).toBeInTheDocument();
    const body = calls.find((c) => c.key === 'POST /api/recipes')?.body;
    expect(body).toMatchObject({ parentId: 'base' });
    expect(body).not.toHaveProperty('sourceLink');
    expect(body).not.toHaveProperty('sourceLanguage');
  });

  it('shows the draft guidance and posts it with the Variant', async () => {
    const user = userEvent.setup({ delay: null });
    const calls = setup('/recipes/x/variant/new', {
      'GET /api/recipes/x/variant-draft': () => Response.json(draft),
      'POST /api/recipes': () => Response.json(saved, { status: 201 }),
    });
    await openGuidance(user);
    const note = await screen.findByLabelText('Nutrition Note');
    expect(note).toHaveValue('Rich in protein');
    // The copied Pairing is a row: label, then "kind · reason".
    expect(screen.getByText('Orange juice')).toBeVisible();
    expect(await screen.findByLabelText('Reason for Breakfast')).toHaveValue(
      'Quick start',
    );
    // Breakfast is Good for already; Lunch is one tap away.
    expect(
      screen.getByRole('button', { name: 'Breakfast: Good for' }),
    ).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Lunch: not set' }));
    expect(await screen.findByLabelText('Reason for Lunch')).toBeVisible();

    await user.clear(note);
    await user.type(note, 'Light');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() =>
      expect(
        calls.find((call) => call.key === 'POST /api/recipes')?.body,
      ).toMatchObject({
        guidance: {
          nutritionNote: 'Light',
          pairings: [{ kind: 'drink', label: 'Orange juice' }],
          eatingMoments: [
            {
              eatingMomentId: 'em1',
              polarity: 'good_for',
              reason: 'Quick start',
            },
            { eatingMomentId: 'em2', polarity: 'good_for', reason: null },
          ],
        },
      }),
    );
  });

  it('names the draft Pairing links from the source Recipe', async () => {
    const linked = {
      ...draft,
      guidance: {
        ...draft.guidance,
        pairings: [
          { ...draft.guidance.pairings[0]!, linkedIngredientId: 'i-oj' },
          {
            ...draft.guidance.pairings[0]!,
            label: 'Toast',
            linkedRecipeId: 'r-toast',
          },
        ],
      },
    };
    setup('/recipes/x/variant/new', {
      'GET /api/recipes/x/variant-draft': () => Response.json(linked),
      'GET /api/recipes/x': () =>
        Response.json({
          ...sourceDetail,
          guidance: {
            ...sourceDetail.guidance,
            pairings: [
              {
                link: { type: 'ingredient', id: 'i-oj', name: 'Orange' },
              },
              {
                link: {
                  type: 'recipe',
                  id: 'r-toast',
                  title: 'Buttered toast',
                },
              },
            ],
          },
        }),
    });
    const user = userEvent.setup({ delay: null });
    await openGuidance(user);
    await user.click(
      await screen.findByRole('button', { name: 'Edit Orange juice' }),
    );
    expect(
      await screen.findByText('Linked Ingredient: Orange'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Done' }));
    await user.click(screen.getByRole('button', { name: 'Edit Toast' }));
    expect(
      await screen.findByRole('option', { name: 'Buttered toast' }),
    ).toBeInTheDocument();
  });

  it('shows a coded error in the Member locale', async () => {
    setup('/recipes/x/variant/new', {
      'GET /api/recipes/x/variant-draft': () =>
        Response.json(
          { code: 'recipes.parent_archived', params: {} },
          { status: 409 },
        ),
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This Base Recipe is archived, so it cannot get new Variants.',
    );
  });

  it('blocks saving without a title', async () => {
    setup('/recipes/x/variant/new', {
      'GET /api/recipes/x/variant-draft': () =>
        Response.json({ ...draft, title: '' }),
    });
    expect(await screen.findByRole('button', { name: 'Save' })).toBeDisabled();
  });
});

describe('The Tag field in the Family Recipe editor', () => {
  afterEach(() => vi.unstubAllGlobals());

  const editWith = (tagIds: string[], extra: RecipeTag[] = []) =>
    setup('/recipes/g/edit', {
      'GET /api/recipes/g/edit': () => Response.json({ ...saved, tagIds }),
      'GET /api/recipes/tags': () => Response.json([...pickable, ...extra]),
      'PUT /api/recipes/g': () => Response.json({ ...saved, tagIds }),
    });

  it('groups the options with Your Tags first', async () => {
    const user = userEvent.setup({ delay: null });
    editWith([]);
    await openTab(user, 'Details');
    const tags = await screen.findByRole('combobox', { name: 'Tags' });
    await user.click(tags);
    const options = await screen.findAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual([
      'Meal prep',
      'Dinner',
      'French',
      'Pan frying',
    ]);
    const headers = ['Your Tags', 'Meal', 'Cuisine', 'Method'];
    for (const header of headers) {
      expect(screen.getByText(header)).toBeInTheDocument();
    }
    // The editor shows no counts and disables nothing.
    for (const option of options) {
      expect(option).not.toHaveAttribute('aria-disabled', 'true');
    }
  });

  it('stays on one line: two chips, then a "+N" pill named "and N more Tags"', async () => {
    const user = userEvent.setup({ delay: null });
    editWith(['t-mine', 't-dinner', 'c-fr', 'm-pan']);
    await openTab(user, 'Details');
    expect(await screen.findByText('Meal prep')).toBeInTheDocument();
    expect(screen.getByText('Dinner')).toBeInTheDocument();
    expect(screen.queryByText('French')).not.toBeInTheDocument();
    expect(screen.getByText('and 2 more Tags')).toBeInTheDocument();
  });

  it('shows a Clear Tags button while there is a value, and clears them', async () => {
    const user = userEvent.setup({ delay: null });
    const calls = editWith(['c-fr']);
    await openTab(user, 'Details');
    expect(await screen.findByText('French')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear Tags' }));
    expect(screen.queryByText('French')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Clear Tags' }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() =>
      expect(
        calls.find((c) => c.key === 'PUT /api/recipes/g')?.body,
      ).toMatchObject({ tagIds: [] }),
    );
  });

  it('saves the Tags picked and removed on an existing Recipe', async () => {
    const user = userEvent.setup({ delay: null });
    const calls = editWith(['c-fr']);
    await openTab(user, 'Details');
    await user.click(await screen.findByRole('combobox', { name: 'Tags' }));
    await user.click(await screen.findByRole('option', { name: 'Meal prep' }));
    await user.click(screen.getByRole('option', { name: 'French' }));
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() =>
      expect(
        calls.find((c) => c.key === 'PUT /api/recipes/g')?.body,
      ).toMatchObject({ tagIds: ['t-mine'] }),
    );
  });

  it('stops at 10 Tags and says so', async () => {
    const user = userEvent.setup({ delay: null });
    const many = Array.from({ length: 11 }, (_, i) =>
      tag(`x${i}`, `Extra ${i}`, ['Diet', 2]),
    );
    editWith(
      many.slice(0, 10).map((t) => t.id),
      many,
    );
    await openTab(user, 'Details');
    expect(
      await screen.findByText('A Recipe can have at most 10 Tags.'),
    ).toBeInTheDocument();
    // Said inside a live region, so a screen reader hears it.
    expect(
      screen
        .getAllByRole('status')
        .some((el) => el.textContent === 'A Recipe can have at most 10 Tags.'),
    ).toBe(true);
    await user.click(screen.getByRole('combobox', { name: 'Tags' }));
    await user.click(await screen.findByRole('option', { name: 'Extra 10' }));
    // The 11th is refused: the first 10 stay picked and the new one is not.
    expect(screen.getByRole('option', { name: 'Extra 9' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('option', { name: 'Extra 10' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
    expect(
      screen.getByText('A Recipe can have at most 10 Tags.'),
    ).toBeInTheDocument();
  });

  it('drops a Tag that no longer exists, so a resumed Draft can still be saved', async () => {
    const user = userEvent.setup({ delay: null });
    const calls = editWith(['c-fr', 'gone-tag']);
    await openTab(user, 'Details');
    expect(await screen.findByText('French')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() =>
      expect(
        calls.find((c) => c.key === 'PUT /api/recipes/g')?.body,
      ).toMatchObject({ tagIds: ['c-fr'] }),
    );
  });

  describe('creating a Family Tag from the field', () => {
    const made = tag('t-new', 'Sunday roast', null);
    const typeIn = async (
      user: ReturnType<typeof userEvent.setup>,
      text: string,
    ) => {
      const field = await screen.findByRole('combobox', { name: 'Tags' });
      await user.click(field);
      await user.type(field, text);
    };
    const createWith = (
      answer: () => Response | Promise<Response>,
      tagIds: string[] = [],
    ) => {
      const calls = setup('/recipes/g/edit', {
        'GET /api/recipes/g/edit': () => Response.json({ ...saved, tagIds }),
        'POST /api/recipes/tags': answer,
        'PUT /api/recipes/g': () => Response.json(saved),
      });
      return calls;
    };

    it('offers Create "…" for a name with no match, and nothing for one that matches', async () => {
      const user = userEvent.setup({ delay: null });
      createWith(() => Response.json(made));
      await openTab(user, 'Details');
      await typeIn(user, 'Sunday roast');
      expect(
        await screen.findByRole('option', { name: 'Create “Sunday roast”' }),
      ).toBeInTheDocument();
      await user.clear(screen.getByRole('combobox', { name: 'Tags' }));
      await user.type(
        screen.getByRole('combobox', { name: 'Tags' }),
        'meal-PREP',
      );
      expect(
        screen.queryByRole('option', { name: /^Create/ }),
      ).not.toBeInTheDocument();
    });

    it('creates the Tag, picks it and saves its id', async () => {
      const user = userEvent.setup({ delay: null });
      const calls = createWith(() => Response.json(made));
      await openTab(user, 'Details');
      await typeIn(user, '  Sunday roast ');
      await user.click(
        await screen.findByRole('option', { name: 'Create “Sunday roast”' }),
      );
      expect(
        calls.find((c) => c.key === 'POST /api/recipes/tags')?.body,
      ).toEqual({ name: 'Sunday roast' });
      expect(
        await screen.findByRole('button', { name: 'Remove Tag Sunday roast' }),
      ).toBeInTheDocument();
      // The new id survives the check for Tags that no longer exist.
      await user.keyboard('{Escape}');
      await user.click(screen.getByRole('button', { name: 'Save' }));
      await vi.waitFor(() =>
        expect(
          calls.find((c) => c.key === 'PUT /api/recipes/g')?.body,
        ).toMatchObject({ tagIds: ['t-new'] }),
      );
    });

    it('shows the new Tag under Your Tags next time the list opens', async () => {
      const user = userEvent.setup({ delay: null });
      createWith(() => Response.json(made));
      await openTab(user, 'Details');
      await typeIn(user, 'Sunday roast');
      await user.click(
        await screen.findByRole('option', { name: 'Create “Sunday roast”' }),
      );
      await screen.findByRole('button', { name: 'Remove Tag Sunday roast' });
      await user.clear(screen.getByRole('combobox', { name: 'Tags' }));
      const options = await screen.findAllByRole('option');
      expect(options.slice(0, 2).map((o) => o.textContent)).toEqual([
        'Meal prep',
        'Sunday roast',
      ]);
    });

    it('picks the Catalog Tag when the API matched one, without a second chip', async () => {
      const user = userEvent.setup({ delay: null });
      const calls = createWith(() => Response.json(pickable[1]), ['t-dinner']);
      await openTab(user, 'Details');
      await typeIn(user, 'cina');
      await user.click(
        await screen.findByRole('option', { name: 'Create “cina”' }),
      );
      await vi.waitFor(() =>
        expect(calls.some((c) => c.key === 'POST /api/recipes/tags')).toBe(
          true,
        ),
      );
      expect(
        screen.getAllByRole('button', { name: /^Remove Tag/ }),
      ).toHaveLength(1);
    });

    it('warns that Allergens come from Ingredient Lines for a Tag that claims one is absent', async () => {
      const user = userEvent.setup({ delay: null });
      createWith(() =>
        Response.json({
          ...tag('t-gf', 'Gluten-free', null),
          claimsAllergenFree: true,
        }),
      );
      await openTab(user, 'Details');
      await typeIn(user, 'Gluten-free');
      await user.click(
        await screen.findByRole('option', { name: 'Create “Gluten-free”' }),
      );
      expect(
        await screen.findByText(/Allergens come from Ingredient Lines/),
      ).toBeInTheDocument();
      await user.click(
        screen.getByRole('button', { name: 'Remove Tag Gluten-free' }),
      );
      expect(
        screen.queryByText(/Allergens come from Ingredient Lines/),
      ).not.toBeInTheDocument();
    });

    it('says why when the API refuses the name', async () => {
      const user = userEvent.setup({ delay: null });
      createWith(() =>
        Response.json(
          { code: 'tags.name_too_long', params: { max: 30 } },
          { status: 400 },
        ),
      );
      await openTab(user, 'Details');
      await typeIn(user, 'Sunday roast');
      await user.click(
        await screen.findByRole('option', { name: 'Create “Sunday roast”' }),
      );
      expect(
        await screen.findByText('A Tag name can be at most 30 characters.'),
      ).toBeInTheDocument();
    });

    it('does not re-add a Tag removed while the request was pending', async () => {
      const user = userEvent.setup({ delay: null });
      let release: () => void = () => {};
      const gate = new Promise<void>((resolve) => (release = resolve));
      createWith(() => gate.then(() => Response.json(made)), ['c-fr']);
      await openTab(user, 'Details');
      await screen.findByRole('button', { name: 'Remove Tag French' });
      await typeIn(user, 'Sunday roast');
      await user.click(
        await screen.findByRole('option', { name: 'Create “Sunday roast”' }),
      );
      await user.click(
        screen.getByRole('button', { name: 'Remove Tag French' }),
      );
      release();
      expect(
        await screen.findByRole('button', { name: 'Remove Tag Sunday roast' }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Remove Tag French' }),
      ).not.toBeInTheDocument();
    });

    it('does not add the new Tag when a pick made while it was pending filled the 10-Tag cap', async () => {
      const user = userEvent.setup({ delay: null });
      let release: () => void = () => {};
      const gate = new Promise<void>((resolve) => (release = resolve));
      const many = Array.from({ length: 10 }, (_, i) =>
        tag(`x${i}`, `Extra ${i}`, ['Diet', 2]),
      );
      const calls = setup('/recipes/g/edit', {
        'GET /api/recipes/g/edit': () =>
          Response.json({
            ...saved,
            tagIds: many.slice(0, 9).map((t) => t.id),
          }),
        'GET /api/recipes/tags': () => Response.json([...pickable, ...many]),
        'POST /api/recipes/tags': () => gate.then(() => Response.json(made)),
        'PUT /api/recipes/g': () => Response.json(saved),
      });
      await openTab(user, 'Details');
      await typeIn(user, 'Sunday roast');
      await user.click(
        await screen.findByRole('option', { name: 'Create “Sunday roast”' }),
      );
      // The 10th Tag is picked by hand before the Create answers.
      await user.clear(screen.getByRole('combobox', { name: 'Tags' }));
      await user.click(await screen.findByRole('option', { name: 'Extra 9' }));
      await screen.findByText('A Recipe can have at most 10 Tags.');
      release();
      // The Create answered once its Tag is an option; its onSuccess has run, so the guard is what is tested.
      await screen.findByRole('option', { name: 'Sunday roast' });
      await user.keyboard('{Escape}');
      await user.click(screen.getByRole('button', { name: 'Save' }));
      await vi.waitFor(() =>
        expect(calls.some((c) => c.key === 'PUT /api/recipes/g')).toBe(true),
      );
      const put = calls.find((c) => c.key === 'PUT /api/recipes/g');
      const sent = (put!.body as { tagIds: string[] }).tagIds;
      expect(sent).toHaveLength(10);
      expect(sent).not.toContain('t-new');
    });

    it('clears the refusal once the Member edits the name or picks a Tag', async () => {
      const user = userEvent.setup({ delay: null });
      createWith(() =>
        Response.json(
          { code: 'tags.name_too_long', params: { max: 30 } },
          { status: 400 },
        ),
      );
      const refusal = 'A Tag name can be at most 30 characters.';
      await openTab(user, 'Details');
      await typeIn(user, 'Sunday roast');
      await user.click(
        await screen.findByRole('option', { name: 'Create “Sunday roast”' }),
      );
      expect(await screen.findByText(refusal)).toBeInTheDocument();
      await user.type(screen.getByRole('combobox', { name: 'Tags' }), 's');
      expect(screen.queryByText(refusal)).not.toBeInTheDocument();
      await user.clear(screen.getByRole('combobox', { name: 'Tags' }));
      await user.type(
        screen.getByRole('combobox', { name: 'Tags' }),
        'Sunday roast',
      );
      await user.click(
        await screen.findByRole('option', { name: 'Create “Sunday roast”' }),
      );
      expect(await screen.findByText(refusal)).toBeInTheDocument();
      await user.clear(screen.getByRole('combobox', { name: 'Tags' }));
      await user.click(await screen.findByRole('option', { name: 'French' }));
      expect(screen.queryByText(refusal)).not.toBeInTheDocument();
    });

    it('offers no Create row at the 10-Tag cap', async () => {
      const user = userEvent.setup({ delay: null });
      const many = Array.from({ length: 10 }, (_, i) =>
        tag(`x${i}`, `Extra ${i}`, ['Diet', 2]),
      );
      setup('/recipes/g/edit', {
        'GET /api/recipes/g/edit': () =>
          Response.json({ ...saved, tagIds: many.map((t) => t.id) }),
        'GET /api/recipes/tags': () => Response.json([...pickable, ...many]),
      });
      await openTab(user, 'Details');
      await screen.findByText('A Recipe can have at most 10 Tags.');
      await typeIn(user, 'Sunday roast');
      expect(
        screen.queryByRole('option', { name: /^Create/ }),
      ).not.toBeInTheDocument();
    });

    it('stops the typed name at 30 characters', async () => {
      const user = userEvent.setup({ delay: null });
      createWith(() => Response.json(made));
      await openTab(user, 'Details');
      expect(
        await screen.findByRole('combobox', { name: 'Tags' }),
      ).toHaveAttribute('maxlength', '30');
    });
  });

  it('shows a translated message when the API refuses the Tags', async () => {
    const user = userEvent.setup({ delay: null });
    setup('/recipes/g/edit', {
      'GET /api/recipes/g/edit': () => Response.json(saved),
      'PUT /api/recipes/g': () =>
        Response.json(
          { code: 'recipes.tags_too_many', params: { max: 10 } },
          { status: 400 },
        ),
    });
    await user.click(await screen.findByRole('button', { name: 'Save' }));
    expect(
      await screen.findByText(
        'The Recipe was not saved: A Recipe can have at most 10 Tags.',
      ),
    ).toBeInTheDocument();
  });
});

describe('EditFamilyRecipePage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('saves the edited document keeping line and Step ids', async () => {
    const user = userEvent.setup({ delay: null });
    const calls = setup('/recipes/g/edit', {
      'GET /api/recipes/g/edit': () => Response.json(saved),
      'PUT /api/recipes/g': () => Response.json(saved),
    });
    await openTab(user, 'Details');
    await openGuidance(user);
    fireEvent.change(await screen.findByLabelText('Nutrition Note'), {
      target: { value: 'Still here' },
    });
    fireEvent.change(screen.getByLabelText(/^Title/), {
      target: { value: 'Better omelette' },
    });
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Recipe saved.')).toBeInTheDocument();
    await openTab(user, 'Steps');
    expect(
      screen.getByRole('link', { name: 'View the Recipe' }),
    ).toHaveAttribute('href', '/recipes/g');
    expect(
      calls.find((call) => call.key === 'PUT /api/recipes/g/guidance')!.body,
    ).toMatchObject({ nutritionNote: 'Still here' });
    const put = calls.find((call) => call.key === 'PUT /api/recipes/g')!;
    expect(put.body).toMatchObject({
      title: 'Better omelette',
      lines: [
        { id: 'l1', ingredientId: 'egg', rawName: null },
        { id: 'l2', ingredientId: null, rawName: 'Gran’s herbs' },
      ],
      steps: [{ id: 's1' }],
    });
  });

  it('keeps focus where it was when a save reseeds the Ingredient lines', async () => {
    const user = userEvent.setup({ delay: null });
    setup('/recipes/g/edit', {
      'GET /api/recipes/g/edit': () => Response.json(saved),
      'PUT /api/recipes/g': () => Response.json(saved),
    });
    await openTab(user, 'Ingredients');
    await user.click(await screen.findByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Recipe saved.')).toBeInTheDocument();

    expect(screen.getByLabelText('Quantity of Gran’s herbs')).not.toHaveFocus();
    expect(screen.getByLabelText('Quantity of Egg')).not.toHaveFocus();
  });

  it('says an archived Recipe cannot be edited', async () => {
    setup('/recipes/g/edit', {
      'GET /api/recipes/g/edit': () =>
        Response.json({ ...saved, archived: true }),
    });
    expect(
      await screen.findByText('This Recipe cannot be edited.'),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Title/)).toBeNull();
  });

  it('sends no unit when a Catalog line has its quantity cleared', async () => {
    const user = userEvent.setup({ delay: null });
    const calls = setup('/recipes/g/edit', {
      'GET /api/recipes/g/edit': () => Response.json(saved),
      'PUT /api/recipes/g': () => Response.json(saved),
    });
    await openTab(user, 'Ingredients');
    await user.clear(await screen.findByLabelText('Quantity of Egg'));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() =>
      expect(
        calls.find((c) => c.key === 'PUT /api/recipes/g')?.body,
      ).toMatchObject({
        lines: [{ id: 'l1', quantity: null, unit: null }, {}],
      }),
    );
  });

  it('saves the Recipe, then its Guidance, with one Save (#595)', async () => {
    const user = userEvent.setup({ delay: null });
    const calls = setup('/recipes/g/edit', {
      'GET /api/recipes/g/edit': () => Response.json(saved),
      'PUT /api/recipes/g': () => Response.json(saved),
    });
    await openTab(user, 'Details');
    await openGuidance(user);
    const note = await screen.findByLabelText('Nutrition Note');
    await user.clear(note);
    await user.type(note, 'Light');
    expect(await screen.findByLabelText('Reason for Breakfast')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Save guidance' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Recipe saved.')).toBeInTheDocument();
    expect(
      calls.filter((c) => c.key.startsWith('PUT ')).map((c) => c.key),
    ).toEqual(['PUT /api/recipes/g', 'PUT /api/recipes/g/guidance']);
    const put = calls.find((c) => c.key === 'PUT /api/recipes/g/guidance')!;
    expect(put.body).toEqual({
      nutritionNote: 'Light',
      pairings: [
        {
          id: 'p1',
          kind: 'drink',
          label: 'Orange juice',
          reason: 'Fresh against the butter',
          principle: null,
          linkedIngredientId: 'i-oj',
          linkedRecipeId: null,
        },
        {
          id: 'p2',
          kind: 'food',
          label: 'Toast',
          reason: 'Soaks it up',
          principle: null,
          linkedIngredientId: null,
          linkedRecipeId: 'r-toast',
        },
      ],
      eatingMoments: [
        { eatingMomentId: 'em1', polarity: 'good_for', reason: 'Quick start' },
      ],
    });
  });

  it('says the Guidance was not saved when only it fails, and a retry sends only the Guidance (#595)', async () => {
    const user = userEvent.setup({ delay: null });
    let guidanceCalls = 0;
    // The server answers with what the last PUT stored.
    let seen: { key: string; body: unknown }[] | undefined;
    const withStoredTitle = () => ({
      ...saved,
      title:
        (
          seen?.filter((c) => c.key === 'PUT /api/recipes/g').at(-1)?.body as
            { title: string } | undefined
        )?.title ?? saved.title,
    });
    const calls = setup('/recipes/g/edit', {
      'GET /api/recipes/g/edit': () => Response.json(withStoredTitle()),
      'PUT /api/recipes/g': () => Response.json(withStoredTitle()),
      'PUT /api/recipes/g/guidance': () =>
        ++guidanceCalls === 1
          ? Response.json({ error: 'boom' }, { status: 500 })
          : Response.json(saved),
    });
    seen = calls;
    await openTab(user, 'Details');
    fireEvent.change(await screen.findByLabelText(/^Title/), {
      target: { value: 'Better omelette' },
    });
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(
      await screen.findByText(/Guidance was not saved/),
    ).toBeInTheDocument();
    expect(screen.queryByText('Recipe saved.')).toBeNull();
    expect(screen.getByLabelText(/^Title/)).toHaveValue('Better omelette');

    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Recipe saved.')).toBeInTheDocument();
    expect(screen.queryByText(/was not saved/)).toBeNull();
    expect(calls.filter((c) => c.key === 'PUT /api/recipes/g')).toHaveLength(1);
    expect(
      calls.filter((c) => c.key === 'PUT /api/recipes/g/guidance'),
    ).toHaveLength(2);
  });

  it('resends a Recipe changed again after a Guidance failure, keeping the Guidance edits (#595)', async () => {
    const user = userEvent.setup({ delay: null });
    let guidanceCalls = 0;
    // The server answers with what the last PUT stored.
    let seen: { key: string; body: unknown }[] | undefined;
    const withStoredTitle = () => ({
      ...saved,
      title:
        (
          seen?.filter((c) => c.key === 'PUT /api/recipes/g').at(-1)?.body as
            { title: string } | undefined
        )?.title ?? saved.title,
    });
    const calls = setup('/recipes/g/edit', {
      'GET /api/recipes/g/edit': () => Response.json(withStoredTitle()),
      'PUT /api/recipes/g': () => Response.json(withStoredTitle()),
      'PUT /api/recipes/g/guidance': () =>
        ++guidanceCalls === 1
          ? Response.json({ error: 'boom' }, { status: 500 })
          : Response.json(saved),
    });
    seen = calls;
    await openTab(user, 'Details');
    await openGuidance(user);
    fireEvent.change(await screen.findByLabelText('Nutrition Note'), {
      target: { value: 'Mine' },
    });
    fireEvent.change(screen.getByLabelText(/^Title/), {
      target: { value: 'Better omelette' },
    });
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(
      await screen.findByText(/The Recipe's Guidance was not saved/),
    ).toBeInTheDocument();
    // Only the Recipe reseeded: the Guidance edit is still there.
    expect(screen.getByLabelText('Nutrition Note')).toHaveValue('Mine');

    fireEvent.change(screen.getByLabelText(/^Title/), {
      target: { value: 'Best omelette' },
    });
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Recipe saved.')).toBeInTheDocument();
    expect(calls.map((c) => c.key).filter((k) => k.startsWith('PUT'))).toEqual([
      'PUT /api/recipes/g',
      'PUT /api/recipes/g/guidance',
      'PUT /api/recipes/g',
      'PUT /api/recipes/g/guidance',
    ]);
    const puts = calls.filter((c) => c.key === 'PUT /api/recipes/g');
    expect(puts[1]!.body).toMatchObject({ title: 'Best omelette' });
  });

  it('reseeds the Guidance card from what the Guidance save returned (#595)', async () => {
    const user = userEvent.setup({ delay: null });
    setup('/recipes/g/edit', {
      'GET /api/recipes/g/edit': () => Response.json(saved),
      'PUT /api/recipes/g': () => Response.json(saved),
      'PUT /api/recipes/g/guidance': () =>
        Response.json({ ...saved, nutritionNote: 'From server' }),
    });
    await openTab(user, 'Details');
    await openGuidance(user);
    fireEvent.change(await screen.findByLabelText('Nutrition Note'), {
      target: { value: 'Typed' },
    });
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Recipe saved.')).toBeInTheDocument();
    expect(screen.getByLabelText('Nutrition Note')).toHaveValue('From server');
  });

  it('sends no Guidance when the Recipe fails, names the Recipe, and a retry sends both (#595)', async () => {
    const user = userEvent.setup({ delay: null });
    let recipeCalls = 0;
    const calls = setup('/recipes/g/edit', {
      'GET /api/recipes/g/edit': () => Response.json(saved),
      'PUT /api/recipes/g': () =>
        ++recipeCalls === 1
          ? Response.json({ error: 'boom' }, { status: 500 })
          : Response.json(saved),
    });
    await user.click(await screen.findByRole('button', { name: 'Save' }));
    expect(
      await screen.findByText(/The Recipe was not saved/),
    ).toBeInTheDocument();
    expect(screen.queryByText('Recipe saved.')).toBeNull();
    expect(calls.some((c) => c.key === 'PUT /api/recipes/g/guidance')).toBe(
      false,
    );

    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Recipe saved.')).toBeInTheDocument();
    expect(
      calls.filter((c) => c.key === 'PUT /api/recipes/g/guidance'),
    ).toHaveLength(1);
  });

  it('disables Save while the Guidance has a problem (#595)', async () => {
    const user = userEvent.setup({ delay: null });
    setup('/recipes/g/edit', {
      'GET /api/recipes/g/edit': () => Response.json(saved),
    });
    await openTab(user, 'Details');
    await openGuidance(user);
    fireEvent.change(await screen.findByLabelText('Nutrition Note'), {
      target: { value: 'x'.repeat(600) },
    });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('names the linked Ingredient and Recipe of saved Pairings', async () => {
    const user = userEvent.setup({ delay: null });
    setup('/recipes/g/edit', {
      'GET /api/recipes/g/edit': () => Response.json(saved),
    });
    await openTab(user, 'Details');
    await openGuidance(user);
    await user.click(
      await screen.findByRole('button', { name: 'Edit Orange juice' }),
    );
    expect(
      await screen.findByText('Linked Ingredient: Orange'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Edit Toast' }));
    expect(
      await screen.findByRole('option', { name: 'Buttered toast' }),
    ).toBeInTheDocument();
  });

  it('links a Pairing to a Recipe found by search', async () => {
    const user = userEvent.setup({ delay: null });
    const calls = setup('/recipes/g/edit', {
      'GET /api/recipes/g/edit': () => Response.json(saved),
      'GET /api/recipes': () =>
        Response.json({
          recipes: [
            {
              id: 'r9',
              title: 'Pancakes',
              parentId: null,
              base: null,
              variantCount: 0,
              servings: 4,
              prepMinutes: null,
              cookMinutes: null,
              difficulty: null,
              owner: 'catalog',
            },
          ],
        }),
      'PUT /api/recipes/g': () => Response.json(saved),
    });
    await openTab(user, 'Details');
    await openGuidance(user);
    await user.click(
      await screen.findByRole('button', { name: 'Edit Orange juice' }),
    );
    await user.selectOptions(
      await screen.findByLabelText('Link of Pairing 1'),
      'recipe',
    );
    await user.selectOptions(
      await screen.findByLabelText('Linked Recipe of Pairing 1'),
      'r9',
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() =>
      expect(
        calls.find((c) => c.key === 'PUT /api/recipes/g/guidance')?.body,
      ).toMatchObject({
        pairings: [
          { id: 'p1', linkedRecipeId: 'r9', linkedIngredientId: null },
          { id: 'p2', linkedRecipeId: 'r-toast' },
        ],
      }),
    );
  });

  it('links a Pairing to an Ingredient with a search that has no Use as typed', async () => {
    const user = userEvent.setup({ delay: null });
    const calls = setup('/recipes/g/edit', {
      'GET /api/recipes/g/edit': () => Response.json(saved),
      'GET /api/catalog/search': () => Response.json({ results: [] }),
    });
    await openTab(user, 'Details');
    await openGuidance(user);
    await user.click(
      await screen.findByRole('button', { name: 'Edit Orange juice' }),
    );
    await user.selectOptions(
      await screen.findByLabelText('Link of Pairing 1'),
      'ingredient',
    );
    await user.type(
      await screen.findByRole('combobox', {
        name: 'Linked Ingredient of Pairing 1',
      }),
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
});

describe('EditFamilyRecipePage Source Link', () => {
  afterEach(() => vi.unstubAllGlobals());

  const linked: FamilyRecipeEdit = {
    ...saved,
    sourceLink: 'https://www.example.com/p',
    sourceLanguage: 'fr',
  };
  const putBody = (calls: ReturnType<typeof setup>) =>
    calls.find((c) => c.key === 'PUT /api/recipes/g')?.body as
      Record<string, unknown> | undefined;

  it('shows the link and the translation note, with no way to change the link', async () => {
    const user = userEvent.setup({ delay: null });
    setup('/recipes/g/edit', {
      'GET /api/recipes/g/edit': () => Response.json(linked),
    });
    await openTab(user, 'Details');
    const link = await screen.findByRole('link', {
      name: 'From example.com ↗',
    });
    expect(link).toHaveAttribute('href', 'https://www.example.com/p');
    expect(
      screen.getByText('Translated from French', { exact: false }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Remove link' })).toBeVisible();
    // The link is shown, never offered for editing.
    expect(
      screen
        .getAllByRole('textbox')
        .some((box) => (box as HTMLInputElement).value.includes('example.com')),
    ).toBe(false);
  });

  it('shows no link row on a Recipe without a Source Link', async () => {
    const user = userEvent.setup({ delay: null });
    setup('/recipes/g/edit', {
      'GET /api/recipes/g/edit': () => Response.json(saved),
    });
    await openTab(user, 'Details');
    await screen.findByLabelText(/^Title/);
    expect(screen.queryByRole('button', { name: 'Remove link' })).toBeNull();
    expect(screen.queryByText(/From .* ↗/)).toBeNull();
  });

  it('removes the link on Save: hides it at once, sends null, moves focus to Undo', async () => {
    const user = userEvent.setup({ delay: null });
    let current = linked;
    const calls = setup('/recipes/g/edit', {
      'GET /api/recipes/g/edit': () => Response.json(current),
      'PUT /api/recipes/g': () => {
        current = { ...linked, sourceLink: null, sourceLanguage: null };
        return Response.json(current);
      },
    });
    await openTab(user, 'Details');
    await user.click(
      await screen.findByRole('button', { name: 'Remove link' }),
    );
    expect(
      screen.queryByRole('link', { name: /From example\.com/ }),
    ).toBeNull();
    expect(screen.queryByText(/Translated from/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Undo' })).toHaveFocus();
    // Nothing is sent until Save.
    expect(putBody(calls)).toBeUndefined();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Recipe saved.')).toBeInTheDocument();
    expect(putBody(calls)).toHaveProperty('sourceLink', null);
    expect(screen.queryByRole('button', { name: 'Remove link' })).toBeNull();
  });

  it('does not send the link when Save is pressed without removing it', async () => {
    const user = userEvent.setup({ delay: null });
    const calls = setup('/recipes/g/edit', {
      'GET /api/recipes/g/edit': () => Response.json(linked),
      'PUT /api/recipes/g': () => Response.json(linked),
    });
    await openTab(user, 'Details');
    await screen.findByRole('link', { name: 'From example.com ↗' });
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Recipe saved.')).toBeInTheDocument();
    expect(putBody(calls)).not.toHaveProperty('sourceLink');
    expect(putBody(calls)).not.toHaveProperty('sourceLanguage');
    expect(
      screen.getByRole('link', { name: 'From example.com ↗' }),
    ).toBeVisible();
  });

  it('drops "Recipe saved." when the link is removed after a Save', async () => {
    const user = userEvent.setup({ delay: null });
    setup('/recipes/g/edit', {
      'GET /api/recipes/g/edit': () => Response.json(linked),
      'PUT /api/recipes/g': () => Response.json(linked),
    });
    await openTab(user, 'Details');
    await screen.findByRole('link', { name: 'From example.com ↗' });
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Recipe saved.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove link' }));
    expect(screen.queryByText('Recipe saved.')).toBeNull();
  });

  it('sends the removal once: a second Save leaves the link out', async () => {
    const user = userEvent.setup({ delay: null });
    let current = linked;
    const calls = setup('/recipes/g/edit', {
      'GET /api/recipes/g/edit': () => Response.json(current),
      'PUT /api/recipes/g': () => {
        current = { ...linked, sourceLink: null, sourceLanguage: null };
        return Response.json(current);
      },
    });
    await openTab(user, 'Details');
    await user.click(
      await screen.findByRole('button', { name: 'Remove link' }),
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() =>
      expect(calls.filter((c) => c.key === 'PUT /api/recipes/g')).toHaveLength(
        1,
      ),
    );
    // An unchanged Recipe is not resent, so change something for the second Save.
    fireEvent.change(await screen.findByLabelText(/^Title/), {
      target: { value: 'Another title' },
    });
    await user.click(await screen.findByRole('button', { name: 'Save' }));
    await vi.waitFor(() =>
      expect(calls.filter((c) => c.key === 'PUT /api/recipes/g')).toHaveLength(
        2,
      ),
    );
    const puts = calls.filter((c) => c.key === 'PUT /api/recipes/g');
    expect(puts[0].body).toHaveProperty('sourceLink', null);
    expect(puts[1].body).not.toHaveProperty('sourceLink');
  });

  it('keeps the link and sends nothing when the removal is cancelled', async () => {
    const user = userEvent.setup({ delay: null });
    const calls = setup('/recipes/g/edit', {
      'GET /api/recipes/g/edit': () => Response.json(linked),
      'PUT /api/recipes/g': () => Response.json(linked),
    });
    await openTab(user, 'Details');
    await user.click(
      await screen.findByRole('button', { name: 'Remove link' }),
    );
    // Leaving with the removal unsaved asks first (#596).
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    try {
      await user.click(screen.getByRole('link', { name: 'Back' }));
      expect(
        await screen.findByText('Detail of the recipe'),
      ).toBeInTheDocument();
      expect(putBody(calls)).toBeUndefined();
    } finally {
      confirm.mockRestore();
    }
  });

  it('still sends the removal on the next Save after a failed one', async () => {
    const user = userEvent.setup({ delay: null });
    let attempts = 0;
    const calls = setup('/recipes/g/edit', {
      'GET /api/recipes/g/edit': () => Response.json(linked),
      'PUT /api/recipes/g': () =>
        ++attempts === 1
          ? Response.json({ code: 'recipes.not_found' }, { status: 404 })
          : Response.json({
              ...linked,
              sourceLink: null,
              sourceLanguage: null,
            }),
    });
    await openTab(user, 'Details');
    await user.click(
      await screen.findByRole('button', { name: 'Remove link' }),
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => expect(attempts).toBe(1));
    await user.click(await screen.findByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Recipe saved.')).toBeInTheDocument();
    expect(attempts).toBe(2);
    const puts = calls.filter((c) => c.key === 'PUT /api/recipes/g');
    expect(
      puts.map((c) => (c.body as { sourceLink?: unknown }).sourceLink),
    ).toEqual([null, null]);
  });

  it('refreshes the Recipe detail after the link is removed', async () => {
    const user = userEvent.setup({ delay: null });
    let removed = false;
    setup('/recipes/g/edit-and-detail', {
      'GET /api/recipes/g/edit': () => Response.json(linked),
      'GET /api/recipes/g': () =>
        Response.json({
          ...sourceDetail,
          sourceLink: removed ? null : 'https://www.example.com/p',
        }),
      'PUT /api/recipes/g': () => {
        removed = true;
        return Response.json({
          ...linked,
          sourceLink: null,
          sourceLanguage: null,
        });
      },
    });
    expect(
      await screen.findByText('detail link: https://www.example.com/p'),
    ).toBeVisible();
    await openTab(user, 'Details');
    await user.click(screen.getByRole('button', { name: 'Remove link' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('detail link: none')).toBeVisible();
  });
});

describe('Family Recipe Browse by aisle', () => {
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
  const aisleRoutes = {
    'GET /api/catalog/aisles': () => Response.json(browseAisles),
    'GET /api/catalog/search': () => Response.json({ results: [] }),
  };

  it('shows Browse by aisle in the ingredient search of the recipe form', async () => {
    const user = userEvent.setup({ delay: null });
    setup('/recipes/new', aisleRoutes);

    await openTab(user, 'Ingredients');
    await user.click(
      await screen.findByRole('combobox', { name: 'Add an ingredient' }),
    );

    expect(await screen.findByText('Browse by aisle')).toBeVisible();
    expect(
      await screen.findByRole('button', { name: 'Dairy & eggs' }),
    ).toBeVisible();
  });

  it('shows Browse by aisle in the Guidance link search', async () => {
    const user = userEvent.setup({ delay: null });
    setup('/recipes/g/edit', {
      'GET /api/recipes/g/edit': () => Response.json(saved),
      ...aisleRoutes,
    });
    await openTab(user, 'Details');
    await openGuidance(user);
    await user.click(
      await screen.findByRole('button', { name: 'Edit Orange juice' }),
    );
    await user.selectOptions(
      await screen.findByLabelText('Link of Pairing 1'),
      'ingredient',
    );

    await user.click(
      await screen.findByRole('combobox', {
        name: 'Linked Ingredient of Pairing 1',
      }),
    );

    expect(await screen.findByText('Browse by aisle')).toBeVisible();
  });
});

describe('Family Recipe form: Add to your catalog (#270)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('offers it in the ingredient search, above Use as typed', async () => {
    const user = userEvent.setup({ delay: null });
    setup('/recipes/new', {
      'GET /api/catalog/search': () => Response.json({ results: [] }),
    });
    await openTab(user, 'Ingredients');

    await user.click(
      screen.getByRole('combobox', { name: 'Add an ingredient' }),
    );
    await user.paste('kombucha');

    // Only the search listbox's options: the form's native selects have options too.
    const options = within(await screen.findByRole('listbox')).getAllByRole(
      'option',
    );
    expect(options[0]).toHaveAccessibleName(/Add “kombucha” to your catalog/);
    expect(options[1]).toHaveAccessibleName(/Use “kombucha” as typed/);
  });

  it('offers it in a Guidance link search, which has no Use as typed', async () => {
    const user = userEvent.setup({ delay: null });
    setup('/recipes/g/edit', {
      'GET /api/recipes/g/edit': () => Response.json(saved),
      'GET /api/catalog/search': () => Response.json({ results: [] }),
    });
    await openTab(user, 'Details');
    await openGuidance(user);
    await user.click(
      await screen.findByRole('button', { name: 'Edit Orange juice' }),
    );
    await user.selectOptions(
      await screen.findByLabelText('Link of Pairing 1'),
      'ingredient',
    );

    await user.click(
      await screen.findByRole('combobox', {
        name: 'Linked Ingredient of Pairing 1',
      }),
    );
    await user.paste('kombucha');

    const options = within(await screen.findByRole('listbox')).getAllByRole(
      'option',
    );
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveAccessibleName(/Add “kombucha” to your catalog/);
  });
});

describe('Family Recipe form: inline Add an ingredient (#590)', () => {
  afterEach(() => vi.unstubAllGlobals());

  const kombucha = {
    owner: 'family',
    amountScale: 'medium',
    id: 'k1',
    name: 'Kombucha',
    defaultUnit: 'ml',
    leafCategory: { id: 'tea', name: 'Tea' },
    parentCategory: {
      id: 'drinks',
      name: 'Drinks',
      aisle: { id: 'a1', name: 'Drinks' },
    },
    defaults: { expiryDays: 30, location: 'fridge' },
  };
  const searchBox = () =>
    screen.getByRole('combobox', { name: 'Add an ingredient' });

  it('picks a result with Enter, clears the query and focuses the new line quantity', async () => {
    const user = userEvent.setup({ delay: null });
    setup('/recipes/new', {
      'GET /api/catalog/search': () => Response.json({ results: [kombucha] }),
    });
    await openTab(user, 'Ingredients');

    await user.type(searchBox(), 'komb');
    await screen.findByRole('option', { name: /Kombucha/ });
    await user.keyboard('{Enter}');

    const quantity = await screen.findByLabelText('Quantity of Kombucha');
    expect(searchBox()).toHaveValue('');
    expect(quantity).toHaveFocus();
  });

  it('adds an Unmatched line with Use as typed and focuses its quantity', async () => {
    const user = userEvent.setup({ delay: null });
    setup('/recipes/new', {
      'GET /api/catalog/search': () => Response.json({ results: [] }),
    });
    await openTab(user, 'Ingredients');

    await user.type(searchBox(), 'Dragon fruit');
    await user.click(
      await screen.findByRole('option', {
        name: /Use “Dragon fruit” as typed/,
      }),
    );

    expect(
      await screen.findByLabelText('Quantity of Dragon fruit'),
    ).toHaveFocus();
  });

  it('closes the popover with Escape', async () => {
    const user = userEvent.setup({ delay: null });
    setup('/recipes/new', {
      'GET /api/catalog/search': () => Response.json({ results: [kombucha] }),
    });
    await openTab(user, 'Ingredients');

    await user.type(searchBox(), 'komb');
    await screen.findByRole('option', { name: /Kombucha/ });
    await user.keyboard('{Escape}');

    expect(searchBox()).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes the popover when focus leaves the search', async () => {
    const user = userEvent.setup({ delay: null });
    setup('/recipes/new', {
      'GET /api/catalog/search': () => Response.json({ results: [kombucha] }),
    });
    await openTab(user, 'Ingredients');

    await user.type(searchBox(), 'komb');
    await screen.findByRole('option', { name: /Kombucha/ });
    await user.click(document.body);

    expect(searchBox()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('option', { name: /Kombucha/ })).toBeNull();
  });

  it('goes back from an aisle with the inline ‹ Aisles link and keeps focus in the field', async () => {
    const user = userEvent.setup({ delay: null });
    setup('/recipes/new', {
      'GET /api/catalog/aisles': () =>
        Response.json({
          aisles: [
            {
              id: 'aisle-dairy',
              name: 'Dairy & eggs',
              parentCategories: [{ id: 'p-dairy', name: 'Dairy' }],
            },
          ],
        }),
      'GET /api/catalog/search': () => Response.json({ results: [kombucha] }),
    });
    await openTab(user, 'Ingredients');

    await user.click(searchBox());
    await user.click(
      await screen.findByRole('button', { name: 'Dairy & eggs' }),
    );
    await user.click(await screen.findByRole('button', { name: '‹ Aisles' }));

    expect(await screen.findByText('Browse by aisle')).toBeVisible();
    expect(
      await screen.findByRole('button', { name: 'Dairy & eggs' }),
    ).toBeVisible();
    expect(searchBox()).toHaveFocus();
  });

  it('adds the line with the new Family Ingredient after Add to your catalog', async () => {
    stubViewport(1024);
    const user = userEvent.setup({ delay: null });
    setup('/recipes/new', {
      'GET /api/catalog/search': () => Response.json({ results: [] }),
      'GET /api/catalog/allergens': () => Response.json({ allergens: [] }),
      'GET /api/catalog/categories': () =>
        Response.json({
          categories: [
            {
              id: 'tea',
              name: 'Tea',
              parentCategory: { id: 'drinks', name: 'Drinks' },
              aisle: { id: 'a1', name: 'Drinks' },
              defaults: { expiryDays: null, location: null },
            },
          ],
        }),
      'POST /api/catalog/family-ingredients': () =>
        Response.json(kombucha, { status: 201 }),
    });
    await openTab(user, 'Ingredients');

    await user.type(searchBox(), 'Kombucha');
    await user.click(
      await screen.findByRole('option', {
        name: /Add “Kombucha” to your catalog/,
      }),
    );
    const dialog = await screen.findByRole('dialog');
    await user.click(
      await within(dialog).findByRole('option', { name: /Tea/ }),
    );
    await user.click(
      within(dialog).getByRole('button', { name: /^Add & pick/ }),
    );

    const quantity = await screen.findByLabelText('Quantity of Kombucha');
    expect(quantity).toHaveFocus();
    expect(screen.getAllByText('Family').length).toBeGreaterThan(0);
  });
});

describe('Suggest Guidance', () => {
  afterEach(() => vi.unstubAllGlobals());

  const NOTE = 'Rich in protein, light on fibre.';
  const suggestRoute = 'POST /api/recipes/suggest-guidance';
  const idea = {
    kind: 'food',
    label: 'Fresh berries',
    reason: 'Their tartness cuts the richness.',
    principle: 'acid_cuts_fat',
    linkedIngredientId: null,
    linkedRecipeId: null,
  };
  const moment = {
    eatingMomentId: 'em1',
    polarity: 'avoid',
    reason: 'Too heavy first thing.',
  };
  const proposal = () =>
    Response.json({
      guidance: {
        nutritionNote: NOTE,
        pairings: [idea],
        eatingMoments: [moment],
      },
      noSuggestions: [],
    });
  const noteOnly = () =>
    Response.json({ guidance: { nutritionNote: NOTE }, noSuggestions: [] });
  const pairingsGroup = () => screen.getByRole('group', { name: /Pairings/ });
  const noteField = () => screen.getByLabelText('Nutrition Note');
  // On the row of the Guidance card (New and Variant).
  const suggestButton = () => screen.getByRole('button', { name: 'Suggest' });
  const noNote: FamilyRecipeDraft = {
    ...draft,
    guidance: { ...draft.guidance, nutritionNote: null },
  };
  const unfilled: FamilyRecipeEdit = { ...saved, nutritionNote: null };

  it('shows the Credit Price of Suggest Guidance beside its button', async () => {
    setup('/recipes/new', {
      'GET /api/credits': () =>
        Response.json({
          balance: 100,
          prices: { guidance: 1 },
          lowBalanceThreshold: 10,
          history: [],
        }),
    });
    const button = await screen.findByRole('button', { name: 'Suggest' });
    expect(await screen.findByText('1 Credit')).toBeInTheDocument();
    expect(button).toHaveAccessibleDescription('1 Credit');
  });

  it('fills an empty Nutrition Note from the page as it is now, marked Suggested, and sends ordinary Guidance on save', async () => {
    const user = userEvent.setup({ delay: null });
    const calls = setup('/recipes/new', {
      [suggestRoute]: proposal,
      'POST /api/recipes': () => Response.json(saved, { status: 201 }),
    });
    await user.type(await screen.findByLabelText(/^Title/), 'Gran stew');

    await user.click(suggestButton());

    await vi.waitFor(() => expect(noteField()).toHaveValue(NOTE));
    expect(screen.getByText('Fresh berries')).toBeVisible();
    const asked = calls.find((c) => c.key === suggestRoute)?.body;
    expect(asked).toMatchObject({
      recipe: { title: 'Gran stew', servings: 4 },
      guidance: { nutritionNote: null, pairings: [], eatingMoments: [] },
    });
    expect(
      within(screen.getByRole('group', { name: /Nutrition Note/ })).getByText(
        'Suggested',
      ),
    ).toBeVisible();
    // The Eating Moment is a chip marked Avoid, with its reason and a Suggested mark.
    const moments = within(
      screen.getByRole('group', { name: /Eating Moments/ }),
    );
    expect(moments.getByText('Suggested')).toBeVisible();
    expect(
      moments.getByRole('button', { name: 'Breakfast: Avoid' }),
    ).toBeVisible();
    expect(moments.getByLabelText('Reason for Breakfast')).toHaveValue(
      moment.reason,
    );
    // Nothing is stored by suggesting.
    expect(calls.some((c) => c.key === 'POST /api/recipes')).toBe(false);
    // Every covered field is filled now: nothing is left to suggest, so the row drops the button.
    expect(
      screen.queryByRole('button', { name: 'Suggest' }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() =>
      expect(calls.some((c) => c.key === 'POST /api/recipes')).toBe(true),
    );
    const body = calls.find((c) => c.key === 'POST /api/recipes')?.body;
    expect(body).toMatchObject({
      guidance: { nutritionNote: NOTE, eatingMoments: [moment] },
    });
    expect(JSON.stringify(body)).not.toMatch(/suggested/i);
  });

  it('clears the mark once the Member edits the note', async () => {
    const user = userEvent.setup({ delay: null });
    setup('/recipes/new', { [suggestRoute]: noteOnly });
    await user.type(await screen.findByLabelText(/^Title/), 'Gran stew');
    await user.click(suggestButton());
    await vi.waitFor(() => expect(noteField()).toHaveValue(NOTE));

    await user.type(noteField(), '!');

    expect(screen.queryByText('Suggested')).not.toBeInTheDocument();
    expect(noteField()).toHaveValue(`${NOTE}!`);
  });

  it('clears the mark of an Eating Moment once the Member edits its reason or polarity', async () => {
    const user = userEvent.setup({ delay: null });
    setup('/recipes/new', {
      [suggestRoute]: () =>
        Response.json({
          guidance: {
            eatingMoments: [
              moment,
              { ...moment, eatingMomentId: 'em2', polarity: 'good_for' },
            ],
          },
          noSuggestions: [],
        }),
    });
    await user.type(await screen.findByLabelText(/^Title/), 'Gran stew');
    await user.click(suggestButton());
    await screen.findByLabelText('Reason for Lunch');
    expect(screen.getAllByText('Suggested')).toHaveLength(2);

    await user.type(screen.getByLabelText('Reason for Breakfast'), '!');
    expect(screen.getAllByText('Suggested')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Lunch: Good for' }));
    expect(screen.queryByText('Suggested')).not.toBeInTheDocument();
  });

  it('keeps Eating Moments the Member already added', async () => {
    const user = userEvent.setup({ delay: null });
    const calls = setup('/recipes/x/variant/new', {
      'GET /api/recipes/x/variant-draft': () => Response.json(noNote),
      'GET /api/recipes/x': () => Response.json(sourceDetail),
      [suggestRoute]: () =>
        Response.json({
          guidance: { nutritionNote: NOTE, eatingMoments: [moment] },
          noSuggestions: [],
        }),
    });
    await screen.findByLabelText(/^Title/);
    await user.click(suggestButton());
    await vi.waitFor(() => expect(noteField()).toHaveValue(NOTE));
    expect(calls.some((c) => c.key === suggestRoute)).toBe(true);
    // The Variant draft carries "Breakfast" as Good for already: untouched, not marked.
    expect(screen.getByLabelText('Reason for Breakfast')).toHaveValue(
      'Quick start',
    );
    expect(
      within(screen.getByRole('group', { name: /Eating Moments/ })).queryByText(
        'Suggested',
      ),
    ).not.toBeInTheDocument();
  });

  it('has no Suggest on the row when every field is filled, and never asks', async () => {
    const calls = setup('/recipes/x/variant/new', {
      'GET /api/recipes/x/variant-draft': () => Response.json(draft),
      'GET /api/recipes/x': () => Response.json(sourceDetail),
      [suggestRoute]: proposal,
    });
    expect(
      await screen.findByRole('button', { name: /^Pairings, nutrition/ }),
    ).toHaveTextContent('3 set');
    expect(
      screen.queryByRole('button', { name: 'Suggest' }),
    ).not.toBeInTheDocument();
    expect(calls.some((c) => c.key === suggestRoute)).toBe(false);
  });

  it('works on a Variant, reading the copied ingredients and Steps', async () => {
    const user = userEvent.setup({ delay: null });
    const calls = setup('/recipes/x/variant/new', {
      'GET /api/recipes/x/variant-draft': () => Response.json(noNote),
      'GET /api/recipes/x': () => Response.json(sourceDetail),
      [suggestRoute]: proposal,
    });
    await screen.findByLabelText(/^Title/);
    await user.click(suggestButton());
    await vi.waitFor(() => expect(noteField()).toHaveValue(NOTE));
    expect(calls.find((c) => c.key === suggestRoute)?.body).toMatchObject({
      recipe: {
        title: 'Omelette',
        lines: [{ ingredientId: 'egg', quantity: 3, unit: 'pcs' }],
        steps: [{ text: 'Whisk the eggs' }],
      },
      guidance: {
        pairings: [{ label: 'Orange juice' }],
        eatingMoments: [{ eatingMomentId: 'em1' }],
      },
    });
  });

  it('shows a working state and sends one request however often it is pressed', async () => {
    const user = userEvent.setup({ delay: null });
    let release = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const calls = setup('/recipes/new', {
      [suggestRoute]: async () => {
        await gate;
        return proposal();
      },
    });
    await user.type(await screen.findByLabelText(/^Title/), 'Gran stew');
    await user.click(suggestButton());

    const working = await screen.findByRole('button', { name: 'Suggesting…' });
    expect(working).toBeDisabled();
    fireEvent.click(working);
    release();
    await vi.waitFor(() => expect(noteField()).toHaveValue(NOTE));
    expect(calls.filter((c) => c.key === suggestRoute)).toHaveLength(1);
  });

  it('does not overwrite a note the Member typed while the request was in flight', async () => {
    const user = userEvent.setup({ delay: null });
    let release = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    setup('/recipes/new', {
      [suggestRoute]: async () => {
        await gate;
        return noteOnly();
      },
    });
    await user.type(await screen.findByLabelText(/^Title/), 'Gran stew');
    await user.click(suggestButton());
    await screen.findByRole('button', { name: 'Suggesting…' });

    await user.type(noteField(), 'Mine');
    release();

    await screen.findByRole('button', { name: 'Suggest' });
    expect(noteField()).toHaveValue('Mine');
    expect(screen.queryByText('Suggested')).not.toBeInTheDocument();
  });

  it('says "Nothing to suggest" in a status when nothing was worth proposing', async () => {
    const user = userEvent.setup({ delay: null });
    setup('/recipes/new', {
      [suggestRoute]: () =>
        Response.json({ guidance: {}, noSuggestions: ['nutritionNote'] }),
    });
    await user.type(await screen.findByLabelText(/^Title/), 'Gran stew');
    await user.click(suggestButton());

    await screen.findByText('Nothing to suggest');
    expect(
      screen
        .getAllByRole('status')
        .some((s) => s.textContent === 'Nothing to suggest'),
    ).toBe(true);
    expect(noteField()).toHaveValue('');
    // Typing in the field makes the message redundant.
    await user.type(noteField(), 'x');
    expect(screen.queryByText('Nothing to suggest')).not.toBeInTheDocument();
  });

  it('says "Nothing to suggest" for Eating Moments in a status when none was worth proposing', async () => {
    const user = userEvent.setup({ delay: null });
    setup('/recipes/new', {
      [suggestRoute]: () =>
        Response.json({ guidance: {}, noSuggestions: ['eatingMoments'] }),
    });
    await user.type(await screen.findByLabelText(/^Title/), 'Gran stew');
    await user.click(suggestButton());

    await screen.findByText('Nothing to suggest');
    expect(
      within(screen.getByRole('group', { name: /Eating Moments/ })).getByText(
        'Nothing to suggest',
      ),
    ).toBeVisible();
  });

  it('shows a polite error and leaves the form untouched when suggesting fails', async () => {
    const user = userEvent.setup({ delay: null });
    setup('/recipes/new', {
      [suggestRoute]: () =>
        Response.json(
          { code: 'scan.provider_unavailable', params: {} },
          { status: 502 },
        ),
    });
    await user.type(await screen.findByLabelText(/^Title/), 'Gran stew');
    await user.click(suggestButton());

    const toast = await screen.findByText(
      'Suggest Guidance is not working right now. Please try again in a moment.',
    );
    expect(toast.closest('[role="status"]')).not.toBeNull();
    expect(noteField()).toHaveValue('');
    expect(screen.getByLabelText(/^Title/)).toHaveValue('Gran stew');
    // It can be tried again.
    expect(suggestButton()).toBeEnabled();
  });

  describe('the Guidance Cap', () => {
    afterEach(() => vi.useRealTimers());

    const pressAtCap = async (params: object) => {
      const user = userEvent.setup({ delay: null });
      setup('/recipes/new', {
        [suggestRoute]: () =>
          Response.json(
            { code: 'guidance.cap_reached', params },
            { status: 429 },
          ),
      });
      await user.type(await screen.findByLabelText(/^Title/), 'Gran stew');
      await user.click(suggestButton());
    };

    it("says when Suggest Guidance is available again, in the Member's own time, and leaves the form untouched", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      vi.setSystemTime(new Date('2026-05-01T10:00:00Z'));
      const resetsAt = '2026-05-02T00:00:00.000Z';
      await pressAtCap({ cap: 20, resetsAt });
      const when = new Intl.DateTimeFormat('en-GB', {
        weekday: 'long',
        hour: 'numeric',
        minute: '2-digit',
      }).format(Date.parse(resetsAt));
      const toast = await screen.findByText(
        `You have used all 20 Suggest Guidance requests for today. Your requests reset on ${when}.`,
      );
      expect(toast.closest('[role="status"]')).not.toBeNull();
      expect(noteField()).toHaveValue('');
      expect(screen.getByLabelText(/^Title/)).toHaveValue('Gran stew');
    });

    it('says to try tomorrow when the reset time is missing', async () => {
      await pressAtCap({ cap: 20 });
      expect(
        await screen.findByText(
          'You have used all 20 Suggest Guidance requests for today. Try again tomorrow.',
        ),
      ).toBeInTheDocument();
    });

    it('leaves the number out when the cap is missing', async () => {
      await pressAtCap({});
      expect(
        await screen.findByText(
          "You have used all of today's Suggest Guidance requests. Try again tomorrow.",
        ),
      ).toBeInTheDocument();
    });
  });

  it('on the edit page reads unsaved edits and names the Recipe being edited', async () => {
    const user = userEvent.setup({ delay: null });
    const calls = setup('/recipes/g/edit', {
      'GET /api/recipes/g/edit': () => Response.json(unfilled),
      [suggestRoute]: proposal,
    });
    await openTab(user, 'Details');
    fireEvent.change(screen.getByLabelText(/^Title/), {
      target: { value: 'Unsaved title' },
    });

    await user.click(suggestButton());

    await vi.waitFor(() => expect(noteField()).toHaveValue(NOTE));
    expect(calls.find((c) => c.key === suggestRoute)?.body).toMatchObject({
      recipeId: 'g',
      recipe: { title: 'Unsaved title' },
      guidance: { pairings: [{ id: 'p1' }, { id: 'p2' }] },
    });
  });

  describe('Pairings', () => {
    const titleAndSuggest = async (routes: Record<string, () => Response>) => {
      const user = userEvent.setup({ delay: null });
      const calls = setup('/recipes/new', routes);
      await user.type(await screen.findByLabelText(/^Title/), 'Gran stew');
      return { user, calls };
    };

    it('lands linked Pairings marked Suggested, naming the Ingredient and the Recipe they link to', async () => {
      const { user, calls } = await titleAndSuggest({
        [suggestRoute]: () =>
          Response.json({
            guidance: {
              pairings: [
                {
                  ...idea,
                  label: 'Butter',
                  linkedIngredientId: 'butter',
                  linkedIngredientName: 'Butter',
                },
                {
                  ...idea,
                  kind: 'drink',
                  label: 'Tea',
                  principle: null,
                  linkedRecipeId: 'tea',
                  linkedRecipeTitle: 'Iced tea',
                },
              ],
            },
            noSuggestions: ['nutritionNote'],
          }),
        'POST /api/recipes': () => Response.json(saved, { status: 201 }),
      });
      await user.click(suggestButton());

      expect(await screen.findByText('Butter')).toBeVisible();
      expect(within(pairingsGroup()).getAllByText('Suggested')).toHaveLength(2);
      await user.click(screen.getByRole('button', { name: 'Edit Butter' }));
      expect(screen.getByText('Linked Ingredient: Butter')).toBeVisible();
      await user.click(screen.getByRole('button', { name: 'Done' }));
      await user.click(screen.getByRole('button', { name: 'Edit Tea' }));
      expect(
        screen.getByLabelText('Linked Recipe of Pairing 2'),
      ).toHaveDisplayValue('Iced tea');
      await user.click(screen.getByRole('button', { name: 'Done' }));
      expect(screen.getByText('Nothing to suggest')).toBeVisible();

      await user.click(screen.getByRole('button', { name: 'Save' }));
      await vi.waitFor(() =>
        expect(calls.some((c) => c.key === 'POST /api/recipes')).toBe(true),
      );
      const body = calls.find((c) => c.key === 'POST /api/recipes')?.body;
      expect(body).toMatchObject({
        guidance: {
          pairings: [
            { label: 'Butter', linkedIngredientId: 'butter' },
            { label: 'Tea', linkedRecipeId: 'tea', linkedIngredientId: null },
          ],
        },
      });
      expect(JSON.stringify(body)).not.toMatch(/suggested|linkedRecipeTitle/i);
    });

    it('says "Nothing to suggest" for Pairings when the server has none', async () => {
      const { user } = await titleAndSuggest({
        [suggestRoute]: () =>
          Response.json({ guidance: {}, noSuggestions: ['pairings'] }),
      });
      await user.click(suggestButton());

      await screen.findByText('Nothing to suggest');
      expect(
        screen.queryByLabelText('Label of Pairing 1'),
      ).not.toBeInTheDocument();
    });

    it('treats blank Pairing rows as empty: sends none, and the proposal replaces them', async () => {
      const { user, calls } = await titleAndSuggest({
        [suggestRoute]: proposal,
      });
      await openGuidance(user);
      await user.click(screen.getByRole('button', { name: 'Add a Pairing' }));
      expect(screen.getByLabelText('Label of Pairing 1')).toHaveValue('');
      expect(suggestButton()).toBeEnabled();

      await user.click(suggestButton());

      await vi.waitFor(() =>
        expect(screen.getByText('Fresh berries')).toBeVisible(),
      );
      expect(calls.find((c) => c.key === suggestRoute)?.body).toMatchObject({
        guidance: { pairings: [] },
      });
      expect(
        screen.queryByLabelText('Label of Pairing 2'),
      ).not.toBeInTheDocument();
    });

    it('clears the Suggested chip of a Pairing once the Member edits it', async () => {
      const { user } = await titleAndSuggest({
        [suggestRoute]: () =>
          Response.json({
            guidance: { pairings: [idea, { ...idea, label: 'Toast' }] },
            noSuggestions: ['nutritionNote'],
          }),
      });
      await user.click(suggestButton());
      await screen.findByText('Toast');
      expect(within(pairingsGroup()).getAllByText('Suggested')).toHaveLength(2);

      await user.click(
        screen.getByRole('button', { name: 'Edit Fresh berries' }),
      );
      await user.type(screen.getByLabelText('Label of Pairing 1'), '!');
      expect(within(pairingsGroup()).getAllByText('Suggested')).toHaveLength(1);
    });

    it("keeps a partly typed Pairing row as the Member's own: Pairings are not proposed beside it", async () => {
      const { user, calls } = await titleAndSuggest({
        [suggestRoute]: noteOnly,
      });
      await openGuidance(user);
      await user.click(screen.getByRole('button', { name: 'Add a Pairing' }));
      await user.type(screen.getByLabelText('Label of Pairing 1'), 'Half way');

      await user.click(suggestButton());

      await vi.waitFor(() => expect(noteField()).toHaveValue(NOTE));
      expect(calls.find((c) => c.key === suggestRoute)?.body).toMatchObject({
        guidance: { pairings: [{ label: 'Half way' }] },
      });
      expect(screen.getByLabelText('Label of Pairing 1')).toHaveValue(
        'Half way',
      );
      expect(
        screen.queryByLabelText('Label of Pairing 2'),
      ).not.toBeInTheDocument();
      expect(
        within(pairingsGroup()).queryByText('Suggested'),
      ).not.toBeInTheDocument();
    });

    it('keeps a Pairing the Member has filled in: it is not asked for again', async () => {
      const { user } = await titleAndSuggest({ [suggestRoute]: proposal });
      await openGuidance(user);
      await user.click(screen.getByRole('button', { name: 'Add a Pairing' }));
      await user.type(screen.getByLabelText('Label of Pairing 1'), 'Mine');
      await user.type(screen.getByLabelText('Reason for Pairing 1'), 'Because');

      await user.click(suggestButton());

      await vi.waitFor(() => expect(noteField()).toHaveValue(NOTE));
      expect(screen.getByLabelText('Label of Pairing 1')).toHaveValue('Mine');
      expect(
        screen.queryByLabelText('Label of Pairing 2'),
      ).not.toBeInTheDocument();
    });
  });
});

describe('Recipe editor shell', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const variantRoutes = {
    'GET /api/recipes/x/variant-draft': () => Response.json(draft),
    'POST /api/recipe-drafts': () =>
      Response.json({ id: 'draft-1', version: 1 }, { status: 201 }),
  };

  it('opens New Recipe on Details with Back to the Recipes, the title and Save', async () => {
    setup('/recipes/new', {});
    expect(
      await screen.findByRole('tab', { name: /^Details/ }),
    ).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'New Recipe',
    );
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute(
      'href',
      '/recipes',
    );
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    // The editor's own heading and bottom buttons are gone.
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    // Back, not Home, is the way out.
    expect(screen.queryByRole('link', { name: 'Home' })).toBeNull();
  });

  it('opens Make a Variant on Details with Back to the Recipe', async () => {
    setup('/recipes/x/variant/new', variantRoutes);
    expect(
      await screen.findByRole('tab', { name: /^Details/ }),
    ).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute(
      'href',
      '/recipes/x',
    );
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('opens Edit on Steps with Back to the Recipe and no Recipe Draft status', async () => {
    setup('/recipes/g/edit', {
      'GET /api/recipes/g/edit': () => Response.json(saved),
    });
    expect(await screen.findByRole('tab', { name: /^Steps/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute(
      'href',
      '/recipes/g',
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Edit Recipe',
    );
    expect(screen.queryByText('Draft saved')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Discard draft' })).toBeNull();
  });

  it('keeps a Suggest Guidance answer and its Suggested marks across a tab switch', async () => {
    const user = userEvent.setup({ delay: null });
    let release = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    setup('/recipes/new', {
      'POST /api/recipes/suggest-guidance': async () => {
        await gate;
        return Response.json({
          guidance: { nutritionNote: 'Rich in protein.' },
          noSuggestions: [],
        });
      },
    });
    await user.type(await screen.findByLabelText(/^Title/), 'Gran stew');
    await user.click(screen.getByRole('button', { name: 'Suggest' }));
    await screen.findByRole('button', { name: 'Suggesting…' });

    // Away while the request is in flight, and back after it lands.
    await user.click(screen.getByRole('tab', { name: /^Ingredients/ }));
    release();
    await user.click(screen.getByRole('tab', { name: /^Details/ }));

    await vi.waitFor(() =>
      expect(screen.getByLabelText('Nutrition Note')).toHaveValue(
        'Rich in protein.',
      ),
    );
    // The mark stays through another round trip.
    await user.click(screen.getByRole('tab', { name: /^Steps/ }));
    await user.click(screen.getByRole('tab', { name: /^Details/ }));
    expect(
      within(screen.getByRole('group', { name: /Nutrition Note/ })).getByText(
        'Suggested',
      ),
    ).toBeVisible();
  });

  it('keeps a Back to the Recipes when the resumed Recipe Draft cannot be read', async () => {
    setup('/recipes/new?draft=gone', {
      'GET /api/recipe-drafts/gone': () =>
        Response.json({ error: 'not_found' }, { status: 404 }),
    });
    expect(await screen.findByRole('link', { name: 'Back' })).toHaveAttribute(
      'href',
      '/recipes',
    );
  });

  it('counts Ingredients and Steps in the tab names', async () => {
    setup('/recipes/g/edit', {
      'GET /api/recipes/g/edit': () => Response.json(saved),
    });
    expect(
      await screen.findByRole('tab', { name: 'Ingredients, 2' }),
    ).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Steps, 1' })).toBeVisible();
  });

  it('marks Details with "!" while Serves is blank, and while the touched title is blank', async () => {
    const user = userEvent.setup({ delay: null });
    setup('/recipes/new', {});
    const details = await screen.findByRole('tab', { name: /^Details/ });
    await user.clear(screen.getByLabelText(/^Serves/));
    expect(details).toHaveAccessibleName('Details, Needs attention');
    await user.type(screen.getByLabelText(/^Serves/), '4');
    // An untouched blank title does not nag yet.
    expect(details).toHaveAccessibleName('Details');
    await user.click(screen.getByLabelText(/^Title/));
    await user.tab();
    expect(details).toHaveAccessibleName('Details, Needs attention');
    await user.type(screen.getByLabelText(/^Title/), 'Stew');
    expect(details).toHaveAccessibleName('Details');
  });

  it('moves between tabs with the arrow keys and scrolls to the top', async () => {
    const user = userEvent.setup({ delay: null });
    const scrollTo = vi.fn();
    vi.stubGlobal('scrollTo', scrollTo);
    setup('/recipes/new', {});
    const details = await screen.findByRole('tab', { name: /^Details/ });
    details.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: /^Ingredients/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: /^Steps/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(details).toHaveAttribute('aria-selected', 'true');
  });

  it('puts the fields in their tabs and links on with Ingredients › and Steps ›', async () => {
    const user = userEvent.setup({ delay: null });
    setup('/recipes/x/variant/new', variantRoutes);
    expect(await screen.findByLabelText(/^Title/)).toBeVisible();
    expect(
      screen.getByRole('region', { name: 'Pairings, nutrition & moments' }),
    ).toBeVisible();
    // The other tabs stay mounted but hidden.
    expect(screen.getByLabelText('Quantity of Egg')).not.toBeVisible();
    expect(screen.queryByRole('textbox', { name: 'Step 1' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Ingredients ›' }));
    expect(screen.getByRole('tab', { name: /^Ingredients/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByLabelText('Quantity of Egg')).toBeVisible();
    expect(
      screen.getByRole('combobox', { name: 'Add an ingredient' }),
    ).toBeVisible();
    expect(screen.getByLabelText(/^Title/)).not.toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Steps ›' }));
    expect(screen.getByLabelText('Step 1')).toBeVisible();
  });

  it('words the hints for a New Recipe and a Variant', async () => {
    setup('/recipes/new', {});
    expect(
      await screen.findByText(
        "Kept as your draft until you save it as one of your family's Recipes.",
      ),
    ).toBeVisible();
  });

  it('words the Variant hint with the source and no owner', async () => {
    setup('/recipes/x/variant/new', {
      ...variantRoutes,
      'GET /api/recipes/x': () =>
        Response.json({ ...sourceDetail, title: 'Classic omelette' }),
    });
    expect(
      await screen.findByText(
        'Copied from Classic omelette. It becomes a Recipe when you save it.',
      ),
    ).toBeVisible();
  });

  it('shows the Recipe Draft status under the title, not beside Save', async () => {
    const user = userEvent.setup({ delay: null });
    setup('/recipes/new', {
      'POST /api/recipe-drafts': () =>
        Response.json({ id: 'draft-1', version: 1 }, { status: 201 }),
    });
    await user.type(await screen.findByLabelText(/^Title/), 'Stew');
    const status = await within(screen.getByRole('banner')).findByRole(
      'status',
    );
    expect(
      screen.getByRole('heading', { level: 1 }).parentElement,
    ).toContainElement(status);
    expect(screen.getByRole('button', { name: 'Save' })).not.toContainElement(
      status,
    );
  });

  it('puts Discard draft at the end of Details only, once the draft exists', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({
      delay: null,
      advanceTimers: vi.advanceTimersByTime,
    });
    setup('/recipes/new', {
      'POST /api/recipe-drafts': () =>
        Response.json({ id: 'draft-1', version: 1 }, { status: 201 }),
    });
    expect(screen.queryByRole('button', { name: 'Discard draft' })).toBeNull();
    await user.type(await screen.findByLabelText(/^Title/), 'Stew');
    await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS));
    expect(
      await screen.findByRole('button', { name: 'Discard draft' }),
    ).toBeVisible();
    await user.click(screen.getByRole('tab', { name: /^Steps/ }));
    expect(screen.queryByRole('button', { name: 'Discard draft' })).toBeNull();
  });
});

describe('Recipe editor Steps (#591)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const twoSteps: FamilyRecipeEdit = {
    ...saved,
    steps: [
      { id: 's1', text: 'Whisk the eggs', timerSeconds: 90 },
      { id: 's2', text: 'Fry', timerSeconds: null },
    ],
    tips: [{ id: 't2', stepId: 's1', text: 'Low heat' }],
  };
  const edit = () =>
    setup('/recipes/g/edit', {
      'GET /api/recipes/g/edit': () => Response.json(twoSteps),
    });

  it('turns the Timer chip into a minutes field starting at 5, and back with ×', async () => {
    const user = userEvent.setup({ delay: null });
    edit();
    await openTab(user, 'Steps');
    expect(screen.getByLabelText('Timer for Step 1 (minutes)')).toHaveValue(
      '1.5',
    );
    expect(
      within(screen.getByRole('tabpanel')).getAllByText('min'),
    ).toHaveLength(1);
    await user.click(
      screen.getByRole('button', { name: 'Add a timer to Step 2' }),
    );
    const timer = screen.getByLabelText('Timer for Step 2 (minutes)');
    expect(timer).toHaveValue('5');
    expect(
      within(screen.getByRole('tabpanel')).getAllByText('min'),
    ).toHaveLength(2);
    await user.clear(timer);
    expect(screen.queryByText(/The timer must be a positive/)).toBeNull();
    await user.type(timer, 'x');
    expect(
      screen.getByText(/The timer must be a positive number of minutes/),
    ).toBeVisible();
    await user.click(
      screen.getByRole('button', { name: 'Remove the timer from Step 2' }),
    );
    expect(screen.queryByLabelText('Timer for Step 2 (minutes)')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Add a timer to Step 2' }),
    ).toBeVisible();
  });

  it('shows the placeholder and flags a touched blank Step', async () => {
    const user = userEvent.setup({ delay: null });
    edit();
    await openTab(user, 'Steps');
    expect(screen.getByLabelText('Step 2')).toHaveAttribute(
      'placeholder',
      'What to do in Step 2',
    );
    await user.clear(screen.getByLabelText('Step 2'));
    expect(screen.getByText('Enter the Step text.')).toBeVisible();
  });

  it('adds a Step at the start and at the end, focusing its text', async () => {
    const user = userEvent.setup({ delay: null });
    edit();
    await openTab(user, 'Steps');
    await user.click(screen.getByRole('button', { name: 'Add a Step' }));
    expect(screen.getByLabelText('Step 3')).toHaveFocus();
    expect(screen.getByLabelText('Step 3')).toHaveValue('');

    await user.click(
      screen.getByRole('button', { name: 'Add a Step at the start' }),
    );
    expect(screen.getByLabelText('Step 1')).toHaveFocus();
    expect(screen.getByLabelText('Step 1')).toHaveValue('');
    expect(screen.getByLabelText('Step 2')).toHaveValue('Whisk the eggs');
    expect(screen.getByLabelText('Step 4')).toHaveValue('');
  });

  it('offers only "Add the first Step" when there are no Steps', async () => {
    const user = userEvent.setup({ delay: null });
    setup('/recipes/new', {});
    await openTab(user, 'Steps');
    expect(
      screen.queryByRole('button', { name: 'Add a Step at the start' }),
    ).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add a Step' })).toBeNull();
    await user.click(
      screen.getByRole('button', { name: 'Add the first Step' }),
    );
    expect(screen.getByLabelText('Step 1')).toHaveFocus();
    expect(
      screen.queryByRole('button', { name: 'Add the first Step' }),
    ).toBeNull();
  });

  it('confirms inline before removing a saved Step with Tips, with no Undo', async () => {
    const user = userEvent.setup({ delay: null });
    edit();
    await openTab(user, 'Steps');
    await user.click(screen.getByRole('button', { name: 'Remove Step 1' }));
    expect(
      screen.getByText('Removing Step 1 deletes its 1 Tip when you save.'),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Keep Step' }));
    expect(screen.getByLabelText('Step 1')).toHaveValue('Whisk the eggs');
    await user.click(screen.getByRole('button', { name: 'Remove Step 1' }));
    await user.click(
      screen.getByRole('button', { name: 'Remove Step and Tips' }),
    );
    expect(screen.getByLabelText('Step 1')).toHaveValue('Fry');
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  });

  it('removes a Step with a polite Undo toast that restores it at its old index', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({
      delay: null,
      advanceTimers: vi.advanceTimersByTime,
    });
    edit();
    await openTab(user, 'Steps');
    await user.click(screen.getByRole('button', { name: 'Add a Step' }));
    await user.type(screen.getByLabelText('Step 3'), 'Plate');
    await user.click(screen.getByRole('button', { name: 'Remove Step 2' }));
    expect(screen.getByLabelText('Step 2')).toHaveValue('Plate');
    expect(
      screen.getByText('Removed Step 2').closest('[role="status"]'),
    ).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByLabelText('Step 2')).toHaveValue('Fry');
    expect(screen.getByLabelText('Step 3')).toHaveValue('Plate');
  });
});

describe('Recipe editor Ingredient Lines (#589)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const openLines = async (user: ReturnType<typeof userEvent.setup>) => {
    setup(newRecipeWith(sourced), {});
    await openTab(user, 'Ingredients');
    await screen.findByLabelText('Quantity of Egg');
  };

  it('shows one row per line with a subline, and the rare controls behind a closed strip', async () => {
    const user = userEvent.setup({ delay: null });
    await openLines(user);
    expect(
      screen.getByText('to serve \u00b7 Not in the Catalog'),
    ).toBeVisible();
    expect(screen.queryByLabelText('Note for Egg')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'More for Egg' }),
    ).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText(/Leave the quantity blank/)).toBeVisible();
  });

  it('outlines a bad quantity and shows the message under the row', async () => {
    const user = userEvent.setup({ delay: null });
    await openLines(user);
    const quantity = screen.getByLabelText('Quantity of Egg');
    await user.clear(quantity);
    await user.type(quantity, 'lots');
    expect(quantity).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText(/Quantity must be/)).toBeVisible();
    await user.clear(quantity);
    expect(screen.queryByText(/Quantity must be/)).toBeNull();
  });

  it('opens one strip at a time and disables the end arrows', async () => {
    const user = userEvent.setup({ delay: null });
    await openLines(user);
    const egg = screen.getByRole('button', { name: 'More for Egg' });
    await user.click(egg);
    expect(egg).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Move Egg up' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await user.click(screen.getByRole('switch', { name: 'Optional: Egg' }));
    await user.click(
      screen.getByRole('button', { name: 'More for Maple syrup' }),
    );
    expect(egg).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByLabelText('Note for Egg')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Move Maple syrup down' }),
    ).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText(/^optional/)).toBeVisible();
  });

  it('moves a line down', async () => {
    const user = userEvent.setup({ delay: null });
    await openLines(user);
    await user.click(screen.getByRole('button', { name: 'More for Egg' }));
    await user.click(screen.getByRole('button', { name: 'Move Egg down' }));
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Maple syrup');
    expect(items[1]).toHaveTextContent('Egg');
  });

  it('removes a line with a polite Undo toast that restores it at its old index and ends with the window', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await openLines(user);
    await user.click(screen.getByRole('button', { name: 'More for Egg' }));
    await user.click(screen.getByRole('button', { name: 'Remove Egg' }));
    expect(screen.queryByLabelText('Quantity of Egg')).toBeNull();
    expect(
      (await screen.findByText('Removed Egg')).closest('[role="status"]'),
    ).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Egg');
    expect(screen.getByLabelText('Quantity of Egg')).toHaveValue('2');

    await user.click(screen.getByRole('button', { name: 'More for Egg' }));
    await user.click(screen.getByRole('button', { name: 'Remove Egg' }));
    await screen.findByText('Removed Egg');
    await act(() => vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS + 500));
    await waitFor(() => expect(screen.queryByText('Removed Egg')).toBeNull());
  });

  it("shows the Family pill on a saved line whose Ingredient is the Family's own", async () => {
    const user = userEvent.setup({ delay: null });
    setup('/recipes/g/edit', {
      'GET /api/recipes/g/edit': () => Response.json(saved),
      'GET /api/catalog/family': () =>
        Response.json({
          ingredients: [{ id: 'egg', name: 'Egg' }],
          synonyms: [],
        }),
    });
    await openTab(user, 'Ingredients');
    const row = (await screen.findByLabelText('Quantity of Egg')).closest(
      'li',
    )!;
    expect(await within(row).findByText('Family')).toBeVisible();
  });

  it('links the bad-quantity message to the input', async () => {
    const user = userEvent.setup({ delay: null });
    setup(newRecipeWith(sourced), {});
    await openTab(user, 'Ingredients');
    const quantity = await screen.findByLabelText('Quantity of Egg');
    await user.clear(quantity);
    await user.type(quantity, 'lots');
    expect(quantity).toHaveAccessibleDescription(/Quantity must be/);
  });

  it('closes the Undo toast when the page unmounts', async () => {
    const user = userEvent.setup({ delay: null });
    setup('/recipes/g/edit', {
      'GET /api/recipes/g/edit': () => Response.json(saved),
    });
    await openTab(user, 'Ingredients');
    await user.click(
      await screen.findByRole('button', { name: 'More for Egg' }),
    );
    await user.click(screen.getByRole('button', { name: 'Remove Egg' }));
    await screen.findByText('Removed Egg');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    try {
      await user.click(screen.getByRole('link', { name: 'Back' }));
      expect(await screen.findByText('Detail of the recipe')).toBeVisible();
      await waitFor(() => expect(screen.queryByText('Removed Egg')).toBeNull());
    } finally {
      confirm.mockRestore();
    }
  });
});

describe('Recipe editor Tips (#593)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const withTips: FamilyRecipeEdit = {
    ...saved,
    steps: [
      { id: 's1', text: 'Whisk the eggs', timerSeconds: null },
      { id: 's2', text: 'Fry', timerSeconds: null },
    ],
    tips: [
      { id: 't1', stepId: null, text: 'Use butter' },
      { id: 't2', stepId: 's1', text: 'Low heat' },
    ],
  };
  const edit = (routes: Parameters<typeof stubApi>[0] = {}) =>
    setup('/recipes/g/edit', {
      'GET /api/recipes/g/edit': () => Response.json(withTips),
      ...routes,
    });
  const tipCalls = (calls: ReturnType<typeof setup>) =>
    calls.filter((c) => /\/tips|hidden-tips/.test(c.key));

  it('adds a Tip under its Step from the Tip chip and saves it on blur', async () => {
    const user = userEvent.setup({ delay: null });
    const calls = edit({
      'POST /api/recipes/g/tips': () => Response.json({}, { status: 201 }),
    });
    await openTab(user, 'Steps');
    await user.click(
      screen.getByRole('button', { name: 'Add a Tip to Step 2' }),
    );
    const input = screen.getByLabelText('New Tip for Step 2');
    expect(input).toHaveFocus();
    await user.type(input, 'Do not stir');
    expect(tipCalls(calls)).toHaveLength(0);
    await user.tab();
    await vi.waitFor(() =>
      expect(
        calls.find((c) => c.key === 'POST /api/recipes/g/tips')?.body,
      ).toEqual({ text: 'Do not stir', stepId: 's2' }),
    );
  });

  it('drops an empty new Tip row on blur without a request', async () => {
    const user = userEvent.setup({ delay: null });
    const calls = edit();
    await openTab(user, 'Steps');
    await user.click(
      screen.getByRole('button', { name: 'Add a Tip to Step 2' }),
    );
    await user.tab();
    expect(screen.queryByLabelText('New Tip for Step 2')).toBeNull();
    expect(tipCalls(calls)).toHaveLength(0);
  });

  it('saves a changed Tip on blur, and only when it changed', async () => {
    const user = userEvent.setup({ delay: null });
    const calls = edit({
      'PATCH /api/recipes/g/tips/t2': () => Response.json({}),
    });
    await openTab(user, 'Steps');
    const input = screen.getByLabelText('Tip 1 of Step 1');
    expect(input).toHaveValue('Low heat');
    await user.click(input);
    await user.tab();
    expect(tipCalls(calls)).toHaveLength(0);
    await user.type(input, ' please');
    await user.tab();
    await vi.waitFor(() =>
      expect(
        calls.find((c) => c.key === 'PATCH /api/recipes/g/tips/t2')?.body,
      ).toEqual({ text: 'Low heat please' }),
    );
  });

  it('keeps a Tip with its Step when the Steps are reordered', async () => {
    const user = userEvent.setup({ delay: null });
    edit();
    await openTab(user, 'Steps');
    await user.click(screen.getByRole('button', { name: 'Move Step 1 down' }));
    expect(screen.getByLabelText('Step 2')).toHaveValue('Whisk the eggs');
    expect(screen.getByLabelText('Tip 1 of Step 2')).toHaveValue('Low heat');
    expect(screen.queryByLabelText('Tip 1 of Step 1')).toBeNull();
  });

  it('deletes a Tip only when the Undo window ends', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({
      delay: null,
      advanceTimers: vi.advanceTimersByTime,
    });
    const calls = edit({
      'DELETE /api/recipes/g/tips/t2': () =>
        new Response(null, { status: 204 }),
    });
    await openTab(user, 'Steps');
    await user.click(
      screen.getByRole('button', { name: 'Delete Tip 1 of Step 1' }),
    );
    expect(screen.queryByLabelText('Tip 1 of Step 1')).toBeNull();
    expect(
      screen.getByText('Tip deleted').closest('[role="status"]'),
    ).not.toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS - 100));
    expect(tipCalls(calls)).toHaveLength(0);
    await act(() => vi.advanceTimersByTimeAsync(1000));
    await vi.waitFor(() =>
      expect(calls.some((c) => c.key === 'DELETE /api/recipes/g/tips/t2')).toBe(
        true,
      ),
    );
  });

  it('cancels the delete when Undo is pressed', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({
      delay: null,
      advanceTimers: vi.advanceTimersByTime,
    });
    const calls = edit();
    await openTab(user, 'Steps');
    await user.click(
      screen.getByRole('button', { name: 'Delete Tip 1 of Step 1' }),
    );
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByLabelText('Tip 1 of Step 1')).toHaveValue('Low heat');
    await act(() => vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS + 1000));
    expect(tipCalls(calls)).toHaveLength(0);
  });

  it('shows a Tip under the Step tool row, with a placeholder when new', async () => {
    const user = userEvent.setup({ delay: null });
    edit();
    await openTab(user, 'Steps');
    const tool = screen.getByRole('button', { name: 'Add a Tip to Step 1' });
    const tip = screen.getByLabelText('Tip 1 of Step 1');
    expect(
      tool.compareDocumentPosition(tip) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    await user.click(tool);
    expect(screen.getByLabelText('New Tip for Step 1')).toHaveAttribute(
      'placeholder',
      'A tip for this step',
    );
  });

  it('reports a failed Tip delete once, as one toast, not also an Alert', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({
      delay: null,
      advanceTimers: vi.advanceTimersByTime,
    });
    edit({
      'DELETE /api/recipes/g/tips/t2': () =>
        Response.json({ error: 'boom' }, { status: 500 }),
    });
    await openTab(user, 'Steps');
    await user.click(
      screen.getByRole('button', { name: 'Delete Tip 1 of Step 1' }),
    );
    await act(() => vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS + 1000));
    await vi.waitFor(() =>
      expect(screen.getByLabelText('Tip 1 of Step 1')).toBeVisible(),
    );
    expect(
      screen.getAllByText('Something went wrong. Please try again.'),
    ).toHaveLength(1);
  });

  it('holds the Recipe tips in a card, with the Base Recipe Tips as toggles', async () => {
    const user = userEvent.setup({ delay: null });
    const calls = edit({
      'POST /api/recipes/g/tips': () => Response.json({}, { status: 201 }),
      'PUT /api/recipes/g/hidden-tips': () => Response.json(withTips),
    });
    await openTab(user, 'Steps');
    expect(
      screen.getByText(
        'Tips save as soon as you change them; the rest saves with the Recipe.',
      ),
    ).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Tips' })).toBeNull();
    const card = screen.getByRole('region', { name: 'Recipe tips' });
    expect(within(card).getByLabelText('Recipe Tip 1')).toHaveValue(
      'Use butter',
    );
    expect(within(card).getByLabelText('Recipe Tip 1')).toHaveAttribute(
      'placeholder',
      'A tip for this recipe',
    );
    await user.click(
      within(card).getByRole('button', { name: 'Add a Recipe Tip' }),
    );
    await user.type(within(card).getByLabelText('New Recipe Tip'), 'Rest it');
    await user.tab();
    await vi.waitFor(() =>
      expect(
        calls.find((c) => c.key === 'POST /api/recipes/g/tips')?.body,
      ).toEqual({ text: 'Rest it', stepId: null }),
    );
    await user.click(
      within(card).getByRole('checkbox', { name: 'Show: Nonstick pan' }),
    );
    await vi.waitFor(() =>
      expect(
        calls.find((c) => c.key === 'PUT /api/recipes/g/hidden-tips')?.body,
      ).toEqual({ tipIds: ['bt1'] }),
    );
  });

  it('shows the copied Tip count on a Variant Step, with the hint', async () => {
    const user = userEvent.setup({ delay: null });
    setup('/recipes/x/variant/new', {
      'GET /api/recipes/x/variant-draft': () =>
        Response.json({
          ...draft,
          steps: [
            { text: 'Whisk', timerSeconds: null },
            { text: 'Fry', timerSeconds: null },
          ],
          tips: [
            { stepIndex: 0, text: 'A' },
            { stepIndex: 0, text: 'B' },
            { stepIndex: 1, text: 'C' },
          ],
        }),
    });
    await openTab(user, 'Steps');
    expect(await screen.findByText('2 tips')).toBeVisible();
    expect(screen.getByText('1 tip')).toBeVisible();
    expect(
      screen.getByText(
        'Copied tips stay with their steps; add your own after saving the Variant.',
      ),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: /Tip to Step/ })).toBeNull();
  });

  it('keeps the New Recipe hint about adding Tips after saving', async () => {
    const user = userEvent.setup({ delay: null });
    setup('/recipes/new', {});
    await openTab(user, 'Steps');
    expect(
      screen.getByText('Add tips to steps after saving the Recipe.'),
    ).toBeVisible();
  });
});

describe('Recipe editor reorder by hold, grip or keyboard (#592)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const twoSteps: FamilyRecipeEdit = {
    ...saved,
    steps: [
      { id: 's1', text: 'Whisk the eggs', timerSeconds: null },
      { id: 's2', text: 'Fry', timerSeconds: null },
    ],
    tips: [{ id: 't2', stepId: 's1', text: 'Low heat' }],
  };
  const edit = () =>
    setup('/recipes/g/edit', {
      'GET /api/recipes/g/edit': () => Response.json(twoSteps),
      'PUT /api/recipes/g': () => Response.json(twoSteps),
    });

  const pickUpAndMoveDown = async (
    user: ReturnType<typeof userEvent.setup>,
    grip: HTMLElement,
  ) => {
    grip.focus();
    await user.keyboard(' ');
    await user.keyboard('{ArrowDown}');
    await user.keyboard(' ');
  };

  it('reorders a line with the keyboard, announces it, and saves the new order', async () => {
    stubRowLayout();
    const user = userEvent.setup({ delay: null });
    const calls = edit();
    await openTab(user, 'Ingredients');
    await screen.findByLabelText('Quantity of Egg');
    await pickUpAndMoveDown(
      user,
      screen.getByRole('button', { name: 'Move Egg' }),
    );
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Gran’s herbs');
    expect(items[1]).toHaveTextContent('Egg');
    expect(document.body).toHaveTextContent('Egg dropped at position 2 of 2.');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Recipe saved.');
    const put = calls.find((c) => c.key === 'PUT /api/recipes/g')!;
    expect(
      (put.body as { lines: { id: string }[] }).lines.map((l) => l.id),
    ).toEqual(['l2', 'l1']);
  });

  it('reorders a Step with the keyboard keeping its id and Tip, and saves the order', async () => {
    stubRowLayout();
    const user = userEvent.setup({ delay: null });
    const calls = edit();
    await openTab(user, 'Steps');
    await pickUpAndMoveDown(
      user,
      screen.getByRole('button', { name: 'Move Step 1' }),
    );
    expect(screen.getByLabelText('Step 1')).toHaveValue('Fry');
    expect(screen.getByLabelText('Step 2')).toHaveValue('Whisk the eggs');
    expect(screen.getByLabelText('Tip 1 of Step 2')).toHaveValue('Low heat');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Recipe saved.');
    const put = calls.find((c) => c.key === 'PUT /api/recipes/g')!;
    expect(
      (put.body as { steps: { id: string }[] }).steps.map((s) => s.id),
    ).toEqual(['s2', 's1']);
  });

  it('describes each row as "Hold to move"', async () => {
    const user = userEvent.setup({ delay: null });
    edit();
    await openTab(user, 'Steps');
    const row = screen.getByLabelText('Step 1').closest('li')!;
    expect(row).toHaveAccessibleDescription('Hold to move');
  });

  it('lifts a row held for 500 ms and not one held on the quantity input', async () => {
    stubRowLayout();
    edit();
    await openTab(userEvent.setup({ delay: null }), 'Ingredients');
    const quantity = await screen.findByLabelText('Quantity of Egg');
    vi.useFakeTimers();
    const row = quantity.closest('li')!;
    const press = (target: Element) =>
      fireEvent.pointerDown(target, {
        pointerId: 1,
        isPrimary: true,
        button: 0,
        clientX: 10,
        clientY: 10,
      });

    press(quantity);
    await act(() => vi.advanceTimersByTimeAsync(600));
    expect(row).not.toHaveAttribute('data-lifted');
    fireEvent.pointerUp(quantity, { pointerId: 1 });

    press(screen.getByRole('button', { name: 'Move Egg' }));
    await act(() => vi.advanceTimersByTimeAsync(10));
    expect(row).toHaveAttribute('data-lifted');
    fireEvent.pointerUp(document, { pointerId: 1 });
    press(row.querySelector('p')!);
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(row).not.toHaveAttribute('data-lifted');
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(row).toHaveAttribute('data-lifted');
    fireEvent.pointerUp(document, { pointerId: 1 });
    // dnd-kit swallows clicks for 50 ms after a drop.
    await act(() => vi.advanceTimersByTimeAsync(100));
    expect(row).not.toHaveAttribute('data-lifted');
  });

  it('lifts a touch hold on the row body, but not a touch on a control or a touch pointer', async () => {
    stubRowLayout();
    edit();
    await openTab(userEvent.setup({ delay: null }), 'Ingredients');
    const quantity = await screen.findByLabelText('Quantity of Egg');
    const row = quantity.closest('li')!;
    vi.useFakeTimers();
    const point = { clientX: 10, clientY: 10 };

    fireEvent.pointerDown(row.querySelector('p')!, {
      pointerId: 2,
      isPrimary: true,
      button: 0,
      pointerType: 'touch',
      ...point,
    });
    await act(() => vi.advanceTimersByTimeAsync(600));
    expect(row).not.toHaveAttribute('data-lifted');
    fireEvent.pointerUp(row.querySelector('p')!, { pointerId: 2 });

    fireEvent.touchStart(quantity, { touches: [point] });
    await act(() => vi.advanceTimersByTimeAsync(600));
    expect(row).not.toHaveAttribute('data-lifted');
    fireEvent.touchEnd(quantity, { changedTouches: [point] });

    const body = row.querySelector('p')!;
    fireEvent.touchStart(body, { touches: [point] });
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(row).not.toHaveAttribute('data-lifted');
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(row).toHaveAttribute('data-lifted');
    fireEvent.touchEnd(body, { changedTouches: [point] });
    // dnd-kit swallows clicks for 50 ms after a drop.
    await act(() => vi.advanceTimersByTimeAsync(100));
    expect(row).not.toHaveAttribute('data-lifted');
  });
});

describe('Details basics of the editor', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('replaces the hint with "Enter a title." once a blank title is left', async () => {
    const user = userEvent.setup({ delay: null });
    setup('/recipes/new', {});
    const title = await screen.findByPlaceholderText('Recipe title');
    expect(screen.queryByText('Enter a title.')).not.toBeInTheDocument();
    await user.click(title);
    await user.tab();
    expect(screen.getByText('Enter a title.')).toBeVisible();
    expect(title).toHaveAccessibleDescription('Enter a title.');
    expect(
      screen.queryByText(/Kept as your draft until you save/),
    ).not.toBeInTheDocument();
    await user.type(title, 'Stew');
    expect(screen.queryByText('Enter a title.')).not.toBeInTheDocument();
    expect(screen.getByText(/Kept as your draft until you save/)).toBeVisible();
  });

  it('cycles Level through Not set, Easy, Medium and Hard, and saves the picked one', async () => {
    const user = userEvent.setup({ delay: null });
    const calls = setup('/recipes/new', {
      'POST /api/recipes': () => Response.json(saved, { status: 201 }),
    });
    await user.type(await screen.findByLabelText(/^Title/), 'Gran stew');
    await user.type(screen.getByLabelText(/^Serves/), '4');
    const level = (value: string) =>
      screen.getByRole('button', { name: `Level: ${value}. Tap to change` });
    await user.click(level('Not set'));
    await user.click(level('Easy'));
    await user.click(level('Medium'));
    expect(level('Hard')).toBeVisible();
    await user.click(level('Hard'));
    expect(level('Not set')).toBeVisible();
    await user.click(level('Not set'));
    await user.click(level('Easy'));
    await user.click(level('Medium'));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Detail of the recipe');
    const post = calls.find((c) => c.key === 'POST /api/recipes');
    expect(post?.body).toMatchObject({ difficulty: 'hard' });
  });

  it('requires Serves: says so under the strip and outlines the cell', async () => {
    const user = userEvent.setup({ delay: null });
    setup('/recipes/new', {});
    const serves = await screen.findByLabelText(/^Serves/);
    expect(serves).toHaveValue('4');
    expect(screen.queryByText('Enter how many it serves.')).toBeNull();
    await user.clear(serves);
    expect(screen.getByText('Enter how many it serves.')).toBeVisible();
    expect(serves).toHaveAttribute('aria-invalid', 'true');
    expect(serves).toHaveAccessibleDescription('Enter how many it serves.');
    await user.type(serves, '4');
    expect(
      screen.queryByText('Enter how many it serves.'),
    ).not.toBeInTheDocument();
    expect(serves).not.toHaveAttribute('aria-invalid');
  });

  it('shows one facts message at a time, for the first offending cell', async () => {
    const user = userEvent.setup({ delay: null });
    setup('/recipes/new', {});
    const serves = await screen.findByLabelText(/^Serves/);
    await user.clear(serves);
    await user.type(serves, '0');
    await user.type(screen.getByLabelText(/^Prep/), 'x');
    await user.type(screen.getByLabelText(/^Cook/), 'y');
    expect(
      screen.getByText('Servings must be a whole number from 1 to 1000.'),
    ).toBeVisible();
    expect(
      screen.queryByText('Minutes must be a whole number, or blank.'),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^Serves/)).toHaveAccessibleDescription(
      'Servings must be a whole number from 1 to 1000.',
    );
    expect(screen.getByLabelText(/^Prep/)).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(screen.getByLabelText(/^Prep/)).not.toHaveAccessibleDescription();
    // Only the cell that owns the message is outlined.
    expect(screen.getByLabelText(/^Serves/).closest('label')).toHaveAttribute(
      'data-invalid',
      'true',
    );
    expect(screen.getByLabelText(/^Prep/).closest('label')).not.toHaveAttribute(
      'data-invalid',
    );
    await user.clear(screen.getByLabelText(/^Serves/));
    await user.type(screen.getByLabelText(/^Serves/), '2');
    expect(screen.getByLabelText(/^Prep/).closest('label')).toHaveAttribute(
      'data-invalid',
      'true',
    );
    expect(
      screen.getByText('Minutes must be a whole number, or blank.'),
    ).toBeVisible();
    expect(screen.getByLabelText(/^Prep/)).toHaveAccessibleDescription(
      'Minutes must be a whole number, or blank.',
    );
  });
});

describe('Unmatched line: Add to your catalog from the ⌄ strip (#598)', () => {
  afterEach(() => vi.unstubAllGlobals());

  const kombucha = {
    owner: 'family',
    amountScale: 'medium',
    id: 'k1',
    name: 'Kombucha',
    defaultUnit: 'ml',
    leafCategory: { id: 'tea', name: 'Tea' },
    parentCategory: {
      id: 'drinks',
      name: 'Drinks',
      aisle: { id: 'a1', name: 'Drinks' },
    },
    defaults: { expiryDays: 30, location: 'fridge' },
  };
  const routes = (extra: Parameters<typeof stubApi>[0] = {}) => ({
    'GET /api/catalog/search': () => Response.json({ results: [] }),
    'GET /api/catalog/allergens': () => Response.json({ allergens: [] }),
    'GET /api/catalog/categories': () =>
      Response.json({
        categories: [
          {
            id: 'tea',
            name: 'Tea',
            parentCategory: { id: 'drinks', name: 'Drinks' },
            aisle: { id: 'a1', name: 'Drinks' },
            defaults: { expiryDays: null, location: null },
          },
        ],
      }),
    'POST /api/catalog/family-ingredients': () =>
      Response.json(kombucha, { status: 201 }),
    'POST /api/recipes': () => Response.json(saved, { status: 201 }),
    ...extra,
  });

  async function unmatchedLine(user: ReturnType<typeof userEvent.setup>) {
    await user.type(await screen.findByLabelText(/^Title/), 'Gran stew');
    await openTab(user, 'Ingredients');
    await user.type(
      screen.getByRole('combobox', { name: 'Add an ingredient' }),
      'Kombucha',
    );
    await user.click(
      await screen.findByRole('option', { name: /Kombucha” as typed/ }),
    );
    await user.type(await screen.findByLabelText('Quantity of Kombucha'), '2');
    await user.click(screen.getByRole('button', { name: /More for Kombucha/ }));
    await user.type(screen.getByLabelText('Note for Kombucha'), 'chilled');
    await user.click(screen.getByLabelText('Optional: Kombucha'));
  }
  const addButton = () =>
    screen.getByRole('button', { name: 'Add “Kombucha” to your catalog' });

  it('turns the line into the new Family Ingredient in place, keeping quantity, note and Optional', async () => {
    stubViewport(1024);
    const user = userEvent.setup({ delay: null });
    const calls = setup('/recipes/new', routes());
    await unmatchedLine(user);
    expect(screen.getByText(/Not in the Catalog/)).toBeVisible();

    await user.click(addButton());
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText(/^Name/)).toHaveValue('Kombucha');
    await user.click(
      await within(dialog).findByRole('option', { name: /Tea/ }),
    );
    await user.click(
      within(dialog).getByRole('button', { name: /^Add & pick/ }),
    );

    await vi.waitFor(() =>
      expect(screen.queryByText(/Not in the Catalog/)).not.toBeInTheDocument(),
    );
    expect(
      within(screen.getByRole('listitem')).getByText('Family'),
    ).toBeVisible();
    expect(screen.getAllByLabelText(/^Quantity of /)).toHaveLength(1);
    await vi.waitFor(() =>
      expect(screen.getByLabelText('Quantity of Kombucha')).toHaveFocus(),
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() =>
      expect(
        calls.find((c) => c.key === 'POST /api/recipes')?.body,
      ).toMatchObject({
        lines: [
          {
            ingredientId: 'k1',
            quantity: 2,
            note: 'chilled',
            optional: true,
          },
        ],
      }),
    );
  });

  it('leaves the line Unmatched when the sheet is cancelled', async () => {
    stubViewport(1024);
    const user = userEvent.setup({ delay: null });
    const calls = setup('/recipes/new', routes());
    await unmatchedLine(user);

    await user.click(addButton());
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText(/Not in the Catalog/)).toBeVisible();
    await vi.waitFor(() => expect(addButton()).toHaveFocus());
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() =>
      expect(
        calls.find((c) => c.key === 'POST /api/recipes')?.body,
      ).toMatchObject({ lines: [{ ingredientId: null, rawName: 'Kombucha' }] }),
    );
  });

  it('on Edit, Save updates the line in place, keeping its id', async () => {
    stubViewport(1024);
    const user = userEvent.setup({ delay: null });
    const calls = setup(
      '/recipes/g/edit',
      routes({
        'GET /api/recipes/g/edit': () => Response.json(saved),
        'PUT /api/recipes/g': () => Response.json(saved),
      }),
    );
    await openTab(user, 'Ingredients');
    await user.click(
      await screen.findByRole('button', { name: /More for Gran’s herbs/ }),
    );
    await user.click(
      screen.getByRole('button', {
        name: 'Add “Gran’s herbs” to your catalog',
      }),
    );
    const dialog = await screen.findByRole('dialog');
    await user.click(
      await within(dialog).findByRole('option', { name: /Tea/ }),
    );
    await user.click(
      within(dialog).getByRole('button', { name: /^Add & pick/ }),
    );
    await vi.waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() =>
      expect(
        calls.find((c) => c.key === 'PUT /api/recipes/g')?.body,
      ).toMatchObject({
        lines: [
          { id: 'l1', ingredientId: 'egg' },
          { id: 'l2', ingredientId: 'k1', rawName: null },
        ],
      }),
    );
  });
});

describe('Unmatched line: Add to your catalog on a phone (#598)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('adds through the Sheet, and a hold inside the Sheet does not lift the line behind it', async () => {
    stubRowLayout();
    const user = userEvent.setup({ delay: null });
    const calls = setup('/recipes/new', {
      'GET /api/catalog/search': () => Response.json({ results: [] }),
      'GET /api/catalog/allergens': () => Response.json({ allergens: [] }),
      'GET /api/catalog/categories': () =>
        Response.json({
          categories: [
            {
              id: 'tea',
              name: 'Tea',
              parentCategory: { id: 'drinks', name: 'Drinks' },
              aisle: { id: 'a1', name: 'Drinks' },
              defaults: { expiryDays: null, location: null },
            },
          ],
        }),
      'POST /api/catalog/family-ingredients': () =>
        Response.json(
          {
            owner: 'family',
            amountScale: 'medium',
            id: 'k1',
            name: 'Kombucha',
            defaultUnit: 'ml',
            leafCategory: { id: 'tea', name: 'Tea' },
            parentCategory: {
              id: 'drinks',
              name: 'Drinks',
              aisle: { id: 'a1', name: 'Drinks' },
            },
            defaults: { expiryDays: 30, location: 'fridge' },
          },
          { status: 201 },
        ),
      'POST /api/recipes': () => Response.json(saved, { status: 201 }),
    });
    await user.type(await screen.findByLabelText(/^Title/), 'Gran stew');
    await openTab(user, 'Ingredients');
    await user.type(
      screen.getByRole('combobox', { name: 'Add an ingredient' }),
      'Kombucha',
    );
    await user.click(
      await screen.findByRole('option', { name: /Kombucha” as typed/ }),
    );
    await user.click(screen.getByRole('button', { name: /More for Kombucha/ }));
    await user.click(
      screen.getByRole('button', { name: 'Add “Kombucha” to your catalog' }),
    );
    const dialog = await screen.findByRole('dialog');
    const option = await within(dialog).findByRole('option', { name: /Tea/ });
    const row = screen.getByLabelText('Quantity of Kombucha').closest('li')!;

    vi.useFakeTimers();
    fireEvent.pointerDown(option, {
      pointerId: 1,
      isPrimary: true,
      button: 0,
      clientX: 10,
      clientY: 10,
    });
    await act(() => vi.advanceTimersByTimeAsync(700));
    expect(row).not.toHaveAttribute('data-lifted');
    fireEvent.pointerUp(document, { pointerId: 1 });
    vi.useRealTimers();

    await user.click(option);
    await user.click(
      within(dialog).getByRole('button', { name: /^Add & pick/ }),
    );
    await vi.waitFor(() =>
      expect(screen.queryByText(/Not in the Catalog/)).not.toBeInTheDocument(),
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() =>
      expect(
        calls.find((c) => c.key === 'POST /api/recipes')?.body,
      ).toMatchObject({ lines: [{ ingredientId: 'k1' }] }),
    );
  });
});

describe('Guidance card (#594)', () => {
  afterEach(() => vi.unstubAllGlobals());

  const suggestRoute = 'POST /api/recipes/suggest-guidance';

  it('starts collapsed and counts what is set in its subline', async () => {
    const user = userEvent.setup({ delay: null });
    setup('/recipes/new', {});
    await screen.findByLabelText(/^Title/);
    expect(guidanceToggle()).toHaveAttribute('aria-expanded', 'false');
    expect(guidanceToggle()).toHaveTextContent('Optional');
    expect(screen.getByLabelText('Nutrition Note')).not.toBeVisible();

    await openGuidance(user);
    expect(guidanceToggle()).toHaveAttribute('aria-expanded', 'true');
    await user.type(screen.getByLabelText('Nutrition Note'), 'Hearty');
    expect(guidanceToggle()).toHaveTextContent('1 set · optional');
    await user.click(
      screen.getByRole('button', { name: 'Breakfast: not set' }),
    );
    expect(guidanceToggle()).toHaveTextContent('2 set · optional');
    await user.click(screen.getByRole('button', { name: 'Add a Pairing' }));
    await user.type(screen.getByLabelText('Label of Pairing 1'), 'Toast');
    await user.type(screen.getByLabelText('Reason for Pairing 1'), 'Crisp');
    expect(guidanceToggle()).toHaveTextContent('3 set · optional');
    await user.clear(screen.getByLabelText('Nutrition Note'));
    expect(guidanceToggle()).toHaveTextContent('2 set · optional');
  });

  it('says Guidance is never read from the page on a Recipe from a link', async () => {
    setup(
      newRecipeWith({
        ...sourced,
        sourceLink: 'https://www.example.com/tortilla',
      }),
      {},
    );
    await screen.findByLabelText(/^Title/);
    expect(guidanceToggle()).toHaveTextContent(
      'Optional · never read from the page',
    );
  });

  it('asks from the collapsed row, which expands the card and fills only what is empty', async () => {
    const user = userEvent.setup({ delay: null });
    setup('/recipes/new', {
      [suggestRoute]: () =>
        Response.json({
          guidance: { nutritionNote: 'Light.' },
          noSuggestions: ['pairings', 'eatingMoments'],
        }),
    });
    await user.type(await screen.findByLabelText(/^Title/), 'Gran stew');
    expect(guidanceToggle()).toHaveAttribute('aria-expanded', 'false');

    await user.click(screen.getByRole('button', { name: 'Suggest' }));

    await vi.waitFor(() =>
      expect(screen.getByLabelText('Nutrition Note')).toHaveValue('Light.'),
    );
    expect(guidanceToggle()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByText('Nothing to suggest')).toHaveLength(2);
    expect(guidanceToggle()).toHaveTextContent('1 set · optional');
  });

  it('cycles an Eating Moment chip Good for, Avoid, cleared, and sends it on save', async () => {
    const user = userEvent.setup({ delay: null });
    const calls = setup('/recipes/new', {
      'POST /api/recipe-drafts': () =>
        Response.json({ id: 'draft-1', version: 1 }, { status: 201 }),
      'POST /api/recipes': () => Response.json(saved, { status: 201 }),
    });
    await user.type(await screen.findByLabelText(/^Title/), 'Gran stew');
    await openGuidance(user);
    const chip = (state: string) =>
      screen.getByRole('button', { name: `Breakfast: ${state}` });

    await user.click(chip('not set'));
    expect(chip('Good for')).toHaveAttribute('aria-pressed', 'true');
    await user.type(screen.getByLabelText('Reason for Breakfast'), 'Quick');
    await user.click(chip('Good for'));
    expect(chip('Avoid')).toBeVisible();
    await user.click(chip('Avoid'));
    expect(chip('not set')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByLabelText('Reason for Breakfast')).toBeNull();

    // Back to Avoid with a reason, then save.
    await user.click(chip('not set'));
    await user.click(chip('Good for'));
    await user.type(screen.getByLabelText('Reason for Breakfast'), 'Too heavy');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await vi.waitFor(() =>
      expect(
        calls.find((c) => c.key === 'POST /api/recipes')?.body,
      ).toMatchObject({
        guidance: {
          eatingMoments: [
            { eatingMomentId: 'em1', polarity: 'avoid', reason: 'Too heavy' },
          ],
        },
      }),
    );
  });

  it('shows on the collapsed row why Save is disabled, and flags the Details tab', async () => {
    const user = userEvent.setup({ delay: null });
    setup('/recipes/new', {});
    await user.type(await screen.findByLabelText(/^Title/), 'Tortilla');
    await openGuidance(user);
    await user.click(screen.getByRole('button', { name: 'Add a Pairing' }));
    await user.click(guidanceToggle());
    expect(guidanceToggle()).toHaveAttribute('aria-expanded', 'false');
    expect(guidanceToggle()).toHaveTextContent('Fix before saving');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

    await user.click(screen.getByRole('tab', { name: /^Ingredients/ }));
    expect(
      screen.getByRole('tab', { name: /^Details, .*attention/i }),
    ).toBeInTheDocument();
  });

  it('keeps focus on the row when Suggest fills the last empty fields', async () => {
    const user = userEvent.setup({ delay: null });
    setup('/recipes/new', {
      [suggestRoute]: () =>
        Response.json({
          guidance: {
            nutritionNote: 'Light.',
            pairings: [
              {
                kind: 'food',
                label: 'Toast',
                reason: 'Crisp',
                linkType: 'none',
                linkTarget: '',
              },
            ],
            eatingMoments: [
              { eatingMomentId: 'em1', polarity: 'good_for', reason: 'Easy' },
            ],
          },
          noSuggestions: [],
        }),
    });
    await user.type(await screen.findByLabelText(/^Title/), 'Tortilla');
    await user.click(screen.getByRole('button', { name: 'Suggest' }));
    await screen.findByText('Toast');
    expect(
      screen.queryByRole('button', { name: 'Suggest' }),
    ).not.toBeInTheDocument();
    expect(guidanceToggle()).toHaveFocus();
  });

  it('does not rotate the chevron when the Member prefers reduced motion', async () => {
    const user = userEvent.setup({ delay: null });
    stubMatchMedia((query) => query.includes('prefers-reduced-motion'));
    setup('/recipes/new', {});
    await screen.findByLabelText(/^Title/);
    await openGuidance(user);
    const chevron = guidanceToggle().querySelector(
      '[aria-hidden]',
    ) as HTMLElement;
    expect(getComputedStyle(chevron).transform).not.toContain('180');
  });

  it('rotates the chevron when the Member has not asked for reduced motion', async () => {
    const user = userEvent.setup({ delay: null });
    setup('/recipes/new', {});
    await screen.findByLabelText(/^Title/);
    await openGuidance(user);
    const chevron = guidanceToggle().querySelector(
      '[aria-hidden]',
    ) as HTMLElement;
    expect(getComputedStyle(chevron).transform).toContain('180');
  });
});

describe('Edit leave guard (#596)', () => {
  let confirm: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  });
  afterEach(() => {
    confirm.mockRestore();
    vi.unstubAllGlobals();
  });

  const edit = () =>
    setup('/recipes/g/edit', {
      'GET /api/recipes/g/edit': () =>
        Response.json({
          ...saved,
          tips: [{ id: 't2', stepId: 's1', text: 'Low heat' }],
        }),
      'PUT /api/recipes/g': () => Response.json(saved),
      'PATCH /api/recipes/g/tips/t2': () => Response.json({}),
    });
  const goBack = (user: ReturnType<typeof userEvent.setup>) =>
    user.click(screen.getByRole('link', { name: /Back/ }));
  const retitle = async () =>
    fireEvent.change(await screen.findByLabelText(/^Title/), {
      target: { value: 'Better omelette' },
    });

  it('does not ask when nothing changed', async () => {
    const user = userEvent.setup({ delay: null });
    edit();
    await screen.findByLabelText(/^Title/);
    await goBack(user);
    expect(await screen.findByText('Detail of the recipe')).toBeInTheDocument();
    expect(confirm).not.toHaveBeenCalled();
  });

  it('asks after a title change: cancel stays, confirm leaves', async () => {
    const user = userEvent.setup({ delay: null });
    edit();
    await retitle();
    await goBack(user);
    expect(confirm).toHaveBeenCalledWith('Discard your changes?');
    expect(screen.queryByText('Detail of the recipe')).toBeNull();
    confirm.mockReturnValue(true);
    await goBack(user);
    expect(await screen.findByText('Detail of the recipe')).toBeInTheDocument();
  });

  it('asks after a Guidance change', async () => {
    const user = userEvent.setup({ delay: null });
    edit();
    await openTab(user, 'Details');
    await openGuidance(user);
    fireEvent.change(await screen.findByLabelText('Nutrition Note'), {
      target: { value: 'Lots of protein' },
    });
    await goBack(user);
    expect(confirm).toHaveBeenCalledWith('Discard your changes?');
    expect(screen.queryByText('Detail of the recipe')).toBeNull();
  });

  it('does not ask after a successful Save', async () => {
    const user = userEvent.setup({ delay: null });
    edit();
    await retitle();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Recipe saved.')).toBeInTheDocument();
    await goBack(user);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('does not ask after a Tip change only', async () => {
    const user = userEvent.setup({ delay: null });
    const calls = edit();
    await openTab(user, 'Steps');
    const input = await screen.findByLabelText('Tip 1 of Step 1');
    await user.clear(input);
    await user.type(input, 'Medium heat');
    await user.tab();
    await vi.waitFor(() =>
      expect(calls.some((c) => c.key.startsWith('PATCH'))).toBe(true),
    );
    await goBack(user);
    expect(confirm).not.toHaveBeenCalled();
  });
});

describe('Source Link Remove with Undo (#597)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('says the link goes on save, focuses Undo, and Undo brings the row back and keeps the link on Save', async () => {
    const user = userEvent.setup({ delay: null });
    const calls = setup(
      newRecipeWith({
        ...sourced,
        sourceLink: 'https://www.example.com/tortilla',
      }),
      {
        'POST /api/recipes': () => Response.json(saved, { status: 201 }),
      },
    );
    await user.click(
      await screen.findByRole('button', { name: 'Remove link' }),
    );
    expect(
      screen.getByText('Link removed. It goes when you save.'),
    ).toBeVisible();
    const undo = screen.getByRole('button', { name: 'Undo' });
    expect(undo).toHaveFocus();
    await user.click(undo);
    expect(screen.getByRole('link', { name: /^From / })).toBeVisible();
    // Undo unmounts with its row: focus goes back to "Remove link".
    expect(screen.getByRole('button', { name: 'Remove link' })).toHaveFocus();
    await user.type(screen.getByLabelText(/^Serves/), '4');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() =>
      expect(calls.some((c) => c.key === 'POST /api/recipes')).toBe(true),
    );
    const body = calls.find((c) => c.key === 'POST /api/recipes')?.body as {
      sourceLink?: string;
    };
    expect(body.sourceLink).toBeTruthy();
  });
});

describe('Variant of row on Make a Variant (#597)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('names the Catalog Base, not the Family copy the form was filled from (ADR 0029)', async () => {
    setup('/recipes/copy/variant/new', {
      'GET /api/recipes/copy/variant-draft': () => Response.json(draft),
      'GET /api/recipes/copy': () =>
        Response.json({
          ...sourceDetail,
          id: 'copy',
          title: 'Our omelette',
          owner: 'family',
        }),
      'GET /api/recipes/base': () =>
        Response.json({
          ...sourceDetail,
          id: 'base',
          title: 'Omelette',
          owner: 'catalog',
        }),
    });
    expect(await screen.findByText('Variant of')).toBeVisible();
    expect(screen.getByText('Omelette', { selector: 'b' })).toBeVisible();
    expect(screen.queryByText('Our omelette', { selector: 'b' })).toBeNull();
    expect(screen.queryByRole('radio')).toBeNull();
  });

  it('opens on a Catalog Base itself (the draft branches from the Recipe it was made from)', async () => {
    setup('/recipes/base/variant/new', {
      'GET /api/recipes/base/variant-draft': () => Response.json(draft),
      'GET /api/recipes/base': () =>
        Response.json({
          ...sourceDetail,
          id: 'base',
          title: 'Omelette',
          owner: 'catalog',
        }),
    });
    expect(await screen.findByText('Variant of')).toBeVisible();
    expect(screen.getByText('Omelette', { selector: 'b' })).toBeVisible();
  });

  it('does not name the Family copy when the Catalog Base cannot be fetched (ADR 0029)', async () => {
    setup('/recipes/copy/variant/new', {
      'GET /api/recipes/copy/variant-draft': () => Response.json(draft),
      'GET /api/recipes/copy': () =>
        Response.json({
          ...sourceDetail,
          id: 'copy',
          title: 'Our omelette',
          owner: 'family',
        }),
      'GET /api/recipes/base': () =>
        Response.json({ error: 'nope' }, { status: 500 }),
    });
    expect(await screen.findByLabelText(/^Title/)).toBeVisible();
    expect(screen.queryByText(/^Variant of/)).toBeNull();
  });
});

describe('Edit: Undo after removing the Source Link (#597)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('Undo then Save sends the link along, not null', async () => {
    const user = userEvent.setup({ delay: null });
    const linked: FamilyRecipeEdit = {
      ...saved,
      sourceLink: 'https://www.example.com/p',
      sourceLanguage: 'fr',
    };
    const calls = setup('/recipes/g/edit', {
      'GET /api/recipes/g/edit': () => Response.json(linked),
      'PUT /api/recipes/g': () => Response.json(linked),
    });
    await openTab(user, 'Details');
    await user.click(
      await screen.findByRole('button', { name: 'Remove link' }),
    );
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByRole('button', { name: 'Remove link' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Recipe saved.')).toBeInTheDocument();
    const body = calls.find((c) => c.key === 'PUT /api/recipes/g')
      ?.body as Record<string, unknown>;
    expect(body.sourceLink).not.toBeNull();
  });
});

describe('Edit: Undo, status and badge after a Save (#586 review)', () => {
  afterEach(() => vi.unstubAllGlobals());

  const withoutHerbs: FamilyRecipeEdit = {
    ...saved,
    lines: saved.lines.filter((line) => line.id !== 'l2'),
  };

  it('closes the Undo toast when a Save reseeds, so Undo cannot bring back a stale id', async () => {
    const user = userEvent.setup({ delay: null });
    let stored = saved;
    const calls = setup('/recipes/g/edit', {
      'GET /api/recipes/g/edit': () => Response.json(stored),
      'PUT /api/recipes/g': () => {
        stored = withoutHerbs;
        return Response.json(stored);
      },
    });
    await openTab(user, 'Ingredients');
    await user.click(await screen.findByLabelText('More for Gran’s herbs'));
    await user.click(
      screen.getByRole('button', { name: 'Remove Gran’s herbs' }),
    );
    expect(screen.getByRole('button', { name: 'Undo' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Recipe saved.');
    await vi.waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull(),
    );
    const puts = calls.filter((c) => c.key === 'PUT /api/recipes/g');
    expect(puts).toHaveLength(1);
    expect(
      (puts[0].body as { lines: { id: string }[] }).lines.map((l) => l.id),
    ).toEqual(['l1']);
  });

  it('hides "Recipe saved." once there are new unsaved changes', async () => {
    const user = userEvent.setup({ delay: null });
    setup('/recipes/g/edit', {
      'GET /api/recipes/g/edit': () => Response.json(saved),
      'PUT /api/recipes/g': () => Response.json(saved),
    });
    await openTab(user, 'Details');
    const title = await screen.findByLabelText(/^Title/);
    await user.type(title, '!');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Recipe saved.')).toBeVisible();
    await user.type(screen.getByLabelText(/^Title/), '?');
    expect(screen.queryByText('Recipe saved.')).toBeNull();
  });

  it('marks the Details tab when Prep is not a number', async () => {
    const user = userEvent.setup({ delay: null });
    setup('/recipes/g/edit', {
      'GET /api/recipes/g/edit': () => Response.json(saved),
    });
    await openTab(user, 'Details');
    expect(
      screen.queryByRole('tab', { name: 'Details, Needs attention' }),
    ).toBeNull();
    await user.type(await screen.findByLabelText(/^Prep/), 'x');
    expect(
      screen.getByRole('tab', { name: 'Details, Needs attention' }),
    ).toBeVisible();
  });
});

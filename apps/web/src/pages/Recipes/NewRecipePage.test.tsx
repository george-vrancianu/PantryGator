import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AUTOSAVE_DELAY_MS } from '@/lib/recipeDraftAutosave';
import type { NewRecipeState } from './NewRecipePage';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FamilyRecipeDraft, FamilyRecipeEdit } from '@/lib/familyRecipes';
import { stubRowLayout } from '@/test/layout';
import { stubMatchMedia, stubViewport } from '@/test/viewport';
import { expectSticksAtScrollerTop } from '@/test/stickyHeader';
import {
  draft,
  saved,
  sourceDetail,
  setup,
  openTab,
  sourced,
  newRecipeWith,
  guidanceToggle,
  openGuidance,
} from '@/test/familyRecipePages';

describe('NewRecipePage with a supplied draft', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sticks the editor tabs at the top of the sheet', async () => {
    setup(newRecipeWith(sourced), {});
    await screen.findByLabelText(/^Title/);
    expectSticksAtScrollerTop(screen.getByRole('tablist'));
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

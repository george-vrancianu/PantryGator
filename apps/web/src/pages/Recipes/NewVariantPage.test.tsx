import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FamilyRecipeDraft } from '@/lib/familyRecipes';
import {
  draft,
  saved,
  sourceDetail,
  setup,
  openTab,
  guidanceToggle,
  openGuidance,
} from './familyRecipeTestHelpers';

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

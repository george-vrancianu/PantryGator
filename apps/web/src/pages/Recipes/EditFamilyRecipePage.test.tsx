import {
  act,
  waitFor,
  fireEvent,
  screen,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FamilyRecipeEdit } from '@/lib/familyRecipes';
import { UNDO_WINDOW_MS } from '@/lib/useDeferredRemoval';
import { stubRowLayout } from '@/test/layout';
import { stubViewport } from '@/test/viewport';
import { Link, Route, Routes } from 'react-router-dom';
import { renderWithProviders, stubApi } from '@/test/render';
import { EditFamilyRecipeRoute } from './EditFamilyRecipePage';
import type { RecipeTag } from '@/lib/tags';
import {
  tag,
  pickable,
  draft,
  saved,
  sourceDetail,
  setup,
  openTab,
  sourced,
  newRecipeWith,
  openGuidance,
} from '@/test/familyRecipePages';

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

describe('EditFamilyRecipeRoute', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('keeps nothing of the Recipe it was on when the Member moves to another', async () => {
    const user = userEvent.setup({ delay: null });
    const linked = (id: string): FamilyRecipeEdit => ({
      ...saved,
      id,
      sourceLink: `https://www.example.com/${id}`,
      sourceLanguage: null,
    });
    const { fetchMock } = stubApi({
      'GET /api/recipes/filters': () => Response.json({ eatingMoments: [] }),
      'GET /api/recipes/tags': () => Response.json([]),
      'GET /api/recipes/g/edit': () => Response.json(linked('g')),
      'GET /api/recipes/h/edit': () => Response.json(linked('h')),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route
          path="/recipes/:id/edit"
          element={
            <>
              <Link to="/recipes/h/edit">other</Link>
              <EditFamilyRecipeRoute />
            </>
          }
        />
      </Routes>,
      { route: '/recipes/g/edit' },
    );
    await openTab(user, 'Details');
    await user.click(
      await screen.findByRole('button', { name: 'Remove link' }),
    );
    // Leaving with the removal unsaved asks first; the Member agrees.
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await user.click(screen.getByRole('link', { name: 'other' }));
    confirm.mockRestore();
    await openTab(user, 'Details');
    expect(
      await screen.findByRole('link', { name: /From example\.com/ }),
    ).toHaveAttribute('href', 'https://www.example.com/h');
  });
});

describe('Reordering Tips in the Family editor', () => {
  afterEach(() => vi.unstubAllGlobals());

  const withTips: FamilyRecipeEdit = {
    ...saved,
    parentId: null,
    parentTips: null,
    tips: [
      { id: 't1', stepId: null, text: 'Use butter' },
      { id: 't2', stepId: 's1', text: 'Low heat' },
      { id: 't3', stepId: null, text: 'Serve hot' },
      { id: 't4', stepId: 's1', text: 'Salt late' },
    ],
  };
  const edit = () =>
    setup('/recipes/g/edit', {
      'GET /api/recipes/g/edit': () => Response.json(withTips),
      'PUT /api/recipes/g/tips/order': () => Response.json(withTips),
    });
  const order = (calls: ReturnType<typeof setup>) =>
    calls.find((c) => c.key === 'PUT /api/recipes/g/tips/order')?.body;

  it('moves a Recipe Tip down, sending every Tip of the Recipe in its new order', async () => {
    const user = userEvent.setup({ delay: null });
    const calls = edit();
    await openTab(user, 'Steps');
    expect(
      screen.getByRole('button', { name: 'Move Recipe Tip 1 up' }),
    ).toHaveAttribute('aria-disabled', 'true');
    await user.click(
      screen.getByRole('button', { name: 'Move Recipe Tip 1 down' }),
    );
    await vi.waitFor(() =>
      expect(order(calls)).toEqual({ ids: ['t3', 't2', 't1', 't4'] }),
    );
  });

  it('moves a Step Tip inside its own Step', async () => {
    const user = userEvent.setup({ delay: null });
    const calls = edit();
    await openTab(user, 'Steps');
    await user.click(
      screen.getByRole('button', { name: 'Move Tip 1 of Step 1 down' }),
    );
    await vi.waitFor(() =>
      expect(order(calls)).toEqual({ ids: ['t1', 't4', 't3', 't2'] }),
    );
  });
});

describe('A Tip pending delete on a Step removed and saved within the Undo window', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('does not end in a not-found toast', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({
      delay: null,
      advanceTimers: vi.advanceTimersByTime,
    });
    const twoTips: FamilyRecipeEdit = {
      ...saved,
      steps: [{ id: 's1', text: 'Whisk the eggs', timerSeconds: null }],
      tips: [
        { id: 't2', stepId: 's1', text: 'Low heat' },
        { id: 't4', stepId: 's1', text: 'Salt late' },
      ],
    };
    // The server's view: removing the Step takes its Tips with it.
    let server = twoTips;
    const calls = setup('/recipes/g/edit', {
      'GET /api/recipes/g/edit': () => Response.json(server),
      'PUT /api/recipes/g': () => {
        server = { ...twoTips, steps: [], tips: [] };
        return Response.json(server);
      },
      'DELETE /api/recipes/g/tips/t2': () =>
        server.tips.some((tip) => tip.id === 't2')
          ? new Response(null, { status: 204 })
          : Response.json({ code: 'recipes.not_found' }, { status: 404 }),
    });
    await openTab(user, 'Steps');
    await user.click(
      await screen.findByRole('button', { name: 'Delete Tip 1 of Step 1' }),
    );
    expect(screen.getByText('Tip deleted')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Remove Step 1' }));
    await user.click(
      screen.getByRole('button', { name: 'Remove Step and Tips' }),
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Recipe saved.');
    await act(() => vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS + 1000));
    await vi.waitFor(() =>
      expect(calls.some((c) => c.key === 'DELETE /api/recipes/g/tips/t2')).toBe(
        true,
      ),
    );
    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(screen.queryByText(/not found|no longer exists|gone/i)).toBeNull();
    expect(screen.queryAllByRole('alert')).toHaveLength(0);
  });
});

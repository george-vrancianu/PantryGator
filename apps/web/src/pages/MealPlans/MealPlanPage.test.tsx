import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MealPlanDetail } from '../../lib/mealPlanPage';
import type { RecipeListItem } from '../../lib/recipes';
import { renderWithProviders, stubApi } from '../../test/render';
import { issue, iso, plan, slot, useFixedToday } from '../../test/mealPlans';
import { MealPlanPage } from './MealPlanPage';

/** Yesterday, today and tomorrow. */
const week = (over: Partial<MealPlanDetail> = {}): MealPlanDetail =>
  plan({
    id: 'p1',
    startOffset: -1,
    days: 3,
    servings: 2,
    slots: [
      slot(-1, 0, 'lunch', { status: null, recipeTitle: 'Old soup' }),
      slot(-1, 1, 'breakfast', { recipeTitle: 'Porridge' }),
      slot(-1, 1, 'dinner', {
        recipeTitle: 'Tomato pasta',
        status: 'short',
        issues: [
          issue(),
          issue({
            ingredientId: 'ing-2',
            name: 'Cheese',
            kind: 'short',
            quantity: 100,
            reason: { code: 'onlyInPantry', amount: 50, unit: 'g' },
          }),
          issue({
            ingredientId: 'ing-3',
            name: 'Salt',
            kind: 'uncertain',
            quantity: null,
            unit: null,
            reason: { code: 'noQuantity' },
          }),
        ],
      }),
      slot(-1, 2, 'lunch', {
        recipeTitle: 'Rice bowl',
        status: 'onList',
        issues: [issue({ ingredientId: 'ing-4', name: 'Rice', onList: true })],
      }),
      slot(-1, 2, 'dinner', {
        recipeTitle: 'Retired stew',
        status: 'unavailable',
        unavailable: true,
      }),
    ],
    forecast: { tag: { kind: 'short', count: 1 }, days: [] },
    ...over,
  });

const recipe = (id: string, title: string): RecipeListItem => ({
  id,
  title,
  parentId: null,
  base: null,
  tags: [],
  variantCount: 0,
  servings: 2,
  prepMinutes: 10,
  cookMinutes: 20,
  difficulty: null,
  owner: 'catalog',
  familyCopyId: null,
  copiedFromId: null,
  allergyWarning: null,
});

const shoppingList = () =>
  Response.json({ id: 'l', groups: [], summary: { remaining: 0, checked: 0 } });

function setup(view: MealPlanDetail = week(), extra = {}) {
  const api = stubApi({
    'GET /api/meal-plans/p1': () => Response.json(view),
    'GET /api/recipes': (url) => {
      const search = url.searchParams.get('search');
      // The picker asks twice: the Family's Recipes, then the Catalog's for its Explore section.
      if (url.searchParams.get('scope') === 'catalog') {
        return Response.json({ recipes: [] });
      }
      return Response.json({
        recipes: [
          recipe('rc-1', 'Lemon pasta'),
          {
            ...recipe('rc-2', 'Green curry'),
            allergyWarning: {
              severity: 'strong' as const,
              allergens: [
                {
                  id: 'a-pn',
                  name: 'Peanuts',
                  tier: 'yours' as const,
                  severity: 'strong' as const,
                  owners: [{ kind: 'own' as const }],
                },
              ],
              uncheckedCount: 0,
            },
          },
        ].filter((r) => !search || r.title.toLowerCase().includes(search)),
      });
    },
    'GET /api/recipes/filters': () =>
      Response.json({ tags: [], eatingMoments: [] }),
    'PUT /api/meal-plans/p1/slots/1/lunch': () => Response.json(view),
    'PUT /api/meal-plans/p1/slots/1/dinner': () => Response.json(view),
    'DELETE /api/meal-plans/p1/slots/1/dinner': () =>
      new Response(null, { status: 204 }),
    'POST /api/meal-plans/p1/fill': () => Response.json(view),
    'GET /api/shopping-list': shoppingList,
    ...extra,
  });
  vi.stubGlobal('fetch', api.fetchMock);
  return api;
}

const renderPage = (route = '/meal-plans/p1') =>
  renderWithProviders(
    <Routes>
      <Route path="/meal-plans/:id" element={<MealPlanPage />} />
    </Routes>,
    { route },
  );

const dayCard = (name: RegExp) => screen.getByRole('region', { name });

describe('Meal Plan page', () => {
  beforeEach(useFixedToday);
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('shows a card per day with Breakfast, Lunch and Dinner rows and a status per filled row', async () => {
    setup();
    renderPage();

    const today = await screen.findByRole('region', { name: /Today/ });
    const rows = within(today).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByText('Porridge')).toBeVisible();
    expect(within(rows[0]).getByText('Covered')).toBeVisible();
    expect(
      within(rows[1]).getByRole('button', { name: /^Add Lunch/ }),
    ).toBeVisible();
    expect(within(rows[2]).getByText('Tomato pasta')).toBeVisible();
    expect(within(rows[2]).getByText('2 short')).toBeVisible();

    const tomorrow = dayCard(/Fri/);
    expect(within(tomorrow).getByText('On list')).toBeVisible();
    expect(within(tomorrow).getByText('No longer available')).toBeVisible();
  });

  it('shows the Allergy Warning on a Plan Slot, naming whose Allergy it is', async () => {
    setup(
      week({
        slots: [
          slot(-1, 1, 'dinner', {
            recipeTitle: 'Satay',
            allergyWarning: {
              severity: 'strong',
              allergens: [
                {
                  id: 'a-pn',
                  name: 'Peanuts',
                  tier: 'members',
                  severity: 'strong',
                  owners: [{ kind: 'member', name: 'Ana' }],
                },
              ],
              uncheckedCount: 0,
            },
          }),
          slot(-1, 1, 'breakfast', { recipeTitle: 'Porridge' }),
        ],
      }),
    );
    renderPage();

    const today = await screen.findByRole('region', { name: /Today/ });
    const satay = within(today).getByRole('button', { name: /Satay/ });
    expect(within(satay).getByRole('img')).toHaveAccessibleName(
      'Contains Peanuts (Ana)',
    );
    expect(satay).toHaveAccessibleName(
      expect.stringContaining('Contains Peanuts (Ana)'),
    );
    const porridge = within(today).getByRole('button', { name: /Porridge/ });
    expect(within(porridge).queryByRole('img')).toBeNull();
  });

  it('summarises the forecast in the header', async () => {
    setup();
    renderPage();
    expect(await screen.findByText('1 slot short from Thu')).toBeVisible();
  });

  it('leaves past days read-only with no status', async () => {
    setup();
    renderPage();

    const past = await screen.findByRole('region', { name: /Wed/ });
    expect(within(past).getByText('Old soup')).toBeVisible();
    expect(within(past).queryByRole('button')).toBeNull();
    expect(within(past).queryByText('Covered')).toBeNull();
    expect(within(past).queryByText(/short/)).toBeNull();
  });

  it('opens the line detail with the forecast reasons, including uncertain', async () => {
    setup();
    const u = userEvent.setup();
    renderPage();

    await u.click(await screen.findByRole('button', { name: /Tomato pasta/ }));
    const dialog = await screen.findByRole('dialog', { name: /Tomato pasta/ });
    expect(within(dialog).getByText('Tomatoes')).toBeVisible();
    expect(within(dialog).getByText(/Not in your Pantry/)).toBeVisible();
    expect(within(dialog).getByText('Missing')).toBeVisible();
    expect(within(dialog).getByText('Cheese')).toBeVisible();
    expect(within(dialog).getByText(/Only 50 g in your Pantry/)).toBeVisible();
    expect(within(dialog).getByText('Short 100 g')).toBeVisible();
    expect(within(dialog).getByText('Salt')).toBeVisible();
    expect(within(dialog).getByText("Can't tell")).toBeVisible();
  });

  it('shows an unavailable Recipe as no longer available', async () => {
    setup();
    const u = userEvent.setup();
    renderPage();

    await u.click(await screen.findByRole('button', { name: /Retired stew/ }));
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText('This Recipe is no longer available.'),
    ).toBeVisible();
    expect(
      within(dialog).getByRole('button', { name: 'Clear this meal' }),
    ).toBeVisible();
  });

  it('sets a Recipe in an empty slot through the picker, with search', async () => {
    const api = setup();
    const u = userEvent.setup();
    renderPage();

    await u.click(await screen.findByRole('button', { name: /^Add Lunch/ }));
    const picker = await screen.findByRole('dialog', {
      name: 'Choose a Recipe',
    });
    expect(await within(picker).findByText('Green curry')).toBeVisible();
    expect(
      within(picker).getByRole('img', { name: 'Contains Peanuts' }),
    ).toBeVisible();
    // The search is the Sheet's pinned toolbar, not part of the scrolling list.
    const toolbar = picker.querySelector<HTMLElement>('[data-sheet-toolbar]');
    if (!toolbar) throw new Error('The picker has no toolbar');
    expect(within(toolbar).getByRole('searchbox')).toBeVisible();
    await u.type(within(picker).getByRole('searchbox'), 'lemon');
    await waitFor(() =>
      expect(within(picker).queryByText('Green curry')).toBeNull(),
    );
    await u.click(within(picker).getByText('Lemon pasta'));

    await waitFor(() =>
      expect(
        api.calls.find((c) => c.key === 'PUT /api/meal-plans/p1/slots/1/lunch')
          ?.body,
      ).toEqual({ recipeId: 'rc-1' }),
    );
  });

  it('pins Change Recipe as the slot primary, with no Done', async () => {
    setup();
    const u = userEvent.setup();
    renderPage();

    await u.click(await screen.findByRole('button', { name: /Tomato pasta/ }));
    const dialog = await screen.findByRole('dialog');
    const footer = dialog.querySelector('[data-sheet-footer]');
    expect(footer).toBeInstanceOf(HTMLElement);
    expect(
      within(footer as HTMLElement).getByRole('button', {
        name: 'Change Recipe',
      }),
    ).toBeEnabled();
    expect(within(dialog).queryByRole('button', { name: 'Done' })).toBeNull();
    expect(
      within(dialog).getByRole('button', { name: 'Clear this meal' }),
    ).toBeEnabled();
  });

  it('changes the Recipe of a filled slot', async () => {
    const api = setup();
    const u = userEvent.setup();
    renderPage();

    await u.click(await screen.findByRole('button', { name: /Tomato pasta/ }));
    await u.click(await screen.findByRole('button', { name: 'Change Recipe' }));
    const picker = await screen.findByRole('dialog', {
      name: 'Choose a Recipe',
    });
    await u.click(await within(picker).findByText('Green curry'));

    await waitFor(() =>
      expect(
        api.calls.find((c) => c.key === 'PUT /api/meal-plans/p1/slots/1/dinner')
          ?.body,
      ).toEqual({ recipeId: 'rc-2' }),
    );
  });

  it('clears a slot', async () => {
    const api = setup();
    const u = userEvent.setup();
    renderPage();

    await u.click(await screen.findByRole('button', { name: /Tomato pasta/ }));
    await u.click(
      await screen.findByRole('button', { name: 'Clear this meal' }),
    );

    await waitFor(() =>
      expect(
        api.calls.some(
          (c) => c.key === 'DELETE /api/meal-plans/p1/slots/1/dinner',
        ),
      ).toBe(true),
    );
  });

  it('overrides Servings for one slot, and follows the plan again at the plan Servings', async () => {
    const api = setup();
    const u = userEvent.setup();
    renderPage();

    await u.click(await screen.findByRole('button', { name: /Tomato pasta/ }));
    const dialog = await screen.findByRole('dialog');
    await u.click(
      within(dialog).getByRole('button', { name: 'More Servings' }),
    );
    await waitFor(() =>
      expect(
        api.calls.find((c) => c.key === 'PUT /api/meal-plans/p1/slots/1/dinner')
          ?.body,
      ).toEqual({ recipeId: 'r-1-dinner', servings: 3 }),
    );
  });

  it('follows the plan when the override goes back to the plan Servings', async () => {
    const view = week();
    view.slots = view.slots.map((s) =>
      s.recipeTitle === 'Tomato pasta'
        ? { ...s, servings: 3, servingsOverride: 3 }
        : s,
    );
    const api = setup(view);
    const u = userEvent.setup();
    renderPage();

    await u.click(await screen.findByRole('button', { name: /Tomato pasta/ }));
    const dialog = await screen.findByRole('dialog');
    await u.click(
      within(dialog).getByRole('button', { name: 'Fewer Servings' }),
    );
    await waitFor(() =>
      expect(
        api.calls.find((c) => c.key === 'PUT /api/meal-plans/p1/slots/1/dinner')
          ?.body,
      ).toEqual({ recipeId: 'r-1-dinner' }),
    );
  });

  it('fills with the switch off by default and on when turned on', async () => {
    const api = setup();
    const u = userEvent.setup();
    renderPage();

    await u.click(await screen.findByRole('button', { name: 'Fill' }));
    await waitFor(() =>
      expect(api.calls.filter((c) => c.key.endsWith('/fill'))).toHaveLength(1),
    );
    await u.click(screen.getByRole('switch', { name: 'Only what I have' }));
    await u.click(screen.getByRole('button', { name: 'Fill' }));
    await waitFor(() =>
      expect(api.calls.filter((c) => c.key.endsWith('/fill'))).toHaveLength(2),
    );
    const bodies = api.calls
      .filter((c) => c.key.endsWith('/fill'))
      .map((c) => c.body);
    expect(bodies).toEqual([{ onlyWhatIHave: false }, { onlyWhatIHave: true }]);
  });

  describe('Add missing', () => {
    const addMissing = () => ({
      'POST /api/meal-plans/add-missing': () =>
        Response.json({ createdIds: ['sh1', 'sh2'], count: 2 }),
      'DELETE /api/shopping-list/items/sh1': shoppingList,
      'DELETE /api/shopping-list/items/sh2': shoppingList,
    });

    it('adds for the plan and undoes exactly what it created', async () => {
      const api = setup(week(), addMissing());
      const u = userEvent.setup();
      renderPage();

      await u.click(
        await screen.findByRole('button', { name: 'Add 2 missing' }),
      );
      expect(
        await screen.findByText('2 added to the Shopping List'),
      ).toBeVisible();
      expect(
        api.calls.find((c) => c.key === 'POST /api/meal-plans/add-missing')
          ?.body,
      ).toEqual({ scope: 'plan', planId: 'p1' });

      await u.click(screen.getByRole('button', { name: 'Undo' }));
      await waitFor(() =>
        expect(
          api.calls
            .filter((c) => c.key.startsWith('DELETE /api/shopping-list'))
            .map((c) => c.key),
        ).toEqual([
          'DELETE /api/shopping-list/items/sh1',
          'DELETE /api/shopping-list/items/sh2',
        ]),
      );
    });

    it('offers no Undo when everything merged into existing lines, and announces politely', async () => {
      setup(week(), {
        'POST /api/meal-plans/add-missing': () =>
          Response.json({ createdIds: [], count: 2 }),
      });
      const u = userEvent.setup();
      renderPage();

      await u.click(
        await screen.findByRole('button', { name: 'Add 2 missing' }),
      );
      const toast = await screen.findByText('2 added to the Shopping List');
      expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
      expect(toast.closest('[role="status"]')).not.toBeNull();
    });

    it('adds for one day', async () => {
      const api = setup(week(), addMissing());
      const u = userEvent.setup();
      renderPage();

      const today = await screen.findByRole('region', { name: /Today/ });
      await u.click(
        within(today).getByRole('button', { name: /Add missing for/ }),
      );
      await waitFor(() =>
        expect(
          api.calls.find((c) => c.key === 'POST /api/meal-plans/add-missing')
            ?.body,
        ).toEqual({ scope: 'date', date: iso(0) }),
      );
    });

    it('adds one line from the line detail', async () => {
      const api = setup(week(), addMissing());
      const u = userEvent.setup();
      renderPage();

      await u.click(
        await screen.findByRole('button', { name: /Tomato pasta/ }),
      );
      const dialog = await screen.findByRole('dialog');
      await u.click(
        within(dialog).getByRole('button', {
          name: 'Add Tomatoes to the Shopping List',
        }),
      );
      await waitFor(() =>
        expect(
          api.calls.find((c) => c.key === 'POST /api/meal-plans/add-missing')
            ?.body,
        ).toEqual({
          scope: 'ingredient',
          ingredientId: 'ing-1',
          planId: 'p1',
        }),
      );
    });
  });

  it('opens on the day of the deep link', async () => {
    setup();
    renderPage(`/meal-plans/p1?day=${iso(1)}`);

    const heading = await screen.findByRole('heading', { name: /Fri/ });
    await waitFor(() => expect(heading).toHaveFocus());
  });

  it('shows the error when a slot write fails', async () => {
    setup(week(), {
      'PUT /api/meal-plans/p1/slots/1/lunch': () =>
        Response.json(
          { code: 'meal_plan.day_in_past', params: {} },
          { status: 409 },
        ),
    });
    const u = userEvent.setup();
    renderPage();

    await u.click(await screen.findByRole('button', { name: /^Add Lunch/ }));
    const picker = await screen.findByRole('dialog', {
      name: 'Choose a Recipe',
    });
    await u.click(await within(picker).findByText('Lemon pasta'));
    expect(
      await within(picker).findByText(
        "That day has passed and can't be changed.",
      ),
    ).toBeVisible();
  });

  it('words a missing line with its amount and a large short amount in kg', async () => {
    setup(
      week({
        slots: [
          slot(-1, 1, 'dinner', {
            recipeTitle: 'Big stew',
            status: 'short',
            issues: [
              issue({ name: 'Tomatoes', kind: 'missing', quantity: 400 }),
              issue({
                ingredientId: 'ing-2',
                name: 'Flour',
                kind: 'short',
                quantity: 1500,
                reason: { code: 'onlyInPantry', amount: 500, unit: 'g' },
              }),
            ],
          }),
        ],
      }),
    );
    const u = userEvent.setup();
    renderPage();

    await u.click(await screen.findByRole('button', { name: /Big stew/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/need 400 g/)).toBeVisible();
    expect(within(dialog).queryByText(/short 1\.5 kg/)).toBeNull();
    expect(within(dialog).getByText('Short 1.5 kg')).toBeVisible();
    expect(within(dialog).queryByText(/1500/)).toBeNull();
  });

  it('shows the Widget status marks and names the status on the row', async () => {
    setup();
    renderPage();

    const row = await screen.findByRole('button', {
      name: /Tomato pasta.*2 short/,
    });
    expect(within(row).getByText('2 short')).toBeVisible();
    expect(
      screen.getByRole('button', { name: /Rice bowl.*On list/ }),
    ).toBeVisible();
  });

  it('lists Variants in the picker and keeps the Servings override when the Recipe changes', async () => {
    const api = setup(
      week({
        slots: [
          slot(-1, 1, 'dinner', {
            recipeTitle: 'Tomato pasta',
            servings: 5,
            servingsOverride: 5,
          }),
        ],
      }),
    );
    const u = userEvent.setup();
    renderPage();

    await u.click(await screen.findByRole('button', { name: /Tomato pasta/ }));
    await u.click(await screen.findByRole('button', { name: 'Change Recipe' }));
    const picker = await screen.findByRole('dialog', {
      name: 'Choose a Recipe',
    });
    await u.click(await within(picker).findByText('Green curry'));

    await waitFor(() =>
      expect(
        api.calls.find((c) => c.key === 'PUT /api/meal-plans/p1/slots/1/dinner')
          ?.body,
      ).toEqual({ recipeId: 'rc-2', servings: 5 }),
    );
    expect(
      api.calls
        .filter((c) => c.key === 'GET /api/recipes')
        .every((c) => c.search.includes('includeVariants=true')),
    ).toBe(true);
    // Plan Slots never hide (ADR 0012): the picker asks for Recipes hidden by the Member's Allergies too.
    const pickerCalls = api.calls.filter((c) => c.key === 'GET /api/recipes');
    expect(pickerCalls.length).toBeGreaterThan(0);
    expect(pickerCalls.every((c) => c.search.includes('showHidden=true'))).toBe(
      true,
    );
  });

  it('marks a line already on the list in its pill', async () => {
    setup();
    const u = userEvent.setup();
    renderPage();

    await u.click(await screen.findByRole('button', { name: /Rice bowl/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/on list/)).toBeVisible();
  });

  it('labels a Variant in the picker without a search', async () => {
    setup(week(), {
      'GET /api/recipes': (url: URL) =>
        Response.json({
          recipes:
            url.searchParams.get('scope') === 'catalog'
              ? []
              : [
                  {
                    ...recipe('rc-3', 'Spicy curry'),
                    parentId: 'rc-2',
                    base: { id: 'rc-2', title: 'Green curry' },
                  },
                ],
        }),
    });
    const u = userEvent.setup();
    renderPage();

    await u.click(await screen.findByRole('button', { name: /^Add Lunch/ }));
    const picker = await screen.findByRole('dialog', {
      name: 'Choose a Recipe',
    });
    expect(
      await within(picker).findByText('Variant of Green curry'),
    ).toBeVisible();
  });

  it('lists Family Recipes first, then Explore, and a Catalog pick adds it to the Family and plans the copy', async () => {
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const api = setup(week(), {
      'GET /api/recipes': (url: URL) =>
        Response.json({
          recipes:
            url.searchParams.get('scope') === 'catalog'
              ? [
                  recipe('cat-1', 'Pad thai'),
                  recipe('cat-3', 'Ramen'),
                  { ...recipe('cat-2', 'Already mine'), familyCopyId: 'fam-1' },
                ]
              : [{ ...recipe('fam-1', 'Already mine'), owner: 'family' }],
        }),
      'POST /api/recipes/cat-1/copy': async () => {
        await gate;
        return Response.json({ id: 'copy-1', created: true });
      },
    });
    const u = userEvent.setup();
    renderPage();

    await u.click(await screen.findByRole('button', { name: /^Add Lunch/ }));
    const picker = await screen.findByRole('dialog', {
      name: 'Choose a Recipe',
    });
    const explore = await within(picker).findByRole('heading', {
      name: 'Explore',
    });
    const mine = within(picker).getByText('Already mine');
    expect(
      mine.compareDocumentPosition(explore) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // A Catalog Recipe the Family already has is only listed once, as its copy.
    expect(within(picker).getAllByText('Already mine')).toHaveLength(1);

    await u.click(await within(picker).findByText('Pad thai'));
    // Only the picked row shows it is being added; the others stay ready.
    expect(await within(picker).findAllByText('In your Recipes')).toHaveLength(
      1,
    );
    expect(
      within(picker).getByRole('button', { name: 'Add Ramen to your Recipes' }),
    ).toBeVisible();
    release();

    await waitFor(() =>
      expect(
        api.calls.find((c) => c.key === 'PUT /api/meal-plans/p1/slots/1/lunch')
          ?.body,
      ).toEqual({ recipeId: 'copy-1' }),
    );
    expect(
      api.calls.some((c) => c.key === 'POST /api/recipes/cat-1/copy'),
    ).toBe(true);
  });

  it('has no Servings stepper for an unavailable Recipe', async () => {
    setup();
    const u = userEvent.setup();
    renderPage();

    await u.click(await screen.findByRole('button', { name: /Retired stew/ }));
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).queryByRole('button', { name: /Servings/ }),
    ).toBeNull();
  });

  it('disables Fill for a plan that is over', async () => {
    setup(week({ startDate: iso(-5), days: 3, slots: [] }));
    renderPage();

    expect(await screen.findByRole('button', { name: 'Fill' })).toBeDisabled();
  });

  it('does not fetch Recipes until the picker opens', async () => {
    const api = setup();
    const u = userEvent.setup();
    renderPage();

    await screen.findByRole('button', { name: /^Add Lunch/ });
    expect(api.calls.some((c) => c.key === 'GET /api/recipes')).toBe(false);
    await u.click(screen.getByRole('button', { name: /^Add Lunch/ }));
    await screen.findByText('Green curry');
    expect(api.calls.some((c) => c.key === 'GET /api/recipes')).toBe(true);
  });

  it('sends one write for a double tap in the picker', async () => {
    let release = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const api = setup(week(), {
      'PUT /api/meal-plans/p1/slots/1/lunch': async () => {
        await gate;
        return Response.json(week());
      },
    });
    const u = userEvent.setup();
    renderPage();

    await u.click(await screen.findByRole('button', { name: /^Add Lunch/ }));
    const picker = await screen.findByRole('dialog', {
      name: 'Choose a Recipe',
    });
    const row = await within(picker).findByText('Lemon pasta');
    await u.click(row);
    await u.click(row);
    release();

    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Choose a Recipe' }),
      ).toBeNull(),
    );
    expect(
      api.calls.filter((c) => c.key === 'PUT /api/meal-plans/p1/slots/1/lunch'),
    ).toHaveLength(1);
  });

  it('drops an old write error once a later action starts', async () => {
    setup(week(), {
      'PUT /api/meal-plans/p1/slots/1/lunch': () =>
        Response.json(
          { code: 'meal_plan.day_in_past', params: {} },
          { status: 409 },
        ),
    });
    const u = userEvent.setup();
    renderPage();

    await u.click(await screen.findByRole('button', { name: /^Add Lunch/ }));
    const picker = await screen.findByRole('dialog', {
      name: 'Choose a Recipe',
    });
    await u.click(await within(picker).findByText('Lemon pasta'));
    await within(picker).findByText(
      "That day has passed and can't be changed.",
    );
    await u.keyboard('{Escape}');
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Choose a Recipe' }),
      ).toBeNull(),
    );

    await u.click(screen.getByRole('button', { name: 'Fill' }));
    await waitFor(() =>
      expect(
        screen.queryByText("That day has passed and can't be changed."),
      ).toBeNull(),
    );
  });
});

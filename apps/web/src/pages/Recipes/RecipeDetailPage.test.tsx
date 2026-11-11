import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Locale } from '../../i18n';
import type { RecipeDetail } from '../../lib/recipes';
import { renderWithProviders, stubApi } from '../../test/render';
import { expectSticksBelowTopInset } from '../../test/stickyHeader';
import { RecipeDetailPage } from './RecipeDetailPage';

const entry = (
  id: string,
  ingredientName: string,
  quantity: number | null = null,
  unit: 'g' | 'ml' | null = null,
) => ({ id, ingredientName, quantity, unit });

const recipe = (over: Partial<RecipeDetail>): RecipeDetail => ({
  id: 'o',
  parentId: null,
  owner: 'family',
  title: 'Omelette',
  servings: 2,
  prepMinutes: 5,
  cookMinutes: 10,
  difficulty: 'easy',
  tags: [],
  archived: false,
  lines: [
    {
      id: 'l1',
      ingredientId: 'egg',
      ingredientName: 'Egg',
      quantity: 3,
      unit: 'pcs',
      optional: false,
      note: null,
    },
    {
      id: 'l2',
      ingredientId: 'chive',
      ingredientName: 'Chives',
      quantity: null,
      unit: null,
      optional: true,
      note: 'chopped',
    },
  ],
  steps: [
    { id: 's1', text: 'Whisk the eggs', timerSeconds: null },
    { id: 's2', text: 'Fry gently', timerSeconds: 90 },
  ],
  tips: [],
  base: null,
  variants: [],
  familyCopyId: null,
  copiedFrom: null,
  diff: null,
  guidance: { nutritionNote: null, pairings: [], eatingMoments: [] },
  allergens: { items: [], uncheckedCount: 0 },
  allergyWarning: null,
  sourceLink: null,
  sourceLanguage: null,
  ...over,
});

function setup(
  detail: RecipeDetail,
  route = `/recipes/${detail.id}`,
  extra: Parameters<typeof stubApi>[0] = {},
  locale: Locale = 'en',
) {
  const { fetchMock, calls } = stubApi({
    [`GET /api/recipes/${detail.id}`]: () => Response.json(detail),
    ...extra,
  });
  vi.stubGlobal('fetch', fetchMock);
  renderWithProviders(
    <Routes>
      <Route path="/recipes" element={<p>All recipes page</p>} />
      <Route path="/recipes/:id" element={<RecipeDetailPage />} />
      <Route path="/recipes/:id/edit" element={<p>Edit page</p>} />
    </Routes>,
    { route, locale },
  );
  return calls;
}

/** The value paired with a fact label (a `<dl>`: each term is followed by its definition). */
function fact(label: string): HTMLElement {
  const term = screen
    .getAllByRole('term')
    .find((candidate) => candidate.textContent === label);
  if (!term) throw new Error(`No fact labelled ${label}`);
  const definition = term.nextElementSibling as HTMLElement | null;
  if (!definition || definition.tagName !== 'DD')
    throw new Error(`Fact ${label} has no definition`);
  return definition;
}

/** Opens the "More actions" menu on a Family Recipe. */
async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'More actions' }));
  return screen.findByRole('menu');
}

/** Switches to a tab by clicking it. */
async function openTab(
  user: ReturnType<typeof userEvent.setup>,
  name: 'Ingredients' | 'Steps' | 'About',
) {
  await user.click(await screen.findByRole('tab', { name: new RegExp(name) }));
}

describe('RecipeDetailPage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows the header and ingredients', async () => {
    setup(recipe({}));
    expect(
      await screen.findByRole('heading', { level: 1, name: /Omelette/ }),
    ).toBeInTheDocument();
    const ingredients = screen.getByRole('list', { name: 'Ingredients' });
    expect(within(ingredients).getByText(/Egg/)).toBeInTheDocument();
    expect(within(ingredients).getByText(/optional/)).toBeInTheDocument();
  });

  it('shows every Tag as a chip under the facts, Family Tags first, and no Style fact', async () => {
    setup(
      recipe({
        tags: [
          {
            id: 'f',
            name: 'Meal prep',
            kind: 'family',
            groupId: null,
            groupName: null,
            groupOrder: null,
          },
          ...['Dinner', 'Vegan', 'French', 'Pan frying'].map((name, i) => ({
            id: `c${i}`,
            name,
            kind: 'catalog' as const,
            groupId: `g${i}`,
            groupName: 'Group',
            groupOrder: i + 1,
          })),
        ],
      }),
    );
    const tags = await screen.findByRole('list', { name: 'Tags' });
    expect(
      within(tags)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Meal prep', 'Dinner', 'Vegan', 'French', 'Pan frying']);
    expect(screen.queryByText('Style')).toBeNull();
  });

  it('shows no Tags list on a Recipe without Tags', async () => {
    setup(recipe({}));
    await screen.findByRole('heading', { level: 1, name: /Omelette/ });
    expect(screen.queryByRole('list', { name: 'Tags' })).toBeNull();
  });

  it('links a Recipe read from a page to its Source Link', async () => {
    setup(
      recipe({
        owner: 'family',
        sourceLink: 'https://www.example.com/pancakes',
      }),
    );
    const link = await screen.findByRole('link', {
      name: 'From example.com ↗',
    });
    expect(link).toHaveAttribute('href', 'https://www.example.com/pancakes');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it.each([
    ['en', 'fr', 'Translated from French'],
    ['en', 'en', 'Translated from English'],
    ['ro', 'it', 'Tradusă din italiană'],
    ['en', 'xx-bogus-code-', 'Translated from xx-bogus-code-'],
  ] as [Locale, string, string][])(
    'says a %s-UI Recipe read from a %s page was translated',
    async (locale, code, note) => {
      setup(
        recipe({
          sourceLink: 'https://www.example.com/pancakes',
          sourceLanguage: code,
        }),
        undefined,
        {},
        locale,
      );
      expect(await screen.findByText(note, { exact: false })).toBeVisible();
      expect(screen.getByRole('link', { name: /example\.com/ })).toBeVisible();
    },
  );

  it('says nothing of translation when the Recipe has no source language', async () => {
    setup(recipe({ sourceLink: 'https://www.example.com/pancakes' }));
    await screen.findByRole('link', { name: 'From example.com ↗' });
    expect(screen.queryByText(/Translated from/)).toBeNull();
  });

  it('shows no Source Link on a Recipe without one', async () => {
    setup(recipe({}));
    await screen.findByRole('heading', { level: 1, name: /Omelette/ });
    expect(screen.queryByRole('link', { name: /^From / })).toBeNull();
  });

  it('puts the family pill in the H1 of a Family Recipe', async () => {
    setup(recipe({ owner: 'family' }));
    const heading = await screen.findByRole('heading', {
      level: 1,
      name: /Omelette/,
    });
    expect(within(heading).getByText("Your family's")).toBeInTheDocument();
  });

  describe('Header', () => {
    it('goes back to the list from the Back link, with no Home button or All Recipes link', async () => {
      setup(recipe({}));
      expect(await screen.findByRole('link', { name: 'Back' })).toHaveAttribute(
        'href',
        '/recipes',
      );
      expect(screen.queryByRole('link', { name: 'All Recipes' })).toBeNull();
      expect(screen.queryByRole('link', { name: 'Home' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Home' })).toBeNull();
    });

    it('offers no header action on an archived Recipe', async () => {
      setup(recipe({ id: 'g', owner: 'family', archived: true }));
      await screen.findByText('This Recipe is archived.');
      expect(screen.queryByRole('button', { name: 'More actions' })).toBeNull();
      expect(screen.queryByRole('link', { name: 'Make a Variant' })).toBeNull();
      expect(screen.queryByRole('link', { name: 'Edit' })).toBeNull();
    });
  });

  describe('Hero', () => {
    it('shows the facts: Time, Serves and Level', async () => {
      setup(recipe({}));
      await screen.findByRole('heading', { level: 1, name: /Omelette/ });
      expect(fact('Time')).toHaveTextContent('15 min');
      expect(fact('Serves')).toHaveTextContent('2');
      expect(fact('Level')).toHaveTextContent('Easy');
    });

    it('omits the Time fact when neither prep nor cook time is known', async () => {
      setup(recipe({ prepMinutes: null, cookMinutes: null }));
      await screen.findByRole('heading', { level: 1, name: /Omelette/ });
      const labels = screen.getAllByRole('term').map((n) => n.textContent);
      expect(labels).not.toContain('Time');
      expect(labels).toContain('Serves');
    });

    it('sizes the fact columns to the cells shown', async () => {
      setup(recipe({ prepMinutes: null, cookMinutes: null, difficulty: null }));
      await screen.findByRole('heading', { level: 1, name: /Omelette/ });
      const grid = fact('Serves').parentElement!.parentElement!;
      expect(grid).toHaveStyle({ gridTemplateColumns: '1fr' });
    });

    it('sums prep and cook time when only one is known', async () => {
      setup(recipe({ prepMinutes: null, cookMinutes: 10 }));
      await screen.findByRole('heading', { level: 1, name: /Omelette/ });
      expect(fact('Time')).toHaveTextContent('10 min');
    });

    it('updates Serves when the Servings stepper is raised', async () => {
      const user = userEvent.setup();
      setup(recipe({}));
      await screen.findByRole('heading', { level: 1, name: /Omelette/ });
      await user.click(screen.getByRole('button', { name: 'More Servings' }));
      expect(fact('Serves')).toHaveTextContent('3');
    });

    it("links a Variant's eyebrow to its Base Recipe", async () => {
      setup(
        recipe({
          id: 'f',
          title: 'Frittata',
          parentId: 'o',
          base: {
            id: 'o',
            title: 'Omelette',
            archived: false,
            familyCopyId: null,
          },
        }),
      );
      expect(
        await screen.findByRole('link', { name: /Variant of Omelette/ }),
      ).toHaveAttribute('href', '/recipes/explore/o');
    });
  });

  it('notes an archived Recipe', async () => {
    setup(recipe({ archived: true }));
    expect(
      await screen.findByText('This Recipe is archived.'),
    ).toBeInTheDocument();
  });

  it("lists a base Recipe's Variants with their Tags, linking through", async () => {
    const user = userEvent.setup();
    setup(
      recipe({
        variants: [
          {
            id: 'f',
            title: 'Frittata',
            tags: [
              {
                id: 'c-it',
                name: 'Italian',
                kind: 'catalog',
                groupId: 'g3',
                groupName: 'Cuisine',
                groupOrder: 3,
              },
              {
                id: 'm-bake',
                name: 'Baking',
                kind: 'catalog',
                groupId: 'g4',
                groupName: 'Method',
                groupOrder: 4,
              },
            ],
            owner: 'catalog',
            familyCopyId: null,
          },
        ],
      }),
    );
    await openTab(user, 'About');
    const section = (
      await screen.findByRole('heading', { name: 'Variants' })
    ).closest('section')!;
    expect(
      within(section).getByRole('link', { name: 'Frittata' }),
    ).toHaveAttribute('href', '/recipes/explore/f');
    expect(
      within(section).getByRole('group', { name: 'Tags: Italian, Baking' }),
    ).toBeInTheDocument();
  });

  it('draws no Tags group for a Variant without Tags', async () => {
    const user = userEvent.setup();
    setup(
      recipe({
        variants: [
          {
            id: 'f',
            title: 'Frittata',
            tags: [],
            owner: 'catalog',
            familyCopyId: null,
          },
        ],
      }),
    );
    await openTab(user, 'About');
    const section = (
      await screen.findByRole('heading', { name: 'Variants' })
    ).closest('section')!;
    expect(within(section).queryByRole('group', { name: /^Tags/ })).toBeNull();
  });

  it("marks the Family's own Variants under their base", async () => {
    const user = userEvent.setup();
    setup(
      recipe({
        variants: [
          {
            id: 'f',
            title: 'Frittata',
            tags: [],
            owner: 'catalog',
            familyCopyId: null,
          },
          {
            id: 'g',
            title: "Grandma's omelette",
            tags: [],
            owner: 'family',
            familyCopyId: null,
          },
        ],
      }),
    );
    await openTab(user, 'About');
    const section = (
      await screen.findByRole('heading', { name: 'Variants' })
    ).closest('section')!;
    const own = within(section).getByRole('link', {
      name: "Grandma's omelette",
    });
    expect(own.closest('li')!).toHaveTextContent("Your family's");
    expect(
      within(
        within(section).getByRole('link', { name: 'Frittata' }).closest('li')!,
      ).queryByText("Your family's"),
    ).toBeNull();
  });

  it("shows a Variant's base link and What's different", async () => {
    const user = userEvent.setup();
    setup(
      recipe({
        id: 'f',
        title: 'Frittata',
        parentId: 'o',
        base: {
          id: 'o',
          title: 'Omelette',
          archived: false,
          familyCopyId: null,
        },
        diff: {
          added: [entry('a1', 'Feta', 100, 'g')],
          removed: [entry('r1', 'Butter', 20, 'g')],
          swapped: [
            { from: entry('w1', 'Chives', 5, 'ml'), to: entry('w2', 'Dill') },
          ],
        },
      }),
    );
    await openTab(user, 'About');
    const back = await screen.findByRole('link', {
      name: /Variant of Omelette/,
    });
    expect(back).toHaveAttribute('href', '/recipes/explore/o');
    const section = screen
      .getByRole('heading', { name: "What's different" })
      .closest('section')!;
    const added = within(section).getByRole('list', { name: 'Added' });
    expect(within(added).getByText('Feta 100 g')).toBeInTheDocument();
    const removed = within(section).getByRole('list', { name: 'Removed' });
    expect(within(removed).getByText('Butter 20 g')).toBeInTheDocument();
    const swapped = within(section).getByRole('list', { name: 'Swapped' });
    expect(
      within(swapped).getByText('Chives 5 ml to Dill'),
    ).toBeInTheDocument();
    // A Variant has no Variants section.
    expect(screen.queryByRole('heading', { name: 'Variants' })).toBeNull();
  });

  it("omits What's different on a base Recipe", async () => {
    const user = userEvent.setup();
    setup(recipe({}));
    await openTab(user, 'About');
    await screen.findByRole('heading', { name: /Omelette/ });
    expect(
      screen.queryByRole('heading', { name: "What's different" }),
    ).toBeNull();
  });

  it('shows own and inherited Tips in the Tips section and step Tips on their step', async () => {
    const user = userEvent.setup();
    setup(
      recipe({
        tips: [
          {
            id: 't1',
            stepId: null,
            text: 'Use a nonstick pan',
            inherited: true,
          },
          { id: 't2', stepId: null, text: 'Salt at the end', inherited: false },
          {
            id: 't3',
            stepId: 's2',
            text: 'Keep the heat low',
            inherited: false,
          },
        ],
      }),
    );
    await openTab(user, 'Steps');
    const tips = (await screen.findByRole('heading', { name: 'Tips' })).closest(
      'section',
    )!;
    expect(within(tips).getByText('Use a nonstick pan')).toBeInTheDocument();
    expect(within(tips).getByText('Salt at the end')).toBeInTheDocument();
    expect(within(tips).getAllByText(/from the Base Recipe/)).toHaveLength(1);
    expect(within(tips).queryByText('Keep the heat low')).toBeNull();
    const step = screen.getByText('Fry gently').closest('li')!;
    expect(within(step).getByText('Keep the heat low')).toBeInTheDocument();
    const firstStep = screen.getByText('Whisk the eggs').closest('li')!;
    expect(within(firstStep).queryByText('Keep the heat low')).toBeNull();
  });

  it("orders the About tab: What's different, Pairings, When to eat, Nutrition, disclaimer", async () => {
    const user = userEvent.setup();
    setup(
      recipe({
        parentId: 'o',
        base: {
          id: 'o',
          title: 'Omelette',
          archived: false,
          familyCopyId: null,
        },
        diff: { added: [entry('a1', 'Feta')], removed: [], swapped: [] },
        guidance: {
          nutritionNote: 'Rich in fat.',
          pairings: [
            {
              id: 'p1',
              kind: 'food',
              label: 'Greens',
              reason: 'Light',
              principle: null,
              link: null,
            },
          ],
          eatingMoments: [
            {
              eatingMomentId: 'm1',
              name: 'Dinner',
              polarity: 'good_for',
              reason: null,
            },
          ],
        },
      }),
    );
    await openTab(user, 'About');
    const panel = await screen.findByRole('tabpanel');
    const order = [
      within(panel).getByRole('heading', { name: "What's different" }),
      within(panel).getByRole('heading', { name: 'Pairings' }),
      within(panel).getByRole('heading', { name: 'When to eat' }),
      within(panel).getByRole('heading', { name: 'Nutrition' }),
      within(panel).getByText(
        'General guidance, not medical or dietary advice.',
      ),
    ];
    order.slice(1).forEach((node, index) => {
      expect(
        order[index]!.compareDocumentPosition(node) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });
  });

  describe('Allergens card', () => {
    const REMINDER =
      'Worked out from the ingredients. Always check product labels.';
    const allergens = (over: Partial<RecipeDetail['allergens']>) => ({
      items: [],
      uncheckedCount: 0,
      ...over,
    });
    const card = async (detail: RecipeDetail) => {
      const user = userEvent.setup();
      setup(detail);
      await openTab(user, 'About');
      return within(
        (await screen.findByRole('heading', { name: 'Allergens' })).closest(
          'section',
        )!,
      );
    };

    it('lists each Allergen with the lines it comes from', async () => {
      const view = await card(
        recipe({
          allergens: allergens({
            items: [
              {
                allergen: { id: 'a-milk', name: 'Milk' },
                lines: [
                  { id: 'l1', ingredientName: 'Parmesan', optional: false },
                  { id: 'l2', ingredientName: 'Butter', optional: false },
                ],
                optionalOnly: false,
              },
              {
                allergen: { id: 'a-gluten', name: 'Gluten' },
                lines: [{ id: 'l3', ingredientName: 'Flour', optional: false }],
                optionalOnly: false,
              },
            ],
          }),
        }),
      );
      const items = view.getAllByRole('listitem');
      expect(items).toHaveLength(2);
      expect(items[0]).toHaveTextContent('Milk');
      expect(items[0]).toHaveTextContent('Parmesan, Butter');
      expect(items[1]).toHaveTextContent('Gluten');
      expect(items[1]).toHaveTextContent('Flour');
      expect(view.queryByText('Optional')).toBeNull();
      expect(view.queryByText('No common allergens found')).toBeNull();
      expect(view.getByText(REMINDER)).toBeInTheDocument();
    });

    it('names an Ingredient once when several lines share it', async () => {
      const view = await card(
        recipe({
          allergens: allergens({
            items: [
              {
                allergen: { id: 'a-milk', name: 'Milk' },
                lines: [
                  { id: 'l1', ingredientName: 'Butter', optional: false },
                  { id: 'l2', ingredientName: 'Parmesan', optional: false },
                  { id: 'l3', ingredientName: 'Butter', optional: false },
                ],
                optionalOnly: false,
              },
            ],
          }),
        }),
      );
      expect(view.getByRole('listitem')).toHaveTextContent(
        /Milk\s*Butter, Parmesan$/,
      );
    });

    it('marks the optional sources of an Allergen that also comes from required lines', async () => {
      const view = await card(
        recipe({
          allergens: allergens({
            items: [
              {
                allergen: { id: 'a-nuts', name: 'Tree nuts' },
                lines: [
                  { id: 'l1', ingredientName: 'Almonds', optional: false },
                  { id: 'l2', ingredientName: 'Walnuts', optional: true },
                  { id: 'l3', ingredientName: 'Almonds', optional: true },
                ],
                optionalOnly: false,
              },
            ],
          }),
        }),
      );
      const item = view.getByRole('listitem');
      expect(item).toHaveTextContent('Almonds, Walnuts (optional)');
      expect(item).not.toHaveTextContent('Almonds (optional)');
      expect(view.queryByText('Optional')).toBeNull();
    });

    it('marks an Allergen that comes only from optional lines', async () => {
      const view = await card(
        recipe({
          allergens: allergens({
            items: [
              {
                allergen: { id: 'a-peanuts', name: 'Peanuts' },
                lines: [
                  { id: 'l1', ingredientName: 'Peanuts', optional: true },
                ],
                optionalOnly: true,
              },
            ],
          }),
        }),
      );
      expect(view.getByRole('listitem')).toHaveTextContent('Optional');
    });

    it('says how many ingredients could not be checked', async () => {
      const view = await card(
        recipe({ allergens: allergens({ uncheckedCount: 3 }) }),
      );
      expect(
        view.getByText("3 ingredients couldn't be checked"),
      ).toBeInTheDocument();
    });

    it('uses the singular for one ingredient', async () => {
      const view = await card(
        recipe({ allergens: allergens({ uncheckedCount: 1 }) }),
      );
      expect(
        view.getByText("1 ingredient couldn't be checked"),
      ).toBeInTheDocument();
    });

    it('says no common allergens were found, never that the Recipe is safe or allergen-free', async () => {
      const view = await card(recipe({}));
      expect(view.getByText('No common allergens found')).toBeInTheDocument();
      expect(view.getByText(REMINDER)).toBeInTheDocument();
      expect(view.queryByRole('list')).toBeNull();
      expect(view.queryByText(/couldn't be checked/)).toBeNull();
      expect(document.body.textContent).not.toMatch(/\bsafe\b|allergen-free/i);
    });

    it('sits after Nutrition and before the disclaimer', async () => {
      const user = userEvent.setup();
      setup(
        recipe({
          guidance: {
            nutritionNote: 'Rich in fat.',
            pairings: [],
            eatingMoments: [],
          },
        }),
      );
      await openTab(user, 'About');
      const nutrition = await screen.findByRole('heading', {
        name: 'Nutrition',
      });
      const allergensHeading = screen.getByRole('heading', {
        name: 'Allergens',
      });
      const disclaimer = screen.getByText(
        'General guidance, not medical or dietary advice.',
      );
      const follows = (a: Node, b: Node) =>
        a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING;
      expect(follows(nutrition, allergensHeading)).toBeTruthy();
      expect(follows(allergensHeading, disclaimer)).toBeTruthy();
    });
  });

  it('puts Variants last on the About tab of a Base Recipe', async () => {
    const user = userEvent.setup();
    setup(
      recipe({
        guidance: {
          nutritionNote: 'Rich in fat.',
          pairings: [],
          eatingMoments: [],
        },
      }),
    );
    await openTab(user, 'About');
    const nutrition = await screen.findByRole('heading', { name: 'Nutrition' });
    const variants = screen.getByRole('heading', { name: 'Variants' });
    expect(
      nutrition.compareDocumentPosition(variants) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('omits empty sections from the About tab', async () => {
    const user = userEvent.setup();
    setup(
      recipe({
        parentId: 'o',
        base: {
          id: 'o',
          title: 'Omelette',
          archived: false,
          familyCopyId: null,
        },
      }),
    );
    await openTab(user, 'About');
    const panel = await screen.findByRole('tabpanel');
    // Only the Allergens card is always there.
    expect(
      within(panel)
        .getAllByRole('heading')
        .map((h) => h.textContent),
    ).toEqual(['Allergens']);
  });

  describe('Tabs', () => {
    it('sticks the tabs below the top inset, not behind the Dynamic Island', async () => {
      setup(recipe({}));
      expectSticksBelowTopInset(await screen.findByRole('tablist'));
    });

    const tab = (name: string) => screen.getByRole('tab', { name });

    it('shows Ingredients, Steps and About, with Ingredients selected and only its panel shown', async () => {
      setup(recipe({}));
      await screen.findByRole('tablist');
      const tabs = within(screen.getByRole('tablist')).getAllByRole('tab');
      expect(tabs.map((node) => node.textContent)).toEqual([
        'Ingredients',
        'Steps',
        'About',
      ]);
      expect(tab('Ingredients')).toHaveAttribute('aria-selected', 'true');
      expect(tab('Steps')).toHaveAttribute('aria-selected', 'false');
      const panel = screen.getByRole('tabpanel');
      expect(tab('Ingredients')).toHaveAttribute(
        'aria-controls',
        panel.getAttribute('id'),
      );
      expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
      expect(
        within(panel).getByRole('list', { name: 'Ingredients' }),
      ).toBeInTheDocument();
      expect(screen.queryByText('Whisk the eggs')).toBeNull();
    });

    it('switches panel when a tab is clicked', async () => {
      const user = userEvent.setup();
      setup(recipe({}));
      await openTab(user, 'Steps');
      expect(tab('Steps')).toHaveAttribute('aria-selected', 'true');
      expect(tab('Ingredients')).toHaveAttribute('aria-selected', 'false');
      expect(screen.getByText('Whisk the eggs')).toBeInTheDocument();
      expect(screen.queryByRole('list', { name: 'Ingredients' })).toBeNull();
      await openTab(user, 'Ingredients');
      expect(screen.queryByText('Whisk the eggs')).toBeNull();
    });

    it('moves focus and selection with the arrow keys, wrapping round', async () => {
      const user = userEvent.setup();
      setup(recipe({}));
      await screen.findByRole('tablist');
      tab('Ingredients').focus();
      expect(tab('Ingredients')).toHaveAttribute('tabindex', '0');
      expect(tab('Steps')).toHaveAttribute('tabindex', '-1');
      await user.keyboard('{ArrowRight}');
      expect(tab('Steps')).toHaveFocus();
      expect(tab('Steps')).toHaveAttribute('aria-selected', 'true');
      expect(tab('Steps')).toHaveAttribute('tabindex', '0');
      expect(tab('Ingredients')).toHaveAttribute('tabindex', '-1');
      await user.keyboard('{ArrowRight}{ArrowRight}');
      expect(tab('Ingredients')).toHaveFocus();
      expect(tab('Ingredients')).toHaveAttribute('aria-selected', 'true');
      await user.keyboard('{ArrowLeft}');
      expect(tab('About')).toHaveFocus();
      expect(tab('About')).toHaveAttribute('aria-selected', 'true');
    });

    it('scrolls to the top when switching tabs', async () => {
      const user = userEvent.setup();
      const scrollTo = vi.fn();
      vi.stubGlobal('scrollTo', scrollTo);
      setup(recipe({}));
      await screen.findByRole('tablist');
      expect(scrollTo).not.toHaveBeenCalled();
      await openTab(user, 'Steps');
      expect(scrollTo).toHaveBeenCalled();
    });

    const matchWith = (shortOrMissingCount: number) => ({
      'GET /api/recipes/o/pantry-match': () =>
        Response.json({
          servings: 2,
          canMake: shortOrMissingCount === 0,
          shortOrMissingCount,
          expiringCoveredCount: 0,
          coverageRatio: 0.5,
          lines: [],
        }),
    });

    it('badges the Ingredients tab with how many lines to buy', async () => {
      setup(recipe({}), '/recipes/o', matchWith(2));
      expect(
        await screen.findByRole('tab', { name: 'Ingredients 2 to buy' }),
      ).toBeInTheDocument();
    });

    it('shows no badge on the Ingredients tab when nothing is to buy', async () => {
      const calls = setup(recipe({}), '/recipes/o', matchWith(0));
      await vi.waitFor(() =>
        expect(calls.map((call) => call.key)).toContain(
          'GET /api/recipes/o/pantry-match',
        ),
      );
      await within(await screen.findByRole('tabpanel')).findByText(
        'You can make this',
      );
      expect(screen.getByRole('tab', { name: 'Ingredients' })).toBeVisible();
      expect(screen.queryByText(/to buy/)).toBeNull();
    });
  });

  describe('Steps tab', () => {
    it('numbers the Steps as an ordered list, with the Timer as text, not a button', async () => {
      const user = userEvent.setup();
      setup(recipe({}));
      await openTab(user, 'Steps');
      const list = screen.getByRole('list', { name: 'Steps' });
      expect(list.tagName).toBe('OL');
      expect(
        within(list)
          .getAllByRole('listitem')
          .map((li) => li.textContent),
      ).toEqual([
        expect.stringContaining('Whisk the eggs'),
        expect.stringContaining('Fry gently'),
      ]);
      expect(screen.getByText('Timer 1:30')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Timer/ })).toBeNull();
    });

    it('labels a Step Tip "Tip:" and marks an inherited one as from the Base Recipe', async () => {
      const user = userEvent.setup();
      setup(
        recipe({
          tips: [
            { id: 't1', stepId: 's1', text: 'Use cold eggs', inherited: true },
            { id: 't2', stepId: 's2', text: 'Low heat', inherited: false },
          ],
        }),
      );
      await openTab(user, 'Steps');
      const first = screen.getByText('Whisk the eggs').closest('li')!;
      expect(first).toHaveTextContent('Tip: Use cold eggs');
      expect(first).toHaveTextContent('(from the Base Recipe)');
      const second = screen.getByText('Fry gently').closest('li')!;
      expect(second).toHaveTextContent('Tip: Low heat');
      expect(second).not.toHaveTextContent('from the Base Recipe');
    });

    it('puts the Recipe Tips under a Tips heading below the Steps', async () => {
      const user = userEvent.setup();
      setup(
        recipe({
          tips: [{ id: 't1', stepId: null, text: 'Salt', inherited: false }],
        }),
      );
      await openTab(user, 'Steps');
      const steps = screen.getByRole('list', { name: 'Steps' });
      const heading = screen.getByRole('heading', { name: 'Tips' });
      expect(
        steps.compareDocumentPosition(heading) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });
  });

  describe('About tab', () => {
    it("gives What's different text alternatives for added, removed and swapped entries", async () => {
      const user = userEvent.setup();
      setup(
        recipe({
          parentId: 'o',
          base: {
            id: 'o',
            title: 'Omelette',
            archived: false,
            familyCopyId: null,
          },
          diff: {
            added: [entry('a1', 'Feta')],
            removed: [entry('r1', 'Butter')],
            swapped: [{ from: entry('w1', 'Chives'), to: entry('w2', 'Dill') }],
          },
        }),
      );
      await openTab(user, 'About');
      expect(
        within(screen.getByRole('list', { name: 'Added' })).getByText(/Feta/),
      ).toBeInTheDocument();
      expect(
        within(screen.getByRole('list', { name: 'Removed' })).getByText(
          /Butter/,
        ),
      ).toBeInTheDocument();
      expect(
        within(screen.getByRole('list', { name: 'Swapped' })).getByText(
          'Chives to Dill',
        ),
      ).toBeInTheDocument();
    });

    it('says a Variant has the same ingredients as its base when nothing differs', async () => {
      const user = userEvent.setup();
      setup(
        recipe({
          parentId: 'o',
          base: {
            id: 'o',
            title: 'Omelette',
            archived: false,
            familyCopyId: null,
          },
          diff: { added: [], removed: [], swapped: [] },
        }),
      );
      await openTab(user, 'About');
      expect(
        await screen.findByText('Same ingredients as Omelette.'),
      ).toBeInTheDocument();
    });
  });

  it('names the tab list after the Recipe, not the list of Recipes', async () => {
    setup(recipe({}));
    expect(
      await screen.findByRole('tablist', { name: 'Omelette' }),
    ).toBeInTheDocument();
  });

  it('only points aria-controls at the rendered panel', async () => {
    setup(recipe({}));
    const tabs = await screen.findAllByRole('tab');
    const controls = tabs.map((tab) => tab.getAttribute('aria-controls'));
    expect(controls.filter(Boolean)).toHaveLength(1);
    expect(document.getElementById(controls.find(Boolean)!)).not.toBeNull();
  });

  it('omits the Tips section when there are no Recipe-level Tips', async () => {
    const user = userEvent.setup();
    setup(recipe({}));
    await openTab(user, 'Steps');
    await screen.findByRole('heading', { name: /Omelette/ });
    expect(screen.queryByRole('heading', { name: 'Tips' })).toBeNull();
  });

  it('shows a message when the Recipe is not found', async () => {
    const { fetchMock } = stubApi({});
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/recipes/:id" element={<RecipeDetailPage />} />
      </Routes>,
      { route: '/recipes/nope' },
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This Recipe could not be found.',
    );
  });

  describe('Family actions', () => {
    it("keeps the actions in a menu on the Family's own Recipe", async () => {
      setup(
        recipe({
          id: 'g',
          owner: 'family',
          parentId: 'o',
          base: {
            id: 'o',
            title: 'Omelette',
            archived: false,
            familyCopyId: null,
          },
        }),
      );
      const button = await screen.findByRole('button', {
        name: 'More actions',
      });
      expect(button).toHaveAttribute('aria-haspopup', 'menu');
      expect(screen.queryByRole('menu')).toBeNull();
      expect(screen.queryByRole('link', { name: 'Edit' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    });

    it("offers Make a Variant, Edit and Delete in the menu of the Family's own Variant", async () => {
      const user = userEvent.setup();
      setup(
        recipe({
          id: 'g',
          owner: 'family',
          parentId: 'o',
          base: {
            id: 'o',
            title: 'Omelette',
            archived: false,
            familyCopyId: null,
          },
        }),
      );
      const menu = await openMenu(user);
      expect(
        within(menu).getByRole('menuitem', { name: 'Make a Variant' }),
      ).toHaveAttribute('href', '/recipes/g/variant/new');
      expect(
        within(menu).getByRole('menuitem', { name: 'Edit' }),
      ).toHaveAttribute('href', '/recipes/g/edit');
      expect(
        within(menu).getByRole('menuitem', { name: 'Delete' }),
      ).toBeInTheDocument();
    });

    it('opens the menu from the keyboard', async () => {
      const user = userEvent.setup();
      setup(recipe({ id: 'g', owner: 'family' }));
      const button = await screen.findByRole('button', {
        name: 'More actions',
      });
      button.focus();
      await user.keyboard('{Enter}');
      expect(await screen.findByRole('menu')).toBeInTheDocument();
      expect(
        screen.getByRole('menuitem', { name: 'Edit' }),
      ).toBeInTheDocument();
    });

    it('navigates in-app from the Edit menu item', async () => {
      const user = userEvent.setup();
      setup(recipe({ id: 'g', owner: 'family' }));
      const menu = await openMenu(user);
      await user.click(within(menu).getByRole('menuitem', { name: 'Edit' }));
      expect(await screen.findByText('Edit page')).toBeInTheDocument();
    });

    it('returns focus to the "More actions" button when Delete is cancelled', async () => {
      const user = userEvent.setup();
      setup(recipe({ id: 'g', owner: 'family' }));
      const menu = await openMenu(user);
      await user.click(within(menu).getByRole('menuitem', { name: 'Delete' }));
      await user.click(await screen.findByRole('button', { name: 'Cancel' }));
      await vi.waitFor(() =>
        expect(
          screen.getByRole('button', { name: 'More actions' }),
        ).toHaveFocus(),
      );
    });

    it('closes the menu on Escape', async () => {
      const user = userEvent.setup();
      setup(recipe({ id: 'g', owner: 'family' }));
      await openMenu(user);
      await user.keyboard('{Escape}');
      await vi.waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    });

    it('closes the menu on a click outside it', async () => {
      const user = userEvent.setup();
      setup(recipe({ id: 'g', owner: 'family' }));
      const menu = await openMenu(user);
      // The invisible layer the menu sits in front of: the first child of the menu's presentation root.
      const outside = menu.closest('[role="presentation"]')!.firstElementChild!;
      await user.click(outside);
      await vi.waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    });

    it('renders a Family Recipe with a typed-name line, its Pantry status and the menu button', async () => {
      setup(
        recipe({
          id: 'g',
          owner: 'family',
          parentId: 'o',
          base: {
            id: 'o',
            title: 'Omelette',
            archived: false,
            familyCopyId: null,
          },
          lines: [
            {
              id: 'l9',
              ingredientId: null,
              ingredientName: 'Gran’s herbs',
              quantity: null,
              unit: null,
              optional: false,
              note: null,
            },
          ],
        }),
        '/recipes/g',
        {
          'GET /api/recipes/g/pantry-match': () =>
            Response.json({
              servings: 2,
              canMake: false,
              shortOrMissingCount: 1,
              expiringCoveredCount: 0,
              coverageRatio: 0,
              lines: [
                {
                  lineId: 'l9',
                  ingredientId: null,
                  name: 'Gran’s herbs',
                  status: 'missing',
                  optional: false,
                  pantryBasic: false,
                  quantity: null,
                  unit: null,
                  shortfall: null,
                  usesExpiringSoon: false,
                  onShoppingList: false,
                },
              ],
            }),
        },
      );
      const list = await screen.findByRole('list', { name: 'Ingredients' });
      const row = within(list)
        .getByText(/Gran’s herbs/)
        .closest('li')!;
      expect(await within(row).findByText('Missing')).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'More actions' }),
      ).toBeInTheDocument();
    });

    it('hides Make a Variant in the menu of a Family Base Recipe', async () => {
      const user = userEvent.setup();
      setup(recipe({ id: 'g', owner: 'family' }));
      const menu = await openMenu(user);
      expect(
        within(menu).getByRole('menuitem', { name: 'Edit' }),
      ).toBeInTheDocument();
      expect(
        within(menu).queryByRole('menuitem', { name: 'Make a Variant' }),
      ).toBeNull();
    });

    it('offers Make a Variant in the menu of a copy of a live Catalog Base', async () => {
      const user = userEvent.setup();
      setup(
        recipe({
          id: 'c',
          owner: 'family',
          copiedFrom: { id: 'o', archived: false },
        }),
      );
      const menu = await openMenu(user);
      expect(
        within(menu).getByRole('menuitem', { name: 'Make a Variant' }),
      ).toHaveAttribute('href', '/recipes/c/variant/new');
    });

    it('hides Make a Variant on a copy whose Catalog Base is archived', async () => {
      const user = userEvent.setup();
      setup(
        recipe({
          id: 'c',
          owner: 'family',
          copiedFrom: { id: 'o', archived: true },
        }),
      );
      const menu = await openMenu(user);
      expect(
        within(menu).queryByRole('menuitem', { name: 'Make a Variant' }),
      ).toBeNull();
    });

    it('hides Make a Variant when the Recipe is archived', async () => {
      setup(recipe({ archived: true }));
      await screen.findByRole('heading', { level: 1, name: /Omelette/ });
      expect(screen.queryByRole('link', { name: 'Make a Variant' })).toBeNull();
    });

    it('hides Make a Variant when the Base Recipe is archived', async () => {
      setup(
        recipe({
          id: 'v',
          parentId: 'o',
          base: {
            id: 'o',
            title: 'Omelette',
            archived: true,
            familyCopyId: null,
          },
        }),
      );
      await screen.findByRole('heading', { level: 1, name: /Omelette/ });
      expect(screen.queryByRole('link', { name: 'Make a Variant' })).toBeNull();
    });

    it("archives after a confirm and goes to the Family's copy of the base", async () => {
      const user = userEvent.setup();
      const calls = setup(
        recipe({
          id: 'g',
          owner: 'family',
          parentId: 'o',
          base: {
            id: 'o',
            title: 'Omelette',
            archived: false,
            familyCopyId: 'oc',
          },
        }),
        '/recipes/g',
        {
          'POST /api/recipes/g/archive': () => Response.json({ id: 'g' }),
          'GET /api/recipes/oc': () =>
            Response.json(recipe({ id: 'oc', title: 'Omelette' })),
        },
      );
      const menu = await openMenu(user);
      await user.click(within(menu).getByRole('menuitem', { name: 'Delete' }));
      expect(
        calls.some((call) => call.key === 'POST /api/recipes/g/archive'),
      ).toBe(false);
      await user.click(await screen.findByRole('button', { name: 'Confirm' }));
      await vi.waitFor(() =>
        expect(calls.map((call) => call.key)).toContain('GET /api/recipes/oc'),
      );
      expect(calls.map((call) => call.key)).toContain(
        'POST /api/recipes/g/archive',
      );
    });

    it('goes to the list after deleting a Variant whose Catalog base has no Family copy', async () => {
      const user = userEvent.setup();
      const calls = setup(
        recipe({
          id: 'g',
          owner: 'family',
          parentId: 'o',
          base: {
            id: 'o',
            title: 'Omelette',
            archived: false,
            familyCopyId: null,
          },
        }),
        '/recipes/g',
        { 'POST /api/recipes/g/archive': () => Response.json({ id: 'g' }) },
      );
      const menu = await openMenu(user);
      await user.click(within(menu).getByRole('menuitem', { name: 'Delete' }));
      await user.click(await screen.findByRole('button', { name: 'Confirm' }));
      expect(await screen.findByText('All recipes page')).toBeInTheDocument();
      expect(calls.map((call) => call.key)).not.toContain('GET /api/recipes/o');
    });

    it('goes to the list after deleting a standalone Family Recipe', async () => {
      const user = userEvent.setup();
      setup(recipe({ id: 'g', owner: 'family' }), '/recipes/g', {
        'POST /api/recipes/g/archive': () => Response.json({ id: 'g' }),
      });
      const menu = await openMenu(user);
      await user.click(within(menu).getByRole('menuitem', { name: 'Delete' }));
      await user.click(await screen.findByRole('button', { name: 'Confirm' }));
      expect(await screen.findByText('All recipes page')).toBeInTheDocument();
    });
  });

  describe('Allergy Warning', () => {
    const warning = (
      over: Partial<NonNullable<RecipeDetail['allergyWarning']>>,
    ): NonNullable<RecipeDetail['allergyWarning']> => ({
      severity: 'strong',
      entries: [],
      uncheckedCount: 0,
      ...over,
    });
    const own = { kind: 'own' } as const;
    const strongPeanuts = {
      allergen: { id: 'a-peanuts', name: 'Peanuts' },
      owner: own,
      tier: 'yours' as const,
      severity: 'strong' as const,
      lines: [{ lineId: 'l1', severity: 'strong' as const }],
    };
    const softNuts = {
      allergen: { id: 'a-nuts', name: 'Tree nuts' },
      owner: own,
      tier: 'yours' as const,
      severity: 'soft' as const,
      lines: [{ lineId: 'l2', severity: 'soft' as const }],
    };

    it('shows no banner without a warning', async () => {
      setup(recipe({}));
      await screen.findByRole('heading', { level: 1, name: /Omelette/ });
      expect(
        screen.queryByRole('group', { name: 'Allergy Warning' }),
      ).toBeNull();
      expect(screen.queryByText(/Contains/)).toBeNull();
    });

    it('shows a strong banner naming the Allergens above the tabs', async () => {
      setup(
        recipe({
          allergyWarning: warning({
            entries: [
              strongPeanuts,
              {
                allergen: { id: 'a-milk', name: 'Milk' },
                owner: own,
                tier: 'yours',
                severity: 'strong',
                lines: [{ lineId: 'l1', severity: 'strong' as const }],
              },
            ],
          }),
        }),
      );
      const banner = await screen.findByRole('group', {
        name: 'Allergy Warning',
      });
      expect(banner).toHaveAttribute('data-severity', 'strong');
      expect(
        within(banner).getByText('Contains Peanuts, Milk: your Allergies'),
      ).toBeInTheDocument();
      const tabs = screen.getByRole('tablist');
      expect(
        banner.compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it('shows a softer banner for an optional line', async () => {
      setup(
        recipe({
          allergyWarning: warning({ severity: 'soft', entries: [softNuts] }),
        }),
      );
      const banner = await screen.findByRole('group', {
        name: 'Allergy Warning',
      });
      expect(banner).toHaveAttribute('data-severity', 'soft');
      expect(
        within(banner).getByText(
          'Optional ingredient contains Tree nuts: your Allergy',
        ),
      ).toBeInTheDocument();
    });

    it('shows a softer banner for lines that could not be checked', async () => {
      setup(
        recipe({
          allergyWarning: warning({ severity: 'soft', uncheckedCount: 1 }),
        }),
      );
      const banner = await screen.findByRole('group', {
        name: 'Allergy Warning',
      });
      expect(banner).toHaveAttribute('data-severity', 'soft');
      expect(
        within(banner).getByText(
          "1 ingredient couldn't be checked for allergens",
        ),
      ).toBeInTheDocument();
    });

    it('lists optional and unchecked notes under a strong warning', async () => {
      setup(
        recipe({
          allergyWarning: warning({
            entries: [strongPeanuts, softNuts],
            uncheckedCount: 2,
          }),
        }),
      );
      const banner = await screen.findByRole('group', {
        name: 'Allergy Warning',
      });
      expect(
        within(banner).getByText('Contains Peanuts: your Allergy'),
      ).toBeInTheDocument();
      expect(
        within(banner).getByText(
          'Optional ingredient contains Tree nuts: your Allergy',
        ),
      ).toBeInTheDocument();
      expect(
        within(banner).getByText(
          "2 ingredients couldn't be checked for allergens",
        ),
      ).toBeInTheDocument();
    });

    it('marks each triggering line in the Ingredients tab with the Allergen name', async () => {
      setup(
        recipe({
          allergyWarning: warning({ entries: [strongPeanuts, softNuts] }),
        }),
      );
      const list = await screen.findByRole('list', { name: 'Ingredients' });
      const [egg, chives] = within(list).getAllByRole('listitem');
      expect(within(egg!).getByText('Contains Peanuts')).toBeInTheDocument();
      expect(within(egg!).queryByText('Contains Tree nuts')).toBeNull();
      expect(
        within(chives!).getByText('Contains Tree nuts'),
      ).toBeInTheDocument();
    });

    it('marks an optional line softly even under a strong entry', async () => {
      setup(
        recipe({
          allergyWarning: warning({
            entries: [
              {
                ...strongPeanuts,
                lines: [
                  { lineId: 'l1', severity: 'strong' as const },
                  { lineId: 'l2', severity: 'soft' as const },
                ],
              },
            ],
          }),
        }),
      );
      const list = await screen.findByRole('list', { name: 'Ingredients' });
      const [egg, chives] = within(list).getAllByRole('listitem');
      expect(within(egg!).getByText('Contains Peanuts')).toHaveAttribute(
        'data-severity',
        'strong',
      );
      expect(within(chives!).getByText('Contains Peanuts')).toHaveAttribute(
        'data-severity',
        'soft',
      );
    });

    it('does not change when Servings change', async () => {
      const user = userEvent.setup();
      setup(recipe({ allergyWarning: warning({ entries: [strongPeanuts] }) }));
      await screen.findByRole('group', { name: 'Allergy Warning' });
      await user.click(
        await screen.findByRole('button', { name: 'More Servings' }),
      );
      expect(
        within(
          screen.getByRole('group', { name: 'Allergy Warning' }),
        ).getByText('Contains Peanuts: your Allergy'),
      ).toBeInTheDocument();
    });

    describe('whose Allergy it is', () => {
      const entry = (
        id: string,
        name: string,
        owner: NonNullable<
          RecipeDetail['allergyWarning']
        >['entries'][number]['owner'],
        extra: { severity?: 'strong' | 'soft'; lineId?: string } = {},
      ) => ({
        allergen: { id, name },
        owner,
        tier:
          owner.kind === 'member' ? ('members' as const) : ('yours' as const),
        severity: extra.severity ?? ('strong' as const),
        lines: [
          {
            lineId: extra.lineId ?? 'l1',
            severity: extra.severity ?? ('strong' as const),
          },
        ],
      });
      const banner = async () =>
        within(await screen.findByRole('group', { name: 'Allergy Warning' }));

      it("names Family Allergies by label next to the viewer's own, on the first line", async () => {
        setup(
          recipe({
            allergyWarning: warning({
              entries: [
                entry('a-peanuts', 'Peanuts', own),
                entry('a-nuts', 'Tree nuts', {
                  kind: 'family',
                  label: 'Mia',
                }),
                entry('a-milk', 'Milk', { kind: 'family', label: null }),
              ],
            }),
          }),
        );
        const view = await banner();
        const first = view.getByText(
          'Contains Peanuts: your Allergy',
        ).parentElement!;
        expect(first).toHaveTextContent('Mia: Tree nuts');
        expect(first).toHaveTextContent('Family: Milk');
      });

      it("combines one person's Allergies into a single phrase, keeping the API order", async () => {
        setup(
          recipe({
            allergyWarning: warning({
              entries: [
                entry('a-peanuts', 'Peanuts', own),
                entry('a-nuts', 'Tree nuts', { kind: 'family', label: 'Mia' }),
                entry('a-milk', 'Milk', own, { lineId: 'l2' }),
                entry('a-sesame', 'Sesame', { kind: 'family', label: 'Mia' }),
                entry('a-egg', 'Eggs', {
                  kind: 'member',
                  memberId: 'm-ana',
                  name: 'Ana',
                }),
                entry('a-fish', 'Fish', {
                  kind: 'member',
                  memberId: 'm-ana',
                  name: 'Ana',
                }),
              ],
            }),
          }),
        );
        const view = await banner();
        expect(view.getAllByText(/your Allerg/)).toHaveLength(1);
        expect(
          view.getByText('Contains Peanuts, Milk: your Allergies'),
        ).toBeInTheDocument();
        expect(view.getByText('Mia: Tree nuts, Sesame')).toBeInTheDocument();
        expect(view.getByText('Ana: Eggs, Fish')).toBeInTheDocument();
      });

      it('pluralises the optional note when it covers several optional lines', async () => {
        setup(
          recipe({
            allergyWarning: warning({
              severity: 'soft',
              entries: [
                entry('a-nuts', 'Tree nuts', own, {
                  severity: 'soft',
                  lineId: 'l2',
                }),
                entry('a-milk', 'Milk', own, {
                  severity: 'soft',
                  lineId: 'l3',
                }),
              ],
            }),
          }),
        );
        expect(
          (await banner()).getByText(
            'Optional ingredients contain Tree nuts, Milk: your Allergies',
          ),
        ).toBeInTheDocument();
      });

      it('keeps two Members with the same name apart', async () => {
        setup(
          recipe({
            allergyWarning: warning({
              entries: [
                entry('a-milk', 'Milk', {
                  kind: 'member',
                  memberId: 'm-1',
                  name: 'Ana',
                }),
                entry('a-nuts', 'Tree nuts', {
                  kind: 'member',
                  memberId: 'm-2',
                  name: 'Ana',
                }),
              ],
            }),
          }),
        );
        const view = await banner();
        expect(view.getByText('Ana: Milk')).toBeInTheDocument();
        expect(view.getByText('Ana: Tree nuts')).toBeInTheDocument();
      });

      it("puts other Members' Allergies on a quieter second line after the first", async () => {
        setup(
          recipe({
            allergyWarning: warning({
              entries: [
                entry('a-peanuts', 'Peanuts', own),
                entry('a-milk', 'Milk', {
                  kind: 'member',
                  memberId: 'm-ana',
                  name: 'Ana',
                }),
              ],
            }),
          }),
        );
        const view = await banner();
        const first = view.getByText('Contains Peanuts: your Allergy');
        const second = view.getByText('Ana: Milk');
        expect(
          first.compareDocumentPosition(second) &
            Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        expect(second.parentElement).not.toBe(first.parentElement);
        expect(second.parentElement).toHaveAttribute('data-tier', 'members');
        expect(first.parentElement).toHaveAttribute('data-tier', 'yours');
      });

      it('shows only the second line when only other Members have the Allergy', async () => {
        setup(
          recipe({
            allergyWarning: warning({
              entries: [
                entry('a-milk', 'Milk', {
                  kind: 'member',
                  memberId: 'm-ana',
                  name: 'Ana',
                }),
                entry('a-nuts', 'Tree nuts', {
                  kind: 'member',
                  memberId: 'm-ben',
                  name: 'Ben',
                }),
              ],
            }),
          }),
        );
        const view = await banner();
        expect(view.getByText('Ana: Milk')).toBeInTheDocument();
        expect(view.getByText('Ben: Tree nuts')).toBeInTheDocument();
        expect(view.queryByText(/your Allerg/)).toBeNull();
      });

      it('marks an optional-only Allergy of another Member as optional', async () => {
        setup(
          recipe({
            allergyWarning: warning({
              severity: 'soft',
              entries: [
                entry(
                  'a-milk',
                  'Milk',
                  { kind: 'member', memberId: 'm-ana', name: 'Ana' },
                  { severity: 'soft' },
                ),
              ],
            }),
          }),
        );
        expect(
          (await banner()).getByText('Ana: Milk (optional)'),
        ).toBeInTheDocument();
      });

      it('names a Family Allergy in the optional note', async () => {
        setup(
          recipe({
            allergyWarning: warning({
              severity: 'soft',
              entries: [
                entry(
                  'a-nuts',
                  'Tree nuts',
                  { kind: 'family', label: 'Mia' },
                  { severity: 'soft' },
                ),
              ],
            }),
          }),
        );
        expect(
          (await banner()).getByText(
            'Optional ingredient contains Tree nuts: Mia',
          ),
        ).toBeInTheDocument();
      });

      it('marks a line once per Allergen even when several people have it', async () => {
        setup(
          recipe({
            allergyWarning: warning({
              entries: [
                entry('a-peanuts', 'Peanuts', own),
                entry('a-peanuts', 'Peanuts', { kind: 'family', label: 'Mia' }),
                entry('a-peanuts', 'Peanuts', {
                  kind: 'member',
                  memberId: 'm-ana',
                  name: 'Ana',
                }),
              ],
            }),
          }),
        );
        const list = await screen.findByRole('list', { name: 'Ingredients' });
        const [egg] = within(list).getAllByRole('listitem');
        expect(within(egg!).getAllByText('Contains Peanuts')).toHaveLength(1);
      });
    });

    it('never calls the Recipe safe', async () => {
      setup(
        recipe({
          allergyWarning: warning({
            severity: 'soft',
            uncheckedCount: 1,
            entries: [softNuts],
          }),
        }),
      );
      await screen.findByRole('group', { name: 'Allergy Warning' });
      expect(document.body.textContent).not.toMatch(/\bsafe\b|allergen-free/i);
    });
  });

  describe('Catalog Recipe ids on /recipes/:id', () => {
    const open = (detail: RecipeDetail) => {
      const { fetchMock } = stubApi({
        [`GET /api/recipes/${detail.id}`]: () => Response.json(detail),
      });
      vi.stubGlobal('fetch', fetchMock);
      renderWithProviders(
        <Routes>
          <Route path="/recipes/:id" element={<RecipeDetailPage />} />
          <Route path="/recipes/explore/:id" element={<p>Preview page</p>} />
          <Route path="/recipes/copy-1" element={<p>Copy page</p>} />
        </Routes>,
        { route: `/recipes/${detail.id}` },
      );
    };

    it("redirects to the Family's live copy when there is one", async () => {
      open(recipe({ owner: 'catalog', familyCopyId: 'copy-1' }));
      expect(await screen.findByText('Copy page')).toBeInTheDocument();
    });

    it('redirects to the Explore preview without a copy', async () => {
      open(recipe({ owner: 'catalog', familyCopyId: null }));
      expect(await screen.findByText('Preview page')).toBeInTheDocument();
    });
  });
});

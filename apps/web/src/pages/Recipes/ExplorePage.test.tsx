import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { findToast, getToast } from '../../test/toast';
import userEvent from '@testing-library/user-event';
import { authoredCss } from '@pocket-pantry/ui/test/authoredCss';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecipeListItem } from '../../lib/recipes';
import {
  renderInAppLayout,
  renderWithProviders,
  stubApi,
} from '../../test/render';
import { ExplorePage } from './ExplorePage';
import { exploreAdds } from '../../lib/exploreAdds';

beforeEach(() => exploreAdds.reset());

/*
 * DOM contract these tests assume:
 * - The list is a `list` named "All Recipes (n)" or "Matches (n)"; each row is a `listitem`.
 * - Each row has one add control: a `button` named "Add {title} to your Recipes", which once the
 *   Recipe is added becomes a `link` to `/recipes/{copyId}` named "{title} is in your Recipes. Open it".
 *   The row then also shows the text "In your Recipes".
 * - The filter block is the search box beside a "Filter by Tags" `button`; picked Tags show below as
 *   "Remove Tag {name}" buttons (no "Clear" chip). The button opens a
 *   `dialog` named "Filter by Tags" with an always-open `listbox` of Catalog Tags only (no "Your
 *   Tags"), each unpicked option with its count in an element named "{n} Recipes".
 * - The toast is a `status` ("Added {title} to your Recipes", with an Undo button); an error toast
 *   is an `alert`.
 */

const soup: RecipeListItem = {
  id: 'soup',
  title: 'Soup',
  parentId: null,
  base: null,
  tags: [
    {
      id: 't-din',
      name: 'Dinner',
      kind: 'catalog',
      groupId: 'g1',
      groupName: 'Meal',
      groupOrder: 1,
    },
    {
      id: 't-veg',
      name: 'Vegan',
      kind: 'catalog',
      groupId: 'g2',
      groupName: 'Diet',
      groupOrder: 2,
    },
    {
      id: 't-it',
      name: 'Italian',
      kind: 'catalog',
      groupId: 'g3',
      groupName: 'Cuisine',
      groupOrder: 3,
    },
  ],
  variantCount: 0,
  servings: 2,
  prepMinutes: 10,
  cookMinutes: 20,
  difficulty: 'easy',
  owner: 'catalog',
  familyCopyId: null,
  copiedFromId: null,
  allergyWarning: null,
};

type Options = {
  /** Answers the copy request. */
  copy?: () => Response;
};

function setup({
  copy = () => Response.json({ id: 'copy-1', created: true }),
}: Options = {}) {
  // What the server says about Soup: its copy, once added, until it is archived.
  let copyId: string | null = null;
  const { fetchMock, calls } = stubApi({
    'GET /api/recipes': () =>
      Response.json({
        recipes: [{ ...soup, familyCopyId: copyId }],
        hiddenByAllergiesCount: 0,
      }),
    'GET /api/recipes/filters': () => Response.json({ tags: [] }),
    'POST /api/recipes/soup/copy': () => {
      const response = copy();
      if (response.ok) copyId = 'copy-1';
      return response;
    },
    'POST /api/recipes/copy-1/archive': () => {
      copyId = null;
      return Response.json({ id: 'copy-1' });
    },
  });
  vi.stubGlobal('fetch', fetchMock);
  renderWithProviders(
    <Routes>
      <Route path="/recipes/explore" element={<ExplorePage />} />
      <Route path="/recipes/:id" element={<p>detail page</p>} />
    </Routes>,
    { route: '/recipes/explore' },
  );
  return calls;
}

const row = async () => {
  const list = await screen.findByRole('list', { name: /^All Recipes/ });
  return within(list).getByRole('listitem');
};
const addButton = () =>
  screen.findByRole('button', { name: 'Add Soup to your Recipes' });

describe('ExplorePage add to Family', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('shows two Tag chips and "+N" on a row, naming every Tag for screen readers', async () => {
    setup();
    await addButton();
    const row = screen.getByText('Soup').closest('li')!;
    const line = within(row).getByRole('group', {
      name: 'Tags: Dinner, Vegan, Italian',
    });
    expect(line).toHaveTextContent('DinnerVegan+1· Easy');
    expect(within(line).getByText('+1')).toHaveAttribute('aria-hidden', 'true');
  });

  it('lists Catalog Recipes from the catalog scope', async () => {
    const calls = setup();
    await addButton();
    const list = calls.filter((c) => c.key === 'GET /api/recipes');
    expect(new URLSearchParams(list[0].search).get('scope')).toBe('catalog');
  });

  it('adds with one tap: the check, the pill and a polite toast with Undo', async () => {
    const calls = setup();
    await userEvent
      .setup({ advanceTimers: vi.advanceTimersByTime })
      .click(await addButton());

    const open = await screen.findByRole('link', {
      name: 'Soup is in your Recipes. Open it',
    });
    expect(open).toHaveAttribute('href', '/recipes/copy-1');
    expect(within(await row()).getByText('In your Recipes')).toBeVisible();
    expect(getToast()).toHaveTextContent('Added Soup to your Recipes');
    expect(screen.getByRole('button', { name: 'Undo' })).toBeVisible();
    expect(calls.some((c) => c.key === 'POST /api/recipes/soup/copy')).toBe(
      true,
    );
    // The Explore list is refetched, and keeps the check from the server's answer.
    await waitFor(() =>
      expect(
        calls.filter((c) => c.key === 'GET /api/recipes').length,
      ).toBeGreaterThan(1),
    );
    expect(
      await screen.findByRole('link', {
        name: 'Soup is in your Recipes. Open it',
      }),
    ).toBeVisible();
  });

  it('Undo archives the copy and restores the row', async () => {
    const calls = setup();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(await addButton());
    await screen.findByRole('link', { name: /is in your Recipes/ });

    await user.click(screen.getByRole('button', { name: 'Undo' }));

    expect(await addButton()).toBeVisible();
    expect(within(await row()).queryByText('In your Recipes')).toBeNull();
    expect(
      calls.some((c) => c.key === 'POST /api/recipes/copy-1/archive'),
    ).toBe(true);
    // The server's answer (no copy) agrees once the list has refetched.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(await addButton()).toBeVisible();
  });

  it('says so, without Undo, when the Family already had the copy', async () => {
    const calls = setup({
      copy: () => Response.json({ id: 'copy-1', created: false }),
    });
    await userEvent
      .setup({ advanceTimers: vi.advanceTimersByTime })
      .click(await addButton());

    expect(await findToast()).toHaveTextContent(
      'Soup is already in your Recipes',
    );
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
    expect(
      await screen.findByRole('link', { name: /is in your Recipes/ }),
    ).toBeVisible();
    expect(
      calls.some((c) => c.key === 'POST /api/recipes/copy-1/archive'),
    ).toBe(false);
  });

  it('rolls back a failed add and says so', async () => {
    setup({
      copy: () =>
        Response.json({ code: 'recipes.copy_archived' }, { status: 409 }),
    });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(await addButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't add Soup. Try again.",
    );
    expect(await addButton()).toBeVisible();
    expect(within(await row()).queryByText('In your Recipes')).toBeNull();
  });

  it('opens the copy when the added check is tapped', async () => {
    setup();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(await addButton());
    fireEvent.click(
      await screen.findByRole('link', { name: /is in your Recipes/ }),
    );
    expect(await screen.findByText('detail page')).toBeVisible();
  });
});

const base = (
  id: string,
  over: Partial<RecipeListItem> = {},
): RecipeListItem => ({
  ...soup,
  id,
  title: id,
  ...over,
});

const cardOf = (
  baseId: string,
  over: Record<string, unknown> = {},
  recipe: Record<string, unknown> = {},
) => ({
  base: { id: baseId, title: baseId, archived: false },
  recipe: {
    id: baseId,
    title: baseId,
    parentId: null,
    owner: 'catalog',
    servings: 2,
    prepMinutes: 10,
    cookMinutes: 20,
    tags: [],
    allergyWarning: null,
    ...recipe,
  },
  canMake: true,
  missing: null,
  expiringCount: 0,
  otherVariantsCount: 0,
  ...over,
});

function setupGroups({
  list = (_url: URL): RecipeListItem[] => [],
  cards = [] as
    ReturnType<typeof cardOf>[] | ((url: URL) => ReturnType<typeof cardOf>[]),
  hidden = 0,
} = {}) {
  const { fetchMock, calls } = stubApi({
    'GET /api/recipes': (url) =>
      Response.json({ recipes: list(url), hiddenByAllergiesCount: hidden }),
    'GET /api/recipes/filters': () => Response.json({ tags: [] }),
    'GET /api/recipes/cook-tonight': (url) =>
      Response.json({
        cards: typeof cards === 'function' ? cards(url) : cards,
        hiddenByAllergiesCount: 0,
      }),
    'POST /api/recipes/b/copy': () =>
      Response.json({ id: 'copy-b', created: true }),
    'POST /api/recipes/copy-b/archive': () => Response.json({ id: 'copy-b' }),
  });
  vi.stubGlobal('fetch', fetchMock);
  renderWithProviders(
    <Routes>
      <Route path="/recipes/explore" element={<ExplorePage />} />
      <Route path="/recipes" element={<p>recipes page</p>} />
    </Routes>,
    { route: '/recipes/explore' },
  );
  return calls;
}

const titlesIn = (list: HTMLElement) =>
  within(list)
    .getAllByRole('listitem')
    .map((li) => li.querySelector('div')?.textContent ?? '');

describe('ExplorePage groups', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('puts what the Pantry can make first, most expiring first, without the Can make pill, and the rest A to Z', async () => {
    const calls = setupGroups({
      list: () => [base('a'), base('b'), base('c'), base('d')],
      cards: [
        cardOf('b'),
        cardOf('d', { expiringCount: 2 }),
        cardOf('a', {
          canMake: false,
          missing: { ingredientId: null, name: 'egg' },
        }),
      ],
    });
    const make = await screen.findByRole('list', {
      name: /^You can make this/,
    });
    expect(titlesIn(make).map((x) => x.slice(0, 1))).toEqual(['d', 'b']);
    expect(within(make).queryByText('Can Make')).toBeNull();
    expect(within(make).getByText('2 expiring')).toBeVisible();
    const all = screen.getByRole('list', { name: /^All Recipes/ });
    expect(titlesIn(all).map((x) => x.slice(0, 1))).toEqual(['a', 'c']);
    const url = calls.find((c) => c.key === 'GET /api/recipes/cook-tonight')!;
    expect(new URLSearchParams(url.search).get('scope')).toBe('catalog');
  });

  it("lists a Catalog Variant card's Base in the group", async () => {
    setupGroups({
      list: () => [base('omelette', { variantCount: 1 })],
      cards: [
        cardOf(
          'omelette',
          {},
          { id: 'cheese', title: 'Cheese omelette', parentId: 'omelette' },
        ),
      ],
    });
    const make = await screen.findByRole('list', {
      name: /^You can make this/,
    });
    expect(within(make).getByText('omelette')).toBeVisible();
    expect(screen.queryByRole('list', { name: /^All Recipes/ })).toBeNull();
  });

  it('shows 4 rows, then Show n more', async () => {
    setupGroups({
      list: () => ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => base(id)),
    });
    const all = await screen.findByRole('list', { name: /^All Recipes/ });
    expect(within(all).getAllByRole('listitem')).toHaveLength(4);
    await userEvent.click(screen.getByRole('button', { name: 'Show 2 more' }));
    expect(within(all).getAllByRole('listitem')).toHaveLength(6);
    expect(screen.queryByRole('button', { name: /Show .* more/ })).toBeNull();
  });

  it('folds into Matches with Variants while searching, and says when nothing matches', async () => {
    setupGroups({
      list: (url) =>
        url.searchParams.has('search')
          ? url.searchParams.get('search') === 'zzz'
            ? []
            : [
                base('cheese', {
                  parentId: 'omelette',
                  base: { id: 'omelette', title: 'Omelette' },
                }),
              ]
          : [base('omelette')],
      cards: [cardOf('omelette')],
    });
    await screen.findByRole('list', { name: /^You can make this/ });
    const user = userEvent.setup();
    await user.type(
      screen.getByRole('searchbox', { name: 'Search all Recipes' }),
      'che',
    );
    const matches = await screen.findByRole('list', { name: /^Matches/ });
    expect(await screen.findByText('Variant of Omelette')).toBeVisible();
    expect(matches).toBeInTheDocument();
    expect(
      screen.queryByRole('list', { name: /^You can make this/ }),
    ).toBeNull();
    await user.clear(screen.getByRole('searchbox'));
    await user.type(screen.getByRole('searchbox'), 'zzz');
    expect(await screen.findByText('No Recipes match.')).toBeVisible();
  });

  it('offers the Recipes hidden by Allergies', async () => {
    setupGroups({ list: () => [base('a')], hidden: 2 });
    expect(await screen.findByRole('button', { name: /show/i })).toBeVisible();
  });

  it('never lists a hidden Recipe under "You can make this", even after Show', async () => {
    setupGroups({
      list: (url) =>
        url.searchParams.get('showHidden') === 'true'
          ? [base('safe'), base('nuts')]
          : [base('safe')],
      cards: [cardOf('safe'), cardOf('nuts')],
      hidden: 1,
    });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /show/i }));
    await screen.findByRole('button', { name: 'Add nuts to your Recipes' });
    const canMake = screen.getByRole('list', { name: /^You can make this/ });
    expect(within(canMake).getByText('safe')).toBeVisible();
    expect(within(canMake).queryByText('nuts')).toBeNull();
  });
});

describe('ExplorePage Cook Tonight cards after Show', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('keeps a "You can make this" row on its safe card, never a hidden Variant', async () => {
    setupGroups({
      list: () => [base('omelette', { variantCount: 1 })],
      cards: (url) =>
        url.searchParams.get('showHidden') === 'true'
          ? [
              cardOf(
                'omelette',
                { expiringCount: 7 },
                { id: 'nuts', title: 'Nut omelette', parentId: 'omelette' },
              ),
            ]
          : [cardOf('omelette', { expiringCount: 2 })],
      hidden: 1,
    });
    const user = userEvent.setup();
    const make = await screen.findByRole('list', {
      name: /^You can make this/,
    });
    expect(within(make).getByText('2 expiring')).toBeVisible();
    await user.click(await screen.findByRole('button', { name: /show/i }));
    await waitFor(() =>
      expect(
        screen.getByRole('list', { name: /^You can make this/ }),
      ).toBeVisible(),
    );
    const after = screen.getByRole('list', { name: /^You can make this/ });
    expect(within(after).getByText('2 expiring')).toBeVisible();
    expect(within(after).queryByText('7 expiring')).toBeNull();
  });
});

describe('ExplorePage Back badge', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('counts net adds on Back, counts down on Undo and hides at 0', async () => {
    setupGroups({ list: () => [base('b')] });
    const user = userEvent.setup();
    expect(await screen.findByRole('link', { name: 'Back' })).toBeVisible();
    expect(screen.queryByTestId('back-badge')).toBeNull();
    await user.click(
      await screen.findByRole('button', { name: 'Add b to your Recipes' }),
    );
    expect(
      await screen.findByRole('link', {
        name: 'Back to your Recipes, 1 added',
      }),
    ).toBeVisible();
    expect(screen.getByTestId('back-badge')).toHaveTextContent('+1');
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(screen.queryByTestId('back-badge')).toBeNull());
    expect(screen.getByRole('link', { name: 'Back' })).toBeVisible();
  });
});

describe('ExplorePage Back', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('goes back at once, with no slide of its own', async () => {
    setupGroups({ list: () => [base('a')] });
    await userEvent.click(await screen.findByRole('link', { name: 'Back' }));
    expect(await screen.findByText('recipes page')).toBeVisible();
  });
});

describe('ExplorePage Tag filter', () => {
  const tag = (id: string, name: string, groupName: string, order: number) =>
    ({
      id,
      name,
      kind: 'catalog',
      groupId: `g${order}`,
      groupName,
      groupOrder: order,
    }) as const;
  const DINNER = tag('t-din', 'Dinner', 'Meal', 1);
  const VEGAN = tag('t-veg', 'Vegan', 'Diet', 2);
  const ITALIAN = tag('t-it', 'Italian', 'Cuisine', 3);
  const GRILL = tag('t-grill', 'Grill', 'Method', 4);
  const pasta = base('Pasta', { tags: [DINNER, ITALIAN] });
  const curry = base('Curry', { tags: [DINNER, VEGAN] });
  const salad = base('Salad', { tags: [VEGAN] });
  const kebab = base('Kebab', {
    tags: [GRILL],
    parentId: 'Skewer',
    base: { id: 'Skewer', title: 'Skewer' },
  });
  const all = [pasta, curry, salad, kebab];

  const answer = (url: URL) => {
    const ids = (url.searchParams.get('tagIds') ?? '')
      .split(',')
      .filter(Boolean);
    const q = (url.searchParams.get('search') ?? '').toLowerCase();
    return all.filter(
      (r) =>
        ids.every((id) => r.tags.some((t) => t.id === id)) &&
        r.title.toLowerCase().includes(q),
    );
  };

  function setupTags() {
    const { fetchMock, calls } = stubApi({
      'GET /api/recipes': (url) =>
        Response.json({ recipes: answer(url), hiddenByAllergiesCount: 0 }),
      'GET /api/recipes/filters': () =>
        Response.json({
          tags: [DINNER, VEGAN, ITALIAN, GRILL],
          eatingMoments: [],
        }),
      'GET /api/recipes/cook-tonight': () =>
        Response.json({ cards: [], hiddenByAllergiesCount: 0 }),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/recipes/explore" element={<ExplorePage />} />
      </Routes>,
      { route: '/recipes/explore' },
    );
    return calls;
  }
  const lastQuery = (calls: ReturnType<typeof setupTags>) =>
    new URLSearchParams(
      calls.filter((c) => c.key === 'GET /api/recipes').at(-1)!.search,
    );
  const openTags = async () => {
    await userEvent.click(
      await screen.findByRole('button', { name: /^Filter by Tags/ }),
    );
    return screen.findByRole('dialog', { name: 'Filter by Tags' });
  };
  const closeTags = async () => {
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  };

  afterEach(() => vi.unstubAllGlobals());

  it('starts with no Tag picked, and has no Clear chip', async () => {
    const calls = setupTags();
    await screen.findByRole('list', { name: /^All Recipes/ });
    expect(
      await screen.findByRole('button', { name: 'Filter by Tags' }),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull();
    expect(lastQuery(calls).has('tagIds')).toBe(false);
  });

  it('offers only the Catalog Tags it is given, with no Your Tags group, and a count on each', async () => {
    setupTags();
    await screen.findByRole('list', { name: /^All Recipes/ });
    const dialog = await openTags();
    const options = await within(dialog).findAllByRole('option');
    expect(
      options.map((o) => o.textContent?.replace(/\d+ Recipes?$/, '')),
    ).toEqual(['Dinner', 'Vegan', 'Italian', 'Grill']);
    expect(within(dialog).queryByText('Your Tags')).toBeNull();
    await waitFor(() =>
      expect(within(options[1]).getByText('2 Recipes')).toBeInTheDocument(),
    );
  });

  it('filters by several Tags (AND) with the search, listing Variants as their own rows matched on their own Tags', async () => {
    const calls = setupTags();
    const user = userEvent.setup();
    await screen.findByRole('list', { name: /^All Recipes/ });
    const dialog = await openTags();
    await user.click(
      await within(dialog).findByRole('option', { name: /^Dinner/ }),
    );
    await user.click(within(dialog).getByRole('option', { name: /^Vegan/ }));
    await waitFor(() =>
      expect(lastQuery(calls).get('tagIds')).toBe('t-din,t-veg'),
    );
    expect(
      await within(dialog).findByRole('button', { name: 'Show 1 Recipe' }),
    ).toBeInTheDocument();
    await closeTags();

    const list = await screen.findByRole('list', { name: /^Matches/ });
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    expect(within(list).getByText('Curry')).toBeInTheDocument();
    // The picked Tags lead the row's Tag line and carry the ring (matched).
    expect(
      within(list).getByRole('group', { name: 'Tags: Dinner, Vegan' }),
    ).toBeInTheDocument();
    expect(await findToast()).toHaveTextContent(
      'Dinner, Vegan selected. 1 Recipe matches.',
    );

    await user.type(screen.getByLabelText('Search all Recipes'), 'zzz');
    expect(
      await screen.findByText('No Recipes have all 2 Tags and match “zzz”'),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: /^Without Dinner/ }),
    ).toBeInTheDocument();
  });

  it('shows a Variant that has the Tag on its own, labelled with its Base', async () => {
    setupTags();
    const user = userEvent.setup();
    await screen.findByRole('list', { name: /^All Recipes/ });
    const dialog = await openTags();
    await user.click(
      await within(dialog).findByRole('option', { name: /^Grill/ }),
    );
    await closeTags();
    const list = await screen.findByRole('list', { name: /^Matches/ });
    expect(await within(list).findByText('Kebab')).toBeInTheDocument();
    expect(within(list).getByText('Variant of Skewer')).toBeInTheDocument();
  });

  it('removes a Tag by tapping its chip', async () => {
    const calls = setupTags();
    const user = userEvent.setup();
    await screen.findByRole('list', { name: /^All Recipes/ });
    const dialog = await openTags();
    await user.click(
      await within(dialog).findByRole('option', { name: /^Vegan/ }),
    );
    await closeTags();
    await user.click(
      await screen.findByRole('button', { name: 'Remove Tag Vegan' }),
    );
    await waitFor(() => expect(lastQuery(calls).has('tagIds')).toBe(false));
    expect(
      await screen.findByRole('list', { name: /^All Recipes/ }),
    ).toBeInTheDocument();
  });
});

describe('ExplorePage in the Canopy layout', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('holds the description, search and Tags in the header and the list in the sheet', async () => {
    const { fetchMock } = stubApi({
      'GET /api/recipes': () =>
        Response.json({ recipes: [soup], hiddenByAllergiesCount: 0 }),
      'GET /api/recipes/filters': () => Response.json({ tags: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderInAppLayout(<ExplorePage />, '/recipes/explore');
    const list = await screen.findByRole('list', { name: /^All Recipes/ });
    const header = document.querySelector<HTMLElement>(
      '[data-region="header"]',
    )!;
    const topBar = document.querySelector<HTMLElement>(
      '[data-region="top-bar"]',
    )!;
    expect(
      within(topBar).getByRole('heading', { name: 'Explore' }),
    ).toBeInTheDocument();
    expect(within(topBar).getByText('Catalog Recipes')).toBeInTheDocument();
    expect(
      within(header).getByText(/^Add a Recipe to cook, plan and change it/),
    ).toBeInTheDocument();
    expect(
      within(header).getByRole('searchbox', { name: 'Search all Recipes' }),
    ).toBeInTheDocument();
    expect(
      within(header).getByRole('button', { name: 'Filter by Tags' }),
    ).toBeInTheDocument();
    expect(header).not.toContainElement(list);
  });

  it('ends each row in a 44 pt square add button', async () => {
    const { fetchMock } = stubApi({
      'GET /api/recipes': () =>
        Response.json({ recipes: [soup], hiddenByAllergiesCount: 0 }),
      'GET /api/recipes/filters': () => Response.json({ tags: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderInAppLayout(<ExplorePage />, '/recipes/explore');
    const add = await screen.findByRole('button', {
      name: 'Add Soup to your Recipes',
    });
    const css = authoredCss(add);
    expect(css).toMatch(/width:\s*44px/);
    expect(css).toMatch(/height:\s*44px/);
  });
});

import type { ReactNode } from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Route, Routes } from 'react-router-dom';
import { apiRequest } from '@/lib/api';
import { suggestionsQueryKey } from '@/lib/queryKeys';
import { shoppingListQueryKey } from '@/lib/shopping';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PantryLine, PantryMatch } from '@/lib/recipes';
import type { RecipeDetail } from '@/lib/recipes';
import { renderInAppLayout, renderWithProviders, stubApi } from '@/test/render';
import { RecipeDetailPage } from './RecipeDetailPage';

const detail: RecipeDetail = {
  id: 'r1',
  parentId: null,
  owner: 'family',
  title: 'Pancakes',
  servings: 2,
  prepMinutes: null,
  cookMinutes: null,
  difficulty: null,
  tags: [],
  archived: false,
  lines: [
    ['l-flour', 'Flour', 200, 'g', false],
    ['l-egg', 'Egg', 2, 'pcs', false],
    ['l-milk', 'Milk', 300, 'ml', false],
    ['l-salt', 'Salt', 1, 'g', false],
    ['l-chive', 'Chives', null, null, true],
  ].map(([id, ingredientName, quantity, unit, optional]) => ({
    id: id as string,
    ingredientId: id as string,
    ingredientName: ingredientName as string,
    quantity: quantity as number | null,
    unit: unit as 'g' | null,
    optional: optional as boolean,
    note: id === 'l-chive' ? 'chopped' : null,
  })),
  steps: [],
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
};

const line = (over: Partial<PantryLine> & { lineId: string }): PantryLine => ({
  ingredientId: over.lineId,
  name: null,
  status: 'covered',
  optional: false,
  pantryBasic: false,
  quantity: null,
  unit: null,
  shortfall: null,
  usesExpiringSoon: false,
  onShoppingList: false,
  ...over,
});

const match = (over: Partial<PantryMatch> = {}): PantryMatch => ({
  servings: 2,
  canMake: false,
  shortOrMissingCount: 3,
  expiringCoveredCount: 0,
  coverageRatio: 0.5,
  lines: [
    line({
      lineId: 'l-flour',
      status: 'short',
      quantity: 200,
      unit: 'g',
      shortfall: { quantity: 150, unit: 'g' },
    }),
    line({ lineId: 'l-egg', status: 'missing', quantity: 2, unit: 'pcs' }),
    line({
      lineId: 'l-milk',
      status: 'missing',
      quantity: 300,
      unit: 'ml',
      onShoppingList: true,
    }),
    line({
      lineId: 'l-salt',
      pantryBasic: true,
      quantity: 1,
      unit: 'g',
    }),
    line({ lineId: 'l-chive', status: 'missing', optional: true }),
  ],
  ...over,
});

function setup(
  respond: (url: URL) => PantryMatch = () => match(),
  addMissing: () => Response = () => Response.json({ items: [] }),
) {
  const { fetchMock, calls } = stubApi({
    'GET /api/recipes/r1': () => Response.json(detail),
    'GET /api/recipes/r1/pantry-match': (url) => Response.json(respond(url)),
    'POST /api/recipes/r1/add-missing': addMissing,
  });
  vi.stubGlobal('fetch', fetchMock);
  renderWithProviders(
    <Routes>
      <Route path="/recipes/:id" element={<RecipeDetailPage />} />
    </Routes>,
    { route: '/recipes/r1' },
  );
  return calls;
}

const row = (name: RegExp) => {
  const list = screen.getByRole('list', { name: 'Ingredients' });
  return within(list)
    .getAllByRole('listitem')
    .find((li) => name.test(li.textContent ?? ''))!;
};

/** The top-row heading of the Ingredients tab (the tab badge also says "{n} to buy"). */
const toBuyHeading = async (text: string) =>
  within(await screen.findByRole('tabpanel')).findByText(text);

describe('Recipe detail Pantry status', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows each line as covered, short (with the shortfall) or missing', async () => {
    setup();
    await screen.findByText('Short 150 g');
    expect(within(row(/Flour/)).getByText('Short 150 g')).toBeInTheDocument();
    expect(within(row(/Egg/)).getByText('Missing')).toBeInTheDocument();
    expect(within(row(/Milk/)).getByText('Missing')).toBeInTheDocument();
  });

  it('hints that a missing line is on the Shopping List', async () => {
    setup();
    await screen.findByText('Short 150 g');
    expect(within(row(/Milk/)).getByText(/on list/)).toBeInTheDocument();
    expect(within(row(/Milk/)).getByText('Missing')).toBeInTheDocument();
    expect(within(row(/Egg/)).queryByText(/on list/)).toBeNull();
  });

  it('adds no on-list hint to a covered line that is on the Shopping List', async () => {
    setup(() =>
      match({
        lines: [
          line({
            lineId: 'l-flour',
            quantity: 200,
            unit: 'g',
            onShoppingList: true,
          }),
          line({ lineId: 'l-egg', status: 'missing' }),
        ],
      }),
    );
    await toBuyHeading('3 to buy');
    expect(
      within(row(/Flour/)).getByText('In your Pantry'),
    ).toBeInTheDocument();
    expect(within(row(/Flour/)).queryByText(/on list/)).toBeNull();
  });

  it('reads a covered Pantry Basic as Pantry Basic, not In your Pantry', async () => {
    setup();
    await screen.findByText('Short 150 g');
    expect(within(row(/Salt/)).getByText('Pantry Basic')).toBeInTheDocument();
    expect(within(row(/Salt/)).queryByText('In your Pantry')).toBeNull();
  });

  it('says In your Pantry on a covered line', async () => {
    setup(() =>
      match({
        lines: [line({ lineId: 'l-flour', quantity: 200, unit: 'g' })],
      }),
    );
    await toBuyHeading('3 to buy');
    expect(
      within(row(/Flour/)).getByText('In your Pantry'),
    ).toBeInTheDocument();
  });

  it('shows a quantity tag after the name: unit amounts, a bare number for pieces, none without a quantity', async () => {
    setup();
    await screen.findByText('Short 150 g');
    expect(within(row(/Flour/)).getByText('200 g')).toBeInTheDocument();
    expect(within(row(/Milk/)).getByText('300 ml')).toBeInTheDocument();
    expect(within(row(/Egg/)).getByText('2')).toBeInTheDocument();
    expect(within(row(/Egg/)).queryByText(/pcs/)).toBeNull();
    expect(row(/Chives/).textContent).not.toMatch(/\d/);
  });

  it('shows the note and optional under the name', async () => {
    setup();
    await screen.findByText('Short 150 g');
    expect(within(row(/Chives/)).getByText(/chopped/)).toBeInTheDocument();
    expect(within(row(/Chives/)).getByText(/optional/)).toBeInTheDocument();
    expect(within(row(/Flour/)).queryByText(/optional/)).toBeNull();
  });

  it('marks a Pantry Basic and still shows the status of an optional line', async () => {
    setup();
    await screen.findByText('Short 150 g');
    expect(within(row(/Salt/)).getByText('Pantry Basic')).toBeInTheDocument();
    expect(within(row(/Chives/)).getByText('Missing')).toBeInTheDocument();
    expect(within(row(/Chives/)).getByText(/optional/)).toBeInTheDocument();
  });

  it('heads the Ingredients tab with how many lines to buy', async () => {
    setup();
    expect(await toBuyHeading('3 to buy')).toBeVisible();
    expect(screen.queryByText(/Missing \d+ ingredient/)).toBeNull();
  });

  it('says so when the Recipe can be made', async () => {
    setup(() => match({ canMake: true, shortOrMissingCount: 0, lines: [] }));
    expect(await toBuyHeading('You can make this')).toBeVisible();
    expect(
      within(screen.getByRole('tabpanel')).queryByText(/to buy/),
    ).toBeNull();
  });

  it('asks for the match at the Servings picked, with the Member date', async () => {
    const calls = setup((url) =>
      match({ servings: Number(url.searchParams.get('servings')) }),
    );
    await screen.findByText('Short 150 g');
    const first = calls.find(
      (c) => c.key === 'GET /api/recipes/r1/pantry-match',
    )!;
    expect(first.search).toMatch(/servings=2/);
    expect(first.search).toMatch(/today=\d{4}-\d{2}-\d{2}/);
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'More Servings' }));
    await waitFor(() =>
      expect(
        calls.some(
          (c) =>
            c.key === 'GET /api/recipes/r1/pantry-match' &&
            c.search.includes('servings=3'),
        ),
      ).toBe(true),
    );
    expect(screen.getByText('3 Servings')).toBeVisible();
  });

  it('shows the quantities the match scaled to the Servings', async () => {
    setup((url) =>
      match({
        servings: Number(url.searchParams.get('servings')),
        lines: [
          line({
            lineId: 'l-flour',
            quantity: Number(url.searchParams.get('servings')) * 100,
            unit: 'g',
          }),
        ],
      }),
    );
    await vi.waitFor(() =>
      expect(within(row(/Flour/)).getByText('200 g')).toBeInTheDocument(),
    );
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'More Servings' }));
    expect(await within(row(/Flour/)).findByText('300 g')).toBeVisible();
  });

  it('adds the missing lines at the current Servings and confirms', async () => {
    const calls = setup();
    const user = userEvent.setup();
    await screen.findByText('Short 150 g');
    await user.click(screen.getByRole('button', { name: 'More Servings' }));
    await user.click(
      screen.getByRole('button', { name: 'Add 3 missing to Shopping List' }),
    );
    const post = await vi.waitFor(() => {
      const c = calls.find((x) => x.key === 'POST /api/recipes/r1/add-missing');
      expect(c).toBeDefined();
      return c!;
    });
    expect(post.body).toMatchObject({ servings: 3 });
    expect(
      await screen.findByText('Added 3 items to your Shopping List'),
    ).toBeVisible();
  });

  it('disables the button while adding', async () => {
    let finish: (r: Response) => void = () => {};
    const pending = new Promise<Response>((resolve) => (finish = resolve));
    const { fetchMock } = stubApi({
      'GET /api/recipes/r1': () => Response.json(detail),
      'GET /api/recipes/r1/pantry-match': () => Response.json(match()),
    });
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) =>
      init?.method === 'POST' ? pending : fetchMock(input, init),
    );
    renderWithProviders(
      <Routes>
        <Route path="/recipes/:id" element={<RecipeDetailPage />} />
      </Routes>,
      { route: '/recipes/r1' },
    );
    await screen.findByText('Short 150 g');
    const button = screen.getByRole('button', {
      name: 'Add 3 missing to Shopping List',
    });
    await userEvent.setup().click(button);
    await waitFor(() => expect(button).toBeDisabled());
    finish(Response.json({ items: [] }));
  });

  it('shows no Add missing button when nothing would be added', async () => {
    setup(() =>
      match({
        canMake: true,
        shortOrMissingCount: 0,
        lines: [
          line({ lineId: 'l-flour' }),
          line({ lineId: 'l-salt', pantryBasic: true }),
          line({ lineId: 'l-chive', status: 'missing', optional: true }),
        ],
      }),
    );
    await toBuyHeading('You can make this');
    expect(
      screen.queryByRole('button', { name: /^Add \d+ missing/ }),
    ).toBeNull();
  });

  it('counts only the addable lines in the button', async () => {
    setup(() =>
      match({
        lines: [
          line({ lineId: 'l-egg', status: 'missing' }),
          line({ lineId: 'l-chive', status: 'missing', optional: true }),
          line({ lineId: 'l-salt', status: 'missing', pantryBasic: true }),
        ],
      }),
    );
    await toBuyHeading('3 to buy');
    expect(
      screen.getByRole('button', { name: 'Add 1 missing to Shopping List' }),
    ).toBeEnabled();
  });

  it('disables the button while the match for the picked Servings loads', async () => {
    const { fetchMock } = stubApi({
      'GET /api/recipes/r1': () => Response.json(detail),
      'GET /api/recipes/r1/pantry-match': () => Response.json(match()),
    });
    let finish: (r: Response) => void = () => {};
    const pending = new Promise<Response>((resolve) => (finish = resolve));
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) =>
      String(input).includes('servings=3') ? pending : fetchMock(input, init),
    );
    renderWithProviders(
      <Routes>
        <Route path="/recipes/:id" element={<RecipeDetailPage />} />
      </Routes>,
      { route: '/recipes/r1' },
    );
    await screen.findByText('Short 150 g');
    const button = screen.getByRole('button', {
      name: 'Add 3 missing to Shopping List',
    });
    expect(button).toBeEnabled();
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'More Servings' }));
    expect(button).toBeDisabled();
    finish(Response.json(match({ servings: 3 })));
    await waitFor(() => expect(button).toBeEnabled());
  });

  it('reads Added to your list and stays disabled after adding', async () => {
    setup();
    const user = userEvent.setup();
    await screen.findByText('Short 150 g');
    await user.click(
      screen.getByRole('button', { name: 'Add 3 missing to Shopping List' }),
    );
    expect(
      await screen.findByText('Added 3 items to your Shopping List'),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Added to your list' }),
    ).toBeDisabled();
  });

  it('still allows adding lines already on the list, with a warning', async () => {
    setup(() =>
      match({
        lines: [
          line({ lineId: 'l-egg', status: 'missing', onShoppingList: true }),
        ],
      }),
    );
    await toBuyHeading('3 to buy');
    expect(
      screen.getByRole('button', { name: 'Add 1 missing to Shopping List' }),
    ).toBeEnabled();
    expect(
      screen.getByText(
        'Some of these are already on your list; adding them again increases the amount.',
      ),
    ).toBeVisible();
  });

  it('does not warn when none of the missing lines is on the list', async () => {
    setup(() =>
      match({ lines: [line({ lineId: 'l-egg', status: 'missing' })] }),
    );
    await toBuyHeading('3 to buy');
    expect(screen.queryByText(/already on your list/)).toBeNull();
  });

  it('shows the error when adding fails', async () => {
    setup(
      () => match(),
      () => Response.json({ code: 'not_found', params: {} }, { status: 404 }),
    );
    await screen.findByText('Short 150 g');
    await userEvent
      .setup()
      .click(
        screen.getByRole('button', { name: 'Add 3 missing to Shopping List' }),
      );
    expect(await screen.findByRole('alert')).toBeVisible();
    // The button is in the header now, and stays there to try again.
    expect(
      screen.getByRole('button', { name: 'Add 3 missing to Shopping List' }),
    ).toBeVisible();
  });

  it('keeps the stepper within 1 and the API maximum', async () => {
    const { fetchMock, calls } = stubApi({
      'GET /api/recipes/r1': () => Response.json({ ...detail, servings: 1 }),
      'GET /api/recipes/r1/pantry-match': () => Response.json(match()),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/recipes/:id" element={<RecipeDetailPage />} />
      </Routes>,
      { route: '/recipes/r1' },
    );
    await screen.findByText('Short 150 g');
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Fewer Servings' }));
    expect(screen.getByText('1 Serving')).toBeVisible();
    expect(calls.some((c) => c.search.includes('servings=0'))).toBe(false);
  });

  it('stops at the maximum Servings', async () => {
    const { fetchMock, calls } = stubApi({
      'GET /api/recipes/r1': () => Response.json({ ...detail, servings: 100 }),
      'GET /api/recipes/r1/pantry-match': () => Response.json(match()),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/recipes/:id" element={<RecipeDetailPage />} />
      </Routes>,
      { route: '/recipes/r1' },
    );
    await screen.findByText('Short 150 g');
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'More Servings' }));
    expect(screen.getByText('100 Servings')).toBeVisible();
    expect(calls.some((c) => c.search.includes('servings=101'))).toBe(false);
  });

  it('starts a Recipe fresh when navigating from a Variant to its base', async () => {
    const variant = {
      ...detail,
      id: 'v1',
      parentId: 'r1',
      title: 'Vegan pancakes',
      servings: 4,
      base: {
        id: 'r1',
        title: 'Pancakes',
        archived: false,
        familyCopyId: 'r1-copy',
      },
    };
    const { fetchMock, calls } = stubApi({
      'GET /api/recipes/r1': () => Response.json(detail),
      'GET /api/recipes/r1-copy': () =>
        Response.json({ ...detail, id: 'r1-copy' }),
      'GET /api/recipes/r1-copy/pantry-match': (url) =>
        Response.json(
          match({ servings: Number(url.searchParams.get('servings')) }),
        ),
      'GET /api/recipes/v1': () => Response.json(variant),
      'GET /api/recipes/r1/pantry-match': (url) =>
        Response.json(
          match({ servings: Number(url.searchParams.get('servings')) }),
        ),
      'GET /api/recipes/v1/pantry-match': (url) =>
        Response.json(
          match({ servings: Number(url.searchParams.get('servings')) }),
        ),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/recipes/:id" element={<RecipeDetailPage />} />
      </Routes>,
      { route: '/recipes/v1' },
    );
    const user = userEvent.setup();
    await screen.findByText('Short 150 g');
    await user.click(screen.getByRole('button', { name: 'More Servings' }));
    expect(screen.getByText('5 Servings')).toBeVisible();
    await user.click(screen.getByRole('link', { name: /Variant of Pancakes/ }));
    expect(await screen.findByText('2 Servings')).toBeVisible();
    const baseMatches = calls.filter(
      (c) => c.key === 'GET /api/recipes/r1-copy/pantry-match',
    );
    expect(baseMatches.length).toBeGreaterThan(0);
    expect(baseMatches.every((c) => c.search.includes('servings=2'))).toBe(
      true,
    );
  });

  it('puts the answer in the Shopping List cache and refreshes the match and Suggestions', async () => {
    let suggestionFetches = 0;
    const { fetchMock, calls } = stubApi({
      'GET /api/recipes/r1': () => Response.json(detail),
      'GET /api/recipes/r1/pantry-match': () => Response.json(match()),
      'GET /api/shopping-list/suggestions': () => {
        suggestionFetches += 1;
        return Response.json({ staples: [], usedUp: [] });
      },
      'POST /api/recipes/r1/add-missing': () =>
        Response.json({ items: [{ id: 'i1' }] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <>
        <CacheProbe />
        <Routes>
          <Route path="/recipes/:id" element={<RecipeDetailPage />} />
        </Routes>
      </>,
      { route: '/recipes/r1' },
    );
    await screen.findByText('Short 150 g');
    await vi.waitFor(() => expect(suggestionFetches).toBe(1));
    const matchFetches = () =>
      calls.filter((c) => c.key === 'GET /api/recipes/r1/pantry-match').length;
    const before = matchFetches();
    await userEvent
      .setup()
      .click(
        screen.getByRole('button', { name: 'Add 3 missing to Shopping List' }),
      );
    expect(await screen.findByText('list items: 1')).toBeVisible();
    await vi.waitFor(() => expect(suggestionFetches).toBe(2));
    await vi.waitFor(() => expect(matchFetches()).toBeGreaterThan(before));
  });
});

/** Renders the page with an add-line stub; once it was POSTed the match marks the `onList` line as on the list. */
function setupLine({
  lines,
  onList = 'l-egg',
  pendingServings,
  addLineResponse,
  extra,
}: {
  lines?: PantryLine[];
  onList?: string;
  pendingServings?: number;
  /** Replaces the successful add-line answer. */
  addLineResponse?: () => Response;
  /** Rendered beside the page. */
  extra?: ReactNode;
} = {}) {
  let posted = false;
  const { fetchMock, calls } = stubApi({
    'GET /api/recipes/r1': () => Response.json(detail),
    'GET /api/recipes/r1/pantry-match': (url) => {
      const base = match({
        servings: Number(url.searchParams.get('servings')),
        ...(lines ? { lines } : {}),
      });
      return Response.json({
        ...base,
        lines: base.lines.map((l) =>
          posted && l.lineId === onList ? { ...l, onShoppingList: true } : l,
        ),
      });
    },
    'GET /api/shopping-list/suggestions': () =>
      Response.json({ staples: [], usedUp: [] }),
    'POST /api/recipes/r1/add-line': () => {
      if (addLineResponse) return addLineResponse();
      posted = true;
      return Response.json({ items: [{ id: 'i1' }] });
    },
  });
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => (release = resolve));
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) =>
    pendingServings !== undefined &&
    String(input).includes(`servings=${pendingServings}`)
      ? gate.then(() => fetchMock(input, init))
      : fetchMock(input, init),
  );
  renderWithProviders(
    <>
      {extra}
      <Routes>
        <Route path="/recipes/:id" element={<RecipeDetailPage />} />
      </Routes>
    </>,
    { route: '/recipes/r1' },
  );
  return { calls, release };
}

/** The row's toggle: the button carrying aria-pressed (the add button is a different button). */
const toggle = (name: RegExp) => {
  const list = screen.getByRole('list', { name: 'Ingredients' });
  const found = within(list)
    .getAllByRole('button')
    .find(
      (b) => b.hasAttribute('aria-pressed') && name.test(b.textContent ?? ''),
    );
  if (!found) throw new Error(`no toggle button for ${name}`);
  return found;
};

const addLineCalls = (
  calls: Array<{ key: string; search: string; body: unknown }>,
) => calls.filter((c) => c.key === 'POST /api/recipes/r1/add-line');

const addButton = (name: string) =>
  screen.getByRole('button', { name: `Add ${name} to Shopping List` });

describe('Recipe detail per-line add', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('makes every row a toggle that starts unpressed', async () => {
    setupLine();
    await screen.findByText('Short 150 g');
    for (const name of [/Flour/, /Egg/, /Milk/, /Salt/, /Chives/]) {
      expect(toggle(name)).toHaveAttribute('aria-pressed', 'false');
    }
  });

  it('selects a row on click, one at a time, and deselects on a second click', async () => {
    setupLine();
    const user = userEvent.setup();
    await screen.findByText('Short 150 g');
    await user.click(toggle(/Flour/));
    expect(toggle(/Flour/)).toHaveAttribute('aria-pressed', 'true');
    await user.click(toggle(/Egg/));
    expect(toggle(/Egg/)).toHaveAttribute('aria-pressed', 'true');
    expect(toggle(/Flour/)).toHaveAttribute('aria-pressed', 'false');
    await user.click(toggle(/Egg/));
    expect(toggle(/Egg/)).toHaveAttribute('aria-pressed', 'false');
  });

  it.each([['{Enter}'], [' ']])(
    'toggles a row with the key %j',
    async (key) => {
      setupLine();
      const user = userEvent.setup();
      await screen.findByText('Short 150 g');
      toggle(/Egg/).focus();
      await user.keyboard(key);
      expect(toggle(/Egg/)).toHaveAttribute('aria-pressed', 'true');
      await user.keyboard(key);
      expect(toggle(/Egg/)).toHaveAttribute('aria-pressed', 'false');
    },
  );

  it('clears the selection when switching tabs and back', async () => {
    setupLine();
    const user = userEvent.setup();
    await screen.findByText('Short 150 g');
    await user.click(toggle(/Egg/));
    await user.click(screen.getByRole('tab', { name: 'Steps' }));
    await user.click(screen.getByRole('tab', { name: /^Ingredients/ }));
    await screen.findByText('Short 150 g');
    expect(toggle(/Egg/)).toHaveAttribute('aria-pressed', 'false');
    expect(
      screen.queryByRole('button', { name: 'Add Egg to Shopping List' }),
    ).toBeNull();
  });

  it('shows the add button only on the selected row', async () => {
    setupLine();
    const user = userEvent.setup();
    await screen.findByText('Short 150 g');
    expect(
      screen.queryByRole('button', { name: 'Add Egg to Shopping List' }),
    ).toBeNull();
    await user.click(toggle(/Egg/));
    expect(
      within(row(/Egg/)).getByRole('button', {
        name: 'Add Egg to Shopping List',
      }),
    ).not.toHaveAttribute('aria-disabled');
    await user.click(toggle(/Egg/));
    expect(
      screen.queryByRole('button', { name: 'Add Egg to Shopping List' }),
    ).toBeNull();
  });

  it('collapses the selected row pill to an icon that keeps the status as its name', async () => {
    setupLine();
    const user = userEvent.setup();
    await screen.findByText('Short 150 g');
    await user.click(toggle(/Flour/));
    expect(within(row(/Flour/)).queryByText('Short 150 g')).toBeNull();
    expect(
      within(row(/Flour/)).getByLabelText('Short 150 g'),
    ).toBeInTheDocument();
    // Other rows keep their words.
    expect(within(row(/Egg/)).getByText('Missing')).toBeInTheDocument();
    await user.click(toggle(/Flour/));
    expect(within(row(/Flour/)).getByText('Short 150 g')).toBeInTheDocument();
  });

  it('adds the line at the current Servings and shows the added state, toast and on-list pill', async () => {
    const { calls } = setupLine();
    const user = userEvent.setup();
    await screen.findByText('Short 150 g');
    await user.click(toggle(/Egg/));
    await user.click(addButton('Egg'));
    const post = await vi.waitFor(() => {
      const c = addLineCalls(calls)[0];
      expect(c).toBeDefined();
      return c!;
    });
    expect(post.body).toMatchObject({ lineId: 'l-egg', servings: 2 });
    expect(
      await screen.findByText('Added Egg to your Shopping List'),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Egg added to your Shopping List' }),
    ).toHaveAttribute('aria-disabled', 'true');
    expect(
      screen.queryByRole('button', { name: 'Add Egg to Shopping List' }),
    ).toBeNull();
    // The button stays focusable, so focus is not dropped after the add.
    expect(
      screen.getByRole('button', { name: 'Egg added to your Shopping List' }),
    ).toHaveFocus();
    // Deselecting restores the full pill, now with the on-list hint.
    await user.click(toggle(/Egg/));
    expect(await within(row(/Egg/)).findByText(/on list/)).toBeVisible();
    expect(within(row(/Egg/)).getByText('Missing')).toBeInTheDocument();
  });

  it('sends the Servings picked with the stepper', async () => {
    const { calls } = setupLine();
    const user = userEvent.setup();
    await screen.findByText('Short 150 g');
    await user.click(screen.getByRole('button', { name: 'More Servings' }));
    await screen.findByText('3 Servings');
    await user.click(toggle(/Flour/));
    await waitFor(() =>
      expect(addButton('Flour')).not.toHaveAttribute('aria-disabled'),
    );
    await user.click(addButton('Flour'));
    const post = await vi.waitFor(() => {
      const c = addLineCalls(calls)[0];
      expect(c).toBeDefined();
      return c!;
    });
    expect(post.body).toMatchObject({ lineId: 'l-flour', servings: 3 });
  });

  it.each([
    ['a Pantry Basic', /Salt/, 'Salt', 'l-salt'],
    ['an optional line', /Chives/, 'Chives', 'l-chive'],
    ['a covered line', /Flour/, 'Flour', 'l-flour'],
  ])('adds %s without filtering it out', async (_what, re, name, lineId) => {
    const { calls } = setupLine({
      lines: [
        line({ lineId: 'l-flour', quantity: 200, unit: 'g' }),
        line({ lineId: 'l-salt', pantryBasic: true, quantity: 1, unit: 'g' }),
        line({ lineId: 'l-chive', status: 'missing', optional: true }),
        line({ lineId: 'l-egg', status: 'missing', quantity: 2, unit: 'pcs' }),
      ],
    });
    const user = userEvent.setup();
    await screen.findByText('In your Pantry');
    await user.click(toggle(re));
    await user.click(addButton(name));
    await vi.waitFor(() => expect(addLineCalls(calls)).toHaveLength(1));
    expect(addLineCalls(calls)[0]!.body).toMatchObject({ lineId });
    // The pill gains the on-list hint even though the line is covered.
    await user.click(toggle(re));
    expect(await within(row(re)).findByText(/on list/)).toBeVisible();
  });

  it('shows the translated error when the add fails, and clears it on another row', async () => {
    setupLine({
      addLineResponse: () =>
        Response.json(
          { code: 'shopping.quantity_too_large', params: {} },
          { status: 400 },
        ),
    });
    const user = userEvent.setup();
    await screen.findByText('Short 150 g');
    await user.click(toggle(/Egg/));
    await user.click(addButton('Egg'));
    expect(
      await within(row(/Egg/)).findByText(/above 1,000,000/),
    ).toBeVisible();
    expect(addButton('Egg')).not.toHaveAttribute('aria-disabled');
    await user.click(toggle(/Flour/));
    expect(screen.queryByText(/above 1,000,000/)).toBeNull();
  });

  it('shows the Recipe-changed message when the line is gone', async () => {
    setupLine({
      addLineResponse: () =>
        Response.json(
          { code: 'recipes.line_not_found', params: {} },
          { status: 404 },
        ),
    });
    const user = userEvent.setup();
    await screen.findByText('Short 150 g');
    await user.click(toggle(/Egg/));
    await user.click(addButton('Egg'));
    expect(
      await within(row(/Egg/)).findByText(/no longer part of this Recipe/),
    ).toBeVisible();
  });

  it('puts the answer in the Shopping List cache and refreshes Suggestions', async () => {
    const { calls } = setupLine({ extra: <CacheProbe /> });
    const user = userEvent.setup();
    await screen.findByText('Short 150 g');
    const suggestionFetches = () =>
      calls.filter((c) => c.key === 'GET /api/shopping-list/suggestions')
        .length;
    await vi.waitFor(() => expect(suggestionFetches()).toBe(1));
    await user.click(toggle(/Egg/));
    await user.click(addButton('Egg'));
    expect(await screen.findByText('list items: 1')).toBeVisible();
    await vi.waitFor(() => expect(suggestionFetches()).toBe(2));
  });

  it('disables Add missing while a per-line add is in flight', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    setupLine({ addLineResponse: () => new Response(null, { status: 500 }) });
    // Hold the POST open by wrapping the stubbed fetch.
    const inner = globalThis.fetch;
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) =>
      String(input).includes('add-line')
        ? gate.then(() => inner(input, init))
        : inner(input, init),
    );
    const user = userEvent.setup();
    await screen.findByText('Short 150 g');
    await user.click(toggle(/Egg/));
    await user.click(addButton('Egg'));
    expect(
      screen.getByRole('button', { name: 'Add 3 missing to Shopping List' }),
    ).toBeDisabled();
    release();
  });

  it('refetches the pantry match after the add', async () => {
    const { calls } = setupLine();
    const user = userEvent.setup();
    await screen.findByText('Short 150 g');
    const matchFetches = () =>
      calls.filter((c) => c.key === 'GET /api/recipes/r1/pantry-match').length;
    const before = matchFetches();
    await user.click(toggle(/Egg/));
    await user.click(addButton('Egg'));
    await vi.waitFor(() => expect(matchFetches()).toBeGreaterThan(before));
  });

  it('disables the per-line add and Add missing while the match is stale', async () => {
    const { release } = setupLine({ pendingServings: 3 });
    const user = userEvent.setup();
    await screen.findByText('Short 150 g');
    await user.click(toggle(/Egg/));
    const add = addButton('Egg');
    const bulk = screen.getByRole('button', {
      name: 'Add 3 missing to Shopping List',
    });
    expect(add).not.toHaveAttribute('aria-disabled');
    expect(bulk).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'More Servings' }));
    expect(add).toHaveAttribute('aria-disabled', 'true');
    expect(bulk).toBeDisabled();
    release();
    await waitFor(() => expect(add).not.toHaveAttribute('aria-disabled'));
    expect(bulk).toBeEnabled();
  });
});

/** Reads the cached English Shopping List and keeps a Suggestions query mounted. */
function CacheProbe() {
  const queryClient = useQueryClient();
  useQuery({
    queryKey: [...suggestionsQueryKey, 'today'],
    queryFn: () => apiRequest('/shopping-list/suggestions'),
  });
  const list = useQuery({
    queryKey: shoppingListQueryKey,
    queryFn: () => new Promise<{ items: unknown[] }>(() => {}),
    enabled: false,
  });
  void queryClient;
  return <p>list items: {list.data?.items.length ?? 0}</p>;
}

describe('Recipe detail in the Canopy header', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('puts the title, facts, Pantry coverage and Add missing in the header, not in the sheet', async () => {
    const { fetchMock } = stubApi({
      'GET /api/recipes/:id': () => Response.json(detail),
      'GET /api/recipes/:id/pantry-match': () => Response.json(match()),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderInAppLayout(<RecipeDetailPage />, '/recipes/:id');
    const header = document.querySelector<HTMLElement>(
      '[data-region="header"]',
    )!;
    expect(
      await within(header).findByRole('heading', {
        level: 1,
        name: 'Pancakes',
      }),
    ).toBeInTheDocument();
    // Required lines only: the Chives are optional. 3 of 4 need adding, so 1 is covered.
    expect(await within(header).findByText('1 of 4')).toBeInTheDocument();
    expect(header).toHaveTextContent('1 of 4 in your Pantry');
    const add = within(header).getByRole('button', {
      name: 'Add 3 missing to Shopping List',
    });
    expect(add).toHaveTextContent('Add 3 missing');
    const sheet = screen.getByTestId('sheet-content');
    expect(
      within(sheet).queryByRole('button', { name: /^Add \d+ missing/ }),
    ).toBeNull();
    expect(within(sheet).queryByRole('heading', { level: 1 })).toBeNull();
  });
});

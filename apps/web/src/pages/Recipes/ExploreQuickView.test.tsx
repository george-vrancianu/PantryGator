import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { findToast, queryToast } from '@/test/toast';
import userEvent from '@testing-library/user-event';
import { Link, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecipeDetail, RecipeListItem } from '@/lib/recipes';
import { exploreAdds } from '@/lib/exploreAdds';
import { renderWithProviders, stubApi } from '@/test/render';
import { stubMatchMedia } from '@/test/viewport';
import { ExplorePage } from './ExplorePage';
import { RecipeDetailPage, RecipePreviewPage } from './RecipeDetailPage';

/*
 * DOM contract: tapping a row's body opens a `dialog` named by the Recipe's title. It holds a
 * "Close" button (the X), the fact terms Time / Serves / Level, a list "Tags" (one chip per Tag; none when the Recipe has no Tags), a list "Ingredients" (a missing
 * chip carries the hidden text "missing"), a list "Variants" and the actions: a button
 * "Add to your Recipes" (then "In your Recipes · Open") as the pinned primary, the pinned
 * secondary "Make a Variant" and the link "See the whole Recipe" in the content.
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
      id: 'c1',
      name: 'Italian',
      kind: 'catalog',
      groupId: 'g3',
      groupName: 'Cuisine',
      groupOrder: 3,
    },
    {
      id: 'm1',
      name: 'Rolled',
      kind: 'catalog',
      groupId: 'g4',
      groupName: 'Method',
      groupOrder: 4,
    },
  ],
  variantCount: 1,
  servings: 2,
  prepMinutes: 10,
  cookMinutes: 20,
  difficulty: 'easy',
  owner: 'catalog',
  familyCopyId: null,
  copiedFromId: null,
  allergyWarning: null,
};

const detail: RecipeDetail = {
  id: 'soup',
  parentId: null,
  owner: 'catalog',
  title: 'Soup',
  servings: 2,
  prepMinutes: 10,
  cookMinutes: 20,
  difficulty: 'easy',
  tags: [],
  archived: false,
  lines: [
    {
      id: 'l1',
      ingredientId: 'water',
      ingredientName: 'Water',
      quantity: 1,
      unit: 'ml',
      optional: false,
      note: null,
    },
    {
      id: 'l2',
      ingredientId: 'leek',
      ingredientName: 'Leek',
      quantity: 1,
      unit: null,
      optional: false,
      note: null,
    },
  ],
  steps: [],
  tips: [],
  base: null,
  variants: [
    {
      id: 'spicy',
      title: 'Spicy soup',
      tags: [],
      owner: 'catalog',
      familyCopyId: null,
    },
    {
      id: 'mine',
      title: 'My soup',
      tags: [],
      owner: 'family',
      familyCopyId: null,
    },
  ],
  familyCopyId: null,
  diff: null,
  guidance: { nutritionNote: null, pairings: [], eatingMoments: [] },
  allergens: { items: [], uncheckedCount: 0 },
  allergyWarning: null,
  sourceLink: null,
  sourceLanguage: null,
  copiedFrom: null,
};
const spicy: RecipeDetail = {
  ...detail,
  id: 'spicy',
  title: 'Spicy soup',
  parentId: 'soup',
  base: { id: 'soup', title: 'Soup', archived: false, familyCopyId: null },
  variants: [],
};

function setup(route = '/recipes/explore') {
  let copies: Record<string, string> = {};
  const { fetchMock, calls } = stubApi({
    'GET /api/recipes': () =>
      Response.json({
        recipes: [{ ...soup, familyCopyId: copies.soup ?? null }],
        hiddenByAllergiesCount: 0,
      }),
    'GET /api/recipes/filters': () => Response.json({ tags: [] }),
    'GET /api/recipes/soup': () =>
      Response.json({
        ...detail,
        familyCopyId: copies.soup ?? null,
        variants: detail.variants.map((variant) => ({
          ...variant,
          familyCopyId: copies[variant.id] ?? null,
        })),
      }),
    'GET /api/recipes/spicy': () =>
      Response.json({ ...spicy, familyCopyId: copies.spicy ?? null }),
    'GET /api/recipes/soup/pantry-match': () =>
      Response.json({
        servings: 2,
        canMake: false,
        shortOrMissingCount: 1,
        expiringCoveredCount: 0,
        coverageRatio: 0.5,
        lines: [
          { lineId: 'l1', status: 'covered', pantryBasic: false },
          { lineId: 'l2', status: 'missing', pantryBasic: false },
        ],
      }),
    'GET /api/recipes/spicy/pantry-match': () =>
      Response.json({ servings: 2, lines: [], shortOrMissingCount: 0 }),
    'GET /api/recipes/cook-tonight': () =>
      Response.json({ cards: [], hiddenByAllergiesCount: 0 }),
    'POST /api/recipes/soup/copy': () => {
      copies = { ...copies, soup: 'copy-1' };
      return Response.json({ id: 'copy-1', created: true });
    },
    'POST /api/recipes/spicy/copy': () => {
      copies = { ...copies, spicy: 'copy-2' };
      return Response.json({ id: 'copy-2', created: true });
    },
  });
  vi.stubGlobal('fetch', fetchMock);
  renderWithProviders(
    <>
      <Link to="/recipes">home</Link>
      <Routes>
        <Route path="/recipes/explore" element={<ExplorePage />} />
        <Route path="/recipes/explore/:id" element={<RecipePreviewPage />} />
        <Route path="/recipes/copy-1" element={<p>family recipe copy-1</p>} />
        <Route path="/recipes/:id" element={<RecipeDetailPage />} />
        <Route
          path="/recipes/:id/variant/new"
          element={<p>variant editor</p>}
        />
        <Route
          path="/recipes"
          element={<Link to="/recipes/explore">to explore</Link>}
        />
      </Routes>
    </>,
    { route },
  );
  return calls;
}

const rowButton = async () => {
  const list = await screen.findByRole('list', { name: /^All Recipes/ });
  return within(within(list).getByRole('listitem')).getAllByRole('button')[0];
};

const user = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

async function openSheet() {
  const trigger = await rowButton();
  await user().click(trigger);
  return {
    trigger,
    dialog: await screen.findByRole('dialog', { name: 'Soup' }),
  };
}

describe('Explore quick view', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    exploreAdds.reset();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('opens a modal dialog with facts, Ingredient chips and Variants, and moves focus in', async () => {
    setup();
    const { dialog } = await openSheet();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(within(dialog).getByText('Catalog Recipe')).toBeVisible();
    for (const [term, value] of [
      ['Time', '30 min'],
      ['Serves', '2'],
      ['Level', 'Easy'],
    ]) {
      expect(
        within(dialog).getByText(term).nextElementSibling,
      ).toHaveTextContent(value);
    }
    const tagList = within(dialog).getByRole('list', { name: 'Tags' });
    expect(
      within(tagList)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Dinner', 'Italian', 'Rolled']);
    expect(await within(dialog).findByText('Water')).toBeVisible();
    const leek = (await within(dialog).findByText('Leek')).closest('li')!;
    await waitFor(() => expect(leek).toHaveAttribute('data-missing'));
    expect(leek).toHaveTextContent('missing');
    expect(within(dialog).getByText('Water').closest('li')).not.toHaveAttribute(
      'data-missing',
    );
    // Only the Catalog Variant is listed.
    expect(within(dialog).getByText('Spicy soup')).toBeVisible();
    expect(within(dialog).queryByText('My soup')).toBeNull();
    // Opening focus rests on the sheet itself, not on the X (ADR 0039).
    await waitFor(() => expect(dialog).toHaveFocus());
    expect(within(dialog).getByRole('button', { name: 'Close' })).toBeVisible();
  });

  it('traps focus: Tab stays inside the dialog', async () => {
    setup();
    const { dialog } = await openSheet();
    await within(dialog).findByText('Water');
    const u = user();
    for (let i = 0; i < 12; i++) await u.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it.each([
    ['Escape', async () => user().keyboard('{Escape}')],
    [
      'the Close button',
      async () => user().click(screen.getByRole('button', { name: 'Close' })),
    ],
    [
      'the scrim',
      async () => {
        const backdrop = document.querySelector('.MuiBackdrop-root');
        fireEvent.mouseDown(backdrop!);
        fireEvent.click(backdrop!);
      },
    ],
  ])('closes with %s and returns focus to the row', async (_name, close) => {
    setup();
    const { trigger } = await openSheet();
    await close();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('hides a showing toast when it opens', async () => {
    setup();
    const u = user();
    await u.click(
      await screen.findByRole('button', { name: 'Add Soup to your Recipes' }),
    );
    expect(await findToast()).toHaveTextContent('Added Soup');
    await u.click(await rowButton());
    await screen.findByRole('dialog', { name: 'Soup' });
    await waitFor(() => expect(queryToast()).toBeNull());
  });

  it('adds: the primary turns into "In your Recipes · Open" and the explanation changes', async () => {
    setup();
    const { dialog } = await openSheet();
    expect(
      within(dialog).getByText(/Adding makes a copy your family can change/),
    ).toBeVisible();
    await user().click(
      within(dialog).getByRole('button', { name: 'Add to your Recipes' }),
    );
    const open = await within(dialog).findByRole('button', {
      name: 'In your Recipes · Open',
    });
    expect(
      within(dialog).getByText(/Your copy is yours to change/),
    ).toBeVisible();
    await user().click(open);
    expect(await screen.findByText('family recipe copy-1')).toBeVisible();
  });

  it('raises the Back badge for an add made in the quick view', async () => {
    setup();
    const { dialog } = await openSheet();
    await user().click(
      within(dialog).getByRole('button', { name: 'Add to your Recipes' }),
    );
    await waitFor(() => expect(exploreAdds.get()).toBe(1));
  });

  it('Make a Variant opens the editor', async () => {
    setup();
    const { dialog } = await openSheet();
    await user().click(
      within(dialog).getByRole('button', { name: 'Make a Variant' }),
    );
    expect(await screen.findByText('variant editor')).toBeVisible();
  });

  it('See the whole Recipe opens the preview and closes the sheet', async () => {
    setup();
    const { dialog } = await openSheet();
    await user().click(
      within(dialog).getByRole('link', { name: /See the whole Recipe/ }),
    );
    expect(
      await screen.findByRole('heading', { level: 1, name: /Soup/ }),
    ).toBeVisible();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('adds a Catalog Variant from its row and opens its preview from the row body', async () => {
    const calls = setup();
    const { dialog } = await openSheet();
    const u = user();
    await u.click(
      await within(dialog).findByRole('button', {
        name: 'Add Spicy soup to your Recipes',
      }),
    );
    expect(
      await within(dialog).findByRole('link', {
        name: 'Spicy soup is in your Recipes. Open it',
      }),
    ).toHaveAttribute('href', '/recipes/copy-2');
    expect(calls.some((c) => c.key === 'POST /api/recipes/spicy/copy')).toBe(
      true,
    );
    await u.click(within(dialog).getByRole('button', { name: /Spicy soup/ }));
    expect(
      await screen.findByRole('heading', { level: 1, name: /Spicy soup/ }),
    ).toBeVisible();
  });

  it('appears with no motion under reduced motion', async () => {
    stubMatchMedia((query) => query.includes('prefers-reduced-motion'));
    setup();
    const { dialog } = await openSheet();
    expect(dialog).toBeVisible();
    await user().keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

describe('Explore and the preview round trip', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    exploreAdds.reset();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('Back from a preview uses history, keeps the badge and has no slide', async () => {
    setup();
    const u = user();
    await u.click(
      await screen.findByRole('button', { name: 'Add Soup to your Recipes' }),
    );
    await screen.findByRole('link', { name: /is in your Recipes/ });
    await waitFor(() =>
      expect(screen.getByTestId('back-badge')).toHaveTextContent('+1'),
    );
    await u.click(await rowButton());
    await u.click(
      await screen.findByRole('link', { name: /See the whole Recipe/ }),
    );
    await screen.findByRole('heading', { level: 1, name: /Soup/ });
    // Under MemoryRouter there is no browser history index: pretend there is one.
    const state = vi
      .spyOn(window.history, 'state', 'get')
      .mockReturnValue({ idx: 1 });
    await u.click(screen.getByRole('link', { name: /Back/ }));
    state.mockRestore();
    await screen.findByRole('heading', { level: 1, name: 'Explore' });
    expect(screen.getByTestId('back-badge')).toHaveTextContent('+1');
  });

  it('Back from a preview opened directly goes to Explore, and its adds do not count', async () => {
    setup('/recipes/explore/soup');
    const u = user();
    await u.click(await screen.findByRole('button', { name: 'Add to Family' }));
    await act(async () => {});
    await u.click(screen.getByRole('link', { name: /Back/ }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Explore' }),
    ).toBeVisible();
    expect(exploreAdds.get()).toBe(0);
    expect(screen.queryByTestId('back-badge')).toBeNull();
  });

  it('Back after a redirect at load (a deep link) lands on Explore, not out of the app', async () => {
    setup('/recipes/soup');
    await screen.findByRole('heading', { level: 1, name: /Soup/ });
    await user().click(screen.getByRole('link', { name: /Back/ }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Explore' }),
    ).toBeVisible();
  });

  it('leaving a preview for elsewhere and coming back to Explore is a fresh visit', async () => {
    setup();
    const u = user();
    await u.click(
      await screen.findByRole('button', { name: 'Add Soup to your Recipes' }),
    );
    await waitFor(() => expect(exploreAdds.get()).toBe(1));
    await u.click(await rowButton());
    await u.click(
      await screen.findByRole('link', { name: /See the whole Recipe/ }),
    );
    await screen.findByRole('heading', { level: 1, name: /Soup/ });
    await u.click(screen.getByRole('link', { name: 'home' }));
    await u.click(await screen.findByRole('link', { name: 'to explore' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Explore' }),
    ).toBeVisible();
    expect(screen.queryByTestId('back-badge')).toBeNull();
  });

  it('adds in a Variant preview opened from a preview opened from Explore raise the badge', async () => {
    setup();
    const u = user();
    await u.click(await rowButton());
    await u.click(
      await screen.findByRole('link', { name: /See the whole Recipe/ }),
    );
    await u.click(await screen.findByRole('tab', { name: 'About' }));
    await u.click(await screen.findByRole('link', { name: 'Spicy soup' }));
    await screen.findByRole('heading', { level: 1, name: /Spicy soup/ });
    await u.click(await screen.findByRole('button', { name: 'Add to Family' }));
    await waitFor(() => expect(exploreAdds.get()).toBe(1));
  });

  it('a fresh visit to Explore starts the badge at 0', async () => {
    setup('/recipes');
    exploreAdds.bump(1);
    await user().click(await screen.findByRole('link', { name: 'to explore' }));
    await rowButton();
    await act(async () => {});
    expect(screen.queryByTestId('back-badge')).toBeNull();
  });
});

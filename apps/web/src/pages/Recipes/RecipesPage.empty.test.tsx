import { screen, waitFor, within } from '@testing-library/react';
import { findToast, getToast } from '@/test/toast';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CookTonightCard } from '@/lib/cookTonight';
import type { RecipeListItem } from '@/lib/recipes';
import { renderWithProviders, stubApi } from '@/test/render';
import { stubMotion } from '@/test/viewport';
import { RecipesPage } from './RecipesPage';

/*
 * The empty Family page (handoff 6): shown when the Family list has no live Recipes. Starters
 * are Catalog Bases from the catalog Cook Tonight, up to 3, each with an "Add {title} to your
 * Recipes" button.
 */

const item = (over: Partial<RecipeListItem>): RecipeListItem => ({
  id: 'r',
  title: 'Recipe',
  parentId: null,
  base: null,
  tags: [],
  variantCount: 0,
  servings: 2,
  prepMinutes: 10,
  cookMinutes: 20,
  difficulty: 'easy',
  owner: 'catalog',
  familyCopyId: null,
  copiedFromId: null,
  allergyWarning: null,
  ...over,
});

const card = (
  base: string,
  over: { recipeId?: string; parentId?: string | null } = {},
): CookTonightCard => ({
  canMake: true,
  missing: null,
  expiringCount: 0,
  otherVariantsCount: 0,
  base: { id: base, title: base, archived: false },
  recipe: {
    id: over.recipeId ?? base,
    title: over.recipeId ?? base,
    parentId: over.parentId ?? null,
    owner: 'catalog',
    familyCopyId: null,
    servings: 2,
    prepMinutes: 10,
    cookMinutes: 15,
    tags: [],
    allergyWarning: null,
  },
});

type Options = {
  family?: RecipeListItem[];
  catalog?: RecipeListItem[];
  cards?: CookTonightCard[];
  drafts?: number;
  hidden?: number;
};

function setup({
  family = [],
  catalog = [],
  cards = [],
  drafts = 0,
  hidden = 0,
}: Options) {
  // Adding makes the Family's copy live, until Undo archives it.
  let copy: RecipeListItem | null = null;
  const { fetchMock, calls } = stubApi({
    'GET /api/recipes': (url) =>
      Response.json({
        recipes:
          url.searchParams.get('scope') === 'catalog'
            ? catalog
            : [...family, ...(copy ? [copy] : [])],
        hiddenByAllergiesCount: hidden,
      }),
    'GET /api/recipes/filters': () => Response.json({ tags: [] }),
    'GET /api/recipes/cook-tonight': (url) =>
      Response.json({
        cards: url.searchParams.get('scope') === 'catalog' ? cards : [],
        hiddenByAllergiesCount: 0,
      }),
    'GET /api/recipe-drafts': () =>
      Response.json(
        Array.from({ length: drafts }, (_, i) => ({
          id: `d${i}`,
          title: null,
          updatedAt: '2026-01-01T00:00:00Z',
        })),
      ),
    'POST /api/recipes/omelette/copy': () => {
      copy = item({ id: 'copy-1', title: 'omelette', owner: 'family' });
      return Response.json({ id: 'copy-1', created: true });
    },
    'POST /api/recipes/copy-1/archive': () => {
      copy = null;
      return Response.json({ id: 'copy-1' });
    },
  });
  vi.stubGlobal('fetch', fetchMock);
  renderWithProviders(
    <Routes>
      <Route path="/recipes" element={<RecipesPage />} />
      <Route path="/recipes/new" element={<p>new recipe page</p>} />
      <Route path="/recipes/explore" element={<p>explore page</p>} />
      <Route path="/recipes/from-link" element={<p>from link page</p>} />
      <Route path="/recipes/from-text" element={<p>from text page</p>} />
    </Routes>,
    { route: '/recipes' },
  );
  return calls;
}

const TITLE = 'No family Recipes yet';
const findTitle = () => screen.findByText(TITLE);
const addButton = (title: string) =>
  screen.findByRole('button', { name: `Add ${title} to your Recipes` });
const catalogBases = ['omelette', 'soup', 'salad', 'stew'].map((id) =>
  item({ id, title: id }),
);

describe('RecipesPage when the Family has no Recipes', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('shows Gator, the copy and both buttons instead of search, chips and list', async () => {
    setup({});
    await findTitle();
    expect(
      screen.getByRole('button', {
        name: 'Gator the chef, with a steaming pot. Tap to say hi',
      }),
    ).toBeVisible();
    expect(screen.getByText(/My pot's empty!/)).toBeVisible();
    expect(screen.getByText(/paste a/)).toBeVisible();
    expect(screen.getByText(/or write down your own/)).toBeVisible();
    expect(
      screen.getByText(/Recipes you add can be changed however you like/),
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Explore Recipes' }),
    ).toHaveAttribute('href', '/recipes/explore');
    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(screen.queryByRole('list', { name: /^All Recipes/ })).toBeNull();
  });

  it("bolds Explore and link in Gator's line", async () => {
    setup({});
    await findTitle();
    expect(screen.getByText('Explore', { selector: 'b' })).toBeVisible();
    expect(screen.getByText('link', { selector: 'b' })).toBeVisible();
  });

  it('puts "From a link" between "Explore Recipes" and "+ New Recipe", leading to Recipe from Link', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    setup({});
    await findTitle();
    const explore = screen.getByRole('link', { name: 'Explore Recipes' });
    const fromLink = screen.getByRole('link', { name: 'From a link' });
    const newRecipe = screen.getByRole('button', { name: '+ New Recipe' });
    expect(fromLink).toHaveAttribute('href', '/recipes/from-link');
    expect(
      explore.compareDocumentPosition(fromLink) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      fromLink.compareDocumentPosition(newRecipe) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    await user.click(fromLink);
    expect(await screen.findByText('from link page')).toBeVisible();
  });

  it('offers "From text" right after "From a link", leading to the From text sheet', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    setup({});
    await findTitle();
    const fromLink = screen.getByRole('link', { name: 'From a link' });
    const fromText = screen.getByRole('link', { name: 'From text' });
    expect(fromText).toHaveAttribute('href', '/recipes/from-text');
    expect(
      fromLink.compareDocumentPosition(fromText) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    await user.click(fromText);
    expect(await screen.findByText('from text page')).toBeVisible();
  });

  it('hides the art from assistive tech', async () => {
    setup({});
    await findTitle();
    const button = screen.getByRole('button', { name: /Gator the chef/ });
    expect(button.querySelector('img')).toHaveAttribute('aria-hidden', 'true');
  });

  it('is static under reduced motion', async () => {
    stubMotion(true);
    setup({});
    await findTitle();
    const img = screen
      .getByRole('button', { name: /Gator the chef/ })
      .querySelector('img')!;
    expect(img).toHaveAttribute('data-motion', 'signature');
  });

  it('plays the entrance, then the signature loop, and hops on a tap', async () => {
    stubMotion(false);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    setup({});
    await findTitle();
    const img = () =>
      screen
        .getByRole('button', { name: /Gator the chef/ })
        .querySelector('img')!;
    expect(img()).toHaveAttribute('data-motion', 'entrance');
    await vi.advanceTimersByTimeAsync(1400);
    expect(img()).toHaveAttribute('data-motion', 'signature');
    await user.click(screen.getByRole('button', { name: /Gator the chef/ }));
    expect(img()).toHaveAttribute('data-motion', 'tap');
  });

  it('"+ New Recipe" opens the "+" menu', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    setup({});
    await findTitle();
    await user.click(screen.getByRole('button', { name: '+ New Recipe' }));
    expect(
      await screen.findByRole('menuitem', { name: /From Explore/ }),
    ).toBeVisible();
  });

  it('keeps the Drafts entry above the Gator panel', async () => {
    setup({ drafts: 2 });
    const entry = await screen.findByRole('link', { name: /Drafts/ });
    const title = await findTitle();
    expect(
      entry.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('shows when the API lists no live Recipes (archived ones are excluded)', async () => {
    setup({ family: [] });
    expect(await findTitle()).toBeVisible();
  });

  it('is not shown when every Recipe is hidden by Allergies', async () => {
    setup({ family: [], hidden: 1 });
    expect(await screen.findByText('No Recipes to show.')).toBeVisible();
    expect(screen.queryByText(TITLE)).toBeNull();
  });

  it('is not shown for a Family with only a Variant', async () => {
    setup({
      family: [
        item({
          id: 'v',
          title: 'Spicy',
          parentId: 'gone',
          base: { id: 'gone', title: 'Gone' },
          owner: 'family',
        }),
      ],
    });
    expect(await screen.findByText('Spicy')).toBeVisible();
    expect(screen.queryByText(TITLE)).toBeNull();
  });

  describe('starters', () => {
    it('lists at most 3 Catalog Bases from Catalog Cook Tonight', async () => {
      const calls = setup({
        catalog: catalogBases,
        cards: catalogBases.map((b) => card(b.id)),
      });
      await findTitle();
      await addButton('omelette');
      const list = screen.getByRole('list', {
        name: 'Start with these · you can make them',
      });
      expect(within(list).getAllByRole('listitem')).toHaveLength(3);
      const scopes = calls
        .filter((c) => c.key === 'GET /api/recipes/cook-tonight')
        .map((c) => new URLSearchParams(c.search).get('scope'));
      expect(scopes).toContain('catalog');
    });

    it('opens the quick view when a starter row is tapped', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      setup({ catalog: [catalogBases[0]!], cards: [card('omelette')] });
      await addButton('omelette');
      await user.click(screen.getByRole('button', { name: /^omelette/ }));
      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByText('Catalog Recipe')).toBeVisible();
      expect(within(dialog).getByText('omelette')).toBeVisible();
    });

    it('keeps the quick view open when adding from it turns the page into the list', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      setup({ catalog: [catalogBases[0]!], cards: [card('omelette')] });
      await addButton('omelette');
      await user.click(screen.getByRole('button', { name: /^omelette/ }));
      const dialog = await screen.findByRole('dialog');

      await user.click(
        within(dialog).getByRole('button', { name: 'Add to your Recipes' }),
      );

      // The page behind the sheet is aria-hidden, so look for its list with `hidden`.
      await screen.findByRole('list', { name: /^All Recipes/, hidden: true });
      expect(screen.getByRole('dialog')).toBeVisible();
    });

    /** The toast's emotion CSS (jsdom's computed style drops `calc()`). */
    const toastCss = () => {
      const el = getToast().closest<HTMLElement>('.MuiSnackbar-root')!;
      const own = [...el.classList].filter((c) => c.startsWith('css-'));
      return [...document.styleSheets]
        .flatMap((sheet) => [...sheet.cssRules])
        .map((rule) => rule.cssText)
        .filter((css) => own.some((c) => css.includes(`.${c}`)))
        .join('\n');
    };

    it('lifts the toast clear of the quick view buttons while it is open', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      setup({ catalog: [catalogBases[0]!], cards: [card('omelette')] });
      await addButton('omelette');
      await user.click(screen.getByRole('button', { name: /^omelette/ }));
      const dialog = await screen.findByRole('dialog');
      await user.click(
        within(dialog).getByRole('button', { name: 'Add to your Recipes' }),
      );
      await findToast();
      expect(toastCss()).toContain('bottom: calc(186px');
    });

    it('keeps the default toast position when it is added from the row', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      setup({ catalog: [catalogBases[0]!], cards: [card('omelette')] });
      await user.click(await addButton('omelette'));
      await findToast();
      expect(toastCss()).not.toContain('186px');
    });

    it('leaves out Recipes the API hid (they are in neither list)', async () => {
      setup({
        catalog: [catalogBases[0]!],
        cards: [card('omelette'), card('hidden-one')],
      });
      await addButton('omelette');
      expect(
        screen.getAllByRole('button', { name: /^Add .* to your/ }),
      ).toHaveLength(1);
    });

    it('shows a Variant card as its Base', async () => {
      setup({
        catalog: [catalogBases[0]!],
        cards: [
          card('omelette', { recipeId: 'omelette-v', parentId: 'omelette' }),
        ],
      });
      expect(await addButton('omelette')).toBeVisible();
    });

    it('hides the section when Cook Tonight has nothing', async () => {
      const calls = setup({ catalog: catalogBases, cards: [] });
      await findTitle();
      await waitFor(() =>
        expect(
          calls.some(
            (c) =>
              c.key === 'GET /api/recipes/cook-tonight' &&
              new URLSearchParams(c.search).get('scope') === 'catalog',
          ),
        ).toBe(true),
      );
      await vi.advanceTimersByTimeAsync(50);
      await waitFor(() =>
        expect(
          screen.queryByText('Start with these · you can make them'),
        ).toBeNull(),
      );
    });

    it('adds, switches to the list with the toast, and Undo brings the empty state back', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      setup({ catalog: [catalogBases[0]!], cards: [card('omelette')] });
      await user.click(await addButton('omelette'));

      const list = await screen.findByRole('list', { name: /^All Recipes/ });
      expect(within(list).getByText('omelette')).toBeVisible();
      expect(screen.queryByText(TITLE)).toBeNull();
      expect(getToast()).toHaveTextContent('Added omelette to your Recipes');

      await user.click(screen.getByRole('button', { name: 'Undo' }));
      expect(await findTitle()).toBeVisible();
    });
  });
});

import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { QueryClient } from '@tanstack/react-query';
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CookTonightCard } from '../../lib/cookTonight';
import type { RecipeListItem } from '../../lib/recipes';
import type { RecipeTag } from '../../lib/tags';
import { renderWithProviders, stubApi } from '../../test/render';
import { expectSticksBelowTopInset } from '../../test/stickyHeader';
import { stubMotion } from '../../test/viewport';
import { RecipesPage } from './RecipesPage';

/*
 * DOM contract these tests assume (the implementation must provide it):
 * - The Cook Tonight card is Gator's bubble panel as one `link` whose accessible name is its
 *   visible lines joined with ", ", starting "Cook tonight", in every state (Can Make, one
 *   ingredient short, nothing). Its Gator is an `img` inside it, named by the Gator's alt text
 *   and marked with `data-mood`. Pressing it plays Gator's Tap (`data-motion="tap"` on that img) and navigates 500ms later, or at
 *   once with reduced motion (tests that only follow the link stub reduced motion).
 *   Its accessible description is that alt text, so a screen reader hears his mood too.
 * - The list is a `list` named by its heading, so its name starts with "All Recipes" or
 *   "Matches"; the count is part of that heading's text. Each row is a `listitem` whose
 *   text holds the title, family pill, "Variant of", meta, pills and time; the row also
 *   contains the one link to `/recipes/{id}`.
 * - Not filtering, a Variant sits under its Base (a Family Recipe, or the Family's copy of its
 *   Catalog Base, matched by `copiedFromId`) and shows only in the Base's "n Variants" count;
 *   a Variant with no Base in the list is its own row, labelled "Variant of {base}".
 * - A row's meta line is one labelled `group` named "Tags: {every Tag name}" holding up to two
 *   Tag chips and "+N" (both hidden from the accessibility tree), then the text "· Easy · 3 Variants"
 *   (Level, Variant count, joined with " · "). Family Tags come first, then Catalog Tags in
 *   Tag Group order. A Recipe without Tags has no such group, only "Easy · 3 Variants".
 * - The filter block is the search box beside a `button` "Filter by Tags" ("Filter by Tags, 2 selected"
 *   with a count; `aria-haspopup="dialog"`). Picked Tags show as a row of chips below it, each a
 *   `button` named "Remove Tag {name}" that removes the Tag; there is no "Clear" chip.
 * - The button opens a `dialog` named "Filter by Tags": a combobox of the same name, an always-open
 *   `listbox` of `option`s grouped by Tag Group (Your Tags first) with each unpicked option's count
 *   in an element named "{n} Recipes", a "Clear" button (disabled with no Tag picked), a "Show {n}
 *   Recipes" button (or "No Recipes match") and a "Close" button. Picks apply to the list at once.
 * - A visually hidden polite `status` reads "{names} selected. {n} Recipes match." while Tags are picked.
 * - With Tags picked and no Recipe left, the page says "No Recipes have all {n} Tags" and offers
 *   "Without {Tag}" buttons, each with the count it would show.
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
  over: Omit<Partial<CookTonightCard>, 'base' | 'recipe'> & {
    base?: Partial<CookTonightCard['base']>;
    recipe?: Partial<CookTonightCard['recipe']>;
  } = {},
): CookTonightCard => ({
  canMake: true,
  missing: null,
  expiringCount: 0,
  otherVariantsCount: 0,
  ...over,
  base: { id: 'o', title: 'Omelette', archived: false, ...over.base },
  recipe: {
    id: 'o',
    title: 'Omelette',
    parentId: null,
    owner: 'catalog',
    familyCopyId: null,
    servings: 2,
    prepMinutes: 10,
    cookMinutes: 15,
    tags: [],
    allergyWarning: null,
    ...over.recipe,
  },
});

const omelette = item({ id: 'o', title: 'Omelette', variantCount: 3 });
const ctag = (
  id: string,
  name: string,
  groupName: string,
  groupOrder: number,
): RecipeTag => ({
  id,
  name,
  kind: 'catalog',
  groupId: `g-${groupOrder}`,
  groupName,
  groupOrder,
});
const ftag = (id: string, name: string): RecipeTag => ({
  id,
  name,
  kind: 'family',
  groupId: null,
  groupName: null,
  groupOrder: null,
});
const MEAL_PREP = ftag('t-prep', 'Meal prep');
const VEGAN = ctag('t-veg', 'Vegan', 'Diet', 2);
const ITALIAN = ctag('c-it', 'Italian', 'Cuisine', 3);
const GREEK = ctag('c-gr', 'Greek', 'Cuisine', 3);
const BAKING = ctag('m-bake', 'Baking', 'Method', 4);
const GRILLING = ctag('m-grill', 'Grilling', 'Method', 4);
const ROMANA = ctag('c-ro', 'Română', 'Cuisine', 3);

const soup = item({ id: 's', title: 'Soup', variantCount: 1 });
const frittata = item({
  id: 'f',
  title: 'Frittata',
  parentId: 'o',
  base: { id: 'o', title: 'Omelette' },
  tags: [ITALIAN],
});
const gratin = item({
  id: 'g',
  title: 'Gratin',
  parentId: 'o',
  base: { id: 'o', title: 'Omelette' },
});
const filters = {
  tags: [MEAL_PREP, VEGAN, ITALIAN, GREEK, ROMANA, BAKING, GRILLING],
};

/** The last render's query cache, to know when a request has settled with nothing on screen to show it. */
let queryClient: QueryClient;

function setup(
  list: (url: URL) => RecipeListItem[],
  /** The cook-tonight cards, or a function answering with the cards or a whole response. */
  cards:
    | CookTonightCard[]
    | ((
        url: URL,
      ) =>
        | CookTonightCard[]
        | Response
        | Promise<CookTonightCard[] | Response>) = [],
  /** Holds every filtered list response until it resolves. */
  gate?: Promise<void>,
  /** How many Recipes "Hide Recipes with my Allergies" left out, unless the request shows them. */
  hidden = 0,
  /** How many Can Make groups were left out, when that differs from the list's count. */
  hiddenCards = hidden,
) {
  const hiddenFor = (url: URL, count = hidden) =>
    url.searchParams.get('showHidden') === 'true' ? 0 : count;
  const { fetchMock, calls } = stubApi({
    'GET /api/recipes': (url) =>
      Response.json({
        recipes: list(url),
        hiddenByAllergiesCount: hiddenFor(url),
      }),
    'GET /api/recipes/filters': () => Response.json(filters),
    'GET /api/recipes/cook-tonight': async (url) => {
      const answer = typeof cards === 'function' ? await cards(url) : cards;
      return answer instanceof Response
        ? answer
        : Response.json({
            cards: answer,
            hiddenByAllergiesCount: hiddenFor(url, hiddenCards),
          });
    },
  });
  vi.stubGlobal(
    'fetch',
    gate
      ? async (input: RequestInfo | URL, init?: RequestInit) => {
          const response = await fetchMock(input, init);
          const url = new URL(String(input), window.location.origin);
          if (url.pathname === '/api/recipes' && filtered(url)) await gate;
          return response;
        }
      : fetchMock,
  );
  ({ queryClient } = renderWithProviders(
    <Routes>
      <Route path="/recipes" element={<RecipesPage />} />
      <Route path="/recipes/new" element={<p>new recipe page</p>} />
      <Route path="/recipes/from-link" element={<p>link step</p>} />
      <Route path="/recipes/explore" element={<p>explore page</p>} />
      <Route path="/recipes/cook-tonight" element={<p>cook tonight page</p>} />
      <Route path="/pantry" element={<p>pantry page</p>} />
      <Route path="/recipes/:id" element={<p>detail page</p>} />
    </Routes>,
    { route: '/recipes' },
  ));
  return calls;
}

type Calls = ReturnType<typeof setup>;

const filtered = (url: URL) =>
  ['tagIds', 'search', 'includeVariants'].some((key) =>
    url.searchParams.has(key),
  );

const lastQuery = (calls: Calls) =>
  new URLSearchParams(
    calls.filter((c) => c.key === 'GET /api/recipes').at(-1)!.search,
  );

const ALL = /^All Recipes/;
const MATCHES = /^Matches/;

/** The list row holding `title`, once the list has rendered it. */
async function findRow(title: string, name: RegExp = ALL) {
  const list = await screen.findByRole('list', { name });
  const text = await within(list).findByText(title);
  return text.closest('li')!;
}

const COOK_TONIGHT = /^Cook tonight/;
const findCookTonight = () => screen.findByRole('link', { name: COOK_TONIGHT });
const queryCookTonight = () =>
  screen.queryByRole('link', { name: COOK_TONIGHT });
const tagsButton = () =>
  screen.findByRole('button', { name: /^Filter by Tags/ });
const tagsButtonNow = () =>
  screen.getByRole('button', { name: /^Filter by Tags/ });

/** Opens the Tags sheet. */
async function openTags() {
  await userEvent.click(await tagsButton());
  return screen.findByRole('dialog', { name: 'Filter by Tags' });
}

/** Closes the Tags sheet and waits for it to be gone. */
async function closeTags() {
  await userEvent.click(screen.getByRole('button', { name: 'Close' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
}

/** Picks Tags in the sheet by name, in order, then closes it. */
async function pickTags(...names: string[]) {
  const dialog = await openTags();
  for (const name of names) {
    await userEvent.click(
      await within(dialog).findByRole('option', {
        name: new RegExp(`^${name}`),
      }),
    );
  }
  await closeTags();
}

describe('RecipesPage', () => {
  afterEach(() => vi.unstubAllGlobals());

  describe('rows', () => {
    it('lists the Recipes in the order the API returned them', async () => {
      setup(() => [soup, omelette]);
      const list = await screen.findByRole('list', { name: ALL });
      await within(list).findByText('Soup');
      const rows = within(list).getAllByRole('listitem');
      expect(rows).toHaveLength(2);
      expect(rows[0]).toHaveTextContent('Soup');
      expect(rows[1]).toHaveTextContent('Omelette');
    });

    it('offers New Recipe, From a link, From text and From Explore (marked new) from the header plus, and opens New Recipe', async () => {
      setup(() => [omelette]);
      await userEvent.click(
        await screen.findByRole('button', { name: 'Add a Recipe' }),
      );
      expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual(
        ['New Recipe', 'From a link', 'From text', 'From Explore new'],
      );
      await userEvent.click(
        screen.getByRole('menuitem', { name: 'New Recipe' }),
      );
      expect(screen.getByText('new recipe page')).toBeInTheDocument();
    });

    it('shows the Explore pill before the plus, with no Settings gear, and opens Explore', async () => {
      setup(() => [omelette]);
      const pill = await screen.findByRole('link', { name: 'Explore' });
      const plus = screen.getByRole('button', { name: 'Add a Recipe' });
      expect(
        pill.compareDocumentPosition(plus) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(screen.queryByRole('link', { name: /settings/i })).toBeNull();
      await userEvent.click(pill);
      expect(screen.getByText('explore page')).toBeInTheDocument();
    });

    it('opens Explore from the header plus', async () => {
      setup(() => [omelette]);
      await userEvent.click(
        await screen.findByRole('button', { name: 'Add a Recipe' }),
      );
      await userEvent.click(
        screen.getByRole('menuitem', { name: 'From Explore new' }),
      );
      expect(screen.getByText('explore page')).toBeInTheDocument();
    });

    it('opens the From a link sheet from the header plus', async () => {
      setup(() => [omelette]);
      await userEvent.click(
        await screen.findByRole('button', { name: 'Add a Recipe' }),
      );
      await userEvent.click(
        screen.getByRole('menuitem', { name: 'From a link' }),
      );
      expect(
        await screen.findByRole('dialog', { name: 'From a link' }),
      ).toBeVisible();
    });

    it('opens the From text sheet from the header plus', async () => {
      setup(() => [omelette]);
      await userEvent.click(
        await screen.findByRole('button', { name: 'Add a Recipe' }),
      );
      await userEvent.click(
        screen.getByRole('menuitem', { name: 'From text' }),
      );
      expect(
        await screen.findByRole('dialog', { name: 'From text' }),
      ).toBeVisible();
      expect(screen.queryByRole('dialog', { name: 'From a link' })).toBeNull();
    });

    it('opens a Recipe when its row is tapped', async () => {
      setup(() => [omelette]);
      const row = await findRow('Omelette');
      const link = within(row).getByRole('link');
      expect(link).toHaveAttribute('href', '/recipes/o');
      await userEvent.click(link);
      expect(screen.getByText('detail page')).toBeInTheDocument();
    });

    it('shows the meta parts that exist, joined by dots, with the pluralised Variant count', async () => {
      setup(() => [
        item({
          id: 'a',
          title: 'Moussaka',
          tags: [
            {
              id: 'c-gr',
              name: 'Greek',
              kind: 'catalog',
              groupId: 'g3',
              groupName: 'Cuisine',
              groupOrder: 3,
            },
          ],
          difficulty: 'medium',
          copiedFromId: 'cm',
        }),
        ...[1, 2, 3].map((n) =>
          item({ id: `mv${n}`, title: `Mv${n}`, parentId: 'cm' }),
        ),
        item({
          id: 'b',
          title: 'Toast',
          difficulty: 'hard',
          copiedFromId: 'ct',
        }),
        item({ id: 'tv', title: 'Tv', parentId: 'ct' }),
        item({ id: 'c', title: 'Water', difficulty: null }),
      ]);
      const moussaka = await findRow('Moussaka');
      expect(moussaka).toHaveTextContent('Greek· Medium · 3 Variants');
      expect(within(moussaka).getByRole('group')).toHaveAccessibleName(
        'Tags: Greek',
      );
      const toast = await findRow('Toast');
      expect(toast).toHaveTextContent('Hard · 1 Variant');
      expect(toast).not.toHaveTextContent('1 Variants');
      expect(await findRow('Water')).not.toHaveTextContent('·');
    });

    describe('Tags', () => {
      const catalogTag = (
        id: string,
        name: string,
        groupName: string,
        groupOrder: number,
      ): RecipeTag => ({
        id,
        name,
        kind: 'catalog',
        groupId: `g-${groupOrder}`,
        groupName,
        groupOrder,
      });
      const familyTag = (id: string, name: string): RecipeTag => ({
        id,
        name,
        kind: 'family',
        groupId: null,
        groupName: null,
        groupOrder: null,
      });
      const tagged = item({
        id: 't',
        title: 'Tagged',
        tags: [
          familyTag('f', 'Meal prep'),
          catalogTag('t-din', 'Dinner', 'Meal', 1),
          catalogTag('t-veg', 'Vegan', 'Diet', 2),
          catalogTag('t-it', 'Italian', 'Cuisine', 3),
        ],
      });

      it('shows two Tag chips, Family Tags first, then "+N" and the Level', async () => {
        setup(() => [tagged]);
        const row = await findRow('Tagged');
        const line = within(row).getByRole('group');
        expect(line).toHaveTextContent(/^Meal prepDinner\+2· Easy$/);
        // The chips and "+N" are visual: the accessible tree has only the labelled line.
        expect(within(row).queryByText('Vegan')).toBeNull();
      });

      it('names every Tag in the line label, including the ones behind "+N"', async () => {
        setup(() => [tagged]);
        const row = await findRow('Tagged');
        expect(
          within(row).getByRole('group', {
            name: 'Tags: Meal prep, Dinner, Vegan, Italian',
          }),
        ).toBeInTheDocument();
        for (const hidden of within(row).getAllByText(
          /^(Meal prep|Dinner|\+2)$/,
        )) {
          expect(hidden.closest('[aria-hidden="true"]')).not.toBeNull();
        }
      });

      it('has no "+N" for two Tags or fewer, and no Tags line for a Recipe without Tags', async () => {
        setup(() => [
          item({
            id: 'two',
            title: 'Two',
            tags: [
              catalogTag('a', 'Dinner', 'Meal', 1),
              familyTag('b', 'Quick'),
            ],
          }),
          item({ id: 'none', title: 'None' }),
        ]);
        const two = await findRow('Two');
        expect(within(two).getByRole('group')).toHaveTextContent(
          /^QuickDinner· Easy$/,
        );
        expect(within(await findRow('None')).queryByRole('group')).toBeNull();
      });
    });

    it('shows the total time in minutes, or a dash when the Recipe has no times', async () => {
      setup(() => [
        item({ id: 'a', title: 'Both', prepMinutes: 10, cookMinutes: 20 }),
        item({
          id: 'b',
          title: 'CookOnly',
          prepMinutes: null,
          cookMinutes: 15,
        }),
        item({
          id: 'c',
          title: 'Neither',
          prepMinutes: null,
          cookMinutes: null,
        }),
      ]);
      expect(await findRow('Both')).toHaveTextContent(/30\s*min/);
      expect(await findRow('CookOnly')).toHaveTextContent(/15\s*min/);
      const neither = await findRow('Neither');
      expect(neither).toHaveTextContent('—');
      expect(neither).not.toHaveTextContent('min');
    });

    it('badges a Family Recipe', async () => {
      setup(() => [item({ id: 'x', title: 'Gran stew', owner: 'family' })]);
      expect(await findRow('Gran stew')).toHaveTextContent("Your family's");
    });

    it('shows no badge on a Catalog Recipe', async () => {
      setup(() => [item({ id: 'c', title: 'Plain stew', owner: 'catalog' })]);
      expect(await findRow('Plain stew')).not.toHaveTextContent(
        "Your family's",
      );
    });

    it('labels a Variant with its Base Recipe while filtering', async () => {
      setup((url) => (filtered(url) ? [frittata, omelette] : [omelette]));
      await findRow('Omelette');

      await pickTags('Italian');
      expect(await findRow('Frittata', MATCHES)).toHaveTextContent(
        'Variant of Omelette',
      );
    });

    it('asks for the Family scope only, in the list and in Cook Tonight', async () => {
      const cookTonightUrls: string[] = [];
      const calls = setup(
        (url) => (filtered(url) ? [frittata, omelette] : [omelette]),
        (url) => {
          cookTonightUrls.push(url.search);
          return [];
        },
      );
      await findRow('Omelette');
      await pickTags('Italian');
      await waitFor(() => expect(lastQuery(calls).get('tagIds')).toBe('c-it'));
      const lists = calls.filter((c) => c.key === 'GET /api/recipes');
      expect(lists.length).toBeGreaterThan(1);
      for (const call of lists) {
        expect(new URLSearchParams(call.search).get('scope')).toBe('family');
      }
      await waitFor(() => expect(cookTonightUrls.length).toBeGreaterThan(0));
      for (const search of cookTonightUrls) {
        expect(new URLSearchParams(search).get('scope')).toBe('family');
      }
    });

    describe('Variants', () => {
      const copy = item({
        id: 'copy',
        title: 'Omelette',
        owner: 'family',
        copiedFromId: 'o',
      });
      const ownVariant = (parentId: string) =>
        item({
          id: 'v',
          title: 'Frittata',
          owner: 'family',
          parentId,
          base: { id: parentId, title: 'Omelette' },
        });

      it("groups a Family Variant under the Family's copy of its Catalog Base", async () => {
        setup(() => [copy, ownVariant('o')]);
        const row = await findRow('Omelette');
        expect(row).toHaveTextContent('1 Variant');
        const list = screen.getByRole('list', { name: ALL });
        expect(within(list).getAllByRole('listitem')).toHaveLength(1);
        expect(within(list).queryByText('Frittata')).not.toBeInTheDocument();
      });

      it('lists a Variant without a copy of its Base as its own row, "Variant of {base}"', async () => {
        setup(() => [ownVariant('o')]);
        expect(await findRow('Frittata')).toHaveTextContent(
          'Variant of Omelette',
        );
      });
    });
  });

  describe('headings, hints and empty states', () => {
    it('heads the list "All Recipes" with its count and shows the Variants hint', async () => {
      setup(() => [omelette, soup]);
      const heading = await screen.findByRole('heading', { name: ALL });
      expect(heading).toHaveTextContent(/^All Recipes · 2$/i);
      expect(
        screen.getByText(
          'Search or pick a filter to see Variants on their own.',
        ),
      ).toBeInTheDocument();
    });

    it('heads the list "Matches" with its count and drops the hint while filtering', async () => {
      setup((url) => (filtered(url) ? [frittata] : [omelette, soup]));
      await findRow('Omelette');
      await pickTags('Italian');
      const heading = await screen.findByRole('heading', { name: MATCHES });
      expect(heading).toHaveTextContent(/^Matches · 1$/i);
      expect(
        screen.queryByRole('heading', { name: ALL }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText(
          'Search or pick a filter to see Variants on their own.',
        ),
      ).not.toBeInTheDocument();
    });

    it('shows chef Gator instead of the list when the Family has no Recipes', async () => {
      setup(() => []);
      expect(
        await screen.findByText('No family Recipes yet'),
      ).toBeInTheDocument();
    });

    it('shows a no-matches state with a hint while filtering', async () => {
      setup((url) => (filtered(url) ? [] : [omelette]));
      await findRow('Omelette');
      await userEvent.type(
        await screen.findByLabelText('Search Recipes'),
        'zzz',
      );
      expect(await screen.findByText('No Recipes match.')).toBeInTheDocument();
      expect(
        screen.getByText('Try another word or clear a filter.'),
      ).toBeInTheDocument();
    });

    it('shows an error when the list fails to load', async () => {
      const { fetchMock } = stubApi({
        'GET /api/recipes/filters': () => Response.json(filters),
      });
      vi.stubGlobal('fetch', fetchMock);
      renderWithProviders(<RecipesPage />, { route: '/recipes' });
      expect(await screen.findByRole('alert')).toBeInTheDocument();
    });
  });

  describe('search and Tag filter', () => {
    it('pins the search below the top inset while the list scrolls', async () => {
      setup(() => [omelette]);
      expectSticksBelowTopInset(await tagsButton());
    });

    it('has a Tags button beside the search and no chip rows or Clear chip', async () => {
      setup(() => [omelette]);
      const button = await tagsButton();
      expect(button).toHaveAccessibleName('Filter by Tags');
      expect(button).toHaveAttribute('aria-haspopup', 'dialog');
      for (const name of ['Italian', 'Greek', 'Baking', 'Grilling', 'Clear']) {
        expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
      }
    });

    it('sends a picked Tag at once, shows it as a chip and a count on the button, and removes it when the chip is tapped', async () => {
      const calls = setup((url) => (filtered(url) ? [frittata] : [omelette]));
      const user = userEvent.setup();
      await findRow('Omelette');

      await pickTags('Italian');
      await waitFor(() => expect(lastQuery(calls).get('tagIds')).toBe('c-it'));
      expect(await tagsButton()).toHaveAccessibleName(
        'Filter by Tags, 1 selected',
      );
      expect(await tagsButton()).toHaveTextContent('1');

      await user.click(
        screen.getByRole('button', { name: 'Remove Tag Italian' }),
      );
      await waitFor(() => expect(lastQuery(calls).has('tagIds')).toBe(false));
      expect(
        screen.queryByRole('button', { name: 'Remove Tag Italian' }),
      ).not.toBeInTheDocument();
      expect(await tagsButton()).toHaveAccessibleName('Filter by Tags');
      expect(
        await screen.findByRole('heading', { name: ALL }),
      ).toBeInTheDocument();
    });

    it('asks for several Tags in the order they were picked, with the search text', async () => {
      const calls = setup(() => [
        item({ id: 'o', title: 'Omelette', tags: [GREEK, BAKING] }),
      ]);
      const user = userEvent.setup();
      await findRow('Omelette');
      await user.type(screen.getByLabelText('Search Recipes'), 'fr');
      await pickTags('Greek', 'Baking');
      await waitFor(() => {
        const query = lastQuery(calls);
        expect(query.get('tagIds')).toBe('c-gr,m-bake');
        expect(query.get('search')).toBe('fr');
      });
      const chips = screen.getAllByRole('button', { name: /^Remove Tag / });
      expect(chips.map((c) => c.getAttribute('aria-label'))).toEqual([
        'Remove Tag Greek',
        'Remove Tag Baking',
      ]);
    });

    it('keeps the previous rows on screen while the next Tag loads', async () => {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      setup((url) => (filtered(url) ? [frittata] : [omelette]), [], gate);
      await findRow('Omelette');

      await pickTags('Italian');
      await screen.findByRole('button', { name: 'Remove Tag Italian' });
      // The filtered response is still held: the old rows stay listed.
      expect(screen.getByText('Omelette')).toBeInTheDocument();
      expect(screen.queryByText('Frittata')).not.toBeInTheDocument();

      release();
      await findRow('Frittata', MATCHES);
      expect(screen.queryByText('Omelette')).not.toBeInTheDocument();
    });

    it('sends the search text after a pause', async () => {
      const calls = setup(() => [omelette]);
      await screen.findByRole('list', { name: ALL });
      await userEvent.type(screen.getByLabelText('Search Recipes'), 'frit');
      await vi.waitFor(() => {
        expect(lastQuery(calls).get('search')).toBe('frit');
      });
      const searched = calls
        .filter((c) => c.key === 'GET /api/recipes')
        .map((c) => new URLSearchParams(c.search).get('search'))
        .filter(Boolean);
      expect(new Set(searched)).toEqual(new Set(['frit']));
    });
  });

  describe('Tags sheet', () => {
    const lasagne = item({
      id: 'l',
      title: 'Lasagne',
      tags: [MEAL_PREP, ITALIAN, BAKING],
    });
    const risotto = item({
      id: 'r',
      title: 'Risotto',
      tags: [VEGAN, ITALIAN],
    });
    const moussaka = item({
      id: 'm',
      title: 'Moussaka',
      tags: [GREEK, BAKING],
    });
    const salad = item({ id: 'sa', title: 'Salad', tags: [VEGAN] });
    const stew = item({ id: 'st', title: 'Romanian stew', tags: [ROMANA] });
    const spicy = item({
      id: 'sp',
      title: 'Spicy risotto',
      parentId: 'r',
      base: { id: 'r', title: 'Risotto' },
      tags: [VEGAN],
    });
    const all = [lasagne, risotto, moussaka, salad, stew, spicy];

    /** Answers like the API: every Tag, and the text in the title. */
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
    const option = (dialog: HTMLElement, name: string) =>
      within(dialog).getByRole('option', { name: new RegExp(`^${name}`) });

    it('opens a dialog with the AND hint, the Tag field, Clear disabled and "Show n Recipes"', async () => {
      setup(answer);
      await findRow('Lasagne');
      const dialog = await openTags();
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(dialog).toHaveTextContent('Recipes must have every Tag you pick.');
      expect(within(dialog).getByRole('combobox')).toHaveAccessibleName(
        'Filter by Tags',
      );
      expect(
        within(dialog).getByPlaceholderText('Type to find a Tag'),
      ).toBeInTheDocument();
      expect(
        within(dialog).getByRole('button', { name: 'Clear' }),
      ).toBeDisabled();
      expect(
        within(dialog).getByRole('button', { name: 'Show 6 Recipes' }),
      ).toBeInTheDocument();
    });

    it('lists Your Tags first, then the Tag Groups, with the count each Tag would leave', async () => {
      setup(answer);
      await findRow('Lasagne');
      const dialog = await openTags();
      const names = await within(dialog).findAllByRole('option');
      expect(
        names.map((o) => o.textContent?.replace(/\d+ Recipes?$/, '')),
      ).toEqual([
        'Meal prep',
        'Vegan',
        'Italian',
        'Greek',
        'Română',
        'Baking',
        'Grilling',
      ]);
      expect(within(dialog).getByText('Your Tags')).toBeInTheDocument();
      expect(
        within(dialog).getByText('only your family sees these'),
      ).toBeInTheDocument();
      await waitFor(() =>
        expect(
          within(option(dialog, 'Italian')).getByText('2 Recipes'),
        ).toBeInTheDocument(),
      );
      expect(
        within(option(dialog, 'Meal prep')).getByText('1 Recipe'),
      ).toBeInTheDocument();
    });

    it('never offers Create "…" in the filter, whatever is typed', async () => {
      setup(answer);
      await findRow('Lasagne');
      const dialog = await openTags();
      const user = userEvent.setup();
      await user.type(
        within(dialog).getByRole('combobox', { name: 'Filter by Tags' }),
        'Sunday roast',
      );
      expect(
        within(dialog).queryByRole('option', { name: /^Create/ }),
      ).not.toBeInTheDocument();
      expect(
        await within(dialog).findByText('No Tag by that name on your Recipes'),
      ).toBeInTheDocument();
    });

    it('dims a Tag that would leave no Recipe, but keeps a picked one enabled', async () => {
      setup(answer);
      await findRow('Lasagne');
      const dialog = await openTags();
      await waitFor(() =>
        expect(option(dialog, 'Grilling')).toHaveAttribute(
          'aria-disabled',
          'true',
        ),
      );
      const user = userEvent.setup();
      await user.click(option(dialog, 'Italian'));
      // Greek shares no Recipe with Italian: dimmed. Italian is picked: enabled, no count.
      await waitFor(() =>
        expect(option(dialog, 'Greek')).toHaveAttribute(
          'aria-disabled',
          'true',
        ),
      );
      expect(option(dialog, 'Italian')).not.toHaveAttribute(
        'aria-disabled',
        'true',
      );
      expect(
        within(option(dialog, 'Italian')).queryByLabelText(/Recipes?$/),
      ).toBeNull();
      expect(option(dialog, 'Baking')).not.toHaveAttribute(
        'aria-disabled',
        'true',
      );
    });

    it('applies each pick to the list behind it and to "Show n Recipes", and keeps them on close', async () => {
      const calls = setup(answer);
      const user = userEvent.setup();
      await findRow('Lasagne');
      const dialog = await openTags();
      await user.click(
        await within(dialog).findByRole('option', { name: /^Italian/ }),
      );
      await waitFor(() => expect(lastQuery(calls).get('tagIds')).toBe('c-it'));
      expect(
        await within(dialog).findByRole('button', { name: 'Show 2 Recipes' }),
      ).toBeInTheDocument();
      // The picked Tag shows in the field as a removable chip.
      expect(
        within(dialog).getByRole('button', { name: 'Remove Tag Italian' }),
      ).toBeInTheDocument();

      await user.click(option(dialog, 'Vegan'));
      expect(
        await within(dialog).findByRole('button', { name: 'Show 1 Recipe' }),
      ).toBeInTheDocument();

      await user.click(
        within(dialog).getByRole('button', { name: 'Show 1 Recipe' }),
      );
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(await tagsButton()).toHaveAccessibleName(
        'Filter by Tags, 2 selected',
      );
      expect(await findRow('Risotto', MATCHES)).toBeInTheDocument();
      expect(screen.queryByText('Lasagne')).not.toBeInTheDocument();
    });

    it('clears every Tag with Clear and keeps the sheet open', async () => {
      const calls = setup(answer);
      const user = userEvent.setup();
      await findRow('Lasagne');
      const dialog = await openTags();
      await user.click(
        await within(dialog).findByRole('option', { name: /^Italian/ }),
      );
      await user.click(within(dialog).getByRole('button', { name: 'Clear' }));
      await waitFor(() => expect(lastQuery(calls).has('tagIds')).toBe(false));
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(
        within(dialog).getByRole('button', { name: 'Clear' }),
      ).toBeDisabled();
    });

    it('matches while typing ignoring case and accents', async () => {
      setup(answer);
      await findRow('Lasagne');
      const dialog = await openTags();
      await userEvent.type(within(dialog).getByRole('combobox'), 'ROMANA');
      expect(
        await within(dialog).findByRole('option', { name: /^Română/ }),
      ).toBeInTheDocument();
      expect(within(dialog).getAllByRole('option')).toHaveLength(1);
    });

    it('says so when no Tag has the typed name, and never offers to create one', async () => {
      setup(answer);
      await findRow('Lasagne');
      const dialog = await openTags();
      await userEvent.type(within(dialog).getByRole('combobox'), 'zzz');
      expect(
        await within(dialog).findByText('No Tag by that name on your Recipes'),
      ).toBeInTheDocument();
      expect(within(dialog).queryByText(/create/i)).toBeNull();
    });

    it('closes with the ×, with Escape from the field and with Escape on the sheet, and focus returns to the Tags button', async () => {
      setup(answer);
      const user = userEvent.setup();
      await findRow('Lasagne');
      await openTags();
      await closeTags();
      await waitFor(() => expect(tagsButtonNow()).toHaveFocus());

      const dialog = await openTags();
      await user.click(within(dialog).getByRole('combobox'));
      await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      await waitFor(() => expect(tagsButtonNow()).toHaveFocus());

      await openTags();
      await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });

    it('announces the picks and the result in a polite status line', async () => {
      setup(answer);
      await findRow('Lasagne');
      await pickTags('Italian', 'Vegan');
      const status = await screen.findByRole('status');
      expect(status).toHaveAttribute('aria-live', 'polite');
      await waitFor(() =>
        expect(status).toHaveTextContent(
          'Italian, Vegan selected. 1 Recipe matches.',
        ),
      );
    });

    it('keeps the page status line mounted, empty, so the first pick and the last removal are announced', async () => {
      setup(answer);
      await findRow('Lasagne');
      const live = document.querySelectorAll('[role="status"]');
      expect(live).toHaveLength(1);
      const region = live[0];
      expect(region).toHaveAttribute('aria-live', 'polite');
      expect(region).toHaveTextContent('');
      await pickTags('Italian');
      // The very same element, now holding the text.
      expect(document.contains(region)).toBe(true);
      expect(region).toHaveTextContent('Italian selected.');
      await userEvent.click(
        screen.getByRole('button', { name: 'Remove Tag Italian' }),
      );
      expect(document.contains(region)).toBe(true);
      expect(region).toHaveTextContent('');
    });

    it('lists Variants as their own rows matched on their own Tags, sorted A to Z', async () => {
      setup(answer);
      await findRow('Lasagne');
      await pickTags('Vegan');
      const list = await screen.findByRole('list', { name: MATCHES });
      await within(list).findByText('Spicy risotto');
      const titles = within(list)
        .getAllByRole('listitem')
        .map((row) => row.querySelector('a')?.textContent?.split('Your')[0]);
      expect(titles).toHaveLength(3);
      expect(titles[0]).toContain('Risotto');
      expect(titles[1]).toContain('Salad');
      expect(titles[2]).toContain('Spicy risotto');
      expect(await findRow('Spicy risotto', MATCHES)).toHaveTextContent(
        'Variant of Risotto',
      );
    });

    it('puts the matched Tags first on a row', async () => {
      setup(answer);
      await findRow('Lasagne');
      await pickTags('Baking');
      const row = await findRow('Lasagne', MATCHES);
      expect(within(row).getByRole('group')).toHaveAccessibleName(
        'Tags: Baking, Meal prep, Italian',
      );
    });

    it('offers "Without {Tag}" with the count each would show when no Recipe has every Tag', async () => {
      const calls = setup(answer);
      const user = userEvent.setup();
      await findRow('Lasagne');
      await pickTags('Italian', 'Vegan');
      await user.type(screen.getByLabelText('Search Recipes'), 'las');
      expect(
        await screen.findByText('No Recipes have all 2 Tags and match “las”'),
      ).toBeInTheDocument();
      expect(screen.getByText('Try without one of them:')).toBeInTheDocument();
      // Lasagne is Italian but not Vegan; nothing "las" is Vegan.
      const noItalian = await screen.findByRole('button', {
        name: /^Without Italian/,
      });
      const noVegan = screen.getByRole('button', { name: /^Without Vegan/ });
      const noText = screen.getByRole('button', { name: /^Without “las”/ });
      await waitFor(() => expect(noVegan).toHaveTextContent('1'));
      expect(noItalian).toBeDisabled();
      expect(noItalian).toHaveTextContent('0');
      expect(noText).toHaveTextContent('1');

      await user.click(noVegan);
      await waitFor(() => expect(lastQuery(calls).get('tagIds')).toBe('c-it'));
      expect(await findRow('Lasagne', MATCHES)).toBeInTheDocument();
      expect(screen.queryByText(/No Recipes have all/)).not.toBeInTheDocument();
    });

    it('says "that Tag" for one Tag with no Recipe, and the text button clears the search', async () => {
      setup(answer);
      const user = userEvent.setup();
      await findRow('Lasagne');
      await pickTags('Greek');
      await user.type(screen.getByLabelText('Search Recipes'), 'lasagne');
      expect(
        await screen.findByText('No Recipes have that Tag and match “lasagne”'),
      ).toBeInTheDocument();
      const noText = await screen.findByRole('button', {
        name: /^Without “lasagne”/,
      });
      await waitFor(() => expect(noText).toBeEnabled());
      await user.click(noText);
      expect(screen.getByLabelText('Search Recipes')).toHaveValue('');
      expect(await findRow('Moussaka', MATCHES)).toBeInTheDocument();
    });
  });

  describe('status pills on rows', () => {
    it('marks a Recipe that is itself the best match as "Can Make"', async () => {
      setup(() => [omelette, soup], [card()]);
      const row = await findRow('Omelette');
      expect(within(row).getByText('Can Make')).toBeInTheDocument();
      expect(await findRow('Soup')).not.toHaveTextContent('Can Make');
    });

    it('names the Variant on a Base Recipe row whose best match is that Variant', async () => {
      setup(
        () => [omelette],
        [
          card({
            recipe: { id: 'v1', title: 'Spicy omelette', parentId: 'o' },
          }),
        ],
      );
      const row = await findRow('Omelette');
      expect(
        within(row).getByText('Can Make Spicy omelette'),
      ).toBeInTheDocument();
      expect(within(row).queryByText('Can Make')).not.toBeInTheDocument();
    });

    it('names the Variant on a near-miss pill whose best match is that Variant', async () => {
      setup(
        () => [omelette],
        [
          card({
            canMake: false,
            missing: { ingredientId: null, name: 'Chives' },
            recipe: { id: 'f', title: 'Frittata', parentId: 'o' },
          }),
        ],
      );
      expect(await findRow('Omelette')).toHaveTextContent(
        'Missing Chives for Frittata',
      );
    });

    it("prefers a Recipe's own card to its base's, and gives no pill to a Variant row without its own card", async () => {
      const calls = setup(
        (url) => (filtered(url) ? [frittata, gratin] : [omelette]),
        [card({ recipe: { id: 'f', title: 'Frittata', parentId: 'o' } })],
      );
      await findRow('Omelette');
      await pickTags('Italian');
      await waitFor(() => expect(lastQuery(calls).get('tagIds')).toBe('c-it'));
      const own = await findRow('Frittata', MATCHES);
      expect(within(own).getByText('Can Make')).toBeInTheDocument();
      expect(await findRow('Gratin', MATCHES)).not.toHaveTextContent(
        'Can Make',
      );
    });

    it('shows "Missing {name}" for a near miss, without a "Can Make" pill', async () => {
      setup(
        () => [omelette],
        [
          card({
            canMake: false,
            missing: { ingredientId: 'i', name: 'Feta' },
          }),
        ],
      );
      const row = await findRow('Omelette');
      expect(within(row).getByText('Missing Feta')).toBeInTheDocument();
      expect(row).not.toHaveTextContent('Can Make');
    });

    it('shows an "{n} expiring" pill next to the status', async () => {
      setup(
        () => [omelette, soup],
        [
          card({ expiringCount: 2 }),
          card({
            base: { id: 's', title: 'Soup' },
            recipe: { id: 's', title: 'Soup' },
            canMake: false,
            missing: { ingredientId: null, name: 'Leek' },
            expiringCount: 1,
          }),
        ],
      );
      const row = await findRow('Omelette');
      expect(within(row).getByText('Can Make')).toBeInTheDocument();
      expect(within(row).getByText('2 expiring')).toBeInTheDocument();
      const nearRow = await findRow('Soup');
      expect(within(nearRow).getByText('Missing Leek')).toBeInTheDocument();
      expect(within(nearRow).getByText('1 expiring')).toBeInTheDocument();
    });

    it('shows no pill on a row without a card', async () => {
      setup(() => [omelette, soup], [card()]);
      await findCookTonight();
      const row = await findRow('Soup');
      expect(row).not.toHaveTextContent('Can Make');
      expect(row).not.toHaveTextContent('Missing');
      expect(row).not.toHaveTextContent('expiring');
    });
  });

  describe('allergen indicator', () => {
    const peanuts = (
      severity: 'strong' | 'soft',
    ): NonNullable<RecipeListItem['allergyWarning']> => ({
      severity,
      allergens: [
        {
          id: 'a-pn',
          name: 'Peanuts',
          tier: 'yours',
          severity,
          owners: [{ kind: 'own' }],
        },
        {
          id: 'a-mk',
          name: 'Milk',
          tier: 'members',
          severity,
          owners: [{ kind: 'member', name: 'Ana' }],
        },
      ],
      uncheckedCount: 0,
    });

    it('marks a row strongly, naming the Allergens for a screen reader', async () => {
      setup(() => [
        item({ id: 'o', title: 'Omelette', allergyWarning: peanuts('strong') }),
        soup,
      ]);
      const row = await findRow('Omelette');
      const indicator = within(row).getByRole('img', {
        name: 'Contains Peanuts, Milk',
      });
      expect(indicator).toHaveAttribute('data-severity', 'strong');
      expect(within(await findRow('Soup')).queryByRole('img')).toBeNull();
    });

    it('marks a row softly when only optional lines contain the Allergen', async () => {
      setup(() => [
        item({ id: 'o', title: 'Omelette', allergyWarning: peanuts('soft') }),
      ]);
      const row = await findRow('Omelette');
      expect(
        within(row).getByRole('img', {
          name: 'Optional: contains Peanuts, Milk',
        }),
      ).toHaveAttribute('data-severity', 'soft');
    });

    it('says when lines could not be checked, without claiming anything is free of Allergens', async () => {
      setup(() => [
        item({
          id: 'o',
          title: 'Omelette',
          allergyWarning: {
            severity: 'soft',
            allergens: [],
            uncheckedCount: 2,
          },
        }),
      ]);
      const row = await findRow('Omelette');
      expect(
        within(row).getByRole('img', {
          name: "2 ingredients couldn't be checked for allergens",
        }),
      ).toBeVisible();
    });
  });

  describe('hidden by Allergies', () => {
    const note = (count: string) =>
      screen.findByText(`${count} hidden by your Allergies`);

    it('says how many Recipes are hidden, with a Show button', async () => {
      setup(() => [omelette], [], undefined, 3);
      expect(await note('3 Recipes')).toBeVisible();
      expect(screen.getByRole('button', { name: 'Show' })).toBeVisible();
    });

    it("counts Cook Tonight's hidden cards when they outnumber the list's", async () => {
      setup(() => [omelette], [], undefined, 1, 4);
      expect(await note('4 Recipes')).toBeVisible();
    });

    it("counts only the list's hidden Recipes while a search is active", async () => {
      setup(
        (url) => (filtered(url) ? [frittata] : [omelette]),
        [card()],
        undefined,
        1,
        4,
      );
      const user = userEvent.setup();
      expect(await note('4 Recipes')).toBeVisible();
      await user.type(screen.getByLabelText('Search Recipes'), 'frit');
      expect(await note('1 Recipe')).toBeVisible();
      expect(screen.queryByText('4 hidden by your Allergies')).toBeNull();
    });

    it('says "1 Recipe" in the singular', async () => {
      setup(() => [omelette], [], undefined, 1);
      expect(await note('1 Recipe')).toBeVisible();
    });

    it('shows no note when nothing is hidden', async () => {
      setup(() => [omelette]);
      await findRow('Omelette');
      expect(screen.queryByText(/hidden by your Allergies/)).toBeNull();
      expect(screen.queryByRole('button', { name: 'Show' })).toBeNull();
    });

    it('asks for the hidden Recipes, in the list and Cook Tonight, when Show is pressed', async () => {
      const user = userEvent.setup();
      const calls = setup(
        (url) =>
          url.searchParams.get('showHidden') === 'true'
            ? [omelette, soup]
            : [omelette],
        [],
        undefined,
        1,
      );
      await user.click(await screen.findByRole('button', { name: 'Show' }));
      expect(await findRow('Soup')).toBeVisible();
      expect(screen.queryByText(/hidden by your Allergies/)).toBeNull();
      const cookTonight = calls.filter(
        (c) => c.key === 'GET /api/recipes/cook-tonight',
      );
      expect(
        new URLSearchParams(cookTonight.at(-1)!.search).get('showHidden'),
      ).toBe('true');
    });

    it('does not ask to show hidden Recipes on the first load', async () => {
      const calls = setup(() => [omelette]);
      await findRow('Omelette');
      for (const call of calls.filter((c) =>
        c.key.startsWith('GET /api/recipes'),
      )) {
        expect(new URLSearchParams(call.search).has('showHidden')).toBe(false);
      }
    });
  });

  describe('Cook Tonight card', () => {
    const expiring = (id: string, title: string, count = 1) =>
      card({
        base: { id, title },
        recipe: { id, title },
        expiringCount: count,
      });
    const plain = (id: string, title: string) =>
      card({ base: { id, title }, recipe: { id, title } });
    const near = (id: string, title: string, expiringCount = 0) =>
      card({
        base: { id, title },
        recipe: { id, title },
        canMake: false,
        missing: { ingredientId: null, name: 'Feta' },
        expiringCount,
      });

    it('shows the chef Gator, how many Recipes the Family Can Make and how many use what expires soon', async () => {
      setup(
        () => [omelette, soup],
        [expiring('o', 'Omelette'), plain('s', 'Soup'), plain('p', 'Pie')],
      );
      const link = await findCookTonight();
      expect(link).toHaveAccessibleName(
        'Cook tonight, 3 Recipes you can make, 1 uses what expires soon',
      );
      expect(link).toHaveTextContent('3 Recipes you can make');
      expect(link).toHaveTextContent('1 uses what expires soon');
      expect(
        within(link).getByRole('img', { name: 'Gator, cooking' }),
      ).toHaveAttribute('data-mood', 'chef');
      // The link's name stays "Cook tonight, ..."; Gator's mood is its description.
      expect(link).toHaveAccessibleDescription('Gator, cooking');
    });

    it('says "1 Recipe" in the singular and "2 use" in the plural', async () => {
      setup(() => [omelette], [expiring('o', 'Omelette'), near('s', 'Soup')]);
      expect(await findCookTonight()).toHaveAccessibleName(
        'Cook tonight, 1 Recipe you can make, 1 uses what expires soon',
      );
      cleanup();
      setup(
        () => [omelette],
        [expiring('o', 'Omelette'), expiring('s', 'Soup', 3)],
      );
      expect(await findCookTonight()).toHaveAccessibleName(
        'Cook tonight, 2 Recipes you can make, 2 use what expires soon',
      );
    });

    it('leaves out the expiring line when no Recipe it counts uses what expires soon', async () => {
      setup(() => [omelette], [plain('o', 'Omelette'), near('s', 'Soup', 3)]);
      const link = await findCookTonight();
      expect(link).toHaveAccessibleName('Cook tonight, 1 Recipe you can make');
      expect(link).not.toHaveTextContent('expires soon');
    });

    it('counts a Base Recipe once, whichever of its Variants is the best match', async () => {
      setup(
        () => [omelette, soup],
        [
          card({
            recipe: { id: 'v1', title: 'Spicy omelette', parentId: 'o' },
            otherVariantsCount: 3,
          }),
          plain('s', 'Soup'),
        ],
      );
      expect(await findCookTonight()).toHaveTextContent(
        '2 Recipes you can make',
      );
    });

    it('opens the Cook Tonight page when tapped', async () => {
      stubMotion(true);
      setup(() => [omelette], [plain('o', 'Omelette')]);
      const link = await findCookTonight();
      expect(link).toHaveAttribute('href', '/recipes/cook-tonight');
      await userEvent.click(link);
      expect(await screen.findByText('cook tonight page')).toBeInTheDocument();
    });

    describe('pressing the card', () => {
      afterEach(() => vi.useRealTimers());

      it("plays Gator's Tap and opens the page 500ms later", async () => {
        stubMotion(false);
        vi.useFakeTimers({ shouldAdvanceTime: true });
        setup(() => [omelette], [plain('o', 'Omelette')]);
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        const link = await findCookTonight();
        await user.click(link);
        expect(within(link).getByRole('img')).toHaveAttribute(
          'data-motion',
          'tap',
        );
        await act(() => vi.advanceTimersByTimeAsync(400));
        expect(screen.queryByText('cook tonight page')).toBeNull();
        expect(await findCookTonight()).toBeVisible();
        await act(() => vi.advanceTimersByTimeAsync(100));
        expect(screen.getByText('cook tonight page')).toBeInTheDocument();
      });

      it('goes to the Pantry after the Tap when nothing can be made', async () => {
        stubMotion(false);
        vi.useFakeTimers({ shouldAdvanceTime: true });
        setup(() => [omelette], []);
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        await user.click(await findCookTonight());
        expect(screen.queryByText('pantry page')).toBeNull();
        await act(() => vi.advanceTimersByTimeAsync(500));
        expect(screen.getByText('pantry page')).toBeInTheDocument();
      });

      it('opens the page at once with reduced motion', async () => {
        stubMotion(true);
        vi.useFakeTimers({ shouldAdvanceTime: true });
        setup(() => [omelette], [plain('o', 'Omelette')]);
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        await user.click(await findCookTonight());
        expect(screen.getByText('cook tonight page')).toBeInTheDocument();
      });
    });

    describe('when nothing can be made', () => {
      const FLOP = 'Gator, disappointed, with the cooking tools dropped';

      it('says how many Recipes are one ingredient short, with the disappointed chef, and opens the Cook Tonight page', async () => {
        stubMotion(true);
        setup(
          () => [omelette, soup],
          [near('o', 'Omelette'), near('s', 'Soup', 2)],
        );
        const link = await findCookTonight();
        expect(link).toHaveAccessibleName(
          'Cook tonight, Nothing to cook yet, 2 Recipes are one ingredient short',
        );
        expect(link).toHaveTextContent('Nothing to cook yet');
        expect(link).toHaveTextContent('2 Recipes are one ingredient short');
        expect(link).not.toHaveTextContent('expires soon');
        expect(within(link).getByRole('img', { name: FLOP })).toHaveAttribute(
          'data-mood',
          'chef-flop',
        );
        expect(link).toHaveAttribute('href', '/recipes/cook-tonight');
        await userEvent.click(link);
        expect(
          await screen.findByText('cook tonight page'),
        ).toBeInTheDocument();
      });

      it('says "1 Recipe is" in the singular', async () => {
        setup(() => [omelette], [near('o', 'Omelette')]);
        expect(await findCookTonight()).toHaveAccessibleName(
          'Cook tonight, Nothing to cook yet, 1 Recipe is one ingredient short',
        );
      });

      it('points to the Pantry, with the disappointed chef, when nothing is one ingredient short either', async () => {
        stubMotion(true);
        setup(() => [omelette], []);
        const link = await findCookTonight();
        expect(link).toHaveAccessibleName(
          'Cook tonight, Nothing to cook from your Pantry yet, Add what you have',
        );
        expect(link).toHaveTextContent('Nothing to cook from your Pantry yet');
        expect(link).toHaveTextContent('Add what you have');
        expect(within(link).getByRole('img', { name: FLOP })).toHaveAttribute(
          'data-mood',
          'chef-flop',
        );
        expect(link).toHaveAttribute('href', '/pantry');
        await userEvent.click(link);
        expect(await screen.findByText('pantry page')).toBeInTheDocument();
      });

      it('never shows the disappointed chef before Cook Tonight has loaded', async () => {
        let release!: () => void;
        const gate = new Promise<void>((resolve) => (release = resolve));
        setup(
          () => [omelette],
          async () => {
            await gate;
            return [];
          },
        );
        await findRow('Omelette');
        expect(queryCookTonight()).toBeNull();
        expect(screen.queryByAltText(FLOP)).toBeNull();
        release();
        expect(await findCookTonight()).toHaveAttribute('href', '/pantry');
      });

      it('is hidden while searching, and returns once the search is cleared', async () => {
        setup((url) => (filtered(url) ? [frittata] : [omelette]), []);
        const user = userEvent.setup();
        await findCookTonight();
        await user.type(screen.getByLabelText('Search Recipes'), 'frit');
        await waitFor(() => expect(queryCookTonight()).toBeNull());
        expect(screen.queryByAltText(FLOP)).toBeNull();
        await user.clear(screen.getByLabelText('Search Recipes'));
        await findCookTonight();
      });

      it('counts the Recipes hidden by Allergies once Show is pressed', async () => {
        const user = userEvent.setup();
        setup(
          () => [omelette],
          (url) =>
            url.searchParams.get('showHidden') === 'true'
              ? [near('o', 'Omelette'), near('s', 'Soup')]
              : [near('o', 'Omelette')],
          undefined,
          1,
        );
        expect(await findCookTonight()).toHaveAccessibleName(
          'Cook tonight, Nothing to cook yet, 1 Recipe is one ingredient short',
        );
        await user.click(await screen.findByRole('button', { name: 'Show' }));
        await waitFor(async () =>
          expect(await findCookTonight()).toHaveAccessibleName(
            'Cook tonight, Nothing to cook yet, 2 Recipes are one ingredient short',
          ),
        );
      });
    });

    it('is hidden while Cook Tonight loads', async () => {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      setup(
        () => [omelette],
        async () => {
          await gate;
          return [plain('o', 'Omelette')];
        },
      );
      await findRow('Omelette');
      expect(queryCookTonight()).toBeNull();
      expect(screen.queryByAltText('Gator, cooking')).toBeNull();
      release();
      expect(await findCookTonight()).toBeVisible();
    });

    it('is hidden when Cook Tonight fails to load', async () => {
      setup(
        () => [omelette],
        () => Response.json({ code: 'internal', params: {} }, { status: 500 }),
      );
      await findRow('Omelette');
      await waitFor(() =>
        expect(
          queryClient
            .getQueryCache()
            .findAll({ queryKey: ['recipes', 'cook-tonight'] })
            .some((query) => query.state.status === 'error'),
        ).toBe(true),
      );
      expect(queryCookTonight()).toBeNull();
      expect(screen.queryByAltText('Gator, cooking')).toBeNull();
    });

    describe('before the Recipe list has answered', () => {
      /** Cook Tonight answers "nothing" at once; the Recipe list is whatever `list` does. */
      function setupWithList(list: () => Response | Promise<Response>) {
        const { fetchMock } = stubApi({
          'GET /api/recipes': list,
          'GET /api/recipes/filters': () => Response.json(filters),
          'GET /api/recipes/cook-tonight': () =>
            Response.json({ cards: [], hiddenByAllergiesCount: 0 }),
        });
        vi.stubGlobal('fetch', fetchMock);
        ({ queryClient } = renderWithProviders(<RecipesPage />, {
          route: '/recipes',
        }));
      }
      const cookTonightAnswered = () =>
        waitFor(() =>
          expect(
            queryClient
              .getQueryCache()
              .findAll({ queryKey: ['recipes', 'cook-tonight'] })
              .some((query) => query.state.status === 'success'),
          ).toBe(true),
        );

      it('is hidden while the Recipe list loads, so a slow load never reads as "nothing to cook"', async () => {
        let release!: () => void;
        const gate = new Promise<void>((resolve) => (release = resolve));
        setupWithList(async () => {
          await gate;
          return Response.json({ recipes: [], hiddenByAllergiesCount: 0 });
        });
        await cookTonightAnswered();
        expect(queryCookTonight()).toBeNull();
        release();
      });

      it('is hidden when the Recipe list fails to load', async () => {
        setupWithList(() =>
          Response.json({ code: 'internal', params: {} }, { status: 500 }),
        );
        await screen.findByRole('alert');
        await cookTonightAnswered();
        expect(queryCookTonight()).toBeNull();
      });
    });

    it('is hidden while searching and while a Tag filters, and returns once they are cleared', async () => {
      setup(
        (url) => (filtered(url) ? [frittata] : [omelette]),
        [plain('o', 'Omelette')],
      );
      const user = userEvent.setup();
      await findCookTonight();

      await user.type(screen.getByLabelText('Search Recipes'), 'frit');
      await waitFor(() => expect(queryCookTonight()).toBeNull());

      await user.clear(screen.getByLabelText('Search Recipes'));
      await findCookTonight();

      await pickTags('Italian');
      await waitFor(() => expect(queryCookTonight()).toBeNull());
      await user.click(
        await screen.findByRole('button', { name: 'Remove Tag Italian' }),
      );
      await findCookTonight();
    });

    it('counts the Recipes hidden by Allergies once Show is pressed', async () => {
      const user = userEvent.setup();
      setup(
        () => [omelette],
        (url) =>
          url.searchParams.get('showHidden') === 'true'
            ? [plain('o', 'Omelette'), expiring('s', 'Soup')]
            : [plain('o', 'Omelette')],
        undefined,
        1,
      );
      expect(await findCookTonight()).toHaveAccessibleName(
        'Cook tonight, 1 Recipe you can make',
      );
      await user.click(await screen.findByRole('button', { name: 'Show' }));
      await waitFor(async () =>
        expect(await findCookTonight()).toHaveAccessibleName(
          'Cook tonight, 2 Recipes you can make, 1 uses what expires soon',
        ),
      );
    });
  });
});

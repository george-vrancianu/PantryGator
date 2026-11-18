import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App';
import { AppLayout } from '../../components/AppLayout';
import { useSignOut } from '../../lib/auth';
import { linkReadsOf, recipeReads } from '../../lib/recipeReads';
import type { FamilyRecipeEdit } from '../../lib/familyRecipes';
import type { RecipeDraftView } from '../../lib/recipeDrafts';
import type { RecipeFromLink, RecipeFromLinkDraft } from '../../lib/linkRecipe';
import type { Locale } from '../../i18n';
import { renderWithProviders, stubApi } from '../../test/render';
import { makeScrollable, pull } from '../../test/scroll';
import { closeBubbleSheet, openBubbleSheet } from '../../test/voiceDom';
import { NewRecipePage } from './FamilyRecipePages';
import { RecipesPage } from './RecipesPage';

const filters = {
  tags: [],
  eatingMoments: [],
};

const read = (
  over: Partial<RecipeFromLinkDraft['draft']> = {},
): RecipeFromLinkDraft => ({
  kind: 'draft',
  recipeDraftId: 'rd-1',
  draft: {
    title: 'Blog pancakes',
    servings: null,
    prepMinutes: 10,
    cookMinutes: 15,
    difficulty: null,
    tagIds: ['c-fr', 'm-pan'],
    lines: [
      {
        ingredientId: 'egg',
        rawName: null,
        ingredientName: 'Egg',
        quantity: 2,
        unit: 'pcs',
        optional: false,
        note: '2 large',
      },
      {
        ingredientId: null,
        rawName: 'Maple syrup',
        ingredientName: 'Maple syrup',
        quantity: null,
        unit: null,
        optional: false,
        note: 'to serve',
      },
    ],
    steps: [
      { text: 'Whisk and fry', timerSeconds: 120 },
      { text: 'Serve warm', timerSeconds: null },
    ],
    tips: [],
    guidance: { nutritionNote: null, pairings: [], eatingMoments: [] },
    ...over,
  },
  sourceLink: 'https://www.example.com/pancakes',
  sourceLanguage: null,
  closestBases: [],
  hiddenByAllergiesCount: 0,
});

const saved = {
  id: 'new-id',
  parentId: null,
  title: 'Blog pancakes',
  servings: 4,
  lines: [],
  steps: [],
} as unknown as FamilyRecipeEdit;

type Routes = Parameters<typeof stubApi>[0];

/** The Recipe Draft the server stores for a read (mirror of the API's `draftContentOfLink`). */
function draftViewOf(result: RecipeFromLinkDraft): RecipeDraftView {
  const { draft } = result;
  return {
    id: result.recipeDraftId,
    kind: 'new_recipe',
    baseRecipeId: null,
    baseRecipeName: null,
    baseAvailable: true,
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    expiresAt: '2026-01-31T00:00:00.000Z',
    content: {
      title: draft.title,
      servings: draft.servings === null ? '' : String(draft.servings),
      prepMinutes: draft.prepMinutes === null ? '' : String(draft.prepMinutes),
      cookMinutes: draft.cookMinutes === null ? '' : String(draft.cookMinutes),
      difficulty: draft.difficulty ?? '',
      tagIds: draft.tagIds,
      lines: draft.lines.map((line) => ({
        ingredientId: line.ingredientId ?? '',
        name: line.ingredientName || line.rawName || '',
        quantity: line.quantity === null ? '' : String(line.quantity),
        unit: line.unit ?? 'g',
        optional: line.optional,
        note: line.note ?? '',
      })),
      steps: draft.steps.map((step) => ({
        text: step.text,
        timer: step.timerSeconds === null ? '' : String(step.timerSeconds / 60),
      })),
      guidance: { nutritionNote: '', pairings: [], eatingMoments: [] },
      pickedBaseId: result.closestBases[0]?.id ?? null,
      sourceLink: result.sourceLink,
      sourceLanguage: result.sourceLanguage,
      plateScan: false,
      offersBases: true,
    },
  };
}

/**
 * Plays the server's side of a read: the from-link answer is kept as the Member's Recipe Draft
 * (served by id) and the closest Base Recipes are asked again from it, as the editor does on resume.
 */
function withStoredRead(routes: Routes): Routes {
  let stored: RecipeFromLinkDraft | null = null;
  const fromLink = routes['POST /api/recipes/from-link'];
  if (!fromLink) return routes;
  return {
    'GET /api/recipe-drafts/rd-1': () =>
      stored
        ? Response.json(draftViewOf(stored))
        : Response.json({ code: 'recipe_drafts.not_found' }, { status: 404 }),
    'POST /api/recipes/plate-matches': () =>
      Response.json({
        matches: stored?.closestBases ?? [],
        hiddenByAllergiesCount: stored?.hiddenByAllergiesCount ?? 0,
      }),
    ...routes,
    'POST /api/recipes/from-link': async (url) => {
      const response = await fromLink(url);
      if (!response.ok) return response;
      const result = (await response.clone().json()) as RecipeFromLink;
      if (result.kind === 'draft') stored = result;
      return response;
    },
  };
}

type SetupOptions = { locale?: Locale; route?: string };

function SignOutButton() {
  const signOut = useSignOut();
  return <button onClick={() => signOut.mutate()}>Sign out now</button>;
}

/** Records the AbortSignal of every request, as the browser would receive it. */
function setup(
  routes: Routes,
  { locale, route = '/recipes?fromLink=1' }: SetupOptions = {},
) {
  const signals: Array<AbortSignal | null | undefined> = [];
  const { fetchMock, calls } = stubApi({
    'GET /api/recipes/filters': () => Response.json(filters),
    'GET /api/recipes': () =>
      Response.json({ recipes: [], hiddenByAllergiesCount: 0 }),
    'POST /api/auth/sign-out': () => Response.json({}),
    'GET /api/recipes/link-check': () => Response.json({ recipeId: null }),
    ...withStoredRead(routes),
  });
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
    // Only the reads' own requests: the duplicate check has a signal of its own.
    if (String(input).endsWith('/from-link')) signals.push(init?.signal);
    const response = fetchMock(input, init);
    const signal = init?.signal;
    if (!signal) return response;
    // A real fetch rejects when its signal aborts.
    return Promise.race([
      response,
      new Promise<never>((_, reject) =>
        signal.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        ),
      ),
    ]);
  });
  function Where() {
    return <p>at {useLocation().pathname}</p>;
  }
  const view = renderWithProviders(
    <>
      <Where />
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/recipes" element={<RecipesPage />} />
          <Route path="/recipes/new" element={<NewRecipePage />} />
          <Route path="/recipes/:id" element={<p>Detail of the recipe</p>} />
          <Route
            path="/pantry"
            element={
              <>
                <p>pantry page</p>
                <Link to="/recipes">to recipes</Link>
                <SignOutButton />
              </>
            }
          />
        </Route>
      </Routes>
    </>,
    { route, locale },
  );
  return { calls, signals, ...view };
}

/** A read that stays pending until `release` is called. */
function hold(result: RecipeFromLink) {
  let release = () => {};
  const gate = new Promise<void>((resolve) => (release = resolve));
  return {
    release,
    handler: async () => {
      await gate;
      return Response.json(result);
    },
  };
}

type User = ReturnType<typeof userEvent.setup>;

const sheet = () => screen.queryByRole('dialog', { name: 'From a link' });
const linkField = () => screen.getByLabelText(/^Link to the recipe/);

/** Types a link into the open sheet and presses "Read the recipe": the sheet closes and the read carries on. */
async function submit(user: User, url: string) {
  await user.type(linkField(), url);
  await user.click(screen.getByRole('button', { name: 'Read the recipe' }));
}

/** Opens the ready row from the Review sheet the Gator bubble opens, and waits for the sheet to go. */
const stripReview = async (user: User) => {
  const sheet = await openBubbleSheet();
  await user.click(
    within(sheet).getAllByRole('button', { name: /^Review the recipe/ })[0]!,
  );
  await waitFor(() => expect(sheet).not.toBeInTheDocument());
};

/** Reads a link, then opens the editor from the strip once the read is ready. */
async function readAndOpen(user: User, url: string) {
  await submit(user, url);
  await stripReview(user);
}

/** Opens the sheet from the Recipes header plus. */
async function openSheet(user: User) {
  await user.click(await screen.findByRole('button', { name: 'Add a Recipe' }));
  await user.click(screen.getByRole('menuitem', { name: 'From a link' }));
  await screen.findByRole('dialog', { name: 'From a link' });
}

beforeEach(() => recipeReads.clear());

describe('"From a link" sheet and the link-read holder', () => {
  afterEach(() => {
    recipeReads.clear();
    vi.unstubAllGlobals();
  });

  const link = 'https://www.example.com/pancakes';
  const sentLinks = (calls: ReturnType<typeof setup>['calls']) =>
    calls
      .filter((c) => c.key === 'POST /api/recipes/from-link')
      .map((c) => (c.body as { url: string }).url);

  it('shows the Credit Price of a web page', async () => {
    const user = userEvent.setup({ delay: null });
    setup(
      {
        'GET /api/credits': () =>
          Response.json({
            balance: 100,
            prices: { 'link-page': 2, 'link-text': 1 },
            lowBalanceThreshold: 10,
            history: [],
          }),
      },
      { route: '/recipes' },
    );
    await openSheet(user);
    const line = await screen.findByText(/Reading a web page costs/);
    expect(line).toBeVisible();
    expect(within(line).getByText('2 Credits')).toBeInTheDocument();
    expect(screen.queryByText(/pasted text costs/)).toBeNull();
  });

  it('opens from the header plus on Recipes, with its label, hint and language choice', async () => {
    const user = userEvent.setup({ delay: null });
    setup({}, { route: '/recipes' });
    expect(sheet()).toBeNull();
    await openSheet(user);
    expect(screen.getByRole('heading', { name: 'From a link' })).toBeVisible();
    expect(screen.getByText('Link to the recipe')).toBeVisible();
    expect(screen.getAllByRole('radio')).toHaveLength(2);
    expect(
      screen.getByRole('button', { name: 'Read the recipe' }),
    ).toBeDisabled();
  });

  it('opens when the address carries the sheet parameter, and the old route lands there', async () => {
    const { fetchMock } = stubApi({
      'GET /api/auth/get-session': () =>
        Response.json({
          user: { id: '1', name: 'Ana', email: 'ana@example.com' },
        }),
      'GET /api/settings/preferences': () =>
        Response.json({ introDone: true, theme: null, locale: null }),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<App />, { route: '/recipes/from-link' });
    expect(
      await screen.findByRole('dialog', { name: 'From a link' }),
    ).toBeVisible();
  });

  it('shows the read in the strip on another Dock page after submitting, and the sheet closes', async () => {
    const user = userEvent.setup({ delay: null });
    const pending = hold(read());
    const { calls } = setup({ 'POST /api/recipes/from-link': pending.handler });
    await submit(user, link);
    await waitFor(() => expect(sheet()).toBeNull());
    await openBubbleSheet();
    expect(await screen.findByText('Reading a recipe link…')).toBeVisible();
    expect(screen.getByText('example.com')).toBeVisible();
    expect(
      calls.find((c) => c.key === 'POST /api/recipes/from-link')?.body,
    ).toEqual({ url: link, language: 'catalog' });
    // Another Dock page: the read follows the Member.
    await closeBubbleSheet();
    await user.click(screen.getByRole('link', { name: 'Pantry' }));
    expect(await screen.findByText('pantry page')).toBeVisible();
    await openBubbleSheet();
    expect(screen.getByText('Reading a recipe link…')).toBeVisible();
    pending.release();
    expect(await screen.findByText('Recipe ready to review')).toBeVisible();
  });

  it('Review opens the editor on the Recipe Draft and the row leaves', async () => {
    const user = userEvent.setup({ delay: null });
    const { calls } = setup({
      'POST /api/recipes/from-link': () => Response.json(read()),
    });
    await submit(user, link);
    await openBubbleSheet();
    await screen.findByText('Recipe ready to review');
    await stripReview(user);
    expect(await screen.findByLabelText(/^Title/)).toHaveValue('Blog pancakes');
    expect(screen.getByText('at /recipes/new')).toBeVisible();
    expect(calls.map((c) => c.key)).toContain('GET /api/recipe-drafts/rd-1');
    expect(screen.queryByText('Recipe ready to review')).toBeNull();
    expect(recipeReads.getState().reads).toEqual([]);
  });

  it('says the Recipe Draft is no longer kept and the row leaves when it is gone', async () => {
    const user = userEvent.setup({ delay: null });
    setup({
      'POST /api/recipes/from-link': () =>
        Response.json({ ...read(), recipeDraftId: 'rd-gone' }),
      'GET /api/recipe-drafts/rd-gone': () =>
        Response.json({ code: 'recipe_drafts.not_found' }, { status: 404 }),
    });
    await submit(user, link);
    await openBubbleSheet();
    await screen.findByText('Recipe ready to review');
    await stripReview(user);
    expect(
      await screen.findByText('That Recipe Draft is no longer kept.'),
    ).toBeVisible();
    expect(screen.queryByText('Recipe ready to review')).toBeNull();
    expect(screen.getByText('at /recipes')).toBeVisible();
  });

  it('updates "Drafts (N)" when a read finishes, without a refresh', async () => {
    const user = userEvent.setup({ delay: null });
    const pending = hold(read());
    let kept = false;
    setup(
      {
        'POST /api/recipes/from-link': async () => {
          const response = await pending.handler();
          kept = true;
          return response;
        },
        'GET /api/recipe-drafts': () =>
          Response.json(
            kept
              ? [
                  {
                    id: 'rd-1',
                    kind: 'new_recipe',
                    title: 'Blog pancakes',
                    baseRecipeName: null,
                    updatedAt: '2026-01-01T00:00:00.000Z',
                    expiresAt: '2026-01-31T00:00:00.000Z',
                  },
                ]
              : [],
          ),
      },
      { route: '/recipes' },
    );
    await openSheet(user);
    await submit(user, link);
    await openBubbleSheet();
    await screen.findByText('Reading a recipe link…');
    expect(screen.queryByRole('link', { name: /^Drafts/ })).toBeNull();
    pending.release();
    await closeBubbleSheet();
    expect(
      await screen.findByRole('link', { name: 'Drafts (1)' }),
    ).toBeVisible();
  });

  describe('reading several', () => {
    /** Five reads asked from the sheet; each stays pending until its release runs. */
    async function startFive(user: User) {
      const releases: Array<() => void> = [];
      const { calls, signals } = setup(
        {
          'POST /api/recipes/from-link': () =>
            new Promise<Response>((resolve) => {
              releases.push(() => resolve(Response.json(read())));
            }),
        },
        { route: '/recipes' },
      );
      for (const n of [1, 2, 3, 4, 5]) {
        await openSheet(user);
        await submit(user, `https://site${n}.example.com/r`);
        await waitFor(() => expect(sheet()).toBeNull());
      }
      return { releases, calls, signals };
    }

    it('reads two at a time, holds five, and the rest wait in the order started', async () => {
      const user = userEvent.setup({ delay: null });
      const { releases, calls } = await startFive(user);
      expect(
        await screen.findByRole('button', {
          name: 'Gator is working: 5 being read. Open Review',
        }),
      ).toBeVisible();
      expect(sentLinks(calls)).toEqual([
        'https://site1.example.com/r',
        'https://site2.example.com/r',
      ]);
      expect(
        linkReadsOf(recipeReads.getState().reads).map(
          (r) => `${r.site}:${r.status}`,
        ),
      ).toEqual([
        'site1.example.com:reading',
        'site2.example.com:reading',
        'site3.example.com:waiting',
        'site4.example.com:waiting',
        'site5.example.com:waiting',
      ]);
      // A finished read frees a slot for the one waiting longest.
      releases[0]();
      await waitFor(() => expect(sentLinks(calls)).toHaveLength(3));
      expect(sentLinks(calls)[2]).toBe('https://site3.example.com/r');
      releases[1]();
      await waitFor(() => expect(sentLinks(calls)).toHaveLength(4));
      expect(sentLinks(calls)[3]).toBe('https://site4.example.com/r');
    });

    it('refuses a sixth in the sheet, asking to review first, until one is let go', async () => {
      const user = userEvent.setup({ delay: null });
      const { calls } = await startFive(user);
      await openSheet(user);
      await submit(user, 'https://site6.example.com/r');
      expect(
        await screen.findByText(/5 link reads are waiting for you/),
      ).toBeVisible();
      expect(sheet()).not.toBeNull();
      expect(recipeReads.getState().reads).toHaveLength(5);
      // Let one go from the background sheet, then the sixth is taken.
      await user.keyboard('{Escape}');
      await waitFor(() => expect(sheet()).toBeNull());
      await user.click(
        await screen.findByRole('button', { name: /Open Review/ }),
      );
      await user.click(
        await screen.findByRole('button', {
          name: 'Cancel reading site5.example.com',
        }),
      );
      await user.keyboard('{Escape}');
      await openSheet(user);
      await submit(user, 'https://site6.example.com/r');
      await waitFor(() => expect(sheet()).toBeNull());
      expect(recipeReads.getState().reads).toHaveLength(5);
      expect(sentLinks(calls)).toHaveLength(2);
    });

    it('discarding a reading row aborts its request and only its own, then the next starts', async () => {
      const user = userEvent.setup({ delay: null });
      const { signals, releases } = await startFive(user);
      const requests = signals.filter((s) => s);
      expect(requests).toHaveLength(2);
      await user.click(
        await screen.findByRole('button', { name: /Open Review/ }),
      );
      await user.click(
        await screen.findByRole('button', {
          name: 'Cancel reading site1.example.com',
        }),
      );
      expect(requests[0]?.aborted).toBe(true);
      expect(requests[1]?.aborted).toBe(false);
      await waitFor(() =>
        expect(recipeReads.getState().reads.map((r) => r.status)).toEqual([
          'reading',
          'reading',
          'waiting',
          'waiting',
        ]),
      );
      // The other read carried on and ends ready.
      releases[1]();
      await waitFor(() =>
        expect(
          linkReadsOf(recipeReads.getState().reads).find(
            (r) => r.site === 'site2.example.com',
          )?.status,
        ).toBe('ready'),
      );
    });
  });

  it('keeps reading when the Member pulls to refresh', async () => {
    const user = userEvent.setup({ delay: null });
    const pending = hold(read());
    const { signals } = setup(
      { 'POST /api/recipes/from-link': pending.handler },
      { route: '/recipes' },
    );
    await openSheet(user);
    await submit(user, link);
    await openBubbleSheet();
    await screen.findByText('Reading a recipe link…');
    await closeBubbleSheet();
    act(() => {
      pull(makeScrollable(screen.getByTestId('sheet-scroller')), { to: 200 });
    });
    await openBubbleSheet();
    await screen.findByText('Reading a recipe link…');
    expect(signals.find((s) => s)?.aborted).toBe(false);
    pending.release();
    expect(await screen.findByText('Recipe ready to review')).toBeVisible();
  });

  it('keeps reading when the sheet is closed with the form untouched by the read, and across pages', async () => {
    const user = userEvent.setup({ delay: null });
    const pending = hold(read());
    const { signals } = setup(
      { 'POST /api/recipes/from-link': pending.handler },
      { route: '/recipes' },
    );
    await openSheet(user);
    await submit(user, link);
    await waitFor(() => expect(sheet()).toBeNull());
    await user.click(screen.getByRole('link', { name: 'Pantry' }));
    await screen.findByText('pantry page');
    await user.click(screen.getByRole('link', { name: 'to recipes' }));
    await openBubbleSheet();
    await screen.findByText('Reading a recipe link…');
    expect(signals.find((s) => s)?.aborted).toBe(false);
    pending.release();
    expect(await screen.findByText('Recipe ready to review')).toBeVisible();
  });

  it('drops the holder silently on sign-out, aborting what is reading', async () => {
    const user = userEvent.setup({ delay: null });
    const pending = hold(read());
    const { signals } = setup(
      { 'POST /api/recipes/from-link': pending.handler },
      { route: '/pantry' },
    );
    recipeReads.submit({ kind: 'link', url: link }, 'catalog');
    await openBubbleSheet();
    await screen.findByText('Reading a recipe link…');
    await closeBubbleSheet();
    await user.click(screen.getByRole('button', { name: 'Sign out now' }));
    await waitFor(() => expect(recipeReads.getState().reads).toEqual([]));
    expect(screen.queryByText('Reading a recipe link…')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(signals.find((s) => s && s !== undefined)?.aborted).toBe(true);
    pending.release();
  });

  it('says a read that failed, and Discard lets it go', async () => {
    const user = userEvent.setup({ delay: null });
    setup({
      'POST /api/recipes/from-link': () =>
        Response.json({ code: 'link.unreadable', params: {} }, { status: 422 }),
    });
    await submit(user, link);
    await openBubbleSheet();
    expect(await screen.findByText("Couldn't read the recipe")).toBeVisible();
    expect(screen.getByText(/could not open that page/)).toBeVisible();
    await user.click(
      await screen.findByRole('button', { name: 'Discard example.com' }),
    );
    expect(recipeReads.getState().reads).toEqual([]);
  });

  it('reads pasted text the same way, as "Pasted text"', async () => {
    const user = userEvent.setup({ delay: null });
    const pending = hold(read());
    const { calls } = setup(
      { 'POST /api/recipes/from-link': pending.handler },
      { route: '/recipes?fromText=1' },
    );
    await user.type(screen.getByLabelText(/^Recipe text/), 'two eggs');
    await user.click(screen.getByRole('button', { name: 'Read the recipe' }));
    await openBubbleSheet();
    expect(await screen.findByText('Reading recipe text…')).toBeVisible();
    expect(screen.getByText('Pasted text')).toBeVisible();
    expect(
      calls.find((c) => c.key === 'POST /api/recipes/from-link')?.body,
    ).toEqual({ text: 'two eggs', language: 'catalog' });
    pending.release();
    expect(await screen.findByText('Recipe ready to review')).toBeVisible();
  });

  describe('a link that is already one of the Recipes', () => {
    const checked = (calls: ReturnType<typeof setup>['calls']) =>
      calls.filter((c) => c.key === 'GET /api/recipes/link-check');
    const duplicateRoute = {
      'GET /api/recipes/link-check': () => Response.json({ recipeId: 'r-1' }),
    };

    it('asks first, then answers in the open sheet without reading', async () => {
      const user = userEvent.setup({ delay: null });
      const { calls } = setup({
        ...duplicateRoute,
        'POST /api/recipes/from-link': () => Response.json(read()),
      });
      await submit(user, link);
      expect(await screen.findByText('Already in your Recipes')).toBeVisible();
      expect(sheet()).not.toBeNull();
      expect(checked(calls)).toHaveLength(1);
      expect(checked(calls)[0].search).toBe(`?url=${encodeURIComponent(link)}`);
      expect(sentLinks(calls)).toEqual([]);
      expect(recipeReads.getState().reads).toEqual([]);
    });

    it('Open goes to that Recipe and closes the sheet', async () => {
      const user = userEvent.setup({ delay: null });
      setup(duplicateRoute);
      await submit(user, link);
      await screen.findByText('Already in your Recipes');
      await user.click(screen.getByRole('link', { name: 'Open' }));
      expect(await screen.findByText('Detail of the recipe')).toBeVisible();
      expect(screen.getByText('at /recipes/r-1')).toBeVisible();
      await waitFor(() => expect(sheet()).toBeNull());
      expect(recipeReads.getState().reads).toEqual([]);
    });

    it('Read again closes the sheet and reads with force', async () => {
      const user = userEvent.setup({ delay: null });
      const { calls } = setup({
        ...duplicateRoute,
        'POST /api/recipes/from-link': () =>
          Response.json(read({ servings: 4 })),
      });
      await user.click(
        screen.getByRole('radio', { name: "Keep the page's language" }),
      );
      await submit(user, link);
      await screen.findByText('Already in your Recipes');
      await user.click(screen.getByRole('button', { name: 'Read again' }));
      await waitFor(() => expect(sheet()).toBeNull());
      await waitFor(() =>
        expect(recipeReads.getState().reads[0]).toMatchObject({
          status: 'ready',
          recipeDraftId: 'rd-1',
        }),
      );
      expect(
        calls.find((c) => c.key === 'POST /api/recipes/from-link')?.body,
      ).toEqual({ url: link, language: 'source', force: true });
    });

    it('says the holder is full instead of checking, and Read again on a late duplicate brings the alert back', async () => {
      const user = userEvent.setup({ delay: null });
      const { calls } = setup({
        ...duplicateRoute,
        'POST /api/recipes/from-link': () => new Promise<Response>(() => {}),
      });
      for (const n of [1, 2, 3, 4]) {
        recipeReads.submit(
          { kind: 'link', url: `https://site${n}.example.com/r` },
          'catalog',
        );
      }
      // Four held: the check runs and the duplicate panel opens.
      await submit(user, link);
      await screen.findByText('Already in your Recipes');
      // A fifth read arrives while the panel is open, so the holder is now full.
      recipeReads.submit(
        { kind: 'link', url: 'https://site5.example.com/r' },
        'catalog',
      );
      await user.click(screen.getByRole('button', { name: 'Read again' }));
      expect(
        await screen.findByText(/5 link reads are waiting for you/),
      ).toBeVisible();
      expect(screen.queryByText('Already in your Recipes')).toBeNull();
      expect(sheet()).not.toBeNull();
      // A full holder is answered before any check is made.
      const checks = checked(calls).length;
      await user.click(screen.getByRole('button', { name: 'Read the recipe' }));
      expect(
        await screen.findByText(/5 link reads are waiting for you/),
      ).toBeVisible();
      expect(checked(calls)).toHaveLength(checks);
    });

    it('closes and reads when the link is not one of the Recipes', async () => {
      const user = userEvent.setup({ delay: null });
      const { calls } = setup({
        'POST /api/recipes/from-link': () => Response.json(read()),
      });
      await submit(user, link);
      await waitFor(() => expect(sheet()).toBeNull());
      await waitFor(() => expect(sentLinks(calls)).toEqual([link]));
      expect(checked(calls)).toHaveLength(1);
      expect(
        calls.find((c) => c.key === 'POST /api/recipes/from-link')?.body,
      ).toEqual({ url: link, language: 'catalog' });
    });

    it('reads anyway when the check itself fails', async () => {
      const user = userEvent.setup({ delay: null });
      const { calls } = setup({
        'GET /api/recipes/link-check': () =>
          Response.json({ code: 'unknown' }, { status: 500 }),
        'POST /api/recipes/from-link': () => Response.json(read()),
      });
      await submit(user, link);
      await waitFor(() => expect(sheet()).toBeNull());
      await waitFor(() => expect(sentLinks(calls)).toEqual([link]));
    });
  });

  describe('the page asks before unloading while a link read is waiting or reading', () => {
    /** Fires `beforeunload` as the browser would and says whether the page asked to stay. */
    const asksToStay = () => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };

    it('asks while reading and stops once the read is ready or failed', async () => {
      const pending = hold(read());
      setup(
        { 'POST /api/recipes/from-link': pending.handler },
        { route: '/recipes' },
      );
      expect(asksToStay()).toBe(false);
      recipeReads.submit({ kind: 'link', url: link }, 'catalog');
      await openBubbleSheet();
      await screen.findByText('Reading a recipe link…');
      expect(asksToStay()).toBe(true);
      pending.release();
      await screen.findByText('Recipe ready to review');
      expect(asksToStay()).toBe(false);
    });

    it('asks while the last read is reading after the others failed, and not once all have failed', async () => {
      const releases: Array<() => void> = [];
      setup({
        'POST /api/recipes/from-link': () =>
          new Promise<Response>((resolve) => {
            releases.push(() =>
              resolve(
                Response.json(
                  { code: 'link.unreadable', params: {} },
                  { status: 422 },
                ),
              ),
            );
          }),
      });
      for (const n of [1, 2, 3]) {
        recipeReads.submit(
          { kind: 'link', url: `https://s${n}.example/r` },
          'catalog',
        );
      }
      await waitFor(() => expect(releases).toHaveLength(2));
      releases[0]();
      releases[1]();
      // Both failed, the third now reads.
      await waitFor(() => expect(releases).toHaveLength(3));
      expect(asksToStay()).toBe(true);
      releases[2]();
      await waitFor(() =>
        expect(recipeReads.getState().reads.map((r) => r.status)).toEqual([
          'failed',
          'failed',
          'failed',
        ]),
      );
      expect(asksToStay()).toBe(false);
    });

    it('does not ask when a Member discards the only read', async () => {
      const pending = hold(read());
      setup(
        { 'POST /api/recipes/from-link': pending.handler },
        { route: '/recipes' },
      );
      const added = recipeReads.submit({ kind: 'link', url: link }, 'catalog');
      expect(added).toBe('started');
      await openBubbleSheet();
      await screen.findByText('Reading a recipe link…');
      expect(asksToStay()).toBe(true);
      recipeReads.discard(recipeReads.getState().reads[0].id);
      await waitFor(() => expect(asksToStay()).toBe(false));
      pending.release();
    });
  });
});

describe('after a read, the editor', () => {
  afterEach(() => {
    recipeReads.clear();
    vi.unstubAllGlobals();
  });

  it('opens the editor on the Recipe Draft the server stored, without creating one itself', async () => {
    const user = userEvent.setup({ delay: null });
    const { calls } = setup({
      'POST /api/recipes/from-link': () =>
        Response.json({ ...read(), recipeDraftId: 'rd-1' }),
    });
    await readAndOpen(user, 'https://www.example.com/pancakes');
    expect(await screen.findByLabelText(/^Title/)).toHaveValue('Blog pancakes');
    const keys = calls.map((c) => c.key);
    expect(keys).toContain('GET /api/recipe-drafts/rd-1');
    expect(keys).not.toContain('POST /api/recipe-drafts');
    expect(keys).not.toContain('PUT /api/recipe-drafts/rd-1');
  });

  it("offers the read's closest Base Recipes when the editor resumes that Recipe Draft", async () => {
    const user = userEvent.setup({ delay: null });
    setup({
      'POST /api/recipes/from-link': () =>
        Response.json({
          ...read({ servings: 4 }),
          closestBases: [
            {
              id: 'base-omelette',
              title: 'Omelette',
              score: 0.8,
              allergyWarning: null,
            },
            {
              id: 'base-crepes',
              title: 'Crepes',
              score: 0.4,
              allergyWarning: null,
            },
          ],
        }),
    });
    await readAndOpen(user, 'https://www.example.com/pancakes');
    expect(
      await screen.findByRole('radio', { name: /Omelette/ }),
    ).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Crepes' })).toBeVisible();
  });

  it('opens the New Recipe page filled in from the read', async () => {
    const user = userEvent.setup({ delay: null });
    setup({
      'POST /api/recipes/from-link': () => Response.json(read()),
    });
    await readAndOpen(user, 'https://www.example.com/pancakes#top');
    expect(await screen.findByLabelText(/^Title/)).toHaveValue('Blog pancakes');
    expect(screen.getByText('at /recipes/new')).toBeVisible();
    // Matched line with the original amount in its note, and an Unmatched name.
    await user.click(screen.getByRole('tab', { name: /^Ingredients/ }));
    expect(screen.getByLabelText('Quantity of Egg')).toHaveValue('2');
    expect(screen.getByText(/2 large/)).toBeVisible();
    expect(screen.getByText('Maple syrup')).toBeVisible();
    expect(screen.getByText(/to serve/)).toBeVisible();
    // Steps with their timers.
    await user.click(screen.getByRole('tab', { name: /^Steps/ }));
    expect(screen.getByDisplayValue('Whisk and fry')).toBeVisible();
    expect(screen.getByDisplayValue('Serve warm')).toBeVisible();
    expect(screen.getByLabelText('Timer for Step 1 (minutes)')).toHaveValue(
      '2',
    );
    expect(screen.queryByLabelText('Timer for Step 2 (minutes)')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Add a timer to Step 2' }),
    ).toBeVisible();
    // Where it came from, opening in a new tab; no empty Base Recipe picker.
    await user.click(screen.getByRole('tab', { name: /^Details/ }));
    const source = screen.getByRole('link', { name: 'From example.com ↗' });
    expect(source).toHaveAttribute('href', 'https://www.example.com/pancakes');
    expect(source).toHaveAttribute('target', '_blank');
    expect(source).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.queryByRole('radio')).toBeNull();
  });

  it('offers Suggest Guidance on the draft, which reads the lines and Steps just read in', async () => {
    const user = userEvent.setup({ delay: null });
    const { calls } = setup({
      'POST /api/recipes/from-link': () => Response.json(read()),
      'POST /api/recipes/suggest-guidance': () =>
        Response.json({
          guidance: { nutritionNote: 'Sweet and filling. Low in fibre.' },
          noSuggestions: [],
        }),
    });
    await readAndOpen(user, 'https://www.example.com/pancakes');
    await screen.findByLabelText(/^Title/);

    // The row says Guidance is never read from the page, and offers Suggest.
    expect(
      screen.getByRole('button', { name: /^Pairings, nutrition/ }),
    ).toHaveTextContent('Optional · never read from the page');
    await user.click(screen.getByRole('button', { name: 'Suggest' }));

    await waitFor(() =>
      expect(screen.getByLabelText('Nutrition Note')).toHaveValue(
        'Sweet and filling. Low in fibre.',
      ),
    );
    expect(screen.getByText('Suggested')).toBeVisible();
    expect(
      calls.find((c) => c.key === 'POST /api/recipes/suggest-guidance')?.body,
    ).toMatchObject({
      recipe: {
        title: 'Blog pancakes',
        tagIds: ['c-fr', 'm-pan'],
        lines: [
          { ingredientId: 'egg', quantity: 2, unit: 'pcs' },
          { ingredientId: null, rawName: 'Maple syrup' },
        ],
        steps: [{ text: 'Whisk and fry' }, { text: 'Serve warm' }],
      },
      guidance: { nutritionNote: null, pairings: [], eatingMoments: [] },
    });
    // The read itself never invents Guidance, and suggesting stores nothing.
    expect(calls.some((c) => c.key === 'POST /api/recipes')).toBe(false);
  });

  it('needs Servings when the page had none, then saves with the Source Link', async () => {
    const user = userEvent.setup({ delay: null });
    const { calls } = setup({
      'POST /api/recipes/from-link': () => Response.json(read()),
      'POST /api/recipes': () => Response.json(saved, { status: 201 }),
    });
    await readAndOpen(user, 'https://www.example.com/pancakes');
    const servings = await screen.findByLabelText(/^Serves/);
    expect(servings).toHaveValue('');
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    await user.type(servings, '4');
    await user.click(save);
    expect(await screen.findByText('Detail of the recipe')).toBeVisible();
    expect(
      calls.find((c) => c.key === 'POST /api/recipes')?.body,
    ).toMatchObject({
      parentId: null,
      title: 'Blog pancakes',
      servings: 4,
      sourceLink: 'https://www.example.com/pancakes',
    });
  });

  describe('closest Base Recipes', () => {
    const bases = [
      {
        id: 'base-omelette',
        title: 'Omelette',
        score: 0.8,
        allergyWarning: null,
      },
      { id: 'base-crepes', title: 'Crepes', score: 0.4, allergyWarning: null },
    ];

    it('offers them in the picker and saves a Variant of the closest with the Source Link', async () => {
      const user = userEvent.setup({ delay: null });
      const { calls } = setup({
        'POST /api/recipes/from-link': () =>
          Response.json({ ...read({ servings: 4 }), closestBases: bases }),
        'POST /api/recipes': () => Response.json(saved, { status: 201 }),
      });
      await readAndOpen(user, 'https://www.example.com/pancakes');
      expect(
        await screen.findByRole('radio', { name: /Omelette/ }),
      ).toBeChecked();
      expect(screen.getByRole('radio', { name: 'Crepes' })).not.toBeChecked();
      await user.click(screen.getByRole('button', { name: 'Save' }));
      expect(await screen.findByText('Detail of the recipe')).toBeVisible();
      expect(
        calls.find((c) => c.key === 'POST /api/recipes')?.body,
      ).toMatchObject({
        parentId: 'base-omelette',
        sourceLink: 'https://www.example.com/pancakes',
      });
    });

    it('saves a Base Recipe with the Source Link when standalone is picked', async () => {
      const user = userEvent.setup({ delay: null });
      const { calls } = setup({
        'POST /api/recipes/from-link': () =>
          Response.json({ ...read({ servings: 4 }), closestBases: bases }),
        'POST /api/recipes': () => Response.json(saved, { status: 201 }),
      });
      await readAndOpen(user, 'https://www.example.com/pancakes');
      await user.click(
        await screen.findByRole('radio', { name: /standalone/i }),
      );
      await user.click(screen.getByRole('button', { name: 'Save' }));
      expect(await screen.findByText('Detail of the recipe')).toBeVisible();
      expect(
        calls.find((c) => c.key === 'POST /api/recipes')?.body,
      ).toMatchObject({
        parentId: null,
        sourceLink: 'https://www.example.com/pancakes',
      });
    });

    it('carries the hidden-by-Allergies count to the picker note', async () => {
      const user = userEvent.setup({ delay: null });
      setup({
        'POST /api/recipes/from-link': () =>
          Response.json({
            ...read({ servings: 4 }),
            closestBases: [],
            hiddenByAllergiesCount: 1,
          }),
      });
      await readAndOpen(user, 'https://www.example.com/pancakes');
      expect(
        await screen.findByText('1 Recipe hidden by your Allergies'),
      ).toBeVisible();
      expect(screen.getByRole('button', { name: 'Show' })).toBeVisible();
    });
  });

  it('saves without the Source Link once the Member removes it', async () => {
    const user = userEvent.setup({ delay: null });
    const { calls } = setup({
      'POST /api/recipes/from-link': () => Response.json(read({ servings: 4 })),
      'POST /api/recipes': () => Response.json(saved, { status: 201 }),
    });
    await readAndOpen(user, 'https://www.example.com/pancakes');
    await user.click(
      await screen.findByRole('button', { name: 'Remove link' }),
    );
    expect(screen.queryByRole('link', { name: /^From / })).toBeNull();
    expect(screen.getByRole('button', { name: 'Undo' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Detail of the recipe');
    const body = calls.find((c) => c.key === 'POST /api/recipes')?.body;
    expect(body).toMatchObject({ servings: 4 });
    expect(body).not.toHaveProperty('sourceLink');
  });

  it('keeps the Base Recipe picker after the Member removes the link', async () => {
    const user = userEvent.setup({ delay: null });
    setup({
      'POST /api/recipes/from-link': () =>
        Response.json({
          ...read({ servings: 4 }),
          closestBases: [
            {
              id: 'base-omelette',
              title: 'Omelette',
              score: 0.8,
              allergyWarning: null,
            },
          ],
        }),
    });
    await readAndOpen(user, 'https://www.example.com/pancakes');
    await user.click(
      await screen.findByRole('button', { name: 'Remove link' }),
    );
    expect(screen.getByRole('radio', { name: /Omelette/ })).toBeChecked();
  });

  describe('language choice', () => {
    const preferences = (catalog: Locale) => ({
      'GET /api/settings/preferences': () =>
        Response.json({
          locale: 'en',
          catalogLanguage: catalog,
          effectiveCatalogLanguage: catalog,
        }),
    });
    const sent = (calls: ReturnType<typeof setup>['calls']) =>
      calls.find((c) => c.key === 'POST /api/recipes/from-link')?.body;

    it('defaults to the Catalog Language and names it, even when it is not English', async () => {
      const user = userEvent.setup({ delay: null });
      const { calls } = setup({
        ...preferences('da'),
        'POST /api/recipes/from-link': () => Response.json(read()),
      });
      const catalog = await screen.findByRole('radio', { name: 'In Danish' });
      expect(catalog).toBeChecked();
      expect(screen.getByRole('radiogroup')).toHaveAccessibleName(
        'Language of the recipe',
      );
      await readAndOpen(user, 'https://www.example.com/pancakes');
      await screen.findByLabelText(/^Title/);
      expect(sent(calls)).toMatchObject({ language: 'catalog' });
    });

    it("sends 'source' after switching to Keep the page's language", async () => {
      const user = userEvent.setup({ delay: null });
      const { calls } = setup({
        ...preferences('ro'),
        'POST /api/recipes/from-link': () => Response.json(read()),
      });
      await user.click(
        await screen.findByRole('radio', { name: "Keep the page's language" }),
      );
      await readAndOpen(user, 'https://www.example.com/pancakes');
      await screen.findByLabelText(/^Title/);
      expect(sent(calls)).toMatchObject({ language: 'source' });
    });

    it('says "På dansk" and "În engleză" in lower case in the Member\'s UI Language', async () => {
      setup(
        {
          'GET /api/settings/preferences': () =>
            Response.json({ effectiveCatalogLanguage: 'da' }),
        },
        { locale: 'da', route: '/recipes?fromLink=1' },
      );
      expect(
        await screen.findByRole('radio', { name: 'På dansk' }),
      ).toBeChecked();
      cleanup();
      setup(
        {
          'GET /api/settings/preferences': () =>
            Response.json({ effectiveCatalogLanguage: 'en' }),
        },
        { locale: 'ro', route: '/recipes?fromLink=1' },
      );
      expect(
        await screen.findByRole('radio', { name: 'În engleză' }),
      ).toBeChecked();
    });

    it('names the UI Language until the Preferences arrive', async () => {
      setup({
        'GET /api/settings/preferences': () => new Promise<Response>(() => {}),
      });
      expect(
        await screen.findByRole('radio', { name: 'In English' }),
      ).toBeChecked();
    });
  });

  it('carries the source language to the create request', async () => {
    const user = userEvent.setup({ delay: null });
    const { calls } = setup({
      'POST /api/recipes/from-link': () =>
        Response.json({ ...read({ servings: 4 }), sourceLanguage: 'fr' }),
      'POST /api/recipes': () => Response.json(saved, { status: 201 }),
    });
    await readAndOpen(user, 'https://www.example.com/pancakes');
    expect(await screen.findByText(/Translated from French/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Detail of the recipe');
    expect(
      calls.find((c) => c.key === 'POST /api/recipes')?.body,
    ).toMatchObject({
      sourceLink: 'https://www.example.com/pancakes',
      sourceLanguage: 'fr',
    });
  });

  it('sends no source language when the page needed no translation', async () => {
    const user = userEvent.setup({ delay: null });
    const { calls } = setup({
      'POST /api/recipes/from-link': () => Response.json(read({ servings: 4 })),
      'POST /api/recipes': () => Response.json(saved, { status: 201 }),
    });
    await readAndOpen(user, 'https://www.example.com/pancakes');
    await user.click(await screen.findByRole('button', { name: 'Save' }));
    await screen.findByText('Detail of the recipe');
    const body = calls.find((c) => c.key === 'POST /api/recipes')?.body;
    expect(body).toHaveProperty('sourceLink');
    expect(body).not.toHaveProperty('sourceLanguage');
  });

  it('drops the source language along with the removed Source Link', async () => {
    const user = userEvent.setup({ delay: null });
    const { calls } = setup({
      'POST /api/recipes/from-link': () =>
        Response.json({ ...read({ servings: 4 }), sourceLanguage: 'fr' }),
      'POST /api/recipes': () => Response.json(saved, { status: 201 }),
    });
    await readAndOpen(user, 'https://www.example.com/pancakes');
    await user.click(
      await screen.findByRole('button', { name: 'Remove link' }),
    );
    expect(screen.queryByText(/Translated from/)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Detail of the recipe');
    const body = calls.find((c) => c.key === 'POST /api/recipes')?.body;
    expect(body).not.toHaveProperty('sourceLink');
    expect(body).not.toHaveProperty('sourceLanguage');
  });

  describe('text reads and the link sheet', () => {
    const textField = () => screen.getByLabelText(/^Recipe text/);
    const fromLink = (calls: ReturnType<typeof setup>['calls']) =>
      calls.find((c) => c.key === 'POST /api/recipes/from-link')?.body;

    it('sends text from the From text sheet with the language, no url', async () => {
      const user = userEvent.setup({ delay: null });
      const { calls } = setup(
        {
          'POST /api/recipes/from-link': () =>
            Response.json({ ...read({ servings: 4 }), sourceLink: null }),
        },
        { route: '/recipes?fromText=1' },
      );
      expect(screen.queryByLabelText(/^Link to the recipe/)).toBeNull();
      expect(screen.getByRole('radiogroup')).toBeVisible();
      const submitButton = screen.getByRole('button', {
        name: 'Read the recipe',
      });
      expect(submitButton).toBeDisabled();
      await user.click(
        screen.getByRole('radio', { name: "Keep the text's language" }),
      );
      await user.type(textField(), '  2 eggs, whisk and fry  ');
      await user.click(submitButton);
      await stripReview(user);
      expect(await screen.findByLabelText(/^Title/)).toHaveValue(
        'Blog pancakes',
      );
      expect(fromLink(calls)).toEqual({
        text: '2 eggs, whisk and fry',
        language: 'source',
      });
      expect(screen.queryByRole('link', { name: /^From / })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Remove link' })).toBeNull();
    });

    it('saves a pasted draft without a sourceLink', async () => {
      const user = userEvent.setup({ delay: null });
      const { calls } = setup(
        {
          'POST /api/recipes/from-link': () =>
            Response.json({ ...read({ servings: 4 }), sourceLink: null }),
          'POST /api/recipes': () => Response.json(saved, { status: 201 }),
        },
        { route: '/recipes?fromText=1' },
      );
      await user.type(textField(), 'eggs');
      await user.click(screen.getByRole('button', { name: 'Read the recipe' }));
      await stripReview(user);
      await user.click(await screen.findByRole('button', { name: 'Save' }));
      await screen.findByText('Detail of the recipe');
      const body = calls.find((c) => c.key === 'POST /api/recipes')?.body;
      expect(body).toMatchObject({ servings: 4 });
      expect(body).not.toHaveProperty('sourceLink');
    });

    it('keeps the hidden-by-Allergies note and Show on a pasted read whose matches are all hidden', async () => {
      const user = userEvent.setup({ delay: null });
      setup(
        {
          'POST /api/recipes/from-link': () =>
            Response.json({
              ...read({ servings: 4 }),
              sourceLink: null,
              closestBases: [],
              hiddenByAllergiesCount: 2,
            }),
        },
        { route: '/recipes?fromText=1' },
      );
      await user.type(textField(), 'eggs');
      await user.click(screen.getByRole('button', { name: 'Read the recipe' }));
      await stripReview(user);
      expect(
        await screen.findByText('2 Recipes hidden by your Allergies'),
      ).toBeVisible();
      expect(screen.getByRole('button', { name: 'Show' })).toBeVisible();
    });

    it('has no text mode: the link field is the only one', async () => {
      setup({});
      expect(screen.getByText(/Paste the link to a page/)).toBeVisible();
      expect(
        screen.queryByRole('button', { name: 'Paste text instead' }),
      ).toBeNull();
      expect(
        screen.queryByRole('button', { name: 'Use a link instead' }),
      ).toBeNull();
      expect(screen.queryByLabelText(/^Recipe text/)).toBeNull();
      expect(screen.queryByRole('radio', { name: /text/ })).toBeNull();
    });
  });
});

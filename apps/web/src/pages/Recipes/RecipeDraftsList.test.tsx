import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Fragment, StrictMode } from 'react';
import {
  Link,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  RecipeDraftContent,
  RecipeDraftSummary,
} from '@/lib/recipeDrafts';
import { UNDO_WINDOW_MS } from '@/lib/useUndoToast';
import { renderWithProviders, stubApi } from '@/test/render';
import { NewRecipePage } from './NewRecipePage';
import { RecipeDraftsPage } from './RecipeDraftsPage';
import { RecipesPage } from './RecipesPage';

const ID_A = '5b0f6c2e-7d3a-4c58-9a51-1f2e3d4c5b6a';
const ID_B = '7c1a8d3f-8e4b-4d69-8b62-2a3f4e5d6c7b';
const ID_C = '9d2b9e40-9f5c-4e7a-9c73-3b405f6e7d8c';

const summary = (over: Partial<RecipeDraftSummary>): RecipeDraftSummary => ({
  id: ID_A,
  kind: 'new_recipe',
  baseRecipeId: null,
  baseRecipeName: null,
  title: 'Gran stew',
  origin: null,
  updatedAt: '2026-10-20T10:00:00.000Z',
  expiresAt: '2026-11-19T10:00:00.000Z',
  version: 1,
  ...over,
});

const blankGuidance = { nutritionNote: '', pairings: [], eatingMoments: [] };
const titled = (title: string): RecipeDraftContent => ({
  title,
  servings: '4',
  prepMinutes: '',
  cookMinutes: '',
  difficulty: '',
  tagIds: [],
  lines: [],
  steps: [],
  guidance: blankGuidance,
  pickedBaseId: null,
  sourceLink: null,
  sourceLanguage: null,
  plateScan: false,
});

const filters = { tags: [], eatingMoments: [] };

function GoBack() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(-1)}>
      go back
    </button>
  );
}

function Where() {
  const location = useLocation();
  return <p>{`at ${location.pathname}${location.search}`}</p>;
}

function setup(
  list: RecipeDraftSummary[],
  routes: Parameters<typeof stubApi>[0] = {},
  route = '/recipes',
  locale: 'en' | 'ro' | 'da' = 'en',
  strict = false,
) {
  const { fetchMock, calls } = stubApi({
    'GET /api/recipes': () =>
      Response.json({ recipes: [], hiddenByAllergiesCount: 0 }),
    'GET /api/recipes/filters': () => Response.json(filters),
    'GET /api/recipes/cook-tonight': () =>
      Response.json({ cards: [], hiddenByAllergiesCount: 0 }),
    'GET /api/recipe-drafts': () => Response.json(list),
    ...routes,
  });
  vi.stubGlobal('fetch', fetchMock);
  const Mode = strict ? StrictMode : Fragment;
  renderWithProviders(
    <Mode>
      <Routes>
        <Route
          path="/recipes"
          element={
            <>
              <GoBack />
              <RecipesPage />
            </>
          }
        />
        <Route
          path="/recipes/drafts"
          element={
            <>
              <Where />
              <RecipeDraftsPage />
            </>
          }
        />
        <Route
          path="/recipes/new"
          element={
            <>
              <Link to={`/recipes/new?draft=${ID_A}`}>reopen</Link>
              <Where />
              <NewRecipePage />
            </>
          }
        />
        <Route path="/recipes/:id/variant/new" element={<Where />} />
      </Routes>
    </Mode>,
    { route, locale },
  );
  return calls;
}

const deletes = (calls: ReturnType<typeof setup>) =>
  calls.filter((c) => c.key.startsWith('DELETE '));

const elapse = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

describe('Recipe Drafts list and discard', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  const user = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

  describe('the Drafts entry on the Recipes page', () => {
    it('shows "Drafts (N)" with the number of Recipe Drafts, and opens the list', async () => {
      const u = user();
      setup([summary({}), summary({ id: ID_B })]);
      await u.click(await screen.findByRole('link', { name: 'Drafts (2)' }));
      expect(await screen.findByText('at /recipes/drafts')).toBeVisible();
    });

    it('shows nothing when there are none', async () => {
      setup([]);
      await screen.findByText('No family Recipes yet');
      expect(screen.queryByRole('link', { name: /^Drafts/ })).toBeNull();
    });

    it.each([
      ['ro', 'Ciorne (1)'],
      ['da', 'Kladder (1)'],
    ] as const)('is worded in %s', async (locale, name) => {
      setup([summary({})], {}, '/recipes', locale);
      expect(await screen.findByRole('link', { name })).toBeVisible();
    });
  });

  describe('the list', () => {
    it('shows one row per Recipe Draft in the order the API gives (newest edit first)', async () => {
      setup(
        [
          summary({ id: ID_A, title: 'Newest' }),
          summary({ id: ID_B, title: 'Middle' }),
          summary({ id: ID_C, title: 'Oldest' }),
        ],
        {},
        '/recipes/drafts',
      );
      const list = await screen.findByRole('list', { name: 'Recipe Drafts' });
      const rows = within(list).getAllByRole('link');
      expect(rows.map((row) => row.textContent)).toEqual([
        expect.stringContaining('Newest'),
        expect.stringContaining('Middle'),
        expect.stringContaining('Oldest'),
      ]);
    });

    it('says what each row is: title or "Untitled recipe", kind, origin, edited and kept until', async () => {
      setup(
        [
          summary({
            id: ID_A,
            title: 'Gran stew',
            origin: { type: 'link', domain: 'example.com' },
          }),
          summary({
            id: ID_B,
            title: '',
            kind: 'variant',
            baseRecipeId: 'base-1',
            baseRecipeName: 'Omelette',
            origin: { type: 'plate_scan' },
          }),
          summary({ id: ID_C, title: '  ' }),
        ],
        {},
        '/recipes/drafts',
      );
      const rows = within(
        await screen.findByRole('list', { name: 'Recipe Drafts' }),
      ).getAllByRole('link');
      const [link, plate, plain] = rows.map((row) => row.textContent);
      expect(link).toContain('Gran stew');
      expect(link).toContain('New recipe');
      expect(link).toContain('From example.com');
      expect(link).toContain('Edited 20.10.2026');
      expect(link).toContain('kept until 19.11.2026');
      expect(plate).toContain('Untitled recipe');
      expect(plate).toContain('Variant of Omelette');
      expect(plate).toContain('Plate scan');
      // No origin: no origin line at all.
      expect(plain).toContain('Untitled recipe');
      expect(plain).not.toMatch(/Plate scan|From /);
    });

    it.each([
      ['ro', 'Variantă a rețetei Omelette'],
      ['da', 'Variant af Omelette'],
    ] as const)('capitalises the Variant line in %s', async (locale, text) => {
      setup(
        [
          summary({
            kind: 'variant',
            baseRecipeId: 'b',
            baseRecipeName: 'Omelette',
          }),
        ],
        {},
        '/recipes/drafts',
        locale,
      );
      expect(await screen.findByText(text)).toBeVisible();
    });

    it('explains an empty list', async () => {
      setup([], {}, '/recipes/drafts');
      expect(await screen.findByText('No Recipe Drafts')).toBeVisible();
    });

    it.each([
      ['ro', 'Ciorne de rețete'],
      ['da', 'Opskriftkladder'],
    ] as const)('is titled in %s', async (locale, title) => {
      setup([summary({})], {}, '/recipes/drafts', locale);
      expect(await screen.findByRole('heading', { name: title })).toBeVisible();
    });
  });

  describe('resuming', () => {
    it('opens a New Recipe row in its form, filled from the Recipe Draft', async () => {
      const u = user();
      setup(
        [summary({ title: 'Gran stew' })],
        {
          [`GET /api/recipe-drafts/${ID_A}`]: () =>
            Response.json({
              id: ID_A,
              kind: 'new_recipe',
              baseRecipeId: null,
              baseRecipeName: null,
              baseAvailable: true,
              content: titled('Gran stew'),
              version: 3,
              createdAt: '2026-10-19T10:00:00.000Z',
              updatedAt: '2026-10-20T10:00:00.000Z',
              expiresAt: '2026-11-19T10:00:00.000Z',
            }),
        },
        '/recipes/drafts',
      );
      await u.click(await screen.findByRole('link', { name: /Gran stew/ }));
      expect(await screen.findByLabelText(/^Title/)).toHaveValue('Gran stew');
      expect(screen.getByText(`at /recipes/new?draft=${ID_A}`)).toBeVisible();
    });

    it('opens a Variant row in New Variant of its base', async () => {
      const u = user();
      setup(
        [
          summary({
            kind: 'variant',
            baseRecipeId: 'base-1',
            baseRecipeName: 'Omelette',
          }),
        ],
        {},
        '/recipes/drafts',
      );
      await u.click(await screen.findByRole('link', { name: /Variant of/ }));
      expect(
        await screen.findByText(`at /recipes/base-1/variant/new?draft=${ID_A}`),
      ).toBeVisible();
    });
  });

  it('reads a Recipe Draft only after the form just left has sent its last edit', async () => {
    const u = user();
    let release: () => void = () => {};
    const detail = () =>
      Response.json({
        id: ID_A,
        kind: 'new_recipe',
        baseRecipeId: null,
        baseRecipeName: null,
        baseAvailable: true,
        content: titled('Gran stew'),
        version: 3,
        createdAt: '2026-10-19T10:00:00.000Z',
        updatedAt: '2026-10-20T10:00:00.000Z',
        expiresAt: '2026-11-19T10:00:00.000Z',
      });
    const calls = setup(
      [summary({})],
      {
        [`GET /api/recipe-drafts/${ID_A}`]: detail,
        [`PUT /api/recipe-drafts/${ID_A}`]: () =>
          new Promise<Response>((resolve) => {
            release = () => resolve(Response.json({ id: ID_A, version: 4 }));
          }),
      },
      `/recipes/new?draft=${ID_A}`,
    );
    const title = await screen.findByLabelText(/^Title/);
    await u.type(title, '!');
    await u.click(screen.getByRole('link', { name: 'reopen' }));
    await elapse(100);
    const gets = () =>
      calls.filter((c) => c.key === `GET /api/recipe-drafts/${ID_A}`);
    expect(calls.filter((c) => c.key.startsWith('PUT '))).toHaveLength(1);
    expect(gets()).toHaveLength(1);
    await act(async () => release());
    await elapse(100);
    expect(gets()).toHaveLength(2);
  });

  describe('discarding them all', () => {
    const three = [
      summary({}),
      summary({ id: ID_B, title: 'Other' }),
      summary({ id: ID_C, title: 'Third' }),
    ];

    const deleteKeys = [ID_A, ID_B, ID_C].map(
      (id) => `DELETE /api/recipe-drafts/${id}`,
    );

    it('hides every row at once with one Undo toast, and deletes each only when the Undo is gone', async () => {
      const u = user();
      const calls = setup(
        three,
        Object.fromEntries(
          deleteKeys.map((key) => [
            key,
            () => new Response(null, { status: 204 }),
          ]),
        ),
        '/recipes/drafts',
      );
      await u.click(await screen.findByRole('button', { name: 'Discard all' }));
      expect(screen.queryByRole('link', { name: /Gran stew/ })).toBeNull();
      expect(screen.queryByRole('link', { name: /Other/ })).toBeNull();
      const toast = await screen.findByText('3 Recipe Drafts discarded');
      expect(toast.closest('[role="status"]')).not.toBeNull();
      await elapse(UNDO_WINDOW_MS - 500);
      expect(deletes(calls)).toEqual([]);
      await elapse(1500);
      expect(
        deletes(calls)
          .map((c) => c.key)
          .sort(),
      ).toEqual([...deleteKeys].sort());
    });

    it('treats a Recipe Draft already gone (404) as discarded: no error toast, the rest still deleted', async () => {
      const u = user();
      const calls = setup(
        three,
        {
          [`DELETE /api/recipe-drafts/${ID_A}`]: () =>
            new Response(null, { status: 204 }),
          [`DELETE /api/recipe-drafts/${ID_B}`]: () =>
            Response.json(
              { code: 'recipe_drafts.not_found', message: 'gone' },
              { status: 404 },
            ),
          [`DELETE /api/recipe-drafts/${ID_C}`]: () =>
            new Response(null, { status: 204 }),
        },
        '/recipes/drafts',
      );
      await u.click(await screen.findByRole('button', { name: 'Discard all' }));
      await elapse(UNDO_WINDOW_MS + 1500);
      expect(deletes(calls)).toHaveLength(3);
      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.queryByText(/not found/i)).toBeNull();
    });

    it('brings them all back on Undo and sends nothing', async () => {
      const u = user();
      const calls = setup(three, {}, '/recipes/drafts');
      await u.click(await screen.findByRole('button', { name: 'Discard all' }));
      await u.click(await screen.findByRole('button', { name: 'Undo' }));
      expect(
        screen.getAllByRole('link', { name: /Gran stew|Other|Third/ }),
      ).toHaveLength(3);
      await elapse(UNDO_WINDOW_MS * 2);
      expect(deletes(calls)).toEqual([]);
    });

    it('is not offered for a single Recipe Draft', async () => {
      setup([summary({})], {}, '/recipes/drafts');
      expect(
        await screen.findByRole('link', { name: /Gran stew/ }),
      ).toBeVisible();
      expect(screen.queryByRole('button', { name: 'Discard all' })).toBeNull();
    });
  });

  describe('discarding from a row', () => {
    const open = async (u: ReturnType<typeof user>, name = 'Gran stew') => {
      await u.click(
        await screen.findByRole('button', { name: `Options for ${name}` }),
      );
      await u.click(
        await screen.findByRole('menuitem', { name: 'Discard draft' }),
      );
    };

    it('hides the row at once with an Undo toast, and sends the DELETE only when the Undo is gone', async () => {
      const u = user();
      const calls = setup(
        [summary({}), summary({ id: ID_B, title: 'Other' })],
        {
          [`DELETE /api/recipe-drafts/${ID_A}`]: () =>
            new Response(null, { status: 204 }),
        },
        '/recipes/drafts',
      );
      await open(u);
      expect(screen.queryByRole('link', { name: /Gran stew/ })).toBeNull();
      expect(screen.getByRole('link', { name: /Other/ })).toBeVisible();
      const toast = await screen.findByText('Recipe Draft discarded');
      expect(toast).toBeVisible();
      // A polite status, not an alert.
      expect(toast.closest('[role="status"]')).not.toBeNull();
      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.getByRole('button', { name: 'Undo' })).toBeVisible();
      await elapse(UNDO_WINDOW_MS - 500);
      expect(deletes(calls)).toEqual([]);
      await elapse(1500);
      expect(deletes(calls).map((c) => c.key)).toEqual([
        `DELETE /api/recipe-drafts/${ID_A}`,
      ]);
    });

    it('brings the row back on Undo and sends nothing', async () => {
      const u = user();
      const calls = setup([summary({})], {}, '/recipes/drafts');
      await open(u);
      await u.click(await screen.findByRole('button', { name: 'Undo' }));
      expect(screen.getByRole('link', { name: /Gran stew/ })).toBeVisible();
      await elapse(UNDO_WINDOW_MS * 2);
      expect(deletes(calls)).toEqual([]);
    });

    it('discards by swiping (the remove gesture with its confirmation), with the same Undo', async () => {
      const u = user();
      const calls = setup(
        [summary({})],
        {
          [`DELETE /api/recipe-drafts/${ID_A}`]: () =>
            new Response(null, { status: 204 }),
        },
        '/recipes/drafts',
      );
      const row = await screen.findByRole('group', { name: 'Gran stew' });
      act(() => row.focus());
      await u.keyboard('{Delete}');
      expect(
        await screen.findByRole('group', { name: 'Discard Gran stew?' }),
      ).toBeVisible();
      fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
      expect(await screen.findByText('Recipe Draft discarded')).toBeVisible();
      expect(deletes(calls)).toEqual([]);
      await elapse(UNDO_WINDOW_MS + 500);
      expect(deletes(calls)).toHaveLength(1);
    });
  });

  describe('"Discard draft" from the form', () => {
    const resumable = {
      [`GET /api/recipe-drafts/${ID_A}`]: () =>
        Response.json({
          id: ID_A,
          kind: 'new_recipe',
          baseRecipeId: null,
          baseRecipeName: null,
          baseAvailable: true,
          content: titled('Gran stew'),
          version: 3,
          createdAt: '2026-10-19T10:00:00.000Z',
          updatedAt: '2026-10-20T10:00:00.000Z',
          expiresAt: '2026-11-19T10:00:00.000Z',
        }),
      [`DELETE /api/recipe-drafts/${ID_A}`]: () =>
        new Response(null, { status: 204 }),
    };

    it('goes back to Recipes, hides the Recipe Draft at once with Undo, and deletes after the Undo is gone', async () => {
      const u = user();
      const calls = setup(
        [summary({})],
        resumable,
        `/recipes/new?draft=${ID_A}`,
      );
      await screen.findByLabelText(/^Title/);
      await u.click(
        await screen.findByRole('button', { name: 'Discard draft' }),
      );
      expect(await screen.findByText('Recipe Draft discarded')).toBeVisible();
      // Back on Recipes, where the entry is gone with its only Recipe Draft.
      expect(await screen.findByText('No family Recipes yet')).toBeVisible();
      expect(screen.queryByRole('link', { name: /^Drafts/ })).toBeNull();
      expect(deletes(calls)).toEqual([]);
      await elapse(UNDO_WINDOW_MS + 500);
      expect(deletes(calls)).toHaveLength(1);
      // Autosave neither re-created nor re-saved it.
      expect(
        calls.filter(
          (c) =>
            c.key === 'POST /api/recipe-drafts' || c.key.startsWith('PUT '),
        ),
      ).toEqual([]);
    });

    it('does not come back to the discarded Recipe Draft on Back', async () => {
      const u = user();
      setup([summary({})], resumable, `/recipes/new?draft=${ID_A}`);
      await screen.findByLabelText(/^Title/);
      await u.click(
        await screen.findByRole('button', { name: 'Discard draft' }),
      );
      expect(await screen.findByText('No family Recipes yet')).toBeVisible();
      await u.click(screen.getByRole('button', { name: 'go back' }));
      await elapse(100);
      expect(screen.queryByLabelText(/^Title/)).toBeNull();
      expect(screen.queryByText(/^at \/recipes\/new/)).toBeNull();
      expect(screen.getByText('No family Recipes yet')).toBeVisible();
    });

    it('sends nothing on Undo, and the Recipe Draft is back in the entry', async () => {
      const u = user();
      const calls = setup(
        [summary({})],
        resumable,
        `/recipes/new?draft=${ID_A}`,
      );
      await screen.findByLabelText(/^Title/);
      await u.click(
        await screen.findByRole('button', { name: 'Discard draft' }),
      );
      await u.click(await screen.findByRole('button', { name: 'Undo' }));
      expect(
        await screen.findByRole('link', { name: 'Drafts (1)' }),
      ).toBeVisible();
      await elapse(UNDO_WINDOW_MS * 2);
      expect(deletes(calls)).toEqual([]);
    });

    it('keeps the DELETE back until the Undo window ends under StrictMode too', async () => {
      const u = user();
      const calls = setup(
        [summary({})],
        resumable,
        `/recipes/new?draft=${ID_A}`,
        'en',
        true,
      );
      await screen.findByLabelText(/^Title/);
      await u.click(
        await screen.findByRole('button', { name: 'Discard draft' }),
      );
      expect(await screen.findByText('Recipe Draft discarded')).toBeVisible();
      await elapse(UNDO_WINDOW_MS - 1000);
      expect(screen.getByRole('button', { name: 'Undo' })).toBeVisible();
      expect(deletes(calls)).toEqual([]);
      await elapse(1500);
      expect(deletes(calls)).toHaveLength(1);
    });

    it('is not offered before there is a Recipe Draft', async () => {
      setup([], {}, '/recipes/new');
      await screen.findByLabelText(/^Title/);
      expect(
        screen.queryByRole('button', { name: 'Discard draft' }),
      ).toBeNull();
    });
  });

  describe('the cap', () => {
    it('tells the Member to finish or discard one when starting a 21st Recipe Draft', async () => {
      const u = user();
      setup(
        [],
        {
          'POST /api/recipe-drafts': () =>
            Response.json(
              { code: 'recipe_drafts.limit_reached', params: { max: 20 } },
              { status: 409 },
            ),
        },
        '/recipes/new',
      );
      await u.type(await screen.findByLabelText(/^Title/), 'Gran stew');
      await elapse(1600);
      expect(
        await screen.findByText(
          'You already keep 20 Recipe Drafts. Finish or discard one to start another.',
        ),
      ).toBeVisible();
    });

    it.each([
      [
        'ro',
        'Ai deja 20 de ciorne de rețete. Termină sau elimină una ca să începi alta.',
      ],
      [
        'da',
        'Du har allerede 20 opskriftkladder. Gør en færdig eller kassér en for at starte en ny.',
      ],
    ] as const)('says so in %s', async (locale, text) => {
      const u = user();
      setup(
        [],
        {
          'POST /api/recipe-drafts': () =>
            Response.json(
              { code: 'recipe_drafts.limit_reached', params: { max: 20 } },
              { status: 409 },
            ),
        },
        '/recipes/new',
        locale,
      );
      await u.type((await screen.findAllByRole('textbox'))[0], 'Gran stew');
      await elapse(1600);
      expect(await screen.findByText(text)).toBeVisible();
    });
  });
});

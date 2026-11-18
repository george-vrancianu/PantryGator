import { act, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import {
  Link,
  Route,
  Routes,
  useLocation,
  useNavigationType,
} from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, stubApi } from '@/test/render';
import { NewRecipePage } from './NewRecipePage';
import { NewVariantPage } from './NewVariantPage';

const A = '5b0f6c2e-7d3a-4c58-9a51-1f2e3d4c5b6a';
const B = '6c1a7d3f-8e4b-4d69-8b62-2a3f4e5d6c7b';
const C = '7d2b8e4a-9f5c-4e7a-9c73-3b4a5f6e7d8c';
const BASE = 'base';

const summary = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  kind: 'new_recipe',
  baseRecipeId: null,
  baseRecipeName: null,
  title: 'Gran stew',
  origin: null,
  updatedAt: '2026-01-05T10:00:00.000Z',
  expiresAt: '2026-02-04T10:00:00.000Z',
  version: 1,
  ...over,
});

function Where() {
  const location = useLocation();
  const type = useNavigationType();
  return <p>{`at ${location.pathname}${location.search} by ${type}`}</p>;
}

function setup(
  route: string,
  routes: Parameters<typeof stubApi>[0],
  state?: unknown,
  locale: 'en' | 'ro' | 'da' = 'en',
  staleTime = 0,
) {
  const { fetchMock, calls } = stubApi({
    'GET /api/recipes/filters': () =>
      Response.json({ tags: [], eatingMoments: [] }),
    [`GET /api/recipes/${BASE}/variant-draft`]: () =>
      Response.json({
        parentId: BASE,
        title: 'Omelette',
        servings: 2,
        prepMinutes: null,
        cookMinutes: null,
        difficulty: null,
        tagIds: [],
        lines: [],
        steps: [],
        tips: [],
        guidance: { nutritionNote: null, pairings: [], eatingMoments: [] },
      }),
    ...routes,
  });
  vi.stubGlobal('fetch', fetchMock);
  // Production keeps a fetched list fresh for a while; the page must not trust it.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime } },
  });
  renderWithProviders(
    <QueryClientProvider client={queryClient}>
      <Routes>
        <Route
          path="/recipes/new"
          element={
            <>
              <Where />
              <NewRecipePage />
            </>
          }
        />
        <Route
          path="/recipes/:id"
          element={
            <>
              <p>Detail of the recipe</p>
              <Link to="/recipes/new">again</Link>
            </>
          }
        />
        <Route
          path="/recipes/:id/variant/new"
          element={
            <>
              <Where />
              <NewVariantPage />
            </>
          }
        />
      </Routes>
    </QueryClientProvider>,
    { route: state === undefined ? route : { pathname: route, state }, locale },
  );
  return calls;
}

const elapse = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));
const sent = (calls: ReturnType<typeof setup>, key: string) =>
  calls.filter((call) => call.key === key);
const list = (drafts: unknown[]) => ({
  'GET /api/recipe-drafts': () => Response.json(drafts),
});
const PROMPT = 'Continue your draft?';

describe('Continue your draft? prompt', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  const typer = () =>
    userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

  it('lists the New Recipe drafts on New Recipe, with Continue on each and Start new, not showing the form', async () => {
    setup(
      '/recipes/new',
      list([
        summary(A, { title: 'Gran stew' }),
        summary(B, { title: '' }),
        summary(C, { kind: 'variant', baseRecipeId: BASE }),
      ]),
    );
    expect(await screen.findByText(PROMPT)).toBeVisible();
    expect(screen.queryByLabelText(/^Title/)).toBeNull();
    const rows = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText('Gran stew')).toBeVisible();
    expect(within(rows[0]).getByText(/^Edited /)).toBeVisible();
    expect(within(rows[1]).getByText('Untitled recipe')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Start new' })).toBeVisible();
  });

  it('Continue opens that Recipe Draft in the form', async () => {
    const user = typer();
    setup('/recipes/new', {
      ...list([summary(A), summary(B, { title: 'Second' })]),
      [`GET /api/recipe-drafts/${B}`]: () =>
        Response.json({
          ...summary(B, { title: 'Second' }),
          baseAvailable: false,
          createdAt: '2026-01-01T00:00:00.000Z',
          content: {
            title: 'Second',
            servings: '4',
            prepMinutes: '',
            cookMinutes: '',
            difficulty: '',
            tagIds: [],
            lines: [],
            steps: [],
            guidance: null,
            pickedBaseId: null,
            sourceLink: null,
            sourceLanguage: null,
            plateScan: false,
          },
        }),
    });
    await user.click(
      await screen.findByRole('button', { name: 'Continue Second' }),
    );
    expect(await screen.findByLabelText(/^Title/)).toHaveValue('Second');
    expect(
      screen.getByText(`at /recipes/new?draft=${B} by PUSH`),
    ).toBeVisible();
    expect(screen.queryByText(PROMPT)).toBeNull();
  });

  it('Start new shows the usual form, creates nothing until real content, and does not ask again', async () => {
    const user = typer();
    const calls = setup('/recipes/new', {
      ...list([summary(A)]),
      'POST /api/recipe-drafts': () =>
        Response.json({ id: B, version: 1 }, { status: 201 }),
    });
    await user.click(await screen.findByRole('button', { name: 'Start new' }));
    const title = await screen.findByLabelText(/^Title/);
    await elapse(10_000);
    expect(sent(calls, 'POST /api/recipe-drafts')).toHaveLength(0);
    await user.type(title, 'x');
    await elapse(1600);
    expect(sent(calls, 'POST /api/recipe-drafts')).toHaveLength(1);
    // The list refreshes after the create; the form stays.
    await elapse(1000);
    expect(screen.queryByText(PROMPT)).toBeNull();
    expect(screen.getByLabelText(/^Title/)).toHaveValue('x');
  });

  it('shows the form at once when there are no New Recipe drafts (Variant drafts do not count)', async () => {
    setup(
      '/recipes/new',
      list([summary(C, { kind: 'variant', baseRecipeId: BASE })]),
    );
    expect(await screen.findByLabelText(/^Title/)).toBeVisible();
    expect(screen.queryByText(PROMPT)).toBeNull();
  });

  it('shows the form, not the prompt, when the list fails', async () => {
    setup('/recipes/new', {
      'GET /api/recipe-drafts': () =>
        Response.json({ code: 'internal', params: {} }, { status: 500 }),
    });
    expect(await screen.findByLabelText(/^Title/)).toBeVisible();
    expect(screen.queryByText(PROMPT)).toBeNull();
  });

  it('holds the form back while the list loads', async () => {
    let answer: (response: Response) => void = () => {};
    const calls = setup('/recipes/new', {
      'GET /api/recipe-drafts': () =>
        new Promise<Response>((resolve) => {
          answer = resolve;
        }),
    });
    await elapse(500);
    expect(screen.queryByLabelText(/^Title/)).toBeNull();
    await act(async () => answer(Response.json([])));
    expect(await screen.findByLabelText(/^Title/)).toBeVisible();
    expect(sent(calls, 'POST /api/recipe-drafts')).toHaveLength(0);
  });

  it('does not ask for a supplied fill', async () => {
    const calls = setup('/recipes/new', list([summary(A)]), {
      draft: {
        title: 'Linked',
        servings: 2,
        prepMinutes: null,
        cookMinutes: null,
        difficulty: null,
        tagIds: [],
        lines: [],
        steps: [],
        tips: [],
        guidance: { nutritionNote: null, pairings: [], eatingMoments: [] },
      },
    });
    expect(await screen.findByLabelText(/^Title/)).toHaveValue('Linked');
    expect(screen.queryByText(PROMPT)).toBeNull();
    expect(sent(calls, 'GET /api/recipe-drafts')).toHaveLength(0);
  });

  it('on New Variant lists only the Variant drafts of that base', async () => {
    setup(
      `/recipes/${BASE}/variant/new`,
      list([
        summary(A, { kind: 'variant', baseRecipeId: BASE, title: 'Mine' }),
        summary(B, {
          kind: 'variant',
          baseRecipeId: 'other',
          title: 'Other base',
        }),
        summary(C, { title: 'A new recipe' }),
      ]),
    );
    expect(await screen.findByText(PROMPT)).toBeVisible();
    expect(screen.getByText('Mine')).toBeVisible();
    expect(screen.queryByText('Other base')).toBeNull();
    expect(screen.queryByText('A new recipe')).toBeNull();
  });

  it('on New Variant, Start new gives the prefilled form', async () => {
    const user = typer();
    setup(`/recipes/${BASE}/variant/new`, {
      ...list([summary(A, { kind: 'variant', baseRecipeId: BASE })]),
    });
    await user.click(await screen.findByRole('button', { name: 'Start new' }));
    expect(await screen.findByLabelText(/^Title/)).toHaveValue('Omelette');
  });

  it('on New Variant, Continue goes to ?draft=ID of this base', async () => {
    const user = typer();
    setup(`/recipes/${BASE}/variant/new`, {
      ...list([summary(A, { kind: 'variant', baseRecipeId: BASE })]),
    });
    await user.click(
      await screen.findByRole('button', { name: 'Continue Gran stew' }),
    );
    expect(
      await screen.findByText(
        `at /recipes/${BASE}/variant/new?draft=${A} by PUSH`,
      ),
    ).toBeVisible();
  });

  it('asks in Danish', async () => {
    setup('/recipes/new', list([summary(A)]), undefined, 'da');
    expect(
      await screen.findByText('Vil du fortsætte din kladde?'),
    ).toBeVisible();
    expect(screen.getByText(/Du har en ufærdig opskriftkladde/)).toBeVisible();
  });

  it('asks in Romanian, with the plural forms', async () => {
    setup(
      '/recipes/new',
      list([summary(A), summary(B), summary(C)]),
      undefined,
      'ro',
    );
    expect(await screen.findByText('Continui ciorna?')).toBeVisible();
    expect(
      screen.getByText(/Ai 3 ciorne de rețete nefinalizate/),
    ).toBeVisible();
    expect(screen.getAllByRole('button', { name: /^Continuă / })).toHaveLength(
      3,
    );
    expect(
      screen.getByRole('button', { name: 'Începe una nouă' }),
    ).toBeVisible();
  });

  it('counts the drafts in the hint', async () => {
    setup('/recipes/new', list([summary(A), summary(B)]));
    expect(
      await screen.findByText(
        'You have 2 unfinished Recipe Drafts. Continue one, or start a new one.',
      ),
    ).toBeVisible();
  });

  it('does not offer a Recipe Draft that was saved a moment ago, even when the cached list is still fresh', async () => {
    const user = typer();
    let current = [summary(A)];
    setup(
      '/recipes/new',
      {
        'GET /api/recipe-drafts': () => Response.json(current),
        [`GET /api/recipe-drafts/${A}`]: () =>
          Response.json({
            ...summary(A),
            baseAvailable: false,
            createdAt: '2026-01-01T00:00:00.000Z',
            content: {
              title: 'Gran stew',
              servings: '4',
              prepMinutes: '',
              cookMinutes: '',
              difficulty: '',
              tagIds: [],
              lines: [],
              steps: [],
              guidance: null,
              pickedBaseId: null,
              sourceLink: null,
              sourceLanguage: null,
              plateScan: false,
            },
          }),
        'POST /api/recipes': () => {
          // The server ends the Recipe Draft with the create.
          current = [];
          return Response.json({ id: 'made' }, { status: 201 });
        },
      },
      undefined,
      'en',
      60_000,
    );
    await user.click(
      await screen.findByRole('button', { name: 'Continue Gran stew' }),
    );
    await user.click(await screen.findByRole('button', { name: 'Save' }));
    await user.click(await screen.findByRole('link', { name: 'again' }));
    expect(await screen.findByLabelText(/^Title/)).toHaveValue('');
    expect(screen.queryByText(PROMPT)).toBeNull();
  });
});

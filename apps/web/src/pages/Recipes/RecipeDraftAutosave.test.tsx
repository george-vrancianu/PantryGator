import { act, fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  Link,
  Route,
  Routes,
  useLocation,
  useNavigationType,
} from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecipeDraftContent } from '@/lib/recipeDrafts';
import type { RecipeTag } from '@/lib/tags';
import { renderWithProviders, stubApi } from '@/test/render';
import { NewRecipePage } from './NewRecipePage';

const DRAFT_ID = '5b0f6c2e-7d3a-4c58-9a51-1f2e3d4c5b6a';

const filters = { tags: [], eatingMoments: [] };

const pickable: RecipeTag[] = [
  {
    id: 't-dinner',
    name: 'Dinner',
    kind: 'catalog',
    groupId: 'g1',
    groupName: 'Meal',
    groupOrder: 1,
  },
  {
    id: 't-vegan',
    name: 'Vegan',
    kind: 'catalog',
    groupId: 'g2',
    groupName: 'Diet',
    groupOrder: 2,
  },
];

const blankGuidance = { nutritionNote: '', pairings: [], eatingMoments: [] };

/** A Recipe Draft's content as the form leaves it when only a title is typed. */
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
  offersBases: false,
});

const savedRecipe = {
  id: 'new-recipe',
  parentId: null,
  title: 'Gran stew',
  servings: 4,
  prepMinutes: null,
  cookMinutes: null,
  difficulty: null,
  tagIds: [],
  archived: false,
  sourceLink: null,
  sourceLanguage: null,
  lines: [],
  steps: [],
  tips: [],
  parentTips: null,
  nutritionNote: null,
  pairings: [],
  eatingMoments: [],
};

/** Shows where the router is and how it got there. */
function Where() {
  const location = useLocation();
  const type = useNavigationType();
  return <p>{`at ${location.pathname}${location.search} by ${type}`}</p>;
}

function setup(
  route: string,
  routes: Parameters<typeof stubApi>[0],
  locale: 'en' | 'ro' | 'da' = 'en',
) {
  const { fetchMock, calls } = stubApi({
    'GET /api/recipes/filters': () => Response.json(filters),
    ...routes,
  });
  vi.stubGlobal('fetch', fetchMock);
  renderWithProviders(
    <Routes>
      <Route
        path="/recipes/new"
        element={
          <>
            <Link to="/recipes">leave</Link>
            <Link to={`/recipes/new?draft=${DRAFT_ID}`}>reopen</Link>
            <Where />
            <NewRecipePage />
          </>
        }
      />
      <Route path="/recipes/:id" element={<p>Detail of the recipe</p>} />
      <Route path="/recipes" element={<p>Recipes page</p>} />
    </Routes>,
    { route, locale },
  );
  return calls;
}

const elapse = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));
const sent = (calls: ReturnType<typeof setup>, key: string) =>
  calls.filter((call) => call.key === key);

describe('Recipe Drafts autosave on New Recipe', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  const typer = () =>
    userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

  it('creates no Recipe Draft for a blank form left unchanged', async () => {
    const calls = setup('/recipes/new', {});
    await screen.findByLabelText(/^Title/);
    await elapse(10_000);
    await userEvent
      .setup({ advanceTimers: vi.advanceTimersByTime })
      .click(screen.getByRole('link', { name: 'leave' }));
    await elapse(10_000);
    expect(await screen.findByText('Recipes page')).toBeVisible();
    // Only the list is read (for the Continue prompt); nothing is written.
    expect(
      calls.filter(
        (c) =>
          c.key.includes('recipe-drafts') && c.key !== 'GET /api/recipe-drafts',
      ),
    ).toEqual([]);
  });

  it('creates a Recipe Draft about 1.5 s after the title is typed, sending the content as typed with no React keys', async () => {
    const user = typer();
    const calls = setup('/recipes/new', {
      'POST /api/recipe-drafts': () =>
        Response.json({ id: DRAFT_ID, version: 1 }, { status: 201 }),
    });
    await user.type(await screen.findByLabelText(/^Title/), 'Gran stew');
    await elapse(500);
    expect(sent(calls, 'POST /api/recipe-drafts')).toHaveLength(0);
    await elapse(1100);
    expect(sent(calls, 'POST /api/recipe-drafts')).toHaveLength(1);
    expect(sent(calls, 'POST /api/recipe-drafts')[0].body).toEqual({
      kind: 'new_recipe',
      baseRecipeId: null,
      content: titled('Gran stew'),
    });
  });

  it('creates a Recipe Draft from a first Ingredient Line', async () => {
    const user = typer();
    const calls = setup('/recipes/new', {
      'GET /api/catalog/search': () => Response.json({ results: [] }),
      'POST /api/recipe-drafts': () =>
        Response.json({ id: DRAFT_ID, version: 1 }, { status: 201 }),
    });
    await user.click(await screen.findByRole('tab', { name: /^Ingredients/ }));
    await user.type(
      await screen.findByRole('combobox', { name: 'Add an ingredient' }),
      'Dragon fruit',
    );
    await user.click(
      await screen.findByRole('option', {
        name: /Use “Dragon fruit” as typed/,
      }),
    );
    await elapse(1600);
    expect(sent(calls, 'POST /api/recipe-drafts')[0].body).toMatchObject({
      content: {
        title: '',
        lines: [{ ingredientId: '', name: 'Dragon fruit' }],
      },
    });
  });

  it('creates a Recipe Draft from a first Step', async () => {
    const user = typer();
    const calls = setup('/recipes/new', {
      'POST /api/recipe-drafts': () =>
        Response.json({ id: DRAFT_ID, version: 1 }, { status: 201 }),
    });
    await user.click(await screen.findByRole('tab', { name: /^Steps/ }));
    await user.click(
      await screen.findByRole('button', { name: 'Add the first Step' }),
    );
    await user.type(screen.getByLabelText('Step 1'), 'Whi');
    await elapse(1600);
    expect(sent(calls, 'POST /api/recipe-drafts')[0].body).toMatchObject({
      content: { title: '', steps: [{ text: 'Whi', timer: '' }] },
    });
  });

  it('autosaves the Tags picked, and resumes a draft with them (#709)', async () => {
    const user = typer();
    const calls = setup('/recipes/new', {
      'GET /api/recipes/tags': () => Response.json(pickable),
      'POST /api/recipe-drafts': () =>
        Response.json({ id: DRAFT_ID, version: 1 }, { status: 201 }),
    });
    await user.click(await screen.findByRole('combobox', { name: 'Tags' }));
    await user.click(await screen.findByRole('option', { name: 'Dinner' }));
    await user.click(screen.getByRole('option', { name: 'Vegan' }));
    await elapse(1600);
    expect(sent(calls, 'POST /api/recipe-drafts')[0].body).toMatchObject({
      content: { tagIds: ['t-dinner', 't-vegan'] },
    });
  });

  it('resumes a Recipe Draft with the Tags it was saved with', async () => {
    setup(`/recipes/new?draft=${DRAFT_ID}`, {
      'GET /api/recipes/tags': () => Response.json(pickable),
      [`GET /api/recipe-drafts/${DRAFT_ID}`]: () =>
        Response.json({
          id: DRAFT_ID,
          kind: 'new_recipe',
          baseRecipeId: null,
          baseRecipeName: null,
          baseAvailable: false,
          content: { ...titled('Gran stew'), tagIds: ['t-vegan'] },
          version: 3,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          expiresAt: '2026-01-31T00:00:00.000Z',
        }),
    });
    expect(await screen.findByText('Vegan')).toBeVisible();
    expect(screen.queryByText('Dinner')).toBeNull();
  });

  it('shows Saving… then Draft saved in the header, not as a toast', async () => {
    const user = typer();
    let finish: (response: Response) => void = () => {};
    setup('/recipes/new', {
      'POST /api/recipe-drafts': () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    });
    expect(screen.queryByText('Draft saved')).toBeNull();
    await user.type(await screen.findByLabelText(/^Title/), 'Gran stew');
    await elapse(1600);
    const saving = screen.getByText('Saving…');
    expect(saving).toBeVisible();
    expect(saving).toHaveAttribute('role', 'status');
    expect(screen.queryByRole('alert')).toBeNull();
    await act(async () => {
      finish(Response.json({ id: DRAFT_ID, version: 1 }, { status: 201 }));
    });
    expect(await screen.findByText('Draft saved')).toBeVisible();
    expect(screen.queryByText('Saving…')).toBeNull();
  });

  it.each([
    ['ro', 'Ciornă salvată'],
    ['da', 'Kladde gemt'],
  ] as const)('says the Recipe Draft is saved in %s', async (locale, text) => {
    const user = typer();
    setup(
      '/recipes/new',
      {
        'POST /api/recipe-drafts': () =>
          Response.json({ id: DRAFT_ID, version: 1 }, { status: 201 }),
      },
      locale,
    );
    await user.type((await screen.findAllByRole('textbox'))[0], 'Gran stew');
    await elapse(1600);
    expect(await screen.findByText(text)).toBeVisible();
  });

  it('puts the Recipe Draft id in the URL by replacing the entry', async () => {
    const user = typer();
    setup('/recipes/new', {
      'POST /api/recipe-drafts': () =>
        Response.json({ id: DRAFT_ID, version: 1 }, { status: 201 }),
    });
    expect(await screen.findByText('at /recipes/new by POP')).toBeVisible();
    await user.type(await screen.findByLabelText(/^Title/), 'Gran stew');
    await elapse(1600);
    expect(
      await screen.findByText(`at /recipes/new?draft=${DRAFT_ID} by REPLACE`),
    ).toBeVisible();
    // The form is the same one: nothing typed is lost and nothing is fetched.
    expect(screen.getByLabelText(/^Title/)).toHaveValue('Gran stew');
  });

  it('autosaves a Suggest Guidance result into the Recipe Draft', async () => {
    const user = typer();
    const calls = setup('/recipes/new', {
      'POST /api/recipe-drafts': () =>
        Response.json({ id: DRAFT_ID, version: 1 }, { status: 201 }),
      [`PUT /api/recipe-drafts/${DRAFT_ID}`]: () =>
        Response.json({ id: DRAFT_ID, version: 2 }),
      'POST /api/recipes/suggest-guidance': () =>
        Response.json({
          guidance: { nutritionNote: 'Rich in protein.' },
          noSuggestions: [],
        }),
    });
    await user.type(await screen.findByLabelText(/^Title/), 'Gran stew');
    await elapse(1600);
    expect(sent(calls, 'POST /api/recipe-drafts')).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Suggest' }));
    await vi.waitFor(() =>
      expect(screen.getByLabelText('Nutrition Note')).toHaveValue(
        'Rich in protein.',
      ),
    );
    await elapse(1600);
    const puts = sent(calls, `PUT /api/recipe-drafts/${DRAFT_ID}`);
    expect(puts).toHaveLength(1);
    expect(puts[0].body).toMatchObject({
      version: 1,
      content: {
        title: 'Gran stew',
        guidance: { nutritionNote: 'Rich in protein.' },
      },
    });
  });

  it('updates with the version it holds, one request at a time, sending later edits together', async () => {
    const user = typer();
    const releases: Array<() => void> = [];
    let version = 1;
    const calls = setup('/recipes/new', {
      'POST /api/recipe-drafts': () =>
        Response.json({ id: DRAFT_ID, version }, { status: 201 }),
      [`PUT /api/recipe-drafts/${DRAFT_ID}`]: () =>
        new Promise<Response>((resolve) => {
          releases.push(() =>
            resolve(Response.json({ id: DRAFT_ID, version: ++version })),
          );
        }),
    });
    const title = await screen.findByLabelText(/^Title/);
    await user.type(title, 'Gran');
    await elapse(1600);
    expect(sent(calls, 'POST /api/recipe-drafts')).toHaveLength(1);

    await user.type(title, ' stew');
    await elapse(1600);
    const puts = () => sent(calls, `PUT /api/recipe-drafts/${DRAFT_ID}`);
    expect(puts()).toHaveLength(1);
    expect(puts()[0].body).toMatchObject({
      version: 1,
      content: { title: 'Gran stew' },
    });

    // Edited while the request is in flight: nothing more goes out yet.
    await user.type(title, ' with');
    await elapse(1600);
    await user.type(title, ' herbs');
    await elapse(1600);
    expect(puts()).toHaveLength(1);

    await act(async () => releases[0]());
    await elapse(10);
    expect(puts()).toHaveLength(2);
    expect(puts()[1].body).toMatchObject({
      version: 2,
      content: { title: 'Gran stew with herbs' },
    });
    await act(async () => releases[1]());
    await elapse(5000);
    expect(puts()).toHaveLength(2);
  });

  it('sends what is pending when the Member leaves the page', async () => {
    const user = typer();
    const calls = setup('/recipes/new', {
      'POST /api/recipe-drafts': () =>
        Response.json({ id: DRAFT_ID, version: 1 }, { status: 201 }),
    });
    await user.type(await screen.findByLabelText(/^Title/), 'Gran stew');
    expect(sent(calls, 'POST /api/recipe-drafts')).toHaveLength(0);
    await user.click(screen.getByRole('link', { name: 'leave' }));
    expect(await screen.findByText('Recipes page')).toBeVisible();
    expect(sent(calls, 'POST /api/recipe-drafts')).toHaveLength(1);
  });

  it('sends what is pending on pagehide', async () => {
    const user = typer();
    const calls = setup('/recipes/new', {
      'POST /api/recipe-drafts': () =>
        Response.json({ id: DRAFT_ID, version: 1 }, { status: 201 }),
    });
    await user.type(await screen.findByLabelText(/^Title/), 'Gran stew');
    expect(sent(calls, 'POST /api/recipe-drafts')).toHaveLength(0);
    await act(async () => {
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(sent(calls, 'POST /api/recipe-drafts')).toHaveLength(1);
  });

  it('resumes the form exactly as typed, half-typed values included, and updates from the version it was given', async () => {
    const user = typer();
    const content: RecipeDraftContent = {
      ...titled('Gran st'),
      servings: '4x',
      lines: [
        {
          ingredientId: 'flour-id',
          name: 'Flour',
          quantity: '1/2 ab',
          unit: 'g',
          optional: false,
          note: '',
        },
        {
          ingredientId: '',
          name: 'Dragon fruit',
          quantity: '',
          unit: 'g',
          optional: true,
          note: 'ripe',
        },
      ],
      steps: [{ text: 'Whisk the', timer: '' }],
    };
    const calls = setup(`/recipes/new?draft=${DRAFT_ID}`, {
      [`GET /api/recipe-drafts/${DRAFT_ID}`]: () =>
        Response.json({
          id: DRAFT_ID,
          kind: 'new_recipe',
          baseRecipeId: null,
          baseRecipeName: null,
          baseAvailable: false,
          content,
          version: 7,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          expiresAt: '2026-01-31T00:00:00.000Z',
        }),
      [`PUT /api/recipe-drafts/${DRAFT_ID}`]: () =>
        Response.json({ id: DRAFT_ID, version: 8 }),
    });
    expect(await screen.findByLabelText(/^Title/)).toHaveValue('Gran st');
    expect(screen.getByLabelText(/^Serves/)).toHaveValue('4x');
    await user.click(screen.getByRole('tab', { name: /^Ingredients/ }));
    expect(screen.getByLabelText('Quantity of Flour')).toHaveValue('1/2 ab');
    // A line whose Ingredient is gone is an Unmatched name.
    expect(screen.getByLabelText('Quantity of Dragon fruit')).toBeVisible();
    expect(screen.getByText(/Not in the Catalog/)).toBeVisible();
    await user.click(screen.getByRole('tab', { name: /^Steps/ }));
    expect(screen.getByLabelText('Step 1')).toHaveValue('Whisk the');
    // Resuming alone changes nothing on the server.
    await elapse(5000);
    expect(sent(calls, `PUT /api/recipe-drafts/${DRAFT_ID}`)).toHaveLength(0);

    await user.click(screen.getByRole('tab', { name: /^Details/ }));
    await user.type(screen.getByLabelText(/^Title/), 'ew');
    await elapse(1600);
    const put = sent(calls, `PUT /api/recipe-drafts/${DRAFT_ID}`);
    expect(put).toHaveLength(1);
    expect(put[0].body).toMatchObject({
      version: 7,
      content: {
        title: 'Gran stew',
        lines: content.lines,
        steps: content.steps,
      },
    });
  });

  it('sends the Recipe Draft id with the create and sends no more drafts after', async () => {
    const user = typer();
    const calls = setup('/recipes/new', {
      'POST /api/recipe-drafts': () =>
        Response.json({ id: DRAFT_ID, version: 1 }, { status: 201 }),
      'POST /api/recipes': () => Response.json(savedRecipe, { status: 201 }),
    });
    await user.type(await screen.findByLabelText(/^Title/), 'Gran stew');
    await elapse(1600);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Detail of the recipe')).toBeVisible();
    expect(sent(calls, 'POST /api/recipes')[0].body).toMatchObject({
      title: 'Gran stew',
      recipeDraftId: DRAFT_ID,
    });
    await elapse(5000);
    expect(
      calls.filter(
        (c) =>
          c.key.includes('recipe-drafts') && c.key !== 'GET /api/recipe-drafts',
      ),
    ).toHaveLength(1);
  });

  it('stops saying Saving… when the form goes back to blank before anything was sent', async () => {
    const user = typer();
    const calls = setup('/recipes/new', {});
    const title = await screen.findByLabelText(/^Title/);
    await user.type(title, 'G');
    expect(screen.getByText('Saving…')).toBeVisible();
    await user.clear(title);
    expect(screen.queryByText('Saving…')).toBeNull();
    await elapse(5000);
    // Only the list is read (for the Continue prompt); nothing is written.
    expect(
      calls.filter(
        (c) =>
          c.key.includes('recipe-drafts') && c.key !== 'GET /api/recipe-drafts',
      ),
    ).toEqual([]);
  });

  it('goes back to Draft saved when an edit is undone before it is sent', async () => {
    const user = typer();
    const calls = setup('/recipes/new', {
      'POST /api/recipe-drafts': () =>
        Response.json({ id: DRAFT_ID, version: 1 }, { status: 201 }),
    });
    const title = await screen.findByLabelText(/^Title/);
    await user.type(title, 'Gran');
    await elapse(1600);
    expect(await screen.findByText('Draft saved')).toBeVisible();
    await user.type(title, 'x');
    expect(screen.getByText('Saving…')).toBeVisible();
    await user.type(title, '{Backspace}');
    expect(screen.getByText('Draft saved')).toBeVisible();
    await elapse(5000);
    expect(calls.filter((c) => c.key.startsWith('PUT'))).toEqual([]);
  });

  it('sends the pagehide update so it can outlive the page', async () => {
    const user = typer();
    const inits: Array<RequestInit | undefined> = [];
    const calls = setup('/recipes/new', {
      'POST /api/recipe-drafts': () =>
        Response.json({ id: DRAFT_ID, version: 1 }, { status: 201 }),
    });
    const inner = globalThis.fetch;
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
      inits.push(init);
      return inner(input, init);
    });
    await user.type(await screen.findByLabelText(/^Title/), 'Gran stew');
    await act(async () => {
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(sent(calls, 'POST /api/recipe-drafts')).toHaveLength(1);
    const post = inits.find((init) => init?.method === 'POST');
    expect(post?.keepalive).toBe(true);
  });

  it('makes one Recipe from two quick taps on Save', async () => {
    const user = typer();
    let release: (response: Response) => void = () => {};
    const calls = setup('/recipes/new', {
      'POST /api/recipe-drafts': () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
      'POST /api/recipes': () => Response.json(savedRecipe, { status: 201 }),
    });
    await user.type(await screen.findByLabelText(/^Title/), 'Gran stew');
    const save = screen.getByRole('button', { name: 'Save' });
    await user.click(save);
    // The button is disabled for the whole save; a second tap does nothing.
    fireEvent.click(save);
    await act(async () => {
      release(Response.json({ id: DRAFT_ID, version: 1 }, { status: 201 }));
    });
    await elapse(100);
    expect(await screen.findByText('Detail of the recipe')).toBeVisible();
    expect(sent(calls, 'POST /api/recipes')).toHaveLength(1);
  });

  it('sends no update while the Recipe is being created, and carries on if the create fails', async () => {
    const user = typer();
    let finish: (response: Response) => void = () => {};
    const calls = setup('/recipes/new', {
      'POST /api/recipe-drafts': () =>
        Response.json({ id: DRAFT_ID, version: 1 }, { status: 201 }),
      [`PUT /api/recipe-drafts/${DRAFT_ID}`]: () =>
        Response.json({ id: DRAFT_ID, version: 2 }),
      'POST /api/recipes': () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    });
    const title = await screen.findByLabelText(/^Title/);
    await user.type(title, 'Gran');
    await elapse(1600);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await elapse(10);
    await user.type(title, ' stew');
    await elapse(5000);
    expect(calls.filter((c) => c.key.startsWith('PUT'))).toEqual([]);
    await act(async () => {
      finish(Response.json({ code: 'unknown', params: {} }, { status: 500 }));
    });
    // The failure reaches the page a moment later, then the quiet period runs.
    for (
      let i = 0;
      i < 12 && !calls.some((c) => c.key.startsWith('PUT'));
      i++
    ) {
      await elapse(500);
    }
    const puts = calls.filter((c) => c.key.startsWith('PUT'));
    expect(puts).toHaveLength(1);
    expect(puts[0].body).toMatchObject({ content: { title: 'Gran stew' } });
  });

  it('fetches the Recipe Draft afresh when its address is opened again', async () => {
    const user = typer();
    let version = 3;
    const calls = setup(`/recipes/new?draft=${DRAFT_ID}`, {
      [`GET /api/recipe-drafts/${DRAFT_ID}`]: () =>
        Response.json({
          id: DRAFT_ID,
          kind: 'new_recipe',
          baseRecipeId: null,
          baseRecipeName: null,
          baseAvailable: false,
          content: titled('Gran'),
          version: version++ === 3 ? 3 : 9,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          expiresAt: '2026-01-31T00:00:00.000Z',
        }),
      [`PUT /api/recipe-drafts/${DRAFT_ID}`]: () =>
        Response.json({ id: DRAFT_ID, version: 10 }),
    });
    await screen.findByDisplayValue('Gran');
    await user.click(screen.getByRole('link', { name: 'reopen' }));
    const title = await screen.findByDisplayValue('Gran');
    await user.type(title, ' stew');
    await elapse(1600);
    expect(calls.filter((c) => c.key.startsWith('PUT'))[0].body).toMatchObject({
      version: 9,
    });
  });
});

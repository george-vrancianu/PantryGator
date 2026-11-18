import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  Route,
  Routes,
  useLocation,
  useNavigationType,
} from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FamilyRecipeDraft } from '@/lib/familyRecipes';
import type { RecipeDraftContent } from '@/lib/recipeDrafts';
import { renderWithProviders, stubApi } from '@/test/render';
import { openTab } from '@/test/familyRecipePages';
import { NewRecipePage } from './NewRecipePage';
import { NewVariantPage } from './NewVariantPage';

const DRAFT_ID = '5b0f6c2e-7d3a-4c58-9a51-1f2e3d4c5b6a';
const BASE = 'base';

const base: FamilyRecipeDraft = {
  parentId: BASE,
  title: 'Omelette',
  servings: 2,
  prepMinutes: 5,
  cookMinutes: null,
  difficulty: 'easy',
  tagIds: [],
  lines: [
    {
      ingredientId: 'egg',
      rawName: null,
      ingredientName: 'Egg',
      quantity: 3,
      unit: 'pcs',
      optional: false,
      note: null,
    },
  ],
  steps: [{ text: 'Whisk the eggs', timerSeconds: 90 }],
  tips: [],
  guidance: { nutritionNote: null, pairings: [], eatingMoments: [] },
};

const content = (title: string): RecipeDraftContent => ({
  title,
  servings: '2',
  prepMinutes: '5',
  cookMinutes: '',
  difficulty: 'easy',
  tagIds: [],
  lines: [
    {
      ingredientId: 'egg',
      name: 'Egg',
      quantity: '3',
      unit: 'pcs',
      optional: false,
      note: '',
    },
  ],
  steps: [{ text: 'Whisk the eggs', timer: '1.5', tips: [] }],
  guidance: { nutritionNote: '', pairings: [], eatingMoments: [] },
  pickedBaseId: null,
  sourceLink: null,
  sourceLanguage: null,
  plateScan: false,
  offersBases: false,
});

const summary = (
  id: string,
  over: Partial<{
    kind: 'new_recipe' | 'variant';
    baseRecipeId: string | null;
    title: string;
  }> = {},
) => ({
  id,
  kind: 'variant' as const,
  baseRecipeId: BASE,
  baseRecipeName: 'Omelette',
  title: 'Gran omelette',
  origin: null,
  updatedAt: '2026-01-05T10:00:00.000Z',
  expiresAt: '2026-02-04T10:00:00.000Z',
  version: 3,
  ...over,
});

const view = (
  over: Partial<{
    kind: 'new_recipe' | 'variant';
    baseRecipeId: string | null;
    baseAvailable: boolean;
  }> = {},
) => ({
  id: DRAFT_ID,
  kind: 'variant',
  baseRecipeId: BASE,
  baseRecipeName: 'Omelette',
  baseAvailable: true,
  content: content('Gran omelette'),
  version: 4,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-05T00:00:00.000Z',
  expiresAt: '2026-02-04T00:00:00.000Z',
  ...over,
});

const saved = {
  id: 'made',
  parentId: null,
  title: 'x',
  servings: 2,
  prepMinutes: null,
  cookMinutes: null,
  difficulty: null,
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
    'GET /api/recipes/filters': () =>
      Response.json({ tags: [], eatingMoments: [] }),
    [`GET /api/recipes/${BASE}/variant-draft`]: () => Response.json(base),
    ...routes,
  });
  vi.stubGlobal('fetch', fetchMock);
  renderWithProviders(
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
        path="/recipes/:id/variant/new"
        element={
          <>
            <Where />
            <NewVariantPage />
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
const VARIANT = `/recipes/${BASE}/variant/new`;

describe('Recipe Drafts on New Variant', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  const typer = () =>
    userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

  it("shows the Family pill on a prefilled line whose Ingredient is the Family's own", async () => {
    const user = typer();
    setup(VARIANT, {
      [`GET /api/recipes/${BASE}/variant-draft`]: () =>
        Response.json({
          ...base,
          lines: base.lines.map((line) => ({
            ...line,
            ingredientOwner: 'family',
          })),
        }),
    });
    await screen.findByLabelText(/^Title/);
    await openTab(user, 'Ingredients');
    const row = (await screen.findByLabelText('Quantity of Egg')).closest(
      'li',
    )!;
    expect(await within(row).findByText('Family')).toBeVisible();
  });

  it('keeps nothing for the form as first prefilled from the base', async () => {
    const calls = setup(VARIANT, {});
    expect(await screen.findByLabelText(/^Title/)).toHaveValue('Omelette');
    await elapse(10_000);
    expect(sent(calls, 'POST /api/recipe-drafts')).toHaveLength(0);
  });

  it('creates a Variant Recipe Draft with the base once the Member changes something, and shows the status and the id in the URL', async () => {
    const user = typer();
    const calls = setup(VARIANT, {
      'POST /api/recipe-drafts': () =>
        Response.json({ id: DRAFT_ID, version: 1 }, { status: 201 }),
    });
    await user.type(await screen.findByLabelText(/^Title/), ' deluxe');
    await elapse(1600);
    expect(sent(calls, 'POST /api/recipe-drafts')[0].body).toEqual({
      kind: 'variant',
      baseRecipeId: BASE,
      content: content('Omelette deluxe'),
    });
    expect(await screen.findByText('Draft saved')).toBeVisible();
    expect(
      await screen.findByText(`at ${VARIANT}?draft=${DRAFT_ID} by REPLACE`),
    ).toBeVisible();
  });

  it('allows several Variant drafts of the same base: a second visit that starts new creates its own', async () => {
    const user = typer();
    const calls = setup(VARIANT, {
      'GET /api/recipe-drafts': () => Response.json([summary(DRAFT_ID)]),
      'POST /api/recipe-drafts': () =>
        Response.json({ id: 'second-id', version: 1 }, { status: 201 }),
    });
    await user.click(await screen.findByRole('button', { name: 'Start new' }));
    await user.type(await screen.findByLabelText(/^Title/), '!');
    await elapse(1600);
    expect(sent(calls, 'POST /api/recipe-drafts')).toHaveLength(1);
    expect(sent(calls, `PUT /api/recipe-drafts/${DRAFT_ID}`)).toHaveLength(0);
  });

  it('resumes a Variant draft from ?draft=, updates it, and consumes it on save', async () => {
    const user = typer();
    const calls = setup(`${VARIANT}?draft=${DRAFT_ID}`, {
      [`GET /api/recipe-drafts/${DRAFT_ID}`]: () => Response.json(view()),
      [`PUT /api/recipe-drafts/${DRAFT_ID}`]: () =>
        Response.json({ id: DRAFT_ID, version: 5 }),
      'POST /api/recipes': () => Response.json(saved, { status: 201 }),
    });
    const title = await screen.findByLabelText(/^Title/);
    expect(title).toHaveValue('Gran omelette');
    // No prompt when a draft is being resumed.
    expect(screen.queryByText('Continue your draft?')).toBeNull();
    await elapse(5000);
    expect(sent(calls, `PUT /api/recipe-drafts/${DRAFT_ID}`)).toHaveLength(0);
    await user.type(title, '!');
    await elapse(1600);
    expect(
      sent(calls, `PUT /api/recipe-drafts/${DRAFT_ID}`)[0].body,
    ).toMatchObject({
      version: 4,
      content: { title: 'Gran omelette!' },
    });
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Detail of the recipe')).toBeVisible();
    expect(sent(calls, 'POST /api/recipes')[0].body).toMatchObject({
      parentId: BASE,
      recipeDraftId: DRAFT_ID,
    });
  });

  it('discards from the form back to Recipes', async () => {
    const user = typer();
    const calls = setup(VARIANT, {
      'POST /api/recipe-drafts': () =>
        Response.json({ id: DRAFT_ID, version: 1 }, { status: 201 }),
    });
    await user.type(await screen.findByLabelText(/^Title/), '!');
    await elapse(1600);
    await user.click(
      await screen.findByRole('button', { name: 'Discard draft' }),
    );
    expect(await screen.findByText('Recipes page')).toBeVisible();
    // The delete waits for the Undo window, which the Recipes page owns.
    expect(sent(calls, `DELETE /api/recipe-drafts/${DRAFT_ID}`)).toHaveLength(
      0,
    );
  });

  it('opens a Variant draft of an archived base as New Recipe with a note, and saves a Base Recipe', async () => {
    const user = typer();
    const calls = setup(`${VARIANT}?draft=${DRAFT_ID}`, {
      [`GET /api/recipe-drafts/${DRAFT_ID}`]: () =>
        Response.json(view({ baseAvailable: false })),
      [`PUT /api/recipe-drafts/${DRAFT_ID}`]: () =>
        Response.json({ id: DRAFT_ID, version: 5 }),
      'POST /api/recipes': () => Response.json(saved, { status: 201 }),
    });
    expect(
      await screen.findByText(
        /Base Recipe this Recipe Draft was a Variant of is gone/,
      ),
    ).toBeVisible();
    expect(
      screen.getByText(`at /recipes/new?draft=${DRAFT_ID} by REPLACE`),
    ).toBeVisible();
    expect(screen.getByLabelText(/^Title/)).toHaveValue('Gran omelette');
    expect(sent(calls, `GET /api/recipes/${BASE}/variant-draft`)).toHaveLength(
      0,
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Detail of the recipe')).toBeVisible();
    const post = sent(calls, 'POST /api/recipes')[0].body as Record<
      string,
      unknown
    >;
    expect(post).toMatchObject({ recipeDraftId: DRAFT_ID });
    expect(post.parentId ?? null).toBeNull();
  });

  it('opens a Variant draft of a deleted base at New Recipe with the same note', async () => {
    setup(`/recipes/new?draft=${DRAFT_ID}`, {
      [`GET /api/recipe-drafts/${DRAFT_ID}`]: () =>
        Response.json(view({ baseAvailable: false, baseRecipeId: null })),
    });
    expect(
      await screen.findByText(
        /Base Recipe this Recipe Draft was a Variant of is gone/,
      ),
    ).toBeVisible();
    expect(await screen.findByLabelText(/^Title/)).toHaveValue('Gran omelette');
  });

  it.each([
    ['ro', /această ciornă de rețetă nu mai există/],
    ['da', /denne opskriftkladde var en variant af, findes ikke længere/],
  ] as const)('has the note in %s', async (locale, note) => {
    setup(
      `/recipes/new?draft=${DRAFT_ID}`,
      {
        [`GET /api/recipe-drafts/${DRAFT_ID}`]: () =>
          Response.json(view({ baseAvailable: false, baseRecipeId: null })),
      },
      locale,
    );
    expect(await screen.findByText(note)).toBeVisible();
  });

  it('opens a Variant draft under its own base when the URL names another', async () => {
    const calls = setup(`/recipes/other/variant/new?draft=${DRAFT_ID}`, {
      [`GET /api/recipe-drafts/${DRAFT_ID}`]: () => Response.json(view()),
    });
    expect(
      await screen.findByText(`at ${VARIANT}?draft=${DRAFT_ID} by REPLACE`),
    ).toBeVisible();
    expect(await screen.findByLabelText(/^Title/)).toHaveValue('Gran omelette');
    expect(sent(calls, 'GET /api/recipes/other/variant-draft')).toHaveLength(0);
  });
});

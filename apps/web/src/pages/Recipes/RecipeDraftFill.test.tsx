import { act, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import userEvent from '@testing-library/user-event';
import type { InitialEntry } from 'react-router-dom';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecipeDraftContent } from '../../lib/recipeDrafts';
import { renderWithProviders, stubApi } from '../../test/render';
import { NewRecipePage, type NewRecipeState } from './NewRecipePage';

const DRAFT_ID = '5b0f6c2e-7d3a-4c58-9a51-1f2e3d4c5b6a';
const filters = { tags: [], eatingMoments: [] };
const elapse = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

const savedRecipe = {
  id: 'new-recipe',
  parentId: null,
  title: 'Pancakes from a blog',
  servings: 4,
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

/** A fill as Recipe from Link hands it over. */
const fill: NewRecipeState = {
  draft: {
    title: 'Pancakes from a blog',
    servings: null,
    prepMinutes: null,
    cookMinutes: null,
    difficulty: null,
    tagIds: [],
    lines: [
      {
        ingredientId: 'egg',
        rawName: null,
        ingredientName: 'Egg',
        quantity: 2,
        unit: 'pcs',
        optional: false,
        note: null,
      },
    ],
    steps: [{ text: 'Whisk and fry', timerSeconds: null }],
    tips: [],
    guidance: { nutritionNote: null, pairings: [], eatingMoments: [] },
  },
  closestBases: [
    { id: 'base-crepes', title: 'Crepes', allergyWarning: null },
    { id: 'base-waffles', title: 'Waffles', allergyWarning: null },
  ],
  sourceLink: 'https://www.example.org/pancakes',
  sourceLanguage: 'fr',
};

const content = (
  over: Partial<RecipeDraftContent> = {},
): RecipeDraftContent => ({
  title: 'Pancakes from a blog',
  servings: '',
  prepMinutes: '',
  cookMinutes: '',
  difficulty: '',
  tagIds: [],
  lines: [
    {
      ingredientId: 'egg',
      name: 'Egg',
      quantity: '2',
      unit: 'pcs',
      optional: false,
      note: '',
    },
  ],
  steps: [{ text: 'Whisk and fry', timer: '' }],
  guidance: { nutritionNote: '', pairings: [], eatingMoments: [] },
  pickedBaseId: null,
  sourceLink: null,
  sourceLanguage: null,
  plateScan: false,
  offersBases: false,
  ...over,
});

const stored = (c: RecipeDraftContent) => ({
  id: DRAFT_ID,
  kind: 'new_recipe',
  baseRecipeId: null,
  baseRecipeName: null,
  baseAvailable: false,
  content: c,
  version: 3,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  expiresAt: '2026-01-31T00:00:00.000Z',
});

const draftRoutes = {
  'POST /api/recipe-drafts': () =>
    Response.json({ id: DRAFT_ID, version: 1 }, { status: 201 }),
  [`PUT /api/recipe-drafts/${DRAFT_ID}`]: () =>
    Response.json({ id: DRAFT_ID, version: 4 }),
};

function setup(route: InitialEntry, routes: Parameters<typeof stubApi>[0]) {
  const { fetchMock, calls } = stubApi({
    'GET /api/recipes/filters': () => Response.json(filters),
    ...routes,
  });
  vi.stubGlobal('fetch', fetchMock);
  renderWithProviders(
    <Routes>
      <Route path="/recipes/new" element={<NewRecipePage />} />
      <Route path="/recipes/:id" element={<p>Detail of the recipe</p>} />
    </Routes>,
    { route },
  );
  return calls;
}
const sent = (calls: ReturnType<typeof setup>, key: string) =>
  calls.filter((call) => call.key === key);

describe('Recipe Drafts for supplied fills', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  const typer = () =>
    userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

  it('creates a Recipe Draft at once for a Recipe from Link fill, with no edit', async () => {
    const calls = setup({ pathname: '/recipes/new', state: fill }, draftRoutes);
    await screen.findByLabelText(/^Title/);
    // Far less than the 1.5 s quiet time.
    await elapse(100);
    const posts = sent(calls, 'POST /api/recipe-drafts');
    expect(posts).toHaveLength(1);
    expect(posts[0].body).toEqual({
      kind: 'new_recipe',
      baseRecipeId: null,
      content: content({
        sourceLink: 'https://www.example.org/pancakes',
        sourceLanguage: 'fr',
        pickedBaseId: 'base-crepes',
        steps: [{ text: 'Whisk and fry', timer: '', tips: [] }],
      }),
    });
    // Nothing more is sent while nothing changes.
    await elapse(5000);
    expect(sent(calls, 'POST /api/recipe-drafts')).toHaveLength(1);
    expect(sent(calls, `PUT /api/recipe-drafts/${DRAFT_ID}`)).toHaveLength(0);
  });

  it('keeps the Source Link and language through a resume and onto the saved Recipe', async () => {
    const user = typer();
    const calls = setup(`/recipes/new?draft=${DRAFT_ID}`, {
      ...draftRoutes,
      [`GET /api/recipe-drafts/${DRAFT_ID}`]: () =>
        Response.json(
          stored(
            content({
              servings: '4',
              sourceLink: 'https://www.example.org/pancakes',
              sourceLanguage: 'fr',
            }),
          ),
        ),
      'POST /api/recipes': () => Response.json(savedRecipe, { status: 201 }),
    });
    expect(await screen.findByLabelText(/^Title/)).toHaveValue(
      'Pancakes from a blog',
    );
    expect(screen.getByRole('link', { name: /example\.org/ })).toBeVisible();
    await user.type(screen.getByLabelText(/^Title/), '!');
    await elapse(1600);
    expect(
      sent(calls, `PUT /api/recipe-drafts/${DRAFT_ID}`)[0].body,
    ).toMatchObject({
      content: {
        sourceLink: 'https://www.example.org/pancakes',
        sourceLanguage: 'fr',
      },
    });
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Detail of the recipe')).toBeVisible();
    expect(sent(calls, 'POST /api/recipes')[0].body).toMatchObject({
      sourceLink: 'https://www.example.org/pancakes',
      sourceLanguage: 'fr',
      recipeDraftId: DRAFT_ID,
    });
  });

  it('keeps Guidance proposed by Suggest Guidance marked as suggested after a resume', async () => {
    const user = typer();
    const guidance: NonNullable<RecipeDraftContent['guidance']> = {
      nutritionNote: 'Rich in iron',
      nutritionNoteSuggested: true,
      pairings: [
        {
          kind: 'food',
          label: 'Green salad',
          reason: 'Fresh',
          principle: '',
          linkType: 'none',
          linkTarget: '',
          suggested: true,
        },
        {
          kind: 'food',
          label: 'Bread',
          reason: 'Mine',
          principle: '',
          linkType: 'none',
          linkTarget: '',
        },
      ],
      eatingMoments: [
        {
          eatingMomentId: 'breakfast',
          polarity: 'good_for',
          reason: 'Light',
          suggested: true,
        },
      ],
    };
    const calls = setup(`/recipes/new?draft=${DRAFT_ID}`, {
      ...draftRoutes,
      [`GET /api/recipe-drafts/${DRAFT_ID}`]: () =>
        Response.json(stored(content({ guidance }))),
    });
    await user.type(await screen.findByLabelText(/^Title/), '!');
    await elapse(1600);
    expect(
      sent(calls, `PUT /api/recipe-drafts/${DRAFT_ID}`)[0].body,
    ).toMatchObject({ content: { guidance } });
    // Exactly as typed: no React keys, and no marker on what was not suggested.
    expect(
      (
        sent(calls, `PUT /api/recipe-drafts/${DRAFT_ID}`)[0].body as {
          content: RecipeDraftContent;
        }
      ).content.guidance,
    ).toEqual(guidance);
  });

  it('creates exactly one Recipe Draft for a supplied fill in StrictMode', async () => {
    const { fetchMock, calls } = stubApi({
      'GET /api/recipes/filters': () => Response.json(filters),
      ...draftRoutes,
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <StrictMode>
        <Routes>
          <Route path="/recipes/new" element={<NewRecipePage />} />
        </Routes>
      </StrictMode>,
      { route: { pathname: '/recipes/new', state: fill } },
    );
    await screen.findByLabelText(/^Title/);
    await elapse(3000);
    expect(sent(calls, 'POST /api/recipe-drafts')).toHaveLength(1);
  });

  describe('resuming a Plate Scan Recipe Draft', () => {
    const plate = content({
      plateScan: true,
      pickedBaseId: 'base-waffles',
      servings: '2',
    });
    const resumeRoutes = (hidden = 0) => ({
      ...draftRoutes,
      [`GET /api/recipe-drafts/${DRAFT_ID}`]: () =>
        Response.json(stored(plate)),
      'POST /api/recipes/plate-matches': () =>
        Response.json({
          matches: [
            {
              id: 'base-crepes',
              title: 'Crepes',
              score: 0.8,
              allergyWarning: null,
            },
          ],
          hiddenByAllergiesCount: hidden,
        }),
      // The base picked through search is not among the closest: its name is fetched.
      'GET /api/recipes/base-waffles': () =>
        Response.json({
          id: 'base-waffles',
          owner: 'catalog',
          title: 'Waffles',
          allergyWarning: null,
        }),
    });

    it('asks for plate matches again from its title and lines and keeps the base picked before leaving', async () => {
      const calls = setup(`/recipes/new?draft=${DRAFT_ID}`, resumeRoutes());
      expect(
        await screen.findByRole('radio', { name: 'Waffles' }),
      ).toBeChecked();
      expect(screen.getByRole('radio', { name: /Crepes/ })).not.toBeChecked();
      expect(sent(calls, 'POST /api/recipes/plate-matches')[0].body).toEqual({
        dishTitle: 'Pancakes from a blog',
        ingredientIds: ['egg'],
      });
      // Resuming alone changes nothing on the server.
      await elapse(5000);
      expect(sent(calls, `PUT /api/recipe-drafts/${DRAFT_ID}`)).toHaveLength(0);
    });

    it('keeps plateScan and the picked base on the next save', async () => {
      const user = typer();
      const calls = setup(`/recipes/new?draft=${DRAFT_ID}`, resumeRoutes());
      await screen.findByRole('radio', { name: 'Waffles' });
      await user.type(screen.getByLabelText(/^Title/), '!');
      await elapse(1600);
      expect(
        sent(calls, `PUT /api/recipe-drafts/${DRAFT_ID}`)[0].body,
      ).toMatchObject({
        content: { plateScan: true, pickedBaseId: 'base-waffles' },
      });
      // A different pick is kept too.
      await user.click(screen.getByRole('radio', { name: /Crepes/ }));
      await elapse(1600);
      expect(
        sent(calls, `PUT /api/recipe-drafts/${DRAFT_ID}`).at(-1)?.body,
      ).toMatchObject({
        content: { plateScan: true, pickedBaseId: 'base-crepes' },
      });
    });

    const saveRoutes = {
      'POST /api/recipes': () => Response.json(savedRecipe, { status: 201 }),
    };

    it('saves the picked base when Save comes before the plate matches answer', async () => {
      const user = typer();
      const calls = setup(`/recipes/new?draft=${DRAFT_ID}`, {
        ...resumeRoutes(),
        ...saveRoutes,
        'POST /api/recipes/plate-matches': () =>
          new Promise<Response>(() => {}),
      });
      await screen.findByRole('radio', { name: 'Waffles' });
      await user.click(screen.getByRole('button', { name: 'Save' }));
      // The create goes out at once, without waiting for the matches.
      await vi.waitFor(() =>
        expect(sent(calls, 'POST /api/recipes')).toHaveLength(1),
      );
      expect(sent(calls, 'POST /api/recipes')[0].body).toMatchObject({
        parentId: 'base-waffles',
      });
      // The refetches after the create do not wait on the slow matches.
      expect(await screen.findByText('Detail of the recipe')).toBeVisible();
      expect(sent(calls, 'POST /api/recipes/plate-matches')).toHaveLength(1);
    });

    it.each([
      [
        'matches nothing now',
        () => Response.json({ matches: [], hiddenByAllergiesCount: 0 }),
      ],
      ['fails', () => Response.json({ error: 'boom' }, { status: 500 })],
    ])(
      'keeps the picked base on Save when the plate match %s',
      async (_n, answer) => {
        const user = typer();
        const calls = setup(`/recipes/new?draft=${DRAFT_ID}`, {
          ...resumeRoutes(),
          ...saveRoutes,
          'POST /api/recipes/plate-matches': answer,
        });
        expect(
          await screen.findByRole('radio', { name: 'Waffles' }),
        ).toBeChecked();
        await elapse(500);
        await user.click(screen.getByRole('button', { name: 'Save' }));
        expect(await screen.findByText('Detail of the recipe')).toBeVisible();
        expect(sent(calls, 'POST /api/recipes')[0].body).toMatchObject({
          parentId: 'base-waffles',
        });
        expect(sent(calls, `PUT /api/recipe-drafts/${DRAFT_ID}`)).toHaveLength(
          0,
        );
      },
    );

    it('keeps the pick, without overwriting it, when the picked base cannot be looked up', async () => {
      const user = typer();
      const calls = setup(`/recipes/new?draft=${DRAFT_ID}`, {
        ...resumeRoutes(),
        ...saveRoutes,
        'GET /api/recipes/base-waffles': () =>
          Response.json({ error: 'boom' }, { status: 500 }),
      });
      await screen.findByLabelText(/^Title/);
      await elapse(5000);
      expect(sent(calls, `PUT /api/recipe-drafts/${DRAFT_ID}`)).toHaveLength(0);
      await user.click(screen.getByRole('button', { name: 'Save' }));
      expect(await screen.findByText('Detail of the recipe')).toBeVisible();
      expect(sent(calls, 'POST /api/recipes')[0].body).toMatchObject({
        parentId: 'base-waffles',
      });
    });

    describe('when the Member picked Standalone', () => {
      const standaloneRoutes = {
        ...resumeRoutes(),
        ...saveRoutes,
        [`GET /api/recipe-drafts/${DRAFT_ID}`]: () =>
          Response.json(
            stored(
              content({ plateScan: true, pickedBaseId: null, servings: '2' }),
            ),
          ),
      };

      it('keeps Standalone checked, writes nothing and saves without a base', async () => {
        const user = typer();
        const calls = setup(`/recipes/new?draft=${DRAFT_ID}`, standaloneRoutes);
        expect(
          await screen.findByRole('radio', { name: /Standalone/ }),
        ).toBeChecked();
        expect(screen.getByRole('radio', { name: /Crepes/ })).not.toBeChecked();
        await elapse(5000);
        expect(sent(calls, `PUT /api/recipe-drafts/${DRAFT_ID}`)).toHaveLength(
          0,
        );
        await user.click(screen.getByRole('button', { name: 'Save' }));
        expect(await screen.findByText('Detail of the recipe')).toBeVisible();
        expect(sent(calls, 'POST /api/recipes')[0].body).toMatchObject({
          parentId: null,
        });
      });
    });

    it('keeps the picker and sends one more create when a save fails', async () => {
      const user = typer();
      let answers = 0;
      const calls = setup(`/recipes/new?draft=${DRAFT_ID}`, {
        ...resumeRoutes(),
        'POST /api/recipes': () =>
          ++answers === 1
            ? Response.json({ error: 'boom' }, { status: 500 })
            : Response.json(savedRecipe, { status: 201 }),
      });
      await screen.findByRole('radio', { name: 'Waffles' });
      await user.click(screen.getByRole('button', { name: 'Save' }));
      await vi.waitFor(() =>
        expect(sent(calls, 'POST /api/recipes')).toHaveLength(1),
      );
      const crepes = await screen.findByRole('radio', { name: /Crepes/ });
      await user.click(crepes);
      expect(crepes).toBeChecked();
      await user.click(screen.getByRole('button', { name: 'Save' }));
      expect(await screen.findByText('Detail of the recipe')).toBeVisible();
      expect(sent(calls, 'POST /api/recipes')).toHaveLength(2);
    });

    describe('when the picked base is gone', () => {
      const goneRoutes = (
        base: () => Response,
        matches: unknown[] = [
          {
            id: 'base-crepes',
            title: 'Crepes',
            score: 0.8,
            allergyWarning: null,
          },
        ],
      ) => ({
        ...resumeRoutes(),
        ...saveRoutes,
        'GET /api/recipes/base-waffles': base,
        'POST /api/recipes/plate-matches': () =>
          Response.json({ matches, hiddenByAllergiesCount: 0 }),
      });
      const notFound = () =>
        Response.json({ error: 'not_found' }, { status: 404 });
      const archived = () =>
        Response.json({
          id: 'base-waffles',
          owner: 'catalog',
          title: 'Waffles',
          archived: true,
          allergyWarning: null,
        });

      it.each([
        ['is deleted', notFound],
        ['is archived', archived],
      ])('moves to the top match when the base %s', async (_n, base) => {
        const user = typer();
        const calls = setup(`/recipes/new?draft=${DRAFT_ID}`, goneRoutes(base));
        expect(
          await screen.findByRole('radio', { name: /Crepes/ }),
        ).toBeChecked();
        expect(screen.queryByRole('radio', { name: 'Waffles' })).toBeNull();
        await user.click(screen.getByRole('button', { name: 'Save' }));
        expect(await screen.findByText('Detail of the recipe')).toBeVisible();
        expect(sent(calls, 'POST /api/recipes')[0].body).toMatchObject({
          parentId: 'base-crepes',
        });
      });

      it('sends no base when it is gone and nothing else matches', async () => {
        const user = typer();
        const calls = setup(
          `/recipes/new?draft=${DRAFT_ID}`,
          goneRoutes(notFound, []),
        );
        await screen.findByLabelText(/^Title/);
        await elapse(500);
        await user.click(screen.getByRole('button', { name: 'Save' }));
        expect(await screen.findByText('Detail of the recipe')).toBeVisible();
        expect(sent(calls, 'POST /api/recipes')[0].body).toMatchObject({
          parentId: null,
        });
      });
    });

    it('offers the hidden-by-Allergies note and Show as on first arrival', async () => {
      const user = typer();
      const calls = setup(`/recipes/new?draft=${DRAFT_ID}`, resumeRoutes(1));
      expect(
        await screen.findByText('1 Recipe hidden by your Allergies'),
      ).toBeVisible();
      await user.click(screen.getByRole('button', { name: 'Show' }));
      await vi.waitFor(() =>
        expect(
          sent(calls, 'POST /api/recipes/plate-matches').at(-1)?.body,
        ).toEqual({
          dishTitle: 'Pancakes from a blog',
          ingredientIds: ['egg'],
          showHidden: true,
        }),
      );
      // The base picked before leaving stays picked.
      expect(screen.getByRole('radio', { name: 'Waffles' })).toBeChecked();
    });
  });
});

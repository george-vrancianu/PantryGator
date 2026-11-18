import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FamilyRecipeDraft } from '../../lib/familyRecipes';
import type { RecipeDraftContent } from '../../lib/recipeDrafts';
import { renderWithProviders, stubApi } from '../../test/render';
import { NewVariantPage } from './NewVariantPage';

const DRAFT_ID = '5b0f6c2e-7d3a-4c58-9a51-1f2e3d4c5b6a';
const BASE = 'base';
const VARIANT = `/recipes/${BASE}/variant/new`;
const POST = 'POST /api/recipe-drafts';
const PUT = `PUT /api/recipe-drafts/${DRAFT_ID}`;
const GET = `GET /api/recipe-drafts/${DRAFT_ID}`;
const FAILED = "Couldn't save Recipe Draft, retrying";

const base: FamilyRecipeDraft = {
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
};

const content = (title: string): RecipeDraftContent => ({
  title,
  servings: '2',
  prepMinutes: '',
  cookMinutes: '',
  difficulty: '',
  tagIds: [],
  lines: [],
  steps: [],
  guidance: { nutritionNote: '', pairings: [], eatingMoments: [] },
  pickedBaseId: null,
  sourceLink: null,
  sourceLanguage: null,
  plateScan: false,
});

const failure = (status: number, code: string) =>
  Response.json({ code, params: {} }, { status });
const created = () =>
  Response.json({ id: DRAFT_ID, version: 1 }, { status: 201 });

function setup(routes: Parameters<typeof stubApi>[0]) {
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
        path="/recipes/:id/variant/new"
        element={
          <>
            <Link to="/recipes">leave</Link>
            <NewVariantPage />
          </>
        }
      />
      <Route path="/recipes" element={<p>Recipes page</p>} />
    </Routes>,
    { route: VARIANT },
  );
  return calls;
}

const elapse = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));
const sent = (calls: ReturnType<typeof setup>, key: string) =>
  calls.filter((call) => call.key === key);

describe('Recipe Draft failures on New Variant', () => {
  let confirm: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    confirm.mockRestore();
  });
  const typer = () =>
    userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

  it('shows the failure notice, retries, and asks before a link leaves while the save is failing', async () => {
    const user = typer();
    let n = 0;
    const calls = setup({
      [POST]: () => (n++ === 0 ? failure(500, 'unknown') : created()),
    });
    await user.type(await screen.findByLabelText(/^Title/), ' deluxe');
    await elapse(1600);
    expect(await screen.findByText(FAILED)).toBeVisible();
    await user.click(screen.getByRole('link', { name: 'leave' }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Recipes page')).toBeNull();
    await elapse(3100);
    expect(sent(calls, POST).length).toBeGreaterThanOrEqual(2);
    expect(await screen.findByText('Draft saved')).toBeVisible();
    expect(screen.queryByText(FAILED)).toBeNull();
    // Saved again: leaving no longer asks.
    await user.click(screen.getByRole('link', { name: 'leave' }));
    expect(await screen.findByText('Recipes page')).toBeVisible();
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it('stops on a version conflict, and Load latest reloads the form and resumes on the new version', async () => {
    const user = typer();
    const calls = setup({
      [POST]: () => created(),
      [PUT]: () => failure(409, 'recipe_drafts.version_conflict'),
      [GET]: () =>
        Response.json({
          id: DRAFT_ID,
          kind: 'variant',
          baseRecipeId: BASE,
          baseRecipeName: 'Omelette',
          baseAvailable: true,
          content: content('From the phone'),
          version: 6,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-05T00:00:00.000Z',
          expiresAt: '2026-02-04T00:00:00.000Z',
        }),
    });
    const title = await screen.findByLabelText(/^Title/);
    await user.type(title, '!');
    await elapse(1600);
    await user.type(title, '?');
    await elapse(1600);
    expect(
      await screen.findByText(
        'This Recipe Draft was changed on another device',
      ),
    ).toBeVisible();
    await elapse(60_000);
    expect(sent(calls, PUT)).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Load latest' }));
    expect(await screen.findByDisplayValue('From the phone')).toBeVisible();
    await user.type(screen.getByLabelText(/^Title/), '.');
    await elapse(1600);
    expect(sent(calls, PUT)[1].body).toMatchObject({
      version: 6,
      content: { title: 'From the phone.' },
    });
  });

  it('saves a Variant after a version conflict without ending the newer Recipe Draft, and offers no Discard draft', async () => {
    const user = typer();
    const calls = setup({
      [POST]: () => created(),
      [PUT]: () => failure(409, 'recipe_drafts.version_conflict'),
      'POST /api/recipes': () =>
        Response.json({ id: 'new-variant', title: 'x' }, { status: 201 }),
    });
    const title = await screen.findByLabelText(/^Title/);
    await user.type(title, '!');
    await elapse(1600);
    await user.type(title, '?');
    await elapse(1600);
    await screen.findByRole('button', { name: 'Load latest' });
    expect(screen.queryByRole('button', { name: 'Discard draft' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() =>
      expect(sent(calls, 'POST /api/recipes')).toHaveLength(1),
    );
    expect(sent(calls, 'POST /api/recipes')[0].body).not.toHaveProperty(
      'recipeDraftId',
    );
  });
});

import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  Link,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecipeDraftContent } from '@/lib/recipeDrafts';
import { renderWithProviders, stubApi } from '@/test/render';
import { NewRecipePage } from './NewRecipePage';

const DRAFT_ID = '5b0f6c2e-7d3a-4c58-9a51-1f2e3d4c5b6a';
const filters = { tags: [], eatingMoments: [] };
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

const stored = (content: RecipeDraftContent, version: number) => ({
  id: DRAFT_ID,
  kind: 'new_recipe',
  baseRecipeId: null,
  baseRecipeName: null,
  baseAvailable: false,
  content,
  version,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  expiresAt: '2026-01-31T00:00:00.000Z',
});

const failure = (status: number, code: string) =>
  Response.json({ code, params: {} }, { status });
const serverError = () => failure(500, 'unknown');
const conflict = () => failure(409, 'recipe_drafts.version_conflict');
const created = (version = 1) =>
  Response.json({ id: DRAFT_ID, version }, { status: 201 });

const POST = 'POST /api/recipe-drafts';
const PUT = `PUT /api/recipe-drafts/${DRAFT_ID}`;
const GET = `GET /api/recipe-drafts/${DRAFT_ID}`;

/** Answers the calls of one route in turn; the last answer repeats. */
const inTurn = (...answers: Array<() => Response>) => {
  let n = 0;
  return () => answers[Math.min(n++, answers.length - 1)]();
};

/** Whether each request asked for keepalive, in order. */
const keepalives: boolean[] = [];

function Leave() {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <>
      <Link to="/recipes">leave</Link>
      <button type="button" onClick={() => navigate('/recipes')}>
        go away
      </button>
      <button type="button" onClick={() => navigate(-1)}>
        go back
      </button>
      <p>{`at ${location.pathname}`}</p>
    </>
  );
}

function setup(
  routes: Parameters<typeof stubApi>[0],
  route = '/recipes/new',
  locale: 'en' | 'ro' | 'da' = 'en',
  before: string[] = [],
) {
  const { fetchMock, calls } = stubApi({
    'GET /api/recipes/filters': () => Response.json(filters),
    ...routes,
  });
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
    keepalives.push(init?.keepalive === true);
    return fetchMock(input, init);
  });
  renderWithProviders(
    <Routes>
      <Route
        path="/recipes/new"
        element={
          <>
            <Leave />
            <NewRecipePage />
          </>
        }
      />
      <Route path="/recipes/:id" element={<p>Detail of the recipe</p>} />
      <Route
        path="/recipes"
        element={
          <>
            <Leave />
            <p>Recipes page</p>
          </>
        }
      />
    </Routes>,
    { route, locale, before },
  );
  return calls;
}

const elapse = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));
const sent = (calls: ReturnType<typeof setup>, key: string) =>
  calls.filter((call) => call.key === key);
const FAILED = "Couldn't save Recipe Draft, retrying";

describe('Recipe Draft save failures, leave guard and version conflict', () => {
  let confirm: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    keepalives.length = 0;
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    confirm.mockRestore();
  });
  const typer = () =>
    userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

  describe('a failed save', () => {
    it('says so in the header without blocking, retries, and clears the notice on success', async () => {
      const user = typer();
      const calls = setup({ [POST]: inTurn(serverError, created) });
      await user.type(await screen.findByLabelText(/^Title/), 'Gran stew');
      await elapse(1600);
      const notice = await screen.findByText(FAILED);
      expect(notice).toBeVisible();
      expect(notice).toHaveAttribute('role', 'status');
      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.queryByText('Draft saved')).toBeNull();
      // The form stays usable.
      await user.type(screen.getByLabelText(/^Title/), '!');
      expect(screen.getByLabelText(/^Title/)).toHaveValue('Gran stew!');
      expect(screen.getByText(FAILED)).toBeVisible();

      await elapse(1600);
      // The edit's own quiet period retried it; the retry succeeded.
      expect(sent(calls, POST).length).toBeGreaterThanOrEqual(2);
      expect(await screen.findByText('Draft saved')).toBeVisible();
      expect(screen.queryByText(FAILED)).toBeNull();
    });

    it('retries on its own, a little later each time', async () => {
      const user = typer();
      const calls = setup({
        [POST]: inTurn(serverError, serverError, serverError, created),
      });
      await user.type(await screen.findByLabelText(/^Title/), 'Gran stew');
      await elapse(1600);
      expect(sent(calls, POST)).toHaveLength(1);
      await elapse(2800);
      expect(sent(calls, POST)).toHaveLength(1);
      await elapse(400);
      expect(sent(calls, POST)).toHaveLength(2);
      // 6 s after the second failure (which came at about 4.5 s).
      await elapse(5000);
      expect(sent(calls, POST)).toHaveLength(2);
      await elapse(1000);
      expect(sent(calls, POST)).toHaveLength(3);
      expect(screen.getByText(FAILED)).toBeVisible();
      // 12 s after the third (at about 10.5 s).
      await elapse(10_500);
      expect(sent(calls, POST)).toHaveLength(3);
      await elapse(2000);
      expect(sent(calls, POST)).toHaveLength(4);
      expect(await screen.findByText('Draft saved')).toBeVisible();
      expect(screen.queryByText(FAILED)).toBeNull();
    });

    it('also retries a failed update, and a network failure', async () => {
      const user = typer();
      const calls = setup({
        [POST]: () => created(),
        [PUT]: inTurn(
          () => Response.json({ code: 'x' }, { status: 503 }),
          () => Response.json({ id: DRAFT_ID, version: 2 }),
        ),
      });
      const title = await screen.findByLabelText(/^Title/);
      await user.type(title, 'Gran');
      await elapse(1600);
      await user.type(title, ' stew');
      await elapse(1600);
      expect(await screen.findByText(FAILED)).toBeVisible();
      await elapse(3100);
      expect(sent(calls, PUT)).toHaveLength(2);
      expect(sent(calls, PUT)[1].body).toMatchObject({
        version: 1,
        content: { title: 'Gran stew' },
      });
      expect(await screen.findByText('Draft saved')).toBeVisible();
    });

    it.each([
      [
        'ro',
        'Nu am putut salva ciorna de rețetă, încerc din nou',
        'Pleci oricum?',
      ],
      [
        'da',
        'Kunne ikke gemme opskriftkladden, prøver igen',
        'Vil du forlade siden alligevel?',
      ],
    ] as const)(
      'says it, and asks before leaving, in %s',
      async (locale, text, ask) => {
        const user = typer();
        setup({ [POST]: serverError }, '/recipes/new', locale);
        await user.type(
          (await screen.findAllByRole('textbox'))[0],
          'Gran stew',
        );
        await elapse(1600);
        expect(await screen.findByText(text)).toBeVisible();
        await user.click(screen.getByRole('link', { name: 'leave' }));
        expect(confirm).toHaveBeenCalledWith(expect.stringContaining(ask));
      },
    );

    it('does not retry the cap, which waiting cannot clear', async () => {
      const user = typer();
      const calls = setup({
        [POST]: () => failure(409, 'recipe_drafts.limit_reached'),
      });
      await user.type(await screen.findByLabelText(/^Title/), 'Gran stew');
      await elapse(40_000);
      expect(sent(calls, POST)).toHaveLength(1);
      expect(screen.queryByText(FAILED)).toBeNull();
    });

    it('links the cap notice to the Drafts list', async () => {
      const user = typer();
      setup({ [POST]: () => failure(409, 'recipe_drafts.limit_reached') });
      await user.type(await screen.findByLabelText(/^Title/), 'Gran stew');
      await elapse(1600);
      expect(
        await screen.findByRole('link', { name: 'See your Recipe Drafts' }),
      ).toHaveAttribute('href', '/recipes/drafts');
    });
  });

  describe('leaving the form', () => {
    it('never asks while saves succeed, on a link, a navigate call or unload', async () => {
      const user = typer();
      setup({ [POST]: () => created() });
      await user.type(await screen.findByLabelText(/^Title/), 'Gran stew');
      await elapse(1600);
      expect(await screen.findByText('Draft saved')).toBeVisible();
      const unload = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(unload);
      expect(unload.defaultPrevented).toBe(false);
      await user.click(screen.getByRole('link', { name: 'leave' }));
      expect(await screen.findByText('Recipes page')).toBeVisible();
      expect(confirm).not.toHaveBeenCalled();
    });

    it('never asks for a form with nothing typed', async () => {
      const user = typer();
      setup({});
      await screen.findByLabelText(/^Title/);
      await user.click(screen.getByRole('button', { name: 'go away' }));
      expect(await screen.findByText('Recipes page')).toBeVisible();
      expect(confirm).not.toHaveBeenCalled();
    });

    it('asks before a link leaves while the last save has failed, and stays on Cancel', async () => {
      const user = typer();
      setup({ [POST]: serverError });
      await user.type(await screen.findByLabelText(/^Title/), 'Gran stew');
      await elapse(1600);
      await screen.findByText(FAILED);
      await user.click(screen.getByRole('link', { name: 'leave' }));
      expect(confirm).toHaveBeenCalledTimes(1);
      expect(confirm).toHaveBeenCalledWith(
        'Your latest changes to this Recipe Draft are not saved yet. Leave anyway?',
      );
      expect(screen.getByLabelText(/^Title/)).toHaveValue('Gran stew');
      expect(screen.queryByText('Recipes page')).toBeNull();
    });

    it('leaves when the Member agrees, for a link and a navigate call', async () => {
      const user = typer();
      confirm.mockReturnValue(true);
      setup({ [POST]: serverError });
      await user.type(await screen.findByLabelText(/^Title/), 'Gran stew');
      await elapse(1600);
      await screen.findByText(FAILED);
      await user.click(screen.getByRole('button', { name: 'go away' }));
      expect(await screen.findByText('Recipes page')).toBeVisible();
      expect(confirm).toHaveBeenCalledTimes(1);
    });

    it('asks for navigate(-1), the same door as Back inside the router', async () => {
      const user = typer();
      // Something behind the form to go back to.
      setup({ [POST]: serverError }, '/recipes/new', 'en', ['/recipes']);
      await user.type(await screen.findByLabelText(/^Title/), 'Gran stew');
      await elapse(1600);
      await screen.findByText(FAILED);
      await user.click(screen.getByRole('button', { name: 'go back' }));
      // A history move settles asynchronously in the data router.
      await elapse(0);
      expect(confirm).toHaveBeenCalledTimes(1);
      expect(screen.getByLabelText(/^Title/)).toHaveValue('Gran stew');
    });

    it('asks on unload while the last save has failed, and not once it succeeded', async () => {
      const user = typer();
      setup({ [POST]: inTurn(serverError, created) });
      await user.type(await screen.findByLabelText(/^Title/), 'Gran stew');
      await elapse(1600);
      await screen.findByText(FAILED);
      const unload = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(unload);
      expect(unload.defaultPrevented).toBe(true);

      await elapse(3100);
      await screen.findByText('Draft saved');
      const later = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(later);
      expect(later.defaultPrevented).toBe(false);
    });

    it('does not ask once the Recipe is saved, even after a failed save', async () => {
      const user = typer();
      setup({
        [POST]: serverError,
        'POST /api/recipes': () =>
          Response.json(
            { id: 'new-recipe', title: 'Gran stew' },
            { status: 201 },
          ),
      });
      await user.type(await screen.findByLabelText(/^Title/), 'Gran stew');
      await elapse(1600);
      await screen.findByText(FAILED);
      await user.click(screen.getByRole('button', { name: 'Save' }));
      expect(await screen.findByText('Detail of the recipe')).toBeVisible();
      expect(confirm).not.toHaveBeenCalled();
    });
  });

  describe('a version conflict', () => {
    const conflicted = async () => {
      const user = typer();
      const calls = setup({
        [POST]: () => created(),
        [PUT]: conflict,
        [GET]: () =>
          Response.json(stored(titled('Gran stew, as on the phone'), 5)),
      });
      const title = await screen.findByLabelText(/^Title/);
      await user.type(title, 'Gran');
      await elapse(1600);
      await user.type(title, ' stew');
      await elapse(1600);
      return { user, calls, title };
    };

    it('pins the notice under the tabs, visible on every tab', async () => {
      const { user } = await conflicted();
      await screen.findByText(
        'This Recipe Draft was changed on another device',
      );
      for (const name of [/^Ingredients/, /^Steps/, /^Details/]) {
        await user.click(screen.getByRole('tab', { name }));
        expect(
          screen.getByRole('button', { name: 'Load latest' }),
        ).toBeVisible();
      }
    });

    it('stops autosave and says the Recipe Draft was changed on another device', async () => {
      const { user, calls, title } = await conflicted();
      expect(
        await screen.findByText(
          'This Recipe Draft was changed on another device',
        ),
      ).toBeVisible();
      expect(screen.getByRole('button', { name: 'Load latest' })).toBeVisible();
      expect(screen.queryByText(FAILED)).toBeNull();
      await user.type(title, ' more');
      await elapse(60_000);
      expect(sent(calls, PUT)).toHaveLength(1);
      expect(sent(calls, POST)).toHaveLength(1);
    });

    it('saves without ending the newer Recipe Draft, and offers no Discard draft meanwhile', async () => {
      const calls = setup({
        [POST]: () => created(),
        [PUT]: conflict,
        'POST /api/recipes': () =>
          Response.json(
            { id: 'new-recipe', title: 'Gran stew' },
            { status: 201 },
          ),
      });
      const user = typer();
      const title = await screen.findByLabelText(/^Title/);
      await user.type(title, 'Gran');
      await elapse(1600);
      await user.type(title, ' stew');
      await elapse(1600);
      await screen.findByRole('button', { name: 'Load latest' });
      expect(
        screen.queryByRole('button', { name: 'Discard draft' }),
      ).toBeNull();
      await user.click(screen.getByRole('button', { name: 'Save' }));
      expect(await screen.findByText('Detail of the recipe')).toBeVisible();
      const [post] = sent(calls, 'POST /api/recipes');
      expect(post.body).not.toHaveProperty('recipeDraftId');
    });

    it('saves without ending the newer Recipe Draft when the conflict shows only during the flush of Save', async () => {
      const calls = setup({
        [POST]: () => created(),
        [PUT]: conflict,
        'POST /api/recipes': () =>
          Response.json(
            { id: 'new-recipe', title: 'Gran stew' },
            { status: 201 },
          ),
      });
      const user = typer();
      const title = await screen.findByLabelText(/^Title/);
      await user.type(title, 'Gran');
      await elapse(1600);
      expect(sent(calls, POST)).toHaveLength(1);
      // Nothing has failed yet; the edit is still inside its quiet period.
      await user.type(title, ' stew');
      expect(sent(calls, PUT)).toHaveLength(0);
      await user.click(screen.getByRole('button', { name: 'Save' }));
      expect(await screen.findByText('Detail of the recipe')).toBeVisible();
      expect(sent(calls, PUT)).toHaveLength(1);
      const [post] = sent(calls, 'POST /api/recipes');
      expect(post.body).not.toHaveProperty('recipeDraftId');
    });

    it('keeps the form and discards nothing when the conflict shows only during the flush of Discard draft', async () => {
      const calls = setup({
        [POST]: () => created(),
        [PUT]: conflict,
        [`DELETE /api/recipe-drafts/${DRAFT_ID}`]: () =>
          new Response(null, { status: 204 }),
        [GET]: () =>
          Response.json(stored(titled('Gran stew, as on the phone'), 5)),
      });
      const user = typer();
      const title = await screen.findByLabelText(/^Title/);
      await user.type(title, 'Gran');
      await elapse(1600);
      expect(sent(calls, POST)).toHaveLength(1);
      await user.type(title, ' stew');
      expect(sent(calls, PUT)).toHaveLength(0);
      await user.click(screen.getByRole('button', { name: 'Discard draft' }));
      expect(
        await screen.findByRole('button', { name: 'Load latest' }),
      ).toBeVisible();
      expect(sent(calls, PUT)).toHaveLength(1);
      // Well past the Undo window of a discard.
      await elapse(30_000);
      expect(screen.queryByText('Recipes page')).toBeNull();
      expect(screen.getByLabelText(/^Title/)).toHaveValue('Gran stew');
      expect(
        calls.filter((call) => call.key.startsWith('DELETE ')),
      ).toHaveLength(0);
    });

    it('asks before leaving, since the edits here are not saved', async () => {
      const { user } = await conflicted();
      await screen.findByRole('button', { name: 'Load latest' });
      await user.click(screen.getByRole('link', { name: 'leave' }));
      expect(confirm).toHaveBeenCalledTimes(1);
      expect(screen.queryByText('Recipes page')).toBeNull();
    });

    it('reloads the form from the server on Load latest and resumes autosave on the new version', async () => {
      const { user, calls } = await conflicted();
      await user.click(
        await screen.findByRole('button', { name: 'Load latest' }),
      );
      expect(
        await screen.findByDisplayValue('Gran stew, as on the phone'),
      ).toBeVisible();
      expect(
        screen.queryByText('This Recipe Draft was changed on another device'),
      ).toBeNull();
      expect(sent(calls, GET)).toHaveLength(1);
      // Loading alone writes nothing.
      await elapse(5000);
      expect(sent(calls, PUT)).toHaveLength(1);

      calls.length = 0;
      await user.type(screen.getByLabelText(/^Title/), '!');
      await elapse(1600);
      const puts = sent(calls, PUT);
      expect(puts).toHaveLength(1);
      expect(puts[0].body).toMatchObject({
        version: 5,
        content: { title: 'Gran stew, as on the phone!' },
      });
    });

    it('keeps the form and says so when Load latest fails, and can try again', async () => {
      const user = typer();
      setup({
        [POST]: () => created(),
        [PUT]: conflict,
        [GET]: inTurn(serverError, () =>
          Response.json(stored(titled('Fresh'), 5)),
        ),
      });
      const title = await screen.findByLabelText(/^Title/);
      await user.type(title, 'Gran');
      await elapse(1600);
      await user.type(title, ' stew');
      await elapse(1600);
      await user.click(
        await screen.findByRole('button', { name: 'Load latest' }),
      );
      expect(
        await screen.findByText("Couldn't load the latest. Try again."),
      ).toBeVisible();
      expect(screen.getByLabelText(/^Title/)).toHaveValue('Gran stew');
      await user.click(screen.getByRole('button', { name: 'Load latest' }));
      expect(await screen.findByDisplayValue('Fresh')).toBeVisible();
    });

    it.each([
      [
        'ro',
        'Această ciornă de rețetă a fost modificată pe alt dispozitiv',
        'Încarcă ultima ciornă salvată',
      ],
      ['da', 'Denne opskriftkladde er ændret på en anden enhed', 'Hent nyeste'],
    ] as const)('says it in %s', async (locale, text, action) => {
      const user = typer();
      setup(
        { [POST]: () => created(), [PUT]: conflict },
        '/recipes/new',
        locale,
      );
      const title = (await screen.findAllByRole('textbox'))[0];
      await user.type(title, 'Gran');
      await elapse(1600);
      await user.type(title, ' stew');
      await elapse(1600);
      expect(await screen.findByText(text)).toBeVisible();
      expect(screen.getByRole('button', { name: action })).toBeVisible();
    });
  });

  describe('sending what is pending', () => {
    it('sends an edit made while paused when the form closes', async () => {
      const user = typer();
      let finish: (response: Response) => void = () => {};
      const calls = setup({
        [POST]: () => created(),
        [PUT]: () => Response.json({ id: DRAFT_ID, version: 2 }),
        'POST /api/recipes': () =>
          new Promise<Response>((resolve) => {
            finish = resolve;
          }),
      });
      const title = await screen.findByLabelText(/^Title/);
      await user.type(title, 'Gran stew');
      await elapse(1600);
      await user.click(screen.getByRole('button', { name: 'Save' }));
      await elapse(100);
      expect(sent(calls, 'POST /api/recipes')).toHaveLength(1);
      await user.type(title, '!');
      await elapse(5000);
      expect(sent(calls, PUT)).toHaveLength(0);
      await user.click(screen.getByRole('button', { name: 'go away' }));
      expect(await screen.findByText('Recipes page')).toBeVisible();
      expect(sent(calls, PUT)).toHaveLength(1);
      expect(sent(calls, PUT)[0].body).toMatchObject({
        content: { title: 'Gran stew!' },
      });
      finish(Response.json({}, { status: 500 }));
    });
  });

  describe('a request that cannot succeed by waiting', () => {
    const NOT_FOUND = 'That Recipe Draft is gone.';
    it.each([
      [404, 'recipe_drafts.not_found'],
      [400, 'validation_failed'],
    ])(
      'stops retrying a %s, says why inline and still guards leaving',
      async (status, code) => {
        const user = typer();
        const calls = setup({
          [POST]: () => created(),
          [PUT]: () => failure(status, code),
        });
        const title = await screen.findByLabelText(/^Title/);
        await user.type(title, 'Gran');
        await elapse(1600);
        await user.type(title, ' stew');
        await elapse(1600);
        if (status === 404) {
          expect(await screen.findByText(new RegExp(NOT_FOUND))).toBeVisible();
        }
        expect(screen.queryByText(FAILED)).toBeNull();
        await elapse(120_000);
        expect(sent(calls, PUT)).toHaveLength(1);
        await user.click(screen.getByRole('link', { name: 'leave' }));
        expect(confirm).toHaveBeenCalledTimes(1);
        expect(screen.queryByText('Recipes page')).toBeNull();
      },
    );

    it('offers to keep the form as a new Recipe Draft when the stored one is gone, and creates it from the form as it is', async () => {
      const user = typer();
      const calls = setup({
        [POST]: () => created(),
        [PUT]: () => failure(404, 'recipe_drafts.not_found'),
      });
      const title = await screen.findByLabelText(/^Title/);
      await user.type(title, 'Gran');
      await elapse(1600);
      await user.type(title, ' stew');
      await elapse(1600);
      await user.click(
        await screen.findByRole('button', {
          name: 'Keep as a new Recipe Draft',
        }),
      );
      await elapse(100);
      expect(sent(calls, POST)).toHaveLength(2);
      expect(sent(calls, POST)[1].body).toMatchObject({
        content: { title: 'Gran stew' },
      });
      expect(await screen.findByText('Draft saved')).toBeVisible();
      expect(
        screen.queryByRole('button', { name: 'Keep as a new Recipe Draft' }),
      ).toBeNull();
      expect(screen.queryByText(new RegExp(NOT_FOUND))).toBeNull();
      // Saved again: leaving asks nothing.
      await user.click(screen.getByRole('link', { name: 'leave' }));
      expect(confirm).not.toHaveBeenCalled();
    });

    it('waits for an update in flight when Keep as new is tapped, then creates one new Recipe Draft', async () => {
      const user = typer();
      let release: (response: Response) => void = () => {};
      let puts = 0;
      const calls = setup({
        [POST]: () => created(),
        [PUT]: () => {
          puts += 1;
          if (puts === 1) return failure(404, 'recipe_drafts.not_found');
          return new Promise<Response>((resolve) => {
            release = resolve;
          });
        },
      });
      const title = await screen.findByLabelText(/^Title/);
      await user.type(title, 'Gran');
      await elapse(1600);
      await user.type(title, ' stew');
      await elapse(1600);
      const keep = await screen.findByRole('button', {
        name: 'Keep as a new Recipe Draft',
      });
      // A later edit goes out as another update, which is still in flight at the tap.
      await user.type(title, '!');
      await elapse(1600);
      expect(sent(calls, PUT)).toHaveLength(2);
      await user.click(keep);
      expect(sent(calls, POST)).toHaveLength(1);
      await act(async () => release(failure(404, 'recipe_drafts.not_found')));
      await elapse(100);
      expect(sent(calls, POST)).toHaveLength(2);
      expect(sent(calls, POST)[1].body).toMatchObject({
        content: { title: 'Gran stew!' },
      });
    });

    it('creates only one new Recipe Draft when Keep as new is tapped twice while an update is in flight', async () => {
      const user = typer();
      let release: (response: Response) => void = () => {};
      let puts = 0;
      const calls = setup({
        [POST]: () => created(),
        [PUT]: () => {
          puts += 1;
          if (puts === 1) return failure(404, 'recipe_drafts.not_found');
          return new Promise<Response>((resolve) => {
            release = resolve;
          });
        },
      });
      const title = await screen.findByLabelText(/^Title/);
      await user.type(title, 'Gran');
      await elapse(1600);
      await user.type(title, ' stew');
      await elapse(1600);
      const keep = await screen.findByRole('button', {
        name: 'Keep as a new Recipe Draft',
      });
      await user.type(title, '!');
      await elapse(1600);
      await user.click(keep);
      await user.click(keep);
      await act(async () => release(failure(404, 'recipe_drafts.not_found')));
      await elapse(100);
      expect(sent(calls, POST)).toHaveLength(2);
    });

    it('does not offer it for a refusal other than a gone Recipe Draft', async () => {
      const user = typer();
      setup({
        [POST]: () => created(),
        [PUT]: () => failure(400, 'validation_failed'),
      });
      const title = await screen.findByLabelText(/^Title/);
      await user.type(title, 'Gran');
      await elapse(1600);
      await user.type(title, ' stew');
      await elapse(1600);
      expect(
        screen.queryByRole('button', { name: 'Keep as a new Recipe Draft' }),
      ).toBeNull();
    });

    it('keeps retrying 5xx, 408 and 429', async () => {
      const user = typer();
      const calls = setup({
        [POST]: inTurn(
          () => failure(408, 'unknown'),
          () => failure(429, 'unknown'),
          created,
        ),
      });
      await user.type(await screen.findByLabelText(/^Title/), 'Gran stew');
      await elapse(1600);
      await elapse(3100);
      await elapse(6100);
      expect(sent(calls, POST)).toHaveLength(3);
      expect(await screen.findByText('Draft saved')).toBeVisible();
    });
  });

  describe('keepalive', () => {
    it('is asked only of the request sent as the page hides, not of later ones (bfcache restore)', async () => {
      const user = typer();
      setup({
        [POST]: () => created(),
        [PUT]: () => Response.json({ id: DRAFT_ID, version: 2 }),
      });
      const title = await screen.findByLabelText(/^Title/);
      await user.type(title, 'Gran');
      await elapse(1600);
      await user.type(title, ' stew');
      await act(async () => {
        window.dispatchEvent(new Event('pagehide'));
      });
      await elapse(10);
      expect(keepalives.at(-1)).toBe(true);
      // Restored from the back/forward cache: the form carries on.
      await user.type(title, '!');
      await elapse(1600);
      expect(keepalives.at(-1)).toBe(false);
    });
  });
});

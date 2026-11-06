import { act, cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppLayout } from '../../components/AppLayout';
import type { Locale } from '../../i18n';
import {
  RECIPE_READ_AUTO_RETRY_MS,
  linkReadsOf,
  recipeReads,
} from '../../lib/recipeReads';
import type { RecipeFromLink } from '../../lib/linkRecipe';
import { renderWithProviders, stubApi } from '../../test/render';
import { RecipesPage } from './RecipesPage';

type Routes = Parameters<typeof stubApi>[0];
type User = ReturnType<typeof userEvent.setup>;

const link = 'https://www.example.com/pancakes';
const draft = { kind: 'draft', recipeDraftId: 'rd-1' } as RecipeFromLink;

const failing = (code: string, status = 422, params = {}) =>
  Response.json({ code, params }, { status });

/** The Recipes page and a second Dock page inside the app layout, with a stubbed API. */
function setup(
  fromLink: () => Response | Promise<Response>,
  {
    locale,
    route = '/recipes?fromLink=1',
  }: { locale?: Locale; route?: string } = {},
) {
  const routes: Routes = {
    'GET /api/recipes/filters': () =>
      Response.json({ tags: [], eatingMoments: [] }),
    'GET /api/recipes': () =>
      Response.json({ recipes: [], hiddenByAllergiesCount: 0 }),
    'POST /api/recipes/from-link': fromLink,
  };
  const { fetchMock, calls } = stubApi(routes);
  vi.stubGlobal('fetch', fetchMock);
  const view = renderWithProviders(
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/recipes" element={<RecipesPage />} />
        <Route
          path="/pantry"
          element={
            <>
              <p>pantry page</p>
              <Link to="/recipes">to recipes</Link>
              <Link to="/camera">to the camera</Link>
            </>
          }
        />
      </Route>
      <Route path="/camera" element={<Link to="/pantry">back</Link>} />
    </Routes>,
    { route, locale },
  );
  const sent = () =>
    calls
      .filter((c) => c.key === 'POST /api/recipes/from-link')
      .map((c) => c.body as { url?: string; text?: string });
  return { calls, sent, ...view };
}

const linkField = () => screen.getByLabelText(/^Link to the recipe/);

async function submit(user: User, url = link) {
  await user.type(linkField(), url);
  await user.click(screen.getByRole('button', { name: 'Read the recipe' }));
}

/** Opens the "In the background" sheet from the strip. */
async function openStrip(user: User) {
  await user.click(await screen.findByRole('button', { name: 'Open' }));
  return screen.findByRole('dialog', { name: 'In the background' });
}

const strip = () =>
  screen.queryAllByRole('status').filter((el) => el.textContent !== '')[0];

/** The strip's border as its styles declare it (jsdom cannot compute a border made of a theme variable). */
const outline = () => {
  const classes = Array.from(strip().parentElement!.classList);
  return Array.from(document.styleSheets)
    .flatMap((sheet) => Array.from(sheet.cssRules))
    .filter((rule) => classes.some((c) => rule.cssText.includes(`.${c}`)))
    .map((rule) => rule.cssText)
    .join('\n');
};

beforeEach(() => recipeReads.clear());
afterEach(() => {
  cleanup();
  recipeReads.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('a link read that failed, in the background strip', () => {
  it('keeps its row with the reason, Retry and Discard, and Retry reads again', async () => {
    const user = userEvent.setup({ delay: null });
    let answer: () => Response = () => failing('link.unreadable');
    const { sent } = setup(() => answer());
    await submit(user);
    expect(await screen.findByText("Couldn't read the recipe")).toBeVisible();
    await openStrip(user);
    expect(
      screen.getAllByText(/could not open that page/).length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /^Discard/ })).toBeVisible();

    answer = () => Response.json(draft);
    await user.click(
      screen.getByRole('button', { name: 'Retry reading example.com' }),
    );
    await waitFor(() =>
      expect(recipeReads.getState().reads[0].status).toBe('ready'),
    );
    expect(sent()).toHaveLength(2);
  });

  it('Discard lets the failed read go', async () => {
    const user = userEvent.setup({ delay: null });
    setup(() => failing('link.invalid', 400));
    await submit(user);
    await openStrip(user);
    await user.click(
      screen.getByRole('button', { name: 'Discard example.com' }),
    );
    expect(recipeReads.getState().reads).toEqual([]);
  });

  describe.each<[string, string, number, string, RegExp]>([
    ['link.invalid', 'link', 400, 'invalid', /not a web address we can open/],
    [
      'link.no_recipe',
      'link',
      422,
      'no_recipe',
      /could not find a recipe on that page/,
    ],
    [
      'scan.provider_unavailable',
      'link',
      503,
      'x',
      /cannot read recipes from links right now/,
    ],
    [
      'scan.provider_refused',
      'link',
      502,
      'x',
      /could not read a recipe from that page/,
    ],
    [
      'scan.provider_incomplete',
      'link',
      502,
      'x',
      /could not read a recipe from that page/,
    ],
    [
      'scan.result_invalid',
      'link',
      502,
      'x',
      /could not read a recipe from that page/,
    ],
    [
      'scan.provider_refused',
      'text',
      502,
      'x',
      /could not read a recipe from that text/,
    ],
    [
      'scan.provider_unavailable',
      'text',
      503,
      'x',
      /cannot read recipes right now/,
    ],
    [
      'link.no_recipe',
      'text',
      422,
      'x',
      /could not find a recipe in that text/,
    ],
    [
      'recipe_drafts.limit_reached',
      'link',
      409,
      'x',
      /You already keep 20 Recipe Drafts\. Finish or discard one to start another\./,
    ],
  ])('the reason for %s (%s)', (code, source, status, _name, reason) => {
    it('is worded for links, or for pasted text', async () => {
      const user = userEvent.setup({ delay: null });
      setup(() => failing(code, status, { max: 20 }), {
        route: source === 'text' ? '/recipes?fromText=1' : undefined,
      });
      if (source === 'text') {
        await user.type(screen.getByLabelText(/^Recipe text/), 'two eggs');
      } else {
        await user.type(linkField(), link);
      }
      await user.click(screen.getByRole('button', { name: 'Read the recipe' }));
      expect(await screen.findByText(reason)).toBeVisible();
    });
  });

  it.each<[Locale, string, number, RegExp]>([
    ['ro', 'link.no_recipe', 422, /Nu am găsit nicio rețetă/],
    [
      'ro',
      'scan.provider_refused',
      502,
      /Nu am putut citi o rețetă de pe pagina aceea/,
    ],
    [
      'ro',
      'recipe_drafts.limit_reached',
      409,
      /Ai deja 20 de ciorne de rețete/,
    ],
    ['da', 'link.unreadable', 422, /Vi kunne ikke åbne den side/],
    [
      'da',
      'scan.provider_unavailable',
      503,
      /Det er ikke muligt at læse opskrifter fra links/,
    ],
    ['da', 'recipe_drafts.limit_reached', 409, /Du har allerede 20/],
  ])(
    'words %s %s in its own language',
    async (locale, code, status, reason) => {
      const user = userEvent.setup({ delay: null });
      setup(() => failing(code, status, { max: 20 }), { locale });
      await user.type(screen.getByLabelText(/^Link/), link);
      await user.click(screen.getByRole('button', { name: /^(Citește|Læs)/ }));
      expect(await screen.findByText(reason)).toBeVisible();
    },
  );
});

describe('one automatic retry on a network error', () => {
  it('tries once more before the row shows failed, and shows the read when it works', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    let attempts = 0;
    const { sent } = setup(() => {
      attempts += 1;
      if (attempts === 1) throw new TypeError('Failed to fetch');
      return Response.json(draft);
    });
    await submit(user);
    expect(await screen.findByText('Reading a recipe link…')).toBeVisible();
    await waitFor(() => expect(sent()).toHaveLength(1));
    expect(screen.queryByText("Couldn't read the recipe")).toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(RECIPE_READ_AUTO_RETRY_MS));
    expect(await screen.findByText('Recipe ready to review')).toBeVisible();
    expect(sent()).toHaveLength(2);
  });

  it('fails after the second network error, with no third try', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { sent } = setup(() => {
      throw new TypeError('Failed to fetch');
    });
    await submit(user);
    await waitFor(() => expect(sent()).toHaveLength(1));
    await act(() => vi.advanceTimersByTimeAsync(RECIPE_READ_AUTO_RETRY_MS));
    expect(await screen.findByText("Couldn't read the recipe")).toBeVisible();
    expect(screen.getByText(/could not reach the server/)).toBeVisible();
    await act(() => vi.advanceTimersByTimeAsync(RECIPE_READ_AUTO_RETRY_MS * 3));
    expect(sent()).toHaveLength(2);
  });

  it('does not retry an answer that says no', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { sent } = setup(() => failing('link.unreadable'));
    await submit(user);
    expect(await screen.findByText("Couldn't read the recipe")).toBeVisible();
    await act(() => vi.advanceTimersByTimeAsync(RECIPE_READ_AUTO_RETRY_MS * 3));
    expect(sent()).toHaveLength(1);
  });

  it('Discard during the wait stops the retry', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { sent } = setup(() => {
      throw new TypeError('Failed to fetch');
    });
    await submit(user);
    await waitFor(() => expect(sent()).toHaveLength(1));
    const [read] = recipeReads.getState().reads;
    act(() => recipeReads.discard(read.id));
    await act(() => vi.advanceTimersByTimeAsync(RECIPE_READ_AUTO_RETRY_MS * 2));
    expect(sent()).toHaveLength(1);
  });
});

describe('"Paste text instead" on a failed row', () => {
  it('is offered for a page that could not be read, opens the From text sheet naming the site, and the text replaces the row', async () => {
    const user = userEvent.setup({ delay: null });
    const { sent } = setup(() => failing('link.unreadable'));
    await submit(user);
    await openStrip(user);
    await user.click(
      screen.getByRole('button', { name: /^Paste the text of example.com/ }),
    );

    const sheet = await screen.findByRole('dialog', { name: 'From text' });
    expect(
      screen.queryByRole('dialog', { name: 'In the background' }),
    ).toBeNull();
    const text = screen.getByLabelText(/^Recipe text/);
    // On a phone the field stays unfocused so the keyboard does not jump the sheet (ADR 0039).
    await waitFor(() => expect(sheet).toHaveFocus());
    expect(text).not.toHaveFocus();
    expect(
      screen.getByText('Paste the recipe from example.com.'),
    ).toBeVisible();

    await user.type(screen.getByLabelText(/^Recipe text/), 'two eggs');
    // Not answered yet: the failed row is still there until the text is sent.
    expect(recipeReads.getState().reads).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Read the recipe' }));
    await waitFor(() => expect(sheet).not.toBeVisible());
    expect(sent().at(-1)).toEqual({ text: 'two eggs', language: 'catalog' });
    const reads = linkReadsOf(recipeReads.getState().reads);
    expect(reads).toHaveLength(1);
    expect(reads[0].source.kind).toBe('text');
  });

  it('closing the sheet unsent leaves the failed row where it was', async () => {
    const user = userEvent.setup({ delay: null });
    setup(() => failing('link.unreadable'));
    await submit(user);
    await openStrip(user);
    await user.click(
      screen.getByRole('button', { name: /^Paste the text of/ }),
    );
    await screen.findByRole('dialog', { name: 'From text' });
    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'From text' })).toBeNull(),
    );
    expect(strip()).toHaveTextContent("Couldn't read the recipe");
  });

  it.each(['link.invalid', 'link.no_recipe', 'scan.provider_refused'])(
    'is not offered for %s',
    async (code) => {
      const user = userEvent.setup({ delay: null });
      setup(() => failing(code, 422));
      await submit(user);
      await openStrip(user);
      expect(screen.getByRole('button', { name: /^Retry/ })).toBeVisible();
      expect(
        screen.queryByRole('button', { name: /^Paste the text of/ }),
      ).toBeNull();
    },
  );

  it('is not offered for pasted text that failed', async () => {
    const user = userEvent.setup({ delay: null });
    setup(() => failing('link.unreadable'), { route: '/recipes?fromText=1' });
    await user.type(screen.getByLabelText(/^Recipe text/), 'two eggs');
    await user.click(screen.getByRole('button', { name: 'Read the recipe' }));
    await openStrip(user);
    expect(
      screen.queryByRole('button', { name: /^Paste the text of/ }),
    ).toBeNull();
  });
});

describe('the Link Cap', () => {
  /**
   * The first read to reach the API is held, then refused by the cap when `refuse` is called; the second
   * is held, then answered when `finish` is called; later ones are answered at once.
   */
  function capSetup(
    refusal: () => Response = () =>
      failing('link.cap_reached', 429, { cap: 20 }),
  ) {
    let n = 0;
    let refuse = () => {};
    let finish = () => {};
    const first = new Promise<void>((resolve) => (refuse = resolve));
    const second = new Promise<void>((resolve) => (finish = resolve));
    const view = setup(async () => {
      n += 1;
      if (n === 1) {
        await first;
        return refusal();
      }
      if (n === 2) await second;
      return Response.json(draft);
    });
    return { ...view, refuse: () => refuse(), finish: () => finish() };
  }

  const statuses = () => recipeReads.getState().reads.map((r) => r.status);

  const submitMany = async (user: User, urls: string[]) => {
    for (const [i, url] of urls.entries()) {
      if (i > 0) {
        await user.click(
          await screen.findByRole('button', { name: 'Add a Recipe' }),
        );
        await user.click(screen.getByRole('menuitem', { name: 'From a link' }));
      }
      await user.type(linkField(), url);
      await user.click(screen.getByRole('button', { name: 'Read the recipe' }));
    }
  };

  it('says when the reads start again, in the Real time of the Member, on the capped row', async () => {
    const user = userEvent.setup({ delay: null });
    const resetsAt = '2026-05-02T00:00:00.000Z';
    setup(() => failing('link.cap_reached', 429, { cap: 20, resetsAt }));
    await submit(user);
    const when = new Intl.DateTimeFormat('en-GB', {
      weekday: 'long',
      hour: 'numeric',
      minute: '2-digit',
    }).format(Date.parse(resetsAt));
    expect(
      await screen.findByText("Today's link reads are used up"),
    ).toBeVisible();
    expect(
      screen.getByText(
        `You have used all 20 recipe reads from links for today. Your reads reset on ${when}.`,
      ),
    ).toBeVisible();
  });

  it.each<[Record<string, unknown>, string]>([
    [
      {},
      "You have used all of today's recipe reads from links. Try again tomorrow.",
    ],
    [
      { cap: 20 },
      'You have used all 20 recipe reads from links for today. Try again tomorrow.',
    ],
    [
      { cap: 1 },
      'You have used your 1 recipe read from links for today. Try again tomorrow.',
    ],
  ])('words the cap for %j', async (params, message) => {
    const user = userEvent.setup({ delay: null });
    setup(() => failing('link.cap_reached', 429, params));
    await submit(user);
    expect(await screen.findByText(message)).toBeVisible();
  });

  it.each<[Locale, RegExp]>([
    [
      'ro',
      /Ai folosit toate cele 20 de citiri de rețete din linkuri de azi\. Încearcă mâine\./,
    ],
    [
      'da',
      /Du har brugt alle 20 opskriftslæsninger fra links i dag\. Prøv igen i morgen\./,
    ],
  ])('words the cap in %s', async (locale, message) => {
    const user = userEvent.setup({ delay: null });
    setup(() => failing('link.cap_reached', 429, { cap: 20 }), { locale });
    await user.type(screen.getByLabelText(/^Link/), link);
    await user.click(screen.getByRole('button', { name: /^(Citește|Læs)/ }));
    expect(await screen.findByText(message)).toBeVisible();
  });

  it('fails the read that reaches it and those waiting behind it, while a read in flight finishes', async () => {
    const user = userEvent.setup({ delay: null });
    const { sent, refuse, finish } = capSetup();
    await submitMany(user, [
      'https://a.example/1',
      'https://b.example/2',
      'https://c.example/3',
    ]);
    // 1 and 2 read, 3 waits; the cap refuses 1: 3 is capped with it, 2 carries on.
    await waitFor(() => expect(sent()).toHaveLength(2));
    expect(statuses()).toEqual(['reading', 'reading', 'waiting']);
    refuse();
    await waitFor(() =>
      expect(statuses()).toEqual(['capped', 'reading', 'capped']),
    );
    expect(sent().map((s) => s.url)).toEqual([
      'https://a.example/1',
      'https://b.example/2',
    ]);
    finish();
    await waitFor(() =>
      expect(statuses()).toEqual(['capped', 'ready', 'capped']),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '2 recipe links failed',
    );
  });

  it('fails an Out of Credits read and those waiting behind it, with Retry and Discard on each', async () => {
    const user = userEvent.setup({ delay: null });
    const { sent, refuse, finish } = capSetup(() =>
      failing('credits.insufficient', 402, { price: 2, balance: 1 }),
    );
    await submitMany(user, [
      'https://a.example/1',
      'https://b.example/2',
      'https://c.example/3',
    ]);
    await waitFor(() => expect(sent()).toHaveLength(2));
    refuse();
    await waitFor(() =>
      expect(statuses()).toEqual(['capped', 'reading', 'capped']),
    );
    // Only the first two were ever sent.
    expect(sent()).toHaveLength(2);
    await user.click(await screen.findByRole('button', { name: 'Open' }));
    expect(screen.getAllByText('Out of Credits')).toHaveLength(2);
    expect(
      screen.getByRole('button', { name: 'Discard c.example' }),
    ).toBeVisible();
    await user.click(
      screen.getByRole('button', { name: 'Retry reading a.example' }),
    );
    finish();
    await waitFor(() =>
      expect(statuses()).toEqual(['ready', 'ready', 'ready']),
    );
  });

  it('Retry on a capped read tries again, and releases those the cap held', async () => {
    const user = userEvent.setup({ delay: null });
    const { sent, refuse, finish } = capSetup();
    await submitMany(user, [
      'https://a.example/1',
      'https://b.example/2',
      'https://c.example/3',
    ]);
    await waitFor(() => expect(sent()).toHaveLength(2));
    refuse();
    await waitFor(() =>
      expect(statuses()).toEqual(['capped', 'reading', 'capped']),
    );
    await user.click(await screen.findByRole('button', { name: 'Open' }));
    await user.click(
      screen.getByRole('button', { name: 'Retry reading a.example' }),
    );
    finish();
    await waitFor(() =>
      expect(statuses()).toEqual(['ready', 'ready', 'ready']),
    );
    expect(
      sent()
        .map((s) => s.url)
        .sort(),
    ).toEqual([
      'https://a.example/1',
      'https://a.example/1',
      'https://b.example/2',
      'https://c.example/3',
    ]);
  });
});

describe('Out of Credits', () => {
  const outOfCredits = () =>
    failing('credits.insufficient', 402, { price: 2, balance: 1 });

  it('fails the read with Out of Credits, not the Link Cap message', async () => {
    const user = userEvent.setup({ delay: null });
    setup(outOfCredits);
    await submit(user);
    expect(await screen.findByText('Out of Credits')).toBeVisible();
    expect(
      screen.getByText('Out of Credits. This needs 2, and your Family has 1.'),
    ).toBeVisible();
    expect(screen.queryByText(/link reads are used up/)).toBeNull();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '1 recipe link failed',
    );
  });

  it('fails a read started from the From text sheet with Out of Credits', async () => {
    const user = userEvent.setup({ delay: null });
    setup(outOfCredits, { route: '/recipes?fromText=1' });
    await user.type(screen.getByLabelText(/^Recipe text/), 'two eggs');
    await user.click(screen.getByRole('button', { name: 'Read the recipe' }));
    expect(await screen.findByText('Out of Credits')).toBeVisible();
    expect(
      screen.getByText('Out of Credits. This needs 2, and your Family has 1.'),
    ).toBeVisible();
  });

  it.each<[Locale, RegExp]>([
    [
      'ro',
      /Ai rămas fără Credite\. Aici sunt necesare 2, iar familia ta are 1\./,
    ],
    ['da', /Ikke flere kreditter\. Det kræver 2, og jeres familie har 1\./],
  ])('words it in %s', async (locale, message) => {
    const user = userEvent.setup({ delay: null });
    setup(outOfCredits, { locale });
    await user.type(screen.getByLabelText(/^Link/), link);
    await user.click(screen.getByRole('button', { name: /^(Citește|Læs)/ }));
    expect(await screen.findByText(message)).toBeVisible();
  });
});

describe('the failure alert', () => {
  it('outlines the strip and announces a failure once, not again on another page or while retrying', async () => {
    const user = userEvent.setup({ delay: null });
    let answer: () => Response = () => failing('link.unreadable');
    setup(() => answer());
    await submit(user);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '1 recipe link failed',
    );
    expect(outline()).toMatch(/border: 2px solid/);

    // Off to a page without the Dock and back: the strip remounts, the same failure is not announced again.
    await user.click(screen.getByRole('link', { name: 'Pantry' }));
    await user.click(
      await screen.findByRole('link', { name: 'to the camera' }),
    );
    await user.click(await screen.findByRole('link', { name: 'back' }));
    expect(await screen.findByText('pantry page')).toBeVisible();
    expect(strip()).toHaveTextContent("Couldn't read the recipe");
    expect(screen.queryByRole('alert')).toBeNull();

    // Retrying (reading again) takes the outline away; the alert is not repeated while the sheet is open.
    answer = () => failing('link.unreadable');
    await openStrip(user);
    await user.click(
      screen.getByRole('button', { name: 'Retry reading example.com' }),
    );
    await waitFor(() =>
      expect(recipeReads.getState().reads[0].status).toBe('failed'),
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('announces a capped read as a failure too', async () => {
    const user = userEvent.setup({ delay: null });
    setup(() => failing('link.cap_reached', 429, { cap: 20 }));
    await submit(user);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '1 recipe link failed',
    );
  });

  it('does not outline the strip while reads only wait or read', async () => {
    const user = userEvent.setup({ delay: null });
    setup(() => new Promise<Response>(() => {}));
    await submit(user);
    // The strip is reachable once the sheet has finished closing.
    await waitFor(() =>
      expect(strip()).toHaveTextContent('Reading a recipe link'),
    );
    expect(outline()).not.toMatch(/border: 2px solid/);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

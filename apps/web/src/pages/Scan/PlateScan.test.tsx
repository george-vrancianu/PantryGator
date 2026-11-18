import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  recipeReads,
  useUnloadPromptWhileReading,
} from '../../lib/recipeReads';
import { resetReads } from '../../lib/scanReads';
import { getScanSession, resetScanSession } from '../../lib/scanSession';
import { renderWithProviders, stubApi } from '../../test/render';
import { takeScan } from '../../test/scan';
import { openBubbleSheet } from '../../test/voiceDom';
import { ReviewOverviewPage } from '../Review/ReviewOverviewPage';
import { BackgroundHost } from '../../components/background/BackgroundHost';
import { NewRecipePage } from '@/pages/Recipes/NewRecipePage';
import { ScanPage } from './ScanPage';

const IMAGE = 'data:image/jpeg;base64,YQ==';

vi.mock('../../lib/camera', async () =>
  (await import('../../test/scan')).fakeCameraModule(),
);
vi.mock('../../lib/image', async (importActual) => ({
  ...(await importActual<typeof import('../../lib/image')>()),
  resizeImage: () => Promise.resolve('data:image/jpeg;base64,YQ=='),
}));

const dishes = (token: string) => ({
  token,
  dishes: [
    { title: 'Pancakes', confidence: 0.72 },
    { title: 'Crepes', confidence: 0.2 },
  ],
});

const DRAFT_ID = '5b0f6c2e-7d3a-4c58-9a51-1f2e3d4c5b6a';

/** The Recipe Draft the server stored for the picked dish. */
const storedDraft = {
  id: DRAFT_ID,
  kind: 'new_recipe',
  baseRecipeId: null,
  baseRecipeName: null,
  baseAvailable: false,
  content: {
    title: 'Fluffy pancakes',
    servings: '4',
    prepMinutes: '',
    cookMinutes: '',
    difficulty: '',
    tagIds: [],
    lines: [
      {
        ingredientId: 'milk-id',
        name: 'Milk',
        quantity: '200',
        unit: 'ml',
        optional: false,
        note: '',
      },
    ],
    steps: [{ text: 'Whisk everything.', timer: '' }],
    guidance: { nutritionNote: '', pairings: [], eatingMoments: [] },
    pickedBaseId: null,
    sourceLink: null,
    sourceLanguage: null,
    plateScan: true,
    offersBases: false,
  },
  version: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  expiresAt: '2026-01-31T00:00:00.000Z',
};

/** The app layout mounts the unload prompt; the pages under test do not. */
function UnloadPrompt() {
  useUnloadPromptWhileReading();
  return null;
}

function renderPlate(extra: Record<string, () => Response> = {}) {
  let reads = 0;
  const { fetchMock, calls } = stubApi({
    'POST /api/scan/plate': () => Response.json(dishes(`token-${++reads}`)),
    'POST /api/scan/plate/recipe': () =>
      Response.json({ recipeDraftId: DRAFT_ID }),
    [`GET /api/recipe-drafts/${DRAFT_ID}`]: () => Response.json(storedDraft),
    'GET /api/recipes/filters': () =>
      Response.json({ tags: [], eatingMoments: [] }),
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
        hiddenByAllergiesCount: 2,
      }),
    ...extra,
  });
  vi.stubGlobal('fetch', fetchMock);
  renderWithProviders(
    <>
      <Routes>
        <Route path="/scan" element={<ScanPage />} />
        <Route path="/scan/review" element={<ReviewOverviewPage />} />
        <Route path="/recipes/new" element={<NewRecipePage />} />
      </Routes>
      <BackgroundHost recipeReads />
    </>,
    { route: '/scan?mode=plate' },
  );
  return calls;
}

const creditsBody = (balance: number) => ({
  balance,
  prices: {
    scan: 1,
    voice: 1,
    assistant: 1,
    'link-page': 2,
    'link-text': 1,
    guidance: 1,
    'plate-recipe': 2,
  },
  lowBalanceThreshold: 10,
  history: [],
});

const scanThenDone = async () => {
  takeScan();
  await userEvent.click(
    await screen.findByRole('button', { name: /^Review \d+ / }),
  );
};
const picker = () => screen.findByRole('group', { name: 'Pick the dish' });
const pick = async (title: RegExp) =>
  userEvent.click(within(await picker()).getByRole('button', { name: title }));

describe('Plate Scan in the Scan Session', () => {
  beforeEach(() => {
    resetReads();
    resetScanSession();
    localStorage.clear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('queues like the other modes: stays on the camera, no picker there', async () => {
    const calls = renderPlate();
    takeScan();
    expect(
      await screen.findByRole('button', { name: /^Review 1 photo/ }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('scan-guide')).toBeInTheDocument();
    await waitFor(() =>
      expect(calls.map((c) => c.key)).toContain('POST /api/scan/plate'),
    );
    const read = calls.find((c) => c.key === 'POST /api/scan/plate');
    expect(read?.body).toEqual({ plateImage: IMAGE });
    expect(new URLSearchParams(read?.search).has('scanLanguage')).toBe(false);
    expect(screen.queryByRole('group', { name: 'Pick the dish' })).toBeNull();
  });

  it('shows "Pick the dish" on the card, with each guess and its confidence', async () => {
    renderPlate();
    await scanThenDone();
    const options = within(await picker()).getAllByRole('button');
    expect(options.map((b) => b.getAttribute('aria-label'))).toEqual([
      'Pancakes, 72% likely',
      'Crepes, 20% likely',
    ]);
    expect(within(screen.getByTestId('review-card')).getByRole('group')).toBe(
      screen.getByRole('group', { name: 'Pick the dish' }),
    );
  });

  it('shows the price of writing the dish on each guess', async () => {
    renderPlate({
      'GET /api/credits': () => Response.json(creditsBody(50)),
    });
    await scanThenDone();
    const options = within(await picker()).getAllByRole('button');
    await waitFor(() =>
      expect(options.map((b) => b.getAttribute('aria-label'))).toEqual([
        'Pancakes, 72% likely, writing it as a Recipe costs 2 Credits',
        'Crepes, 20% likely, writing it as a Recipe costs 2 Credits',
      ]),
    );
    for (const option of options) {
      expect(within(option).getByText('2 Credits')).toBeInTheDocument();
    }
  });

  it('refuses a pick the Family cannot pay for: the card and guesses stay, nothing joins the strip', async () => {
    let balance = 1;
    const calls = renderPlate({
      'GET /api/credits': () => Response.json(creditsBody(balance)),
    });
    await scanThenDone();
    await pick(/Pancakes/);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Out of Credits. This needs 2, and your Family has 1.',
    );
    expect(await picker()).toBeInTheDocument();
    expect(getScanSession().scans).toHaveLength(1);
    expect(recipeReads.getState().reads).toHaveLength(0);
    expect(screen.queryByText('Writing Pancakes…')).toBeNull();
    expect(calls.map((c) => c.key)).not.toContain(
      'POST /api/scan/plate/recipe',
    );

    // Credits added: the same card can pick again.
    balance = 5;
    await pick(/Pancakes/);
    await openBubbleSheet();
    expect(
      await screen.findByText('Pancakes ready to review'),
    ).toBeInTheDocument();
    expect(getScanSession().scans).toHaveLength(0);
    expect(
      calls.find((c) => c.key === 'POST /api/scan/plate/recipe')?.body,
    ).toEqual({ dishTitle: 'Pancakes', plateToken: 'token-1' });
  });

  it('brings the card back with its guesses when the server refuses the pick for Credits after the check passed', async () => {
    let refuse = true;
    const calls = renderPlate({
      'GET /api/credits': () => Response.json(creditsBody(50)),
      'POST /api/scan/plate/recipe': () =>
        refuse
          ? Response.json(
              {
                code: 'credits.insufficient',
                params: { price: 2, balance: 1 },
              },
              { status: 402 },
            )
          : Response.json({ recipeDraftId: DRAFT_ID }),
    });
    await scanThenDone();
    await pick(/Pancakes/);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Out of Credits. This needs 2, and your Family has 1.',
    );
    expect(await picker()).toBeInTheDocument();
    expect(getScanSession().scans).toHaveLength(1);
    expect(getScanSession().scans[0]).toMatchObject({
      status: 'read',
      plateToken: 'token-1',
    });
    expect(recipeReads.getState().reads).toHaveLength(0);
    expect(screen.queryByText("Couldn't write Pancakes")).toBeNull();

    // Credits added: the same card, with the same token, can pick again.
    refuse = false;
    await pick(/Pancakes/);
    await openBubbleSheet();
    expect(
      await screen.findByText('Pancakes ready to review'),
    ).toBeInTheDocument();
    expect(
      calls
        .filter((c) => c.key === 'POST /api/scan/plate/recipe')
        .map((c) => c.body),
    ).toEqual([
      { dishTitle: 'Pancakes', plateToken: 'token-1' },
      { dishTitle: 'Pancakes', plateToken: 'token-1' },
    ]);
  });

  it('keeps focus on the guess, enabled, while the balance is checked', async () => {
    let hold = false;
    let release: (response: Response) => void = () => {};
    const calls = renderPlate({
      'GET /api/credits': () =>
        hold
          ? (new Promise<Response>((resolve) => {
              release = resolve;
            }) as unknown as Response)
          : Response.json(creditsBody(50)),
    });
    await scanThenDone();
    const option = await within(await picker()).findByRole('button', {
      name: /Pancakes.*costs 2 Credits/,
    });
    const checks = () =>
      calls.filter((c) => c.key === 'GET /api/credits').length;
    const before = checks();
    hold = true;
    await userEvent.click(option);
    await waitFor(() => expect(checks()).toBe(before + 1));
    // A disabled button loses focus; the guess must stay a live, focused button during the check.
    expect(option).not.toBeDisabled();
    expect(option).not.toHaveAttribute('disabled');
    expect(option).toHaveFocus();
    await userEvent.click(option);
    release(Response.json(creditsBody(1)));
    await screen.findByRole('alert');
    expect(
      within(await picker()).getByRole('button', { name: /Pancakes/ }),
    ).toHaveFocus();
    expect(
      calls.filter((c) => c.key === 'POST /api/scan/plate/recipe'),
    ).toHaveLength(0);
  });

  it('writes the dish once when the guess is clicked twice during the balance check', async () => {
    let hold = false;
    let release: (response: Response) => void = () => {};
    const calls = renderPlate({
      'GET /api/credits': () =>
        hold
          ? (new Promise<Response>((resolve) => {
              release = resolve;
            }) as unknown as Response)
          : Response.json(creditsBody(50)),
    });
    await scanThenDone();
    const option = await within(await picker()).findByRole('button', {
      name: /Pancakes.*costs 2 Credits/,
    });
    hold = true;
    await userEvent.click(option);
    await userEvent.click(option);
    release(Response.json(creditsBody(50)));
    await openBubbleSheet();
    // Written once: the row is there whether the read is still going or already done.
    expect(
      await screen.findByText(/Writing Pancakes…|Pancakes ready to review/),
    ).toBeInTheDocument();
    expect(
      calls.filter((c) => c.key === 'POST /api/scan/plate/recipe'),
    ).toHaveLength(1);
  });

  it('shows only the guesses on the card: no ingredient lines to review', async () => {
    renderPlate();
    await scanThenDone();
    await picker();
    expect(screen.queryByTestId('card-result')).toBeNull();
    expect(screen.queryAllByTestId('card-chip')).toHaveLength(0);
    expect(screen.getByRole('button', { name: /^Add all/ })).toBeDisabled();
  });

  it('picking a dish removes the card and shows "Writing <dish>…" in the strip, while the Member keeps scanning', async () => {
    let finish: (response: Response) => void = () => {};
    const calls = renderPlate({
      'POST /api/scan/plate/recipe': () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }) as unknown as Response,
    });
    await scanThenDone();
    await pick(/Pancakes/);
    await openBubbleSheet();
    await openBubbleSheet();
    expect(await screen.findByText('Writing Pancakes…')).toBeInTheDocument();
    expect(getScanSession().scans).toHaveLength(0);
    expect(screen.queryByRole('group', { name: 'Pick the dish' })).toBeNull();
    expect(screen.queryByTestId('review-card')).toBeNull();
    expect(
      calls.find((c) => c.key === 'POST /api/scan/plate/recipe')?.body,
    ).toEqual({ dishTitle: 'Pancakes', plateToken: 'token-1' });
    expect(recipeReads.getState().reads).toMatchObject([
      { kind: 'plate', title: 'Pancakes', status: 'reading' },
    ]);
    finish(Response.json({ recipeDraftId: DRAFT_ID }));
    await openBubbleSheet();
    expect(
      await screen.findByText('Pancakes ready to review'),
    ).toBeInTheDocument();
  });

  it('after a pick, focus moves to the next card instead of falling to the page', async () => {
    renderPlate();
    takeScan();
    await screen.findByRole('button', { name: /^Review 1 photo/ });
    takeScan();
    await userEvent.click(
      await screen.findByRole('button', { name: /^Review 2 photos/ }),
    );
    await waitFor(() =>
      expect(
        screen.getAllByRole('group', { name: 'Pick the dish' }),
      ).toHaveLength(2),
    );
    const [first, second] = screen.getAllByTestId('review-card');
    await userEvent.click(
      within(first).getByRole('button', { name: /Pancakes/ }),
    );
    await waitFor(() => expect(second).toHaveFocus());
  });

  it('Review on the ready row opens New Recipe filled in, with plate matches offered and Standalone picked', async () => {
    const calls = renderPlate();
    await scanThenDone();
    await pick(/Pancakes/);
    await userEvent.click(
      within(await openBubbleSheet()).getByRole('button', {
        name: /^Review the recipe/,
      }),
    );
    expect(
      await screen.findByRole('radio', { name: /Standalone/ }),
    ).toBeChecked();
    expect(screen.getByRole('radio', { name: /Crepes/ })).not.toBeChecked();
    expect(
      screen.getByText('2 Recipes hidden by your Allergies'),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue('Fluffy pancakes')).toBeInTheDocument();
    expect(
      calls.find((c) => c.key === 'POST /api/recipes/plate-matches')?.body,
    ).toEqual({ dishTitle: 'Fluffy pancakes', ingredientIds: ['milk-id'] });
    // The row left with the Review.
    expect(recipeReads.getState().reads).toHaveLength(0);
  });

  it('keeps the card and its guesses when the holder is full', async () => {
    vi.stubGlobal('fetch', () => new Promise<Response>(() => {}));
    for (let i = 0; i < 5; i++)
      recipeReads.add({ kind: 'plate', title: `Dish ${i}`, token: 't' });
    vi.unstubAllGlobals();
    renderPlate();
    await scanThenDone();
    await pick(/Pancakes/);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Review or cancel one first.',
    );
    expect(await picker()).toBeInTheDocument();
    expect(getScanSession().scans).toHaveLength(1);
  });

  it('shows a translated error on a failed row, which Retry writes again', async () => {
    let attempts = 0;
    const calls = renderPlate({
      'POST /api/scan/plate/recipe': () =>
        ++attempts === 1
          ? Response.json(
              { code: 'scan.result_invalid', params: {} },
              { status: 502 },
            )
          : Response.json({ recipeDraftId: DRAFT_ID }),
    });
    await scanThenDone();
    await pick(/Pancakes/);
    await openBubbleSheet();
    expect(
      await screen.findByText("Couldn't write Pancakes"),
    ).toBeInTheDocument();
    await openBubbleSheet();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Retry writing Pancakes' }),
    );
    await waitFor(() =>
      expect(recipeReads.getState().reads[0].status).toBe('ready'),
    );
    expect(
      calls.filter((c) => c.key === 'POST /api/scan/plate/recipe'),
    ).toHaveLength(2);
    // A successful Retry opens the Recipe Draft like a first-time success.
    await userEvent.click(
      await screen.findByRole('button', {
        name: 'Review the recipe for Pancakes',
      }),
    );
    expect(
      await screen.findByDisplayValue('Fluffy pancakes'),
    ).toBeInTheDocument();
    expect(recipeReads.getState().reads).toHaveLength(0);
  });

  it('brings the card back with its guesses and the limit message when the server refuses at 20 Recipe Drafts', async () => {
    renderPlate({
      'POST /api/scan/plate/recipe': () =>
        Response.json(
          { code: 'recipe_drafts.limit_reached', params: { max: 20 } },
          { status: 409 },
        ),
    });
    await scanThenDone();
    await pick(/Pancakes/);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You already keep 20 Recipe Drafts.',
    );
    expect(await picker()).toBeInTheDocument();
    expect(getScanSession().scans[0]).toMatchObject({
      status: 'read',
      plateToken: 'token-1',
    });
    expect(recipeReads.getState().reads).toHaveLength(0);
    expect(screen.queryByText("Couldn't write Pancakes")).toBeNull();
  });

  it('Discard on a failed row removes it', async () => {
    renderPlate({
      'POST /api/scan/plate/recipe': () =>
        Response.json(
          { code: 'scan.result_invalid', params: {} },
          { status: 502 },
        ),
    });
    await scanThenDone();
    await pick(/Pancakes/);
    await openBubbleSheet();
    expect(
      await screen.findByText("Couldn't write Pancakes"),
    ).toBeInTheDocument();
    await openBubbleSheet();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Discard Pancakes' }),
    );
    expect(recipeReads.getState().reads).toHaveLength(0);
  });

  it('offers to read the photo again, not Retry, once the token is used up or expired, and the card returns to be read', async () => {
    const calls = renderPlate({
      'POST /api/scan/plate/recipe': () =>
        Response.json(
          { code: 'scan.plate_token_invalid', params: {} },
          { status: 400 },
        ),
    });
    await scanThenDone();
    await pick(/Pancakes/);
    await openBubbleSheet();
    expect(
      await screen.findByText("Couldn't write Pancakes"),
    ).toBeInTheDocument();
    await openBubbleSheet();
    expect(
      screen.queryByRole('button', { name: 'Retry writing Pancakes' }),
    ).toBeNull();
    await userEvent.click(
      await screen.findByRole('button', {
        name: 'Read the photo for Pancakes again',
      }),
    );
    expect(recipeReads.getState().reads).toHaveLength(0);
    // The photo is read again: a fresh Plate Scan request, with a new token on the card.
    await waitFor(() =>
      expect(getScanSession().scans[0]).toMatchObject({
        status: 'read',
        plateToken: 'token-2',
      }),
    );
    expect(calls.filter((c) => c.key === 'POST /api/scan/plate')).toHaveLength(
      2,
    );
  });

  it('cancels the request when a writing row is discarded, and asks before unloading while one is writing', async () => {
    let signal: AbortSignal | null | undefined;
    const { fetchMock } = stubApi({
      'POST /api/scan/plate': () => Response.json(dishes('token-1')),
    });
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/api/scan/plate/recipe')) {
        signal = init?.signal;
        return new Promise<Response>(() => {});
      }
      return fetchMock(input, init);
    });
    renderWithProviders(
      <>
        <Routes>
          <Route path="/scan" element={<ScanPage />} />
          <Route path="/scan/review" element={<ReviewOverviewPage />} />
        </Routes>
        <BackgroundHost recipeReads />
        <UnloadPrompt />
      </>,
      { route: '/scan?mode=plate' },
    );
    await scanThenDone();
    await pick(/Pancakes/);
    await openBubbleSheet();
    await openBubbleSheet();
    expect(await screen.findByText('Writing Pancakes…')).toBeInTheDocument();
    await waitFor(() => expect(signal).toBeTruthy());
    const leaving = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(leaving);
    expect(leaving.defaultPrevented).toBe(true);

    await openBubbleSheet();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Cancel writing Pancakes' }),
    );
    expect(signal?.aborted).toBe(true);
    expect(recipeReads.getState().reads).toHaveLength(0);
    const afterwards = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(afterwards);
    expect(afterwards.defaultPrevented).toBe(false);
  });
});

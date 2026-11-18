import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useNavigate } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/App';
import type { CatalogSearchResult } from '@/lib/catalog';
import type { ProposedLine } from '@/lib/scan';
import { preferenceSaves, stubSetupMember, Where } from '@/test/intro';
import { renderWithProviders } from '@/test/render';
import { closeBubbleSheet, openBubbleSheet } from '@/test/voiceDom';
import {
  flush,
  photoStack,
  selected,
  shutter,
  stackCount,
  takeScan,
} from '@/test/scan';

vi.mock('@/lib/camera', async () =>
  (await import('@/test/scan')).fakeCameraModule(),
);
vi.mock('@/lib/image', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/image')>()),
  resizeImage: () => Promise.resolve('data:image/jpeg;base64,YQ=='),
  cropToReceiptGuide: () => Promise.resolve('data:image/jpeg;base64,Y3JvcA=='),
}));

const catalogItem = (id: string, name: string): CatalogSearchResult => ({
  owner: 'catalog',
  amountScale: 'medium',
  id,
  name,
  defaultUnit: 'pcs',
  leafCategory: { id: `${id}-leaf`, name },
  parentCategory: {
    id: 'produce',
    name: 'Produce',
    aisle: { id: 'aisle', name: 'Produce' },
  },
  defaults: { expiryDays: 7, location: 'fridge' },
});

const line = (
  id: string,
  name: string,
  extra: Partial<ProposedLine> = {},
): ProposedLine => ({
  name,
  match: catalogItem(id, name),
  lowConfidence: false,
  quantity: 2,
  unit: 'pcs',
  expiryDate: null,
  sourceText: null,
  productDescription: null,
  ...extra,
});

/** Three things on the counter, one of them a doubtful read. */
const COUNTER = [
  line('tomato', 'Tomatoes'),
  line('onion', 'Onions'),
  line('courgette', 'Courgette', { lowConfidence: true }),
];

/** Two on the receipt, and a bag the Scan left out. */
const RECEIPT = [
  line('milk', 'Milk'),
  line('eggs', 'Eggs'),
  line('bag', 'SACOSA', { match: null, excluded: { reason: 'other' } }),
];

const SCAN_ROUTES = {
  'POST /api/scan/ingredients': () => Response.json({ lines: COUNTER }),
  'POST /api/scan/receipt': () => Response.json({ lines: RECEIPT }),
  'POST /api/pantry/batches/bulk': () => Response.json({ batches: [] }),
  'POST /api/scan/receipt/confirm': () =>
    Response.json({ batches: [], matchedShoppingItemIds: [] }),
};

/** The browser's Back button, which the memory router has no UI for. */
function BrowserBack() {
  const navigate = useNavigate();
  return <button onClick={() => navigate(-1)}>Browser back</button>;
}

const where = () => screen.getByLabelText('Where').textContent;

/** Opens the app at Set up or skip and taps Show me how. */
async function openSnap(routes: Parameters<typeof stubSetupMember>[0] = {}) {
  const calls = stubSetupMember({
    ...routes,
    routes: { ...SCAN_ROUTES, ...routes.routes },
  });
  renderWithProviders(
    <>
      <App />
      <Where />
      <BrowserBack />
    </>,
    { route: '/intro/setup' },
  );
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: /Show me how/ }));
  await screen.findByRole('radiogroup', { name: "What's in front of you?" });
  return { user, calls };
}

/** Snap's camera and `n` photos of what was picked: the shutter keeps shooting, each read in the background. */
async function snapPhotos(
  user: ReturnType<typeof userEvent.setup>,
  n = 1,
  pick?: string,
) {
  if (pick) await user.click(screen.getByRole('radio', { name: pick }));
  await user.click(screen.getByRole('link', { name: 'Camera' }));
  await waitFor(() => expect(shutter()).toBeInTheDocument());
  for (let i = 1; i <= n; i += 1) {
    await waitFor(() => expect(shutter()).toBeEnabled());
    takeScan();
    await waitFor(() => expect(stackCount()).toBe(i));
  }
  await flush();
}

const cards = () => screen.findAllByTestId('review-card');
const overview = () => screen.findByTestId('review-overview');

/** Opens the Setup overview from the camera's photo stack. */
async function openOverview(user: ReturnType<typeof userEvent.setup>) {
  await user.click(photoStack());
  await overview();
}

/** Opens the `index`th card (once read) in the Setup line editor. */
async function openCard(user: ReturnType<typeof userEvent.setup>, index = 0) {
  const results = await screen.findAllByTestId('card-result');
  await user.click(results[index]);
  return banner();
}

const banner = () => screen.findByTestId('setup-review-banner');
const bulkSaves = (calls: Awaited<ReturnType<typeof openSnap>>['calls']) =>
  calls.filter((c) => c.key === 'POST /api/pantry/batches/bulk');

describe('Setup 1: Snap, Setup overview, All set', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('takes Ingredients from Snap to a saved Pantry, All set with the count, and the Dashboard', async () => {
    const { user, calls } = await openSnap();

    // Only the camera is usable on Snap.
    for (const name of ['Home', 'Shopping', 'Pantry', 'Recipes'])
      expect(screen.getByRole('button', { name })).toHaveAttribute(
        'aria-disabled',
        'true',
      );
    await snapPhotos(user);
    // The shutter keeps shooting: the photo did not open an editor.
    expect(where()).toBe('/intro/camera?mode=ingredients');
    await openOverview(user);

    // The real Review overview in the Intro's frame: one card, the Intro's top row, and no app Dock.
    expect(where()).toBe('/intro/review');
    expect(await cards()).toHaveLength(1);
    expect(screen.getByText('1 of 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Skip' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull();
    expect(screen.queryByTestId('review-photos-input')).toBeNull();
    expect(document.querySelector('[data-ground="cream"]')).not.toBeNull();
    expect(document.querySelector('[data-ground="olive"]')).toBeNull();

    // Opening the card edits it in the real line editor, with Gator's count and the one to check.
    expect(await openCard(user)).toHaveTextContent('I spotted 3 things!');
    expect(
      within(await banner()).getByText(
        "Check the one I wasn't sure about. Tap any line to fix it.",
      ),
    ).toBeInTheDocument();
    expect(where()).toMatch(/^\/intro\/review\/.+/);
    expect(screen.getByRole('img', { name: 'Gator, happy' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Review' })).toBeInTheDocument();

    // Nothing opens by itself; tapping a row opens that line's sheet, and dismissing it keeps the line unconfirmed.
    expect(screen.queryByRole('dialog')).toBeNull();
    const lineRows = () =>
      screen
        .getAllByRole('button')
        .filter((button) => button.id.startsWith('review-line-'));
    expect(lineRows()).toHaveLength(3);
    await user.click(lineRows()[0]);
    expect(await screen.findByRole('dialog')).toHaveAccessibleName(/\S/);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    // Confirm closes the sheet and keeps the line in the list.
    await user.click(lineRows()[0]);
    const sheet = await screen.findByRole('dialog');
    await user.click(
      within(sheet).getByRole('button', { name: /^(Confirm|Done)$/ }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(lineRows()).toHaveLength(3);

    await user.click(screen.getByRole('button', { name: 'Add 3 to Pantry' }));

    // It was the last card and it was saved: on to Say it, which counts what is in the Pantry now.
    expect(await screen.findByText('3 things in your Pantry')).toBeVisible();
    expect(where()).toBe('/intro/say-it');
    await user.click(screen.getByRole('link', { name: 'Skip' }));

    // All set shows what was really saved; the Shopping List tile is left out at 0.
    expect(
      await screen.findByText(
        "You're all set! I'll keep an eye on your kitchen.",
      ),
    ).toBeInTheDocument();
    expect(where()).toBe('/intro/all-set');
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('in your Pantry')).toBeInTheDocument();
    expect(screen.queryByText('on your Shopping List')).toBeNull();
    expect(screen.getByRole('img', { name: 'Gator, proud' })).toBeVisible();

    const scan = calls.find((c) => c.key === 'POST /api/scan/ingredients');
    expect(scan?.body).toEqual({
      ingredientsImage: 'data:image/jpeg;base64,YQ==',
    });
    expect(bulkSaves(calls)).toHaveLength(1);
    expect(bulkSaves(calls)[0].body).toMatchObject({
      batches: [
        { ingredientId: 'tomato' },
        { ingredientId: 'onion' },
        { ingredientId: 'courgette' },
      ],
    });

    await user.click(screen.getByRole('button', { name: 'Go to my kitchen' }));
    expect(
      await screen.findByRole('link', { name: 'Settings' }),
    ).toBeInTheDocument();
    expect(where()).toBe('/');
    expect(preferenceSaves(calls)).toEqual([{ introDone: true }]);
  });

  it('opens the same line editor for a Receipt, with the count of what was read', async () => {
    const { user, calls } = await openSnap();
    await snapPhotos(user, 1, 'Receipt');
    await openOverview(user);

    // Two lines were read; the bag the Scan left out is not counted.
    expect(await openCard(user)).toHaveTextContent('I spotted 2 things!');
    expect(
      within(await banner()).getByText(
        "Nothing I wasn't sure about. Tap any line to fix it.",
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add 2 to Pantry' }));
    expect(await screen.findByText('2 things in your Pantry')).toBeVisible();
    await user.click(screen.getByRole('link', { name: 'Skip' }));
    expect(await screen.findByText('in your Pantry')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(
      calls.find((c) => c.key === 'POST /api/scan/receipt/confirm')?.body,
    ).toMatchObject({
      batches: [{ ingredientId: 'milk' }, { ingredientId: 'eggs' }],
    });
    expect(bulkSaves(calls)).toHaveLength(0);
  });

  it('gives one card per photo, returns to the overview after saving one, and Add all saves the rest', async () => {
    const { user, calls } = await openSnap();
    await snapPhotos(user, 3);
    await openOverview(user);
    expect(await cards()).toHaveLength(3);

    // Saving one card goes back to the overview with the others still there; the step does not end.
    await openCard(user);
    await user.click(screen.getByRole('button', { name: 'Add 3 to Pantry' }));
    expect(await overview()).toBeInTheDocument();
    expect(where()).toBe('/intro/review');
    expect(await cards()).toHaveLength(2);
    expect(bulkSaves(calls)).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Add all' }));

    // Every card saved: Say it, and both the pill and All set count the Batches of every save (3 + 3 + 3).
    expect(await screen.findByText('9 things in your Pantry')).toBeVisible();
    expect(where()).toBe('/intro/say-it');
    expect(bulkSaves(calls)).toHaveLength(3);
    await user.click(screen.getByRole('link', { name: 'Skip' }));
    expect(await screen.findByText('in your Pantry')).toBeInTheDocument();
    expect(screen.getByText('9')).toBeInTheDocument();
  });

  it('shows the photos taken and how many are being read on Snap, and keeps them when going back', async () => {
    let finish: (response: Response) => void = () => {};
    const { user } = await openSnap({
      routes: {
        'POST /api/scan/ingredients': () =>
          new Promise<Response>((resolve) => (finish = resolve)) as never,
      },
    });
    expect(screen.queryByTestId('snap-session')).toBeNull();
    await snapPhotos(user);

    // Back from the camera: Snap shows the shared Scan Session.
    await user.click(screen.getByRole('button', { name: 'Browser back' }));
    const session = await screen.findByTestId('snap-session');
    expect(session).toHaveTextContent('1 photo taken');
    expect(session).toHaveTextContent('1 still being read');

    // The overview shows the reading card; back to Snap and on to the camera keep the photo.
    await user.click(
      within(session).getByRole('button', { name: 'See your photos' }),
    );
    await overview();
    expect(await screen.findByText("Gator's reading this one…")).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Browser back' }));
    expect(await screen.findByTestId('snap-session')).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Camera' }));
    await waitFor(() => expect(shutter()).toBeInTheDocument());
    expect(stackCount()).toBe(1);

    finish(Response.json({ lines: COUNTER }));
    await user.click(screen.getByRole('button', { name: 'Browser back' }));
    await waitFor(() =>
      expect(screen.getByTestId('snap-session')).toHaveTextContent('all read'),
    );
  });

  it('keeps the photos when the overview goes back to the camera', async () => {
    const { user } = await openSnap();
    await snapPhotos(user, 2);
    await openOverview(user);
    await user.click(screen.getByRole('link', { name: 'Camera' }));
    await waitFor(() => expect(where()).toBe('/intro/camera?mode=ingredients'));
    expect(stackCount()).toBe(2);
  });

  it('stays on Snap when everything was discarded', async () => {
    const { user, calls } = await openSnap();
    await snapPhotos(user, 2);
    await openOverview(user);
    await cards();
    await user.click(screen.getByRole('button', { name: 'Discard all' }));

    expect(
      await screen.findByRole('radiogroup', {
        name: "What's in front of you?",
      }),
    ).toBeInTheDocument();
    expect(where()).toBe('/intro/snap');
    expect(screen.queryByTestId('snap-session')).toBeNull();
    expect(bulkSaves(calls)).toHaveLength(0);
  });

  it('stays on Snap when Add all saves nothing because no card had a savable line', async () => {
    const { user, calls } = await openSnap({
      routes: {
        'POST /api/scan/ingredients': () =>
          Response.json({
            lines: [
              line('bag', 'SACOSA', {
                match: null,
                excluded: { reason: 'other' },
              }),
            ],
          }),
      },
    });
    await snapPhotos(user);
    await openOverview(user);
    const addAll = screen.getByRole('button', { name: 'Add all' });
    await waitFor(() => expect(addAll).toBeEnabled());
    await user.click(addAll);

    expect(
      await screen.findByRole('radiogroup', {
        name: "What's in front of you?",
      }),
    ).toBeInTheDocument();
    expect(where()).toBe('/intro/snap');
    expect(bulkSaves(calls)).toHaveLength(0);
  });

  it('moves on after something was saved even when the last card is discarded', async () => {
    const { user } = await openSnap();
    await snapPhotos(user, 2);
    await openOverview(user);
    await openCard(user);
    await user.click(screen.getByRole('button', { name: 'Add 3 to Pantry' }));
    await overview();
    await user.click(screen.getByRole('button', { name: 'Remove photo' }));

    expect(await screen.findByText('3 things in your Pantry')).toBeVisible();
    expect(where()).toBe('/intro/say-it');
  });

  it('merges Receipt Sections into one card', async () => {
    const { user, calls } = await openSnap();
    await snapPhotos(user, 2, 'Receipt');
    await openOverview(user);
    await cards();
    await user.click(
      await screen.findByRole('button', { name: /merge with previous/i }),
    );
    expect(await cards()).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Add all' }));
    // Two sections of two lines each, one Receipt Scan.
    expect(await screen.findByText('4 things in your Pantry')).toBeVisible();
    const confirms = calls.filter(
      (c) => c.key === 'POST /api/scan/receipt/confirm',
    );
    expect(confirms).toHaveLength(1);
    expect((confirms[0].body as { batches: unknown[] }).batches).toHaveLength(
      4,
    );
  });

  it('skips from Snap, then Say it, to All set with no tiles, and Go to my kitchen still finishes the Intro', async () => {
    const { user, calls } = await openSnap();
    await user.click(screen.getByRole('link', { name: 'Skip' }));
    expect(where()).toBe('/intro/say-it');
    await user.click(await screen.findByRole('link', { name: 'Skip' }));

    expect(
      await screen.findByText(
        "You're all set! I'll keep an eye on your kitchen.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('in your Pantry')).toBeNull();
    expect(screen.queryByText('on your Shopping List')).toBeNull();
    expect(
      screen.getByText(
        'After each shop, snap the receipt. It ticks off your list too.',
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Go to my kitchen' }));
    expect(
      await screen.findByRole('link', { name: 'Settings' }),
    ).toBeInTheDocument();
    expect(preferenceSaves(calls)).toEqual([{ introDone: true }]);
  });

  it('skips from the Setup overview to Say it, then All set, without saving anything', async () => {
    const { user, calls } = await openSnap();
    await snapPhotos(user, 2);
    await openOverview(user);
    await cards();

    await user.click(screen.getByRole('button', { name: 'Skip' }));
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(
      await screen.findByText(
        "Now just tell me what's in the cupboard, or what to buy. Leave as many notes as you like.",
      ),
    ).toBeInTheDocument();
    expect(where()).toBe('/intro/say-it');
    expect(screen.queryByText(/in your Pantry$/)).toBeNull();
    await user.click(screen.getByRole('link', { name: 'Skip' }));
    expect(
      await screen.findByText(
        "You're all set! I'll keep an eye on your kitchen.",
      ),
    ).toBeInTheDocument();
    expect(where()).toBe('/intro/all-set');
    expect(screen.queryByText('in your Pantry')).toBeNull();
    expect(bulkSaves(calls)).toHaveLength(0);
  });

  it('goes back to the overview from the line editor, and Retake drops the card for the camera', async () => {
    const { user } = await openSnap();
    await snapPhotos(user, 2, 'Receipt');
    await openOverview(user);
    await openCard(user);

    await user.click(screen.getByRole('button', { name: /Review/ }));
    expect(await cards()).toHaveLength(2);

    await openCard(user);
    await user.click(screen.getByRole('button', { name: 'Retake' }));
    await waitFor(() => expect(where()).toBe('/intro/camera?mode=receipt'));
    expect(selected()).toEqual(['Receipt']);
    // Only the retaken card is dropped.
    expect(stackCount()).toBe(1);
  });

  it('shows the card as reading while the photo is read, then it opens in the line editor', async () => {
    let finish: (response: Response) => void = () => {};
    const { user } = await openSnap({
      routes: {
        'POST /api/scan/ingredients': () =>
          new Promise<Response>((resolve) => (finish = resolve)) as never,
      },
    });
    await snapPhotos(user);
    await openOverview(user);

    expect(await screen.findByText("Gator's reading this one…")).toBeVisible();
    expect(screen.queryByTestId('setup-review-banner')).toBeNull();
    expect(screen.getByRole('button', { name: 'Skip' })).toBeInTheDocument();

    finish(Response.json({ lines: COUNTER }));
    expect(await openCard(user)).toHaveTextContent('I spotted 3 things!');
  });

  it('says so when a photo could not be read, and Retake / Read again work on the card', async () => {
    let attempts = 0;
    const { user } = await openSnap({
      routes: {
        'POST /api/scan/ingredients': () => {
          attempts += 1;
          return attempts === 1
            ? Response.json({ code: 'internal', params: {} }, { status: 500 })
            : Response.json({ lines: COUNTER });
        },
      },
    });
    await snapPhotos(user);
    await openOverview(user);

    const [card] = await cards();
    await waitFor(() =>
      expect(card).toHaveTextContent("Couldn't read, retake"),
    );
    expect(screen.getByRole('img', { name: 'Gator, worried' })).toBeVisible();
    await user.click(within(card).getByRole('button', { name: 'Read again' }));
    expect(await openCard(user)).toHaveTextContent('I spotted 3 things!');
  });

  it('says so when the Scan Cap is reached, and Retake goes back to the camera', async () => {
    const { user } = await openSnap({
      routes: {
        'POST /api/scan/ingredients': () =>
          Response.json(
            { code: 'scan.cap_reached', params: { cap: 30 } },
            { status: 429 },
          ),
      },
    });
    await snapPhotos(user);
    await openOverview(user);

    const [card] = await cards();
    await waitFor(() =>
      expect(card).toHaveTextContent("Couldn't read, retake"),
    );
    expect(within(card).getByText('Daily scan limit reached')).toBeVisible();
    await user.click(within(card).getByRole('button', { name: 'Retake' }));
    await waitFor(() => expect(where()).toBe('/intro/camera?mode=ingredients'));
  });

  it('keeps the Scan screen to Setup: two modes, no Import, and Close goes back to Snap', async () => {
    const { user } = await openSnap();
    await user.click(screen.getByRole('link', { name: 'Camera' }));
    await waitFor(() => expect(shutter()).toBeInTheDocument());

    expect(
      within(screen.getByRole('radiogroup', { name: 'Scan mode' }))
        .getAllByRole('radio')
        .map((radio) => radio.getAttribute('aria-label') ?? radio.textContent),
    ).toEqual(['Ingredients', 'Receipt']);
    expect(
      screen.queryByRole('button', { name: 'Import from photos' }),
    ).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Close scanner' }));
    expect(
      await screen.findByRole('radiogroup', {
        name: "What's in front of you?",
      }),
    ).toBeInTheDocument();
    expect(where()).toBe('/intro/snap');
  });

  it('keeps the photos when Close goes back to Snap, without asking', async () => {
    const confirm = vi.spyOn(window, 'confirm');
    const { user } = await openSnap();
    await snapPhotos(user, 2);

    await user.click(screen.getByRole('button', { name: 'Close scanner' }));
    await screen.findByRole('radiogroup', { name: "What's in front of you?" });

    expect(where()).toBe('/intro/snap');
    expect(confirm).not.toHaveBeenCalled();
    expect(screen.getByText('2 photos taken')).toBeInTheDocument();
    confirm.mockRestore();
  });

  it('stays on All set and says so when the Intro could not be marked done', async () => {
    const { user, calls } = await openSnap({ finishFails: true });
    await user.click(screen.getByRole('link', { name: 'Skip' }));
    await user.click(await screen.findByRole('link', { name: 'Skip' }));
    await user.click(
      await screen.findByRole('button', { name: 'Go to my kitchen' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "We couldn't finish just now. Try again.",
    );
    expect(where()).toBe('/intro/all-set');
    expect(
      screen.getByRole('button', { name: 'Go to my kitchen' }),
    ).toBeEnabled();
    expect(preferenceSaves(calls)).toEqual([{ introDone: true }]);
  });

  it('is the normal Scan screen again once the Intro is done', async () => {
    const { user } = await openSnap();
    await user.click(screen.getByRole('link', { name: 'Skip' }));
    await user.click(await screen.findByRole('link', { name: 'Skip' }));
    await user.click(
      await screen.findByRole('button', { name: 'Go to my kitchen' }),
    );
    await user.click(await screen.findByRole('link', { name: 'Camera' }));
    await waitFor(() => expect(shutter()).toBeInTheDocument());

    expect(
      within(
        screen.getByRole('radiogroup', { name: 'Scan mode' }),
      ).getAllByRole('radio'),
    ).toHaveLength(5);
    expect(
      screen.getByRole('button', { name: 'Import from photos' }),
    ).toBeInTheDocument();
  });
  describe('Next and the Skip that asks first', () => {
    const SAY_IT_CALLOUT =
      "Now just tell me what's in the cupboard, or what to buy. Leave as many notes as you like.";

    /** Two photos taken, then back to Snap with them still in the Scan Session. */
    async function snapWithPhotos() {
      const opened = await openSnap();
      await snapPhotos(opened.user, 2);
      await opened.user.click(
        screen.getByRole('button', { name: 'Browser back' }),
      );
      await screen.findByTestId('snap-session');
      return opened;
    }

    it('shows no Next on Snap while nothing is unsaved, and Skip moves on with no confirm', async () => {
      const { user } = await openSnap();
      expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
      await user.click(screen.getByRole('link', { name: 'Skip' }));
      expect(where()).toBe('/intro/say-it');
      expect(screen.queryByText(/saved yet/)).toBeNull();
    });

    it('Next on Snap moves on to Say it and the photos wait in the app Review after the Intro', async () => {
      const { user } = await snapWithPhotos();
      await user.click(screen.getByRole('button', { name: 'Next' }));
      expect(await screen.findByText(SAY_IT_CALLOUT)).toBeInTheDocument();
      expect(where()).toBe('/intro/say-it');
      // The photos wait for the app's Review: Say it's strip is Voice Notes only.
      expect(screen.queryByRole('button', { name: /Open Review/ })).toBeNull();

      await user.click(screen.getByRole('link', { name: 'Skip' }));
      await user.click(
        await screen.findByRole('button', { name: 'Go to my kitchen' }),
      );
      await openBubbleSheet();
      expect(await screen.findByText('2 photos')).toBeInTheDocument();
      await closeBubbleSheet();
      await user.click(await screen.findByRole('link', { name: 'Camera' }));
      await waitFor(() => expect(shutter()).toBeInTheDocument());
      expect(stackCount()).toBe(2);
      await user.click(photoStack());
      expect(await cards()).toHaveLength(2);
      expect(screen.queryByTestId('setup-review-banner')).toBeNull();
    });

    it('Next on the overview moves on to Say it', async () => {
      const { user } = await openSnap();
      await snapPhotos(user, 2);
      await openOverview(user);
      await cards();
      await user.click(screen.getByRole('button', { name: 'Next' }));
      expect(await screen.findByText(SAY_IT_CALLOUT)).toBeInTheDocument();
      expect(where()).toBe('/intro/say-it');
    });

    it('Next in the line editor moves on to Say it', async () => {
      const { user } = await openSnap();
      await snapPhotos(user, 1);
      await openOverview(user);
      await openCard(user);
      await user.click(screen.getByRole('button', { name: 'Next' }));
      expect(await screen.findByText(SAY_IT_CALLOUT)).toBeInTheDocument();
      expect(where()).toBe('/intro/say-it');
    });

    it('Skip with unsaved photos asks first: cancel keeps them, confirm drops them and moves on', async () => {
      const { user } = await openSnap();
      await snapPhotos(user, 2);
      await openOverview(user);
      await cards();

      await user.click(screen.getByRole('button', { name: 'Skip' }));
      expect(
        screen.getByText(
          "Skip and lose these 2 photos? They haven't been saved yet.",
        ),
      ).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(screen.queryByText(/saved yet/)).toBeNull();
      expect(screen.getByRole('button', { name: 'Skip' })).toHaveFocus();
      expect(where()).toBe('/intro/review');
      expect(await cards()).toHaveLength(2);

      await user.click(screen.getByRole('button', { name: 'Skip' }));
      await user.click(screen.getByRole('button', { name: 'Confirm' }));
      expect(await screen.findByText(SAY_IT_CALLOUT)).toBeInTheDocument();
      expect(where()).toBe('/intro/say-it');
      expect(screen.queryByText(/in your Pantry$/)).toBeNull();
    });

    it('Skip on Snap with unsaved photos asks first, and confirming leaves the Scan Session empty', async () => {
      const { user } = await snapWithPhotos();
      await user.click(screen.getByRole('button', { name: 'Skip' }));
      expect(screen.getByText(/saved yet/)).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Confirm' }));
      expect(await screen.findByText(SAY_IT_CALLOUT)).toBeInTheDocument();

      await user.click(screen.getByRole('link', { name: 'Skip' }));
      await user.click(
        await screen.findByRole('button', { name: 'Go to my kitchen' }),
      );
      await user.click(await screen.findByRole('link', { name: 'Camera' }));
      await waitFor(() => expect(shutter()).toBeInTheDocument());
      expect(screen.queryByRole('button', { name: /^Review/ })).toBeNull();
      expect(stackCount()).toBe(0);
    });

    it('Skip in the line editor asks first too', async () => {
      const { user } = await openSnap();
      await snapPhotos(user, 1);
      await openOverview(user);
      await openCard(user);
      await user.click(screen.getByRole('button', { name: 'Skip' }));
      const ask = screen.getByText(/saved yet/);
      await user.click(
        within(ask.closest('[role="alert"]')!.parentElement!).getByRole(
          'button',
          { name: 'Confirm' },
        ),
      );
      expect(await screen.findByText(SAY_IT_CALLOUT)).toBeInTheDocument();
    });
  });
});

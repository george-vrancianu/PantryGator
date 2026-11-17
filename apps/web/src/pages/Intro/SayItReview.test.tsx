import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// The fake voice environment registers its mocks, so it comes before anything that reaches the microphone.
import {
  bubbleSays,
  openBubbleSheet,
  openReady,
  mic,
  resetVoiceEnvironment,
  stubVoiceFetch,
  talkButton,
  voiceAction,
  voiceIngredient,
} from '../../test/voice';
import { App } from '../../App';
import {
  goToSayIt,
  preferenceSaves,
  stubSetupMember,
  Where,
} from '../../test/intro';
import { renderWithProviders } from '../../test/render';
import { photoStack, shutter, stackCount, takeScan } from '../../test/scan';
import {
  pressDown,
  holdLongEnough,
  useVoiceTimers,
} from '../../test/voiceHold';

vi.mock('../../lib/camera', async () =>
  (await import('../../test/scan')).fakeCameraModule(),
);
vi.mock('../../lib/image', async (importActual) => ({
  ...(await importActual<typeof import('../../lib/image')>()),
  resizeImage: () => Promise.resolve('data:image/jpeg;base64,YQ=='),
  cropToReceiptGuide: () => Promise.resolve('data:image/jpeg;base64,Y3JvcA=='),
}));

/** A way back to Set up or skip, which the app has no link to once Setup is under way. */
function ToSetup() {
  const navigate = useNavigate();
  return (
    <button onClick={() => void navigate('/intro/setup')}>To Setup</button>
  );
}

const where = () => screen.getByLabelText('Where').textContent;

const rice = voiceIngredient('rice', 'Rice');
const tomatoes = voiceIngredient('tomatoes', 'Chopped tomatoes');
const milk = voiceIngredient('milk', 'Milk');

/** "We have rice and two tins of tomatoes. Put milk on the list." with no list named for the first two. */
const HEARD = {
  transcript: 'We have rice and two tins of tomatoes. Put milk on the list.',
  actions: [
    voiceAction({
      id: 'a1',
      target: 'pantry',
      op: 'add',
      text: 'rice',
      ingredient: rice,
      defaults: { location: 'cupboard' },
    }),
    voiceAction({
      id: 'a2',
      target: 'pantry',
      op: 'add',
      text: 'two tins of tomatoes',
      ingredient: tomatoes,
      defaults: { location: 'cupboard' },
      quantity: 2,
      unit: 'pcs',
    }),
    voiceAction({
      id: 'a3',
      target: 'shopping',
      op: 'add',
      text: 'milk',
      ingredient: milk,
    }),
  ],
};

const entry = (actionId: string, list: 'pantry' | 'shopping') => ({
  actionId,
  list,
  rowId: `row-${actionId}`,
  alreadyDone: false,
});

const APPLIED_ALL = {
  applied: [
    entry('a1', 'pantry'),
    entry('a2', 'pantry'),
    entry('a3', 'shopping'),
  ],
  skipped: [],
};

const VOICE_ROUTES = (
  heard: unknown = HEARD,
  applied: unknown = APPLIED_ALL,
) => ({
  'POST /api/voice': () => Response.json(heard, { status: 201 }),
  'POST /api/voice/apply': () => Response.json(applied, { status: 201 }),
});

type Options = Parameters<typeof stubSetupMember>[0];

/** The app at Say it, with a fake read of what was said. */
async function openSayIt(
  heard?: unknown,
  applied?: unknown,
  options: Options = {},
  route?: string,
) {
  const calls = stubSetupMember({
    ...options,
    routes: { ...VOICE_ROUTES(heard, applied), ...options?.routes },
  });
  const voice = stubVoiceFetch(globalThis.fetch as never);
  const { sent } = voice;
  renderWithProviders(
    <>
      <App />
      <Where />
      <ToSetup />
    </>,
    { route: route ?? '/intro/setup' },
  );
  if (!route) await goToSayIt();
  return { calls, sent, voice };
}

/** Holds the mic and lets go: one Voice Note goes to the Voice Inbox. */
async function record() {
  const button = await talkButton();
  pressDown(button);
  await screen.findByText("Gator's listening");
  await holdLongEnough();
  fireEvent.pointerUp(button);
}

/** Holds the mic, speaks (the fake read is canned) and lets go; Review is pressed in the strip. */
async function speak() {
  await record();
  // Nothing opens by itself: the note waits in the Voice Inbox strip until Review is pressed.
  return await openReady({ name: "Here's what I heard" });
}

const writes = (calls: ReturnType<typeof stubSetupMember>) =>
  calls.filter((call) => !call.key.startsWith('GET ')).map((c) => c.key);

describe('Setup 2: What Gator heard, Do these, All set', () => {
  beforeEach(() => {
    useVoiceTimers();
    resetVoiceEnvironment();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('goes from the hold to the Review, "Do these 3", All set with both counts and the Dashboard', async () => {
    const { calls, sent } = await openSayIt();
    const user = userEvent.setup();

    const button = await talkButton();
    pressDown(button);
    // Listening: the card with Gator, and the coach line over the scrim.
    expect(await screen.findByText("Gator's listening")).toBeVisible();
    await holdLongEnough();
    expect(screen.getByText('Keep holding while you talk.')).toBeVisible();
    expect(mic.start).toHaveBeenCalledTimes(1);
    // The browser asks for the microphone itself on the first hold; the app does not pre-ask.
    expect(mic.request).not.toHaveBeenCalled();
    fireEvent.pointerUp(button);

    expect(
      await screen.findByRole('button', {
        name: 'All read: 1 ready to review. Open Review',
      }),
    ).toBeVisible();
    expect(screen.queryByRole('dialog')).toBeNull();
    const review = await openReady({ name: "Here's what I heard" });
    expect(sent[0].get('defaultTarget')).toBe('pantry');
    expect(
      within(review).getByRole('img', { name: 'Gator, happy' }),
    ).toBeVisible();
    expect(
      within(review).getByText(
        'We have rice and two tins of tomatoes. Put milk on the list.',
      ),
    ).toBeVisible();
    // Grouped by list, each line an Add.
    const pantry = within(review).getByRole('region', { name: 'Pantry' });
    expect(pantry).toHaveTextContent('Rice');
    expect(pantry).toHaveTextContent('Chopped tomatoes');
    expect(within(pantry).getAllByText('Add')).toHaveLength(2);
    const shopping = within(review).getByRole('region', {
      name: 'Shopping List',
    });
    expect(shopping).toHaveTextContent('Milk');
    expect(within(shopping).getAllByText('Add')).toHaveLength(1);
    expect(
      within(review).getByText(
        'Nothing is saved until you say so. Tap a line to change it.',
      ),
    ).toBeVisible();
    // Nothing was written while the Review is open.
    expect(writes(calls)).toEqual(['POST /api/voice']);

    await user.click(
      within(review).getByRole('button', { name: 'Do these 3' }),
    );

    expect(
      await screen.findByText(
        "You're all set! I'll keep an eye on your kitchen.",
      ),
    ).toBeInTheDocument();
    expect(where()).toBe('/intro/all-set');
    const tiles = screen.getAllByRole('listitem');
    expect(tiles[0]).toHaveTextContent('2in your Pantry');
    expect(tiles[1]).toHaveTextContent('1on your Shopping List');

    // The Pantry's Batches and the Shopping Item go through the normal apply, each to its own list.
    const apply = calls.filter((c) => c.key === 'POST /api/voice/apply');
    expect(apply).toHaveLength(1);
    const body = apply[0].body as {
      actions: { id: string; target: string; op: string }[];
    };
    expect(body.actions.map((a) => [a.id, a.target, a.op])).toEqual([
      ['a1', 'pantry', 'add'],
      ['a2', 'pantry', 'add'],
      ['a3', 'shopping', 'add'],
    ]);

    await user.click(screen.getByRole('button', { name: 'Go to my kitchen' }));
    expect(
      await screen.findByRole('link', { name: 'Settings' }),
    ).toBeInTheDocument();
    expect(where()).toBe('/');
    expect(preferenceSaves(calls)).toEqual([{ introDone: true }]);
  });

  it('reads a bare "rice and tomatoes" as Pantry Batches and "milk on the list" as a Shopping Item', async () => {
    const { sent } = await openSayIt();
    const review = await speak();
    // The Pantry is the Default List, so nothing needs a list picked.
    expect(sent[0].get('defaultTarget')).toBe('pantry');
    expect(within(review).queryByText('Pick a list')).toBeNull();
    expect(
      within(review).getByRole('region', { name: 'Pantry' }),
    ).toHaveTextContent('Rice');
    expect(
      within(review).getByRole('region', { name: 'Shopping List' }),
    ).toHaveTextContent('Milk');
  });

  it('keeps the normal Review as it was when no Setup is involved (no Gator title, Apply N changes)', async () => {
    await openSayIt(
      undefined,
      undefined,
      {
        routes: {
          'GET /api/settings/preferences': () =>
            Response.json({ introDone: true, theme: null, locale: 'en' }),
        },
      },
      '/pantry',
    );
    const button = await talkButton();
    pressDown(button);
    await screen.findByText("Gator's listening");
    await holdLongEnough();
    fireEvent.pointerUp(button);
    const review = await openReady({ name: 'Review' });
    expect(
      within(review).queryByRole('img', { name: 'Gator, happy' }),
    ).toBeNull();
    expect(
      within(review).getByRole('button', { name: 'Apply 3 changes' }),
    ).toBeInTheDocument();
    expect(
      within(review).queryByText(/Nothing is saved until you say so/),
    ).toBeNull();
  });

  it('Discard closes the Review and stays on Say it with nothing saved', async () => {
    const { calls } = await openSayIt();
    const user = userEvent.setup();
    const review = await speak();

    await user.click(within(review).getByRole('button', { name: 'Discard' }));
    await user.click(await screen.findByRole('button', { name: 'Discard' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(where()).toBe('/intro/say-it');
    expect(screen.getByText('Hold the mic, talk, let go')).toBeVisible();
    expect(screen.queryByText(/in your Pantry$/)).toBeNull();
    expect(writes(calls)).toEqual(['POST /api/voice']);

    // Skipping from here shows no tiles: Discard left the counts alone.
    await user.click(screen.getByRole('link', { name: 'Skip' }));
    await screen.findByText(
      "You're all set! I'll keep an eye on your kitchen.",
    );
    expect(screen.queryByText('in your Pantry')).toBeNull();
    expect(screen.queryByText('on your Shopping List')).toBeNull();
  });

  it('shows only the Shopping List tile when Setup added nothing to the Pantry', async () => {
    const { calls } = await openSayIt(
      {
        transcript: 'Put milk on the list.',
        actions: [HEARD.actions[2]],
      },
      { applied: [entry('a3', 'shopping')], skipped: [] },
    );
    const user = userEvent.setup();
    const review = await speak();
    await user.click(
      within(review).getByRole('button', { name: 'Do this one' }),
    );

    await screen.findByText(
      "You're all set! I'll keep an eye on your kitchen.",
    );
    expect(screen.getByText('on your Shopping List')).toBeVisible();
    expect(screen.queryByText('in your Pantry')).toBeNull();
    expect(calls.filter((c) => c.key === 'POST /api/voice/apply')).toHaveLength(
      1,
    );
  });

  it('counts only what the server applied when some actions were skipped', async () => {
    await openSayIt(HEARD, {
      applied: [entry('a1', 'pantry'), entry('a3', 'shopping')],
      skipped: [{ id: 'a2', reason: 'other' }],
    });
    const user = userEvent.setup();
    const review = await speak();
    await user.click(
      within(review).getByRole('button', { name: 'Do these 3' }),
    );

    await screen.findByText(
      "You're all set! I'll keep an eye on your kitchen.",
    );
    const tiles = screen.getAllByRole('listitem');
    expect(tiles[0]).toHaveTextContent('1in your Pantry');
    expect(tiles[1]).toHaveTextContent('1on your Shopping List');
  });

  it('stays in the Review with its edits when the save fails, and counts nothing', async () => {
    const { calls } = await openSayIt(HEARD, undefined, {
      routes: {
        'POST /api/voice/apply': () =>
          Response.json({ code: 'unknown', params: {} }, { status: 500 }),
      },
    });
    const user = userEvent.setup();
    const review = await speak();
    await user.click(
      within(review).getByRole('button', { name: 'Do these 3' }),
    );

    expect(await within(review).findByRole('alert')).toBeVisible();
    expect(where()).toBe('/intro/say-it');
    expect(
      within(review).getByRole('button', { name: 'Do these 3' }),
    ).toBeEnabled();
    expect(calls.some((c) => c.key === 'PUT /api/settings/preferences')).toBe(
      false,
    );
  });

  it('lands back on Say it when the note reads nothing', async () => {
    await openSayIt({ transcript: 'um', actions: [] });
    const user = userEvent.setup();
    const review = await speak();
    // Nothing to do: only a Discard, no "Do these 0".
    expect(
      within(review).queryByRole('button', { name: /Do these/ }),
    ).toBeNull();
    await user.click(within(review).getByRole('button', { name: 'Discard' }));
    await user.click(await screen.findByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(where()).toBe('/intro/say-it');
  });

  it('shows the Voice Inbox strip, not the callout, while Gator reads the note', async () => {
    await openSayIt(undefined, undefined, {
      routes: { 'POST /api/voice': () => new Promise<Response>(() => {}) },
    });
    await record();
    expect(
      await screen.findByRole('button', {
        name: 'Gator is working: 1 being read. Open Review',
      }),
    ).toBeVisible();
    expect(screen.queryByText('Hold the mic, talk, let go')).toBeNull();
  });

  it('asks before Skip drops a note Gator is still reading, and a late answer does not bring it back', async () => {
    let answer: (response: Response) => void = () => {};
    await openSayIt(undefined, undefined, {
      routes: {
        'POST /api/voice': () =>
          new Promise<Response>((resolve) => {
            answer = resolve;
          }),
      },
    });
    const user = userEvent.setup();
    expect(screen.getByRole('link', { name: 'Skip' })).toBeVisible();
    await record();
    await screen.findByRole('button', {
      name: 'Gator is working: 1 being read. Open Review',
    });
    expect(screen.queryByRole('link', { name: 'Skip' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Skip' }));
    expect(
      screen.getByText(
        "Skip and lose this Voice Note? It hasn't been applied yet.",
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Skip' })).toHaveFocus();
    expect(where()).toBe('/intro/say-it');
    expect(
      screen.getByRole('button', {
        name: 'Gator is working: 1 being read. Open Review',
      }),
    ).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Skip' }));
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(
      await screen.findByText(
        "You're all set! I'll keep an eye on your kitchen.",
      ),
    ).toBeInTheDocument();
    expect(where()).toBe('/intro/all-set');

    // The read finishes after the drop: the note must not land in the Voice Inbox.
    const late = Response.json(HEARD, { status: 201 });
    const bodyRead = new Promise<void>((resolve) => {
      const read = late.json.bind(late);
      late.json = async () => {
        try {
          return await read();
        } finally {
          resolve();
        }
      };
    });
    await act(async () => {
      answer(late);
      await bodyRead;
      // Let the client's continuation after the body settle, so a wrongly landing note would show.
      for (let i = 0; i < 20; i += 1) await Promise.resolve();
    });
    await user.click(screen.getByRole('button', { name: 'Go to my kitchen' }));
    await screen.findByRole('link', { name: 'Settings' });
    expect(screen.queryByRole('button', { name: /Open Review/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Open Review/ })).toBeNull();
  });

  it('keeps a note that cannot be read in the Voice Inbox with Retry and Discard', async () => {
    await openSayIt(undefined, undefined, {
      routes: {
        'POST /api/voice': () =>
          Response.json({ code: 'unknown', params: {} }, { status: 500 }),
      },
    });
    const user = userEvent.setup();
    await record();
    expect(await bubbleSays('1 could not be read')).toBeVisible();
    expect(
      screen.queryByRole('dialog', { name: "Here's what I heard" }),
    ).toBeNull();
    expect(where()).toBe('/intro/say-it');

    await user.click(screen.getByRole('button', { name: /Open Review/ }));
    const sheet = within(await screen.findByRole('dialog', { name: 'Review' }));
    expect(sheet.getByRole('button', { name: /^Retry:/ })).toBeVisible();
    expect(sheet.getByRole('button', { name: /^Discard/ })).toBeVisible();
  });

  it('keeps a note that heard nothing until it is retried or discarded', async () => {
    await openSayIt({ transcript: '', actions: [] });
    await record();
    expect(await bubbleSays('1 could not be read')).toBeVisible();
    await openBubbleSheet();
    expect(await screen.findByText(/^Voice Note · 0:\d\d$/)).toBeVisible();
    expect(
      await screen.findByText(/Didn't catch anything, try again/),
    ).toBeVisible();
    // It no longer leaves on its own.
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(screen.getByText(/^Voice Note · 0:\d\d$/)).toBeVisible();
    expect(where()).toBe('/intro/say-it');
  });
});

describe('Setup 2: the Voice Cap', () => {
  beforeEach(() => {
    useVoiceTimers();
    resetVoiceEnvironment();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("says so when the day's Voice Notes are used up, and stays on Say it", async () => {
    const { calls } = await openSayIt(undefined, undefined, {
      routes: {
        'POST /api/voice': () =>
          Response.json(
            { code: 'voice.cap_reached', params: { cap: 30 } },
            { status: 429 },
          ),
      },
    });
    await record();
    expect(await bubbleSays('1 could not be read')).toBeVisible();

    // The next press is refused up front, as in the app: no Listening card, the cap in the Voice Inbox.
    const button = await talkButton();
    pressDown(button);
    await holdLongEnough();
    fireEvent.pointerUp(button);
    await bubbleSays('2 could not be read');
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: /Open Review/ }));
    const sheet = within(await screen.findByRole('dialog', { name: 'Review' }));
    expect(sheet.getAllByText(/today's 30 Voice Notes/).length).toBeGreaterThan(
      0,
    );
    expect(
      screen.queryByRole('dialog', { name: "Here's what I heard" }),
    ).toBeNull();
    expect(where()).toBe('/intro/say-it');
    expect(writes(calls)).toEqual(['POST /api/voice']);
  });
});

describe('Setup: counts across both steps', () => {
  beforeEach(() => {
    useVoiceTimers();
    resetVoiceEnvironment();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('adds Say it to what Snap saved, and starts again from zero when Setup is resumed', async () => {
    const lines = [
      {
        name: 'Tomatoes',
        match: voiceIngredient('tomato', 'Tomatoes'),
        lowConfidence: false,
        quantity: 2,
        unit: 'pcs',
        expiryDate: null,
        sourceText: null,
        productDescription: null,
      },
      {
        name: 'Onions',
        match: voiceIngredient('onion', 'Onions'),
        lowConfidence: false,
        quantity: 1,
        unit: 'pcs',
        expiryDate: null,
        sourceText: null,
        productDescription: null,
      },
    ];
    const { calls } = await openSayIt(
      undefined,
      undefined,
      {
        routes: {
          'POST /api/scan/ingredients': () => Response.json({ lines }),
          'POST /api/pantry/batches/bulk': () => Response.json({ batches: [] }),
        },
      },
      '/intro/setup',
    );
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: /Show me how/ }),
    );
    await screen.findByRole('radiogroup', { name: "What's in front of you?" });
    await user.click(screen.getByRole('link', { name: 'Camera' }));
    await waitFor(() => expect(shutter()).toBeInTheDocument());
    takeScan();
    await waitFor(() => expect(stackCount()).toBe(1));
    await user.click(photoStack());
    await user.click((await screen.findAllByTestId('card-result'))[0]);
    await user.click(
      await screen.findByRole('button', { name: 'Add 2 to Pantry' }),
    );
    expect(await screen.findByText('2 things in your Pantry')).toBeVisible();

    const review = await speak();
    await user.click(
      within(review).getByRole('button', { name: 'Do these 3' }),
    );

    await screen.findByText(
      "You're all set! I'll keep an eye on your kitchen.",
    );
    const tiles = screen.getAllByRole('listitem');
    // Snap's 2 and Say it's 2 Batches, and the Shopping Item.
    expect(tiles[0]).toHaveTextContent('4in your Pantry');
    expect(tiles[1]).toHaveTextContent('1on your Shopping List');
    expect(
      calls.filter((c) => c.key === 'POST /api/pantry/batches/bulk'),
    ).toHaveLength(1);

    // Setup started again from the top counts from zero.
    await user.click(screen.getByRole('button', { name: 'To Setup' }));
    await user.click(
      await screen.findByRole('button', { name: /Show me how/ }),
    );
    await user.click(await screen.findByRole('link', { name: 'Skip' }));
    expect(screen.queryByText(/in your Pantry$/)).toBeNull();
    await user.click(await screen.findByRole('link', { name: 'Skip' }));
    await screen.findByText(
      "You're all set! I'll keep an eye on your kitchen.",
    );
    expect(screen.queryByText('in your Pantry')).toBeNull();
    expect(screen.queryByText('on your Shopping List')).toBeNull();
  });
});

describe('Setup 2: several Voice Notes', () => {
  beforeEach(() => {
    useVoiceTimers();
    resetVoiceEnvironment();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const riceNote = {
    transcript: 'We have rice.',
    actions: [HEARD.actions[0]],
  };
  const eggs = voiceIngredient('eggs', 'Eggs');
  const eggsNote = {
    transcript: 'We have eggs.',
    actions: [
      voiceAction({
        id: 'b1',
        target: 'pantry',
        op: 'add',
        text: 'eggs',
        ingredient: eggs,
        defaults: { location: 'fridge' },
      }),
    ],
  };

  /** Two notes read in turn: the first answer, then the second. */
  const twoNotes = (applies: unknown[]) => {
    const heard = [riceNote, eggsNote];
    let read = 0;
    let applied = 0;
    return {
      routes: {
        'POST /api/voice': () =>
          Response.json(heard[read++ % heard.length], { status: 201 }),
        'POST /api/voice/apply': () =>
          Response.json(applies[applied++], { status: 201 }),
      },
    };
  };
  const RICE_APPLIED = { applied: [entry('a1', 'pantry')], skipped: [] };
  const EGGS_APPLIED = { applied: [entry('b1', 'pantry')], skipped: [] };

  async function twoReady(applies: unknown[]) {
    const setup = await openSayIt(undefined, undefined, twoNotes(applies));
    await record();
    await screen.findByRole('button', {
      name: 'All read: 1 ready to review. Open Review',
    });
    await record();
    await bubbleSays('All read: 2 ready to review');
    return setup;
  }

  it('adds the counts of every apply, moving on only once the Voice Inbox is empty', async () => {
    await twoReady([RICE_APPLIED, EGGS_APPLIED]);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /Open Review/ }));
    const sheet = within(await screen.findByRole('dialog', { name: 'Review' }));
    await user.click(sheet.getAllByRole('button', { name: /^Review:/ })[1]);
    const first = await screen.findByRole('dialog', {
      name: "Here's what I heard",
    });
    await user.click(
      within(first).getByRole('button', { name: 'Do this one' }),
    );

    // One note is still waiting: stay on Say it, with the first apply counted.
    expect(await screen.findByText('1 thing in your Pantry')).toBeVisible();
    expect(where()).toBe('/intro/say-it');

    await openReady({ name: "Here's what I heard" });
    const second = await screen.findByRole('dialog', {
      name: "Here's what I heard",
    });
    await user.click(
      within(second).getByRole('button', { name: 'Do this one' }),
    );

    await screen.findByText(
      "You're all set! I'll keep an eye on your kitchen.",
    );
    expect(where()).toBe('/intro/all-set');
    expect(screen.getAllByRole('listitem')[0]).toHaveTextContent(
      '2in your Pantry',
    );
  });

  it('counts Review all as one apply of every note', async () => {
    const { calls } = await twoReady([
      {
        applied: [entry('a1', 'pantry'), entry('b1', 'pantry')],
        skipped: [],
      },
    ]);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /Open Review/ }));
    const sheet = within(await screen.findByRole('dialog', { name: 'Review' }));
    await user.click(sheet.getByRole('button', { name: 'Review all (2)' }));
    const review = await screen.findByRole('dialog', {
      name: "Here's what I heard",
    });
    await user.click(
      within(review).getByRole('button', { name: 'Do these 2' }),
    );

    await screen.findByText(
      "You're all set! I'll keep an eye on your kitchen.",
    );
    expect(screen.getAllByRole('listitem')[0]).toHaveTextContent(
      '2in your Pantry',
    );
    expect(calls.filter((c) => c.key === 'POST /api/voice/apply')).toHaveLength(
      1,
    );
  });

  it('does not count skipped or already-done entries', async () => {
    await twoReady([
      {
        applied: [
          entry('a1', 'pantry'),
          { ...entry('b1', 'pantry'), alreadyDone: true },
        ],
        skipped: [{ id: 'c1', reason: 'other' }],
      },
    ]);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Open Review/ }));
    const sheet = within(await screen.findByRole('dialog', { name: 'Review' }));
    await user.click(sheet.getByRole('button', { name: 'Review all (2)' }));
    const review = await screen.findByRole('dialog', {
      name: "Here's what I heard",
    });
    await user.click(
      within(review).getByRole('button', { name: 'Do these 2' }),
    );

    await screen.findByText(
      "You're all set! I'll keep an eye on your kitchen.",
    );
    expect(screen.getAllByRole('listitem')[0]).toHaveTextContent(
      '1in your Pantry',
    );
  });

  it('moves on when the rest is discarded after something was applied', async () => {
    await twoReady([RICE_APPLIED]);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Open Review/ }));
    const sheet = within(await screen.findByRole('dialog', { name: 'Review' }));
    await user.click(sheet.getAllByRole('button', { name: /^Review:/ })[1]);
    const first = await screen.findByRole('dialog', {
      name: "Here's what I heard",
    });
    await user.click(
      within(first).getByRole('button', { name: 'Do this one' }),
    );
    await screen.findByText('1 thing in your Pantry');

    await openReady({ name: "Here's what I heard" });
    const second = await screen.findByRole('dialog', {
      name: "Here's what I heard",
    });
    await user.click(within(second).getByRole('button', { name: 'Discard' }));
    await user.click(await screen.findByRole('button', { name: 'Discard' }));

    await screen.findByText(
      "You're all set! I'll keep an eye on your kitchen.",
    );
    expect(screen.getAllByRole('listitem')[0]).toHaveTextContent(
      '1in your Pantry',
    );
  });

  it('stays on Say it when the only apply saved nothing new', async () => {
    const { calls } = await twoReady([
      {
        applied: [{ ...entry('a1', 'pantry'), alreadyDone: true }],
        skipped: [],
      },
    ]);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Open Review/ }));
    const sheet = within(await screen.findByRole('dialog', { name: 'Review' }));
    await user.click(sheet.getAllByRole('button', { name: /^Review:/ })[1]);
    const first = await screen.findByRole('dialog', {
      name: "Here's what I heard",
    });
    await user.click(
      within(first).getByRole('button', { name: 'Do this one' }),
    );
    await waitFor(() =>
      expect(
        calls.filter((c) => c.key === 'POST /api/voice/apply'),
      ).toHaveLength(1),
    );

    await openReady({ name: "Here's what I heard" });
    const second = await screen.findByRole('dialog', {
      name: "Here's what I heard",
    });
    await user.click(within(second).getByRole('button', { name: 'Discard' }));
    await user.click(await screen.findByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    expect(where()).toBe('/intro/say-it');
    expect(screen.getByText('Hold the mic, talk, let go')).toBeVisible();
  });

  it('stays on Say it when every note is discarded', async () => {
    const { calls } = await twoReady([]);
    const user = userEvent.setup();
    for (const remaining of [2, 1]) {
      const review = within(await openBubbleSheet());
      await user.click(
        review.getAllByRole('button', { name: /^Review:/ })[
          remaining === 2 ? 1 : 0
        ],
      );
      const note = await screen.findByRole('dialog', {
        name: "Here's what I heard",
      });
      await user.click(within(note).getByRole('button', { name: 'Discard' }));
      await user.click(await screen.findByRole('button', { name: 'Discard' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    }

    expect(where()).toBe('/intro/say-it');
    expect(screen.getByText('Hold the mic, talk, let go')).toBeVisible();
    expect(writes(calls)).toEqual(['POST /api/voice', 'POST /api/voice']);
  });
});

describe('Setup 2: Next and the Skip that asks first', () => {
  beforeEach(() => {
    useVoiceTimers();
    resetVoiceEnvironment();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('shows no Next while the Voice Inbox is empty, and Skip moves on with no confirm', async () => {
    await openSayIt();
    const user = userEvent.setup();
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
    await user.click(screen.getByRole('link', { name: 'Skip' }));
    expect(
      await screen.findByText(
        "You're all set! I'll keep an eye on your kitchen.",
      ),
    ).toBeInTheDocument();
    expect(where()).toBe('/intro/all-set');
    expect(screen.queryByText(/applied yet/)).toBeNull();
  });

  it('Next moves on to All set, and the note waits in the Voice Inbox on the Dashboard', async () => {
    await openSayIt();
    const user = userEvent.setup();
    await record();
    await screen.findByRole('button', {
      name: 'All read: 1 ready to review. Open Review',
    });
    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(
      await screen.findByText(
        "You're all set! I'll keep an eye on your kitchen.",
      ),
    ).toBeInTheDocument();
    expect(where()).toBe('/intro/all-set');
    await user.click(screen.getByRole('button', { name: 'Go to my kitchen' }));
    await screen.findByRole('link', { name: 'Settings' });
    expect(
      await screen.findByRole('button', {
        name: 'All read: 1 ready to review. Open Review',
      }),
    ).toBeVisible();
  });

  it('Skip with a ready note asks first: Cancel keeps it, Confirm drops it and moves on', async () => {
    await openSayIt();
    const user = userEvent.setup();
    await record();
    await screen.findByRole('button', {
      name: 'All read: 1 ready to review. Open Review',
    });

    await user.click(screen.getByRole('button', { name: 'Skip' }));
    expect(
      screen.getByText(
        "Skip and lose this Voice Note? It hasn't been applied yet.",
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText(/applied yet/)).toBeNull();
    expect(
      screen.getByRole('button', {
        name: 'All read: 1 ready to review. Open Review',
      }),
    ).toBeVisible();
    expect(where()).toBe('/intro/say-it');

    await user.click(screen.getByRole('button', { name: 'Skip' }));
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(
      await screen.findByText(
        "You're all set! I'll keep an eye on your kitchen.",
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Go to my kitchen' }));
    await screen.findByRole('link', { name: 'Settings' });
    expect(screen.queryByRole('button', { name: /Open Review/ })).toBeNull();
  });

  it('names the number of notes that would be lost', async () => {
    const riceNote = {
      transcript: 'We have rice.',
      actions: [HEARD.actions[0]],
    };
    await openSayIt(riceNote);
    const user = userEvent.setup();
    await record();
    await screen.findByRole('button', {
      name: 'All read: 1 ready to review. Open Review',
    });
    await record();
    await bubbleSays('All read: 2 ready to review');
    await user.click(screen.getByRole('button', { name: 'Skip' }));
    expect(
      screen.getByText(
        "Skip and lose these 2 Voice Notes? They haven't been applied yet.",
      ),
    ).toBeInTheDocument();
  });
});

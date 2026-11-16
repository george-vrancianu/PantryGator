import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
// The fake voice environment registers its mocks, so it comes before anything that reaches the microphone.
import {
  announcements,
  bubbleButton,
  mic,
  openBubbleSheet,
  openReady,
  resetVoiceEnvironment,
  stubVoiceFetch,
  talkButton,
  voiceAction,
  voiceIngredient,
} from '../../test/voice';
import {
  holdLongEnough,
  pressDown,
  useVoiceTimers,
} from '../../test/voiceHold';
import { Link, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, stubApi } from '../../test/render';
import { AppLayout } from '../AppLayout';
import en from '../../i18n/locales/en/voice.json';
import ro from '../../i18n/locales/ro/voice.json';
import da from '../../i18n/locales/da/voice.json';

const bread = voiceIngredient('ing-bread', 'Bread');
const heard = (text = 'got the bread') => ({
  transcript: text,
  actions: [
    voiceAction({
      target: 'shopping',
      op: 'check',
      text: 'bread',
      ingredient: bread,
    }),
  ],
});

function renderAt(route = '/shopping') {
  return renderWithProviders(
    <Routes>
      <Route element={<AppLayout />}>
        <Route
          path="/shopping"
          element={<Link to="/pantry">to the pantry</Link>}
        />
        <Route path="/pantry" element={<p>pantry page</p>} />
      </Route>
    </Routes>,
    { route },
  );
}

describe('the Voice Inbox strip', () => {
  let fake: ReturnType<typeof stubVoiceFetch>;
  let applied: Record<string, unknown>[];

  beforeEach(() => {
    useVoiceTimers();
    resetVoiceEnvironment();
    applied = [];
    const { fetchMock } = stubApi({
      'GET /api/voice/config': () => Response.json({ configured: true }),
      'GET /api/catalog/search': () => Response.json({ results: [bread] }),
      'GET /api/catalog/aisles': () => Response.json({ aisles: [] }),
      'POST /api/voice/apply': () =>
        Response.json(
          {
            applied: [
              {
                actionId: 'a1',
                list: 'shopping',
                rowId: 'r1',
                alreadyDone: false,
              },
            ],
            skipped: [],
          },
          { status: 201 },
        ),
    });
    fake = stubVoiceFetch(fetchMock, (input, init) => {
      if (String(input).endsWith('/voice/apply')) {
        applied.push(JSON.parse(init?.body as string) as never);
      }
    });
    fake.holdReads();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  /** Holds the mic, lets go, and waits for the upload to be on its way (or queued). */
  async function speak(reads?: number) {
    const button = await talkButton();
    pressDown(button);
    await screen.findByText("Gator's listening");
    await holdLongEnough();
    fireEvent.pointerUp(button);
    if (reads !== undefined) {
      await waitFor(() => expect(fake.reads).toHaveLength(reads));
    }
  }
  const answer = (index: number) =>
    fake.reads[index].resolve(Response.json(heard(), { status: 201 }));
  /** The Gator bubble's accessible name, as a regex-free exact string match. */
  const bubbleNamed = (sentence: string) =>
    screen.findByRole('button', { name: `${sentence}. Open Review` });
  const noBubble = () =>
    expect(screen.queryByRole('button', { name: /Open Review/ })).toBeNull();

  it('shows nothing when the Voice Inbox is empty and while recording', async () => {
    renderAt();
    await talkButton();
    noBubble();

    await speak(1);
    expect(await bubbleNamed('Gator is working: 1 being read')).toBeVisible();

    const button = await talkButton();
    pressDown(button);
    await screen.findByText("Gator's listening");
    await holdLongEnough();
    noBubble();
  });

  it('records while others are read, two at a time, and the rest wait in order', async () => {
    renderAt();
    await speak(1);
    await speak(2);
    expect(await bubbleNamed('Gator is working: 2 being read')).toBeVisible();

    await speak();
    expect(await bubbleNamed('Gator is working: 3 being read')).toBeVisible();
    // The third waits: still two uploads.
    expect(fake.reads).toHaveLength(2);

    answer(0);
    await waitFor(() => expect(fake.reads).toHaveLength(3));
    expect(await bubbleNamed('1 ready to review')).toBeVisible();
    expect(screen.getByTestId('badge-reading')).toHaveTextContent('2');
  });

  it('keeps the bubble Gator on its Signature while a note is read, then rests on idle once it is ready', async () => {
    renderAt();
    await speak(1);
    await bubbleNamed('Gator is working: 1 being read');
    const gator = () => bubbleButton().querySelector('img[data-mood]');
    expect(gator()).toHaveAttribute('data-mood', 'thinking');
    expect(gator()).toHaveAttribute('data-motion', 'signature');

    answer(0);
    await waitFor(() => expect(gator()).toHaveAttribute('data-mood', 'happy'));
    expect(gator()).toHaveAttribute('data-motion', 'idle');
  });

  it('opens a ready note from its row in the Review sheet, and the bubble steps aside while a sheet is up', async () => {
    renderAt();
    await speak(1);
    await speak(2);

    answer(1);
    expect(await bubbleNamed('1 ready to review')).toBeVisible();

    const dialog = await openReady();
    expect(dialog).toHaveTextContent('What I heard');
    noBubble();
  });

  it('opens the oldest ready note from the sheet when several are ready, and Apply removes only that note', async () => {
    renderAt();
    await speak(1);
    await speak(2);
    fake.reads[1].resolve(Response.json(heard('second note'), { status: 201 }));
    fake.reads[0].resolve(Response.json(heard('first note'), { status: 201 }));
    await bubbleNamed('All read: 2 ready to review');

    await userEvent.click(screen.getByRole('button', { name: /Open Review/ }));
    const sheet = within(await screen.findByRole('dialog'));
    await userEvent.click(
      sheet.getAllByRole('button', { name: /^Review: / })[1],
    );
    const dialog = within(
      await screen.findByRole('dialog', { name: 'Review' }),
    );
    // The oldest is the first recorded, although the second was answered first.
    await userEvent.click(dialog.getByRole('button', { name: /What I heard/ }));
    expect(await dialog.findByText(/first note/)).toBeVisible();

    await userEvent.click(
      dialog.getByRole('button', { name: 'Apply 1 change' }),
    );
    await waitFor(() => expect(applied).toHaveLength(1));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // The other note is still there, ready.
    await openBubbleSheet();
    expect(await screen.findByText('second note')).toBeVisible();
    expect(screen.getAllByText(/Ready to review$/).length).toBeGreaterThan(0);
  });

  it('opens the sheet for any mix but one ready note, with a row per note, newest first', async () => {
    renderAt();
    await speak(1);
    await speak(2);
    await speak();
    // Nothing ready yet: the strip offers Open, and the sheet lists the notes being read.
    await userEvent.click(
      await screen.findByRole('button', { name: /Open Review/ }),
    );
    let sheet = within(await screen.findByRole('dialog', { name: 'Review' }));
    let rows = sheet.getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    rows.forEach((row) => {
      expect(row).toHaveTextContent(/Voice Note · 0:\d\d/);
      expect(row).toHaveTextContent('Shopping List');
      expect(row).toHaveTextContent('Being read');
      expect(
        within(row).getByRole('button', { name: /^Cancel/ }),
      ).toBeVisible();
    });
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    // One ready note: its row's Review opens it, and the sheet goes.
    answer(0);
    expect(await openReady()).toBeVisible();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });

  it('shows ready rows with their transcript and Review, and opens that note and closes the sheet', async () => {
    renderAt();
    await speak(1);
    await speak(2);
    answer(0);
    fake.reads[1].resolve(Response.json(heard('second note'), { status: 201 }));
    await userEvent.click(
      await screen.findByRole('button', { name: /Open Review/ }),
    );
    const sheet = within(await screen.findByRole('dialog', { name: 'Review' }));
    const rows = sheet.getAllByRole('listitem');
    // Newest first.
    expect(rows[1]).toHaveTextContent('got the bread');
    expect(rows[0]).toHaveTextContent('second note');
    expect(rows[0]).toHaveTextContent('Ready to review');
    expect(
      within(rows[0]).queryByRole('button', { name: /^Cancel/ }),
    ).toBeNull();

    await userEvent.click(
      within(rows[0]).getByRole('button', { name: /^Review/ }),
    );
    const dialog = within(await screen.findByRole('dialog'));
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    await userEvent.click(dialog.getByRole('button', { name: /What I heard/ }));
    expect(await dialog.findByText(/second note/)).toBeVisible();
  });

  it('shows an answers-only row with See, which opens the answer sheet and closes the Voice Inbox', async () => {
    renderAt();
    await speak(1);
    await speak(2);
    fake.reads[0].resolve(
      Response.json(
        {
          transcript: 'do we have bread',
          actions: [],
          answers: [
            {
              id: 'q1',
              kind: 'no',
              text: 'bread',
              ingredient: bread,
              onShoppingList: false,
            },
          ],
        },
        { status: 201 },
      ),
    );
    fake.reads[1].resolve(Response.json(heard(), { status: 201 }));
    await userEvent.click(
      await screen.findByRole('button', { name: /Open Review/ }),
    );
    const sheet = within(await screen.findByRole('dialog', { name: 'Review' }));
    const row = sheet.getAllByRole('listitem')[1];
    expect(row).toHaveTextContent('Answers ready');
    expect(row).toHaveTextContent('English');
    await userEvent.click(within(row).getByRole('button', { name: /^See: / }));
    expect(
      await screen.findByRole('dialog', { name: 'Your Pantry' }),
    ).toBeVisible();
    expect(screen.queryByRole('dialog', { name: 'Review' })).toBeNull();
  });

  it('cancels only the read of the row it is on', async () => {
    renderAt();
    await speak(1);
    await speak(2);
    await userEvent.click(
      await screen.findByRole('button', { name: /Open Review/ }),
    );
    const sheet = within(await screen.findByRole('dialog', { name: 'Review' }));
    await userEvent.click(
      within(sheet.getAllByRole('listitem')[0]).getByRole('button', {
        name: /^Cancel/,
      }),
    );
    await waitFor(() => expect(sheet.getAllByRole('listitem')).toHaveLength(1));
    expect(fake.signals[0].aborted).toBe(false);
    expect(fake.signals[1].aborted).toBe(true);
  });

  it('keeps focus in the sheet when a row is cancelled', async () => {
    renderAt();
    await speak(1);
    await speak(2);
    await userEvent.click(
      await screen.findByRole('button', { name: /Open Review/ }),
    );
    const sheet = within(await screen.findByRole('dialog', { name: 'Review' }));
    await userEvent.click(
      within(sheet.getAllByRole('listitem')[1]).getByRole('button', {
        name: /^Cancel/,
      }),
    );
    await waitFor(() => expect(sheet.getAllByRole('listitem')).toHaveLength(1));
    expect(sheet.getByRole('heading', { name: 'Review' })).toHaveFocus();
  });

  it('shows one note by its own title and detail in its row, with Review once it is ready', async () => {
    renderAt();
    await speak(1);
    const sheet = within(await openBubbleSheet());
    expect(await sheet.findByText(/^Voice Note · 0:\d\d$/)).toBeVisible();
    expect(sheet.getByText('Being read', { selector: 'h3' })).toBeVisible();
    expect(sheet.queryByRole('button', { name: /^Review: / })).toBeNull();

    answer(0);
    expect(await sheet.findByText('got the bread')).toBeVisible();
    expect(sheet.getByRole('button', { name: /^Review: / })).toBeVisible();
  });

  it('sums up several notes by state: reading, then some ready, then all done', async () => {
    renderAt();
    await speak(1);
    await speak(2);
    await speak();
    const bubble = () => screen.getByTestId('gator-bubble');
    expect(await bubbleNamed('Gator is working: 3 being read')).toBeVisible();
    expect(bubble()).toHaveAttribute('data-state', 'reading');

    answer(0);
    answer(1);
    expect(await bubbleNamed('2 ready to review')).toBeVisible();
    expect(bubble()).toHaveAttribute('data-state', 'someReady');
    expect(screen.getByTestId('badge-ready')).toHaveTextContent('2');
    expect(screen.getByTestId('badge-reading')).toHaveTextContent('1');
  });

  it('turns gold with a happy Gator once everything in the background is ready', async () => {
    renderAt();
    await speak(1);
    await speak(2);
    const bubble = () => screen.getByTestId('gator-bubble');
    await bubbleNamed('Gator is working: 2 being read');
    answer(0);
    await bubbleNamed('1 ready to review');
    expect(bubble()).toHaveAttribute('data-state', 'someReady');

    answer(1);
    await bubbleNamed('All read: 2 ready to review');
    expect(bubble()).toHaveAttribute('data-state', 'allDone');
    expect(bubbleButton().querySelector('img[data-mood]')).toHaveAttribute(
      'data-mood',
      'happy',
    );
  });

  it('titles the sheet "Review" and lists the newest note first', async () => {
    renderAt();
    await speak(1);
    await speak(2);
    answer(0);
    fake.reads[1].resolve(Response.json(heard('second note'), { status: 201 }));
    await userEvent.click(
      await screen.findByRole('button', { name: /Open Review/ }),
    );
    const sheet = within(await screen.findByRole('dialog', { name: 'Review' }));
    expect(sheet.getByRole('heading', { name: 'Review' })).toBeVisible();
    expect(sheet.getAllByRole('listitem')[0]).toHaveTextContent('second note');
    expect(sheet.getByRole('button', { name: 'Review all (2)' })).toBeVisible();
  });

  it('offers no Review all in the sheet while only one note can be reviewed', async () => {
    renderAt();
    await speak(1);
    await speak(2);
    await userEvent.click(
      await screen.findByRole('button', { name: /Open Review/ }),
    );
    const sheet = within(await screen.findByRole('dialog', { name: 'Review' }));
    expect(sheet.queryByRole('button', { name: /^Review all/ })).toBeNull();
  });

  it('announces each state change once as a polite status, never an alert', async () => {
    renderAt();
    await speak(1);
    await speak(2);
    expect(screen.queryByRole('alert')).toBeNull();
    answer(0);
    await bubbleNamed('1 ready to review');
    expect(screen.queryByRole('alert')).toBeNull();

    fake.reads[1].reject(new TypeError('Failed to fetch'));
    await waitFor(() => expect(fake.reads.length).toBeGreaterThan(2));
    fake.reads[2].reject(new TypeError('Failed to fetch'));
    await bubbleNamed('1 ready to review, 1 could not be read');
    // An announcement waits for the toast showing before it.
    await act(() => vi.advanceTimersByTimeAsync(3000));
    await waitFor(() =>
      expect(announcements()).toContain(
        '1 ready to review, 1 could not be read',
      ),
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('sends each note with the Default List of the page it was recorded on, whichever page opens it', async () => {
    renderAt('/shopping');
    await speak(1);
    await userEvent.click(screen.getByRole('link', { name: 'to the pantry' }));
    await screen.findByText('pantry page');
    await speak(2);

    expect(fake.reads.map((r) => r.body.get('defaultTarget'))).toEqual([
      'shopping',
      'pantry',
    ]);
    answer(0);
    const dialog = await openReady();
    expect(dialog).toHaveTextContent('What I heard');
    expect(screen.getByText('pantry page')).toBeVisible();
  });

  it('refuses the mic while a Review is open, and works again once it closes', async () => {
    renderAt();
    await speak(1);
    answer(0);
    const dialog = within(await openReady());
    mic.start.mockClear();

    const voiceButton = document.querySelector(
      '[data-voice-button]',
    ) as HTMLElement;
    pressDown(voiceButton);
    await holdLongEnough();
    expect(mic.start).not.toHaveBeenCalled();
    expect(screen.queryByText("Gator's listening")).toBeNull();

    await userEvent.click(
      dialog.getByRole('button', { name: 'Apply 1 change' }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await speak();
    expect(mic.start).toHaveBeenCalledOnce();
  });

  it('refuses a sixth note with "Review your notes first"', async () => {
    renderAt();
    for (let i = 0; i < 5; i++) await speak(Math.min(i + 1, 2));
    expect(await bubbleNamed('Gator is working: 5 being read')).toBeVisible();
    mic.start.mockClear();

    const button = await talkButton();
    pressDown(button);
    expect(await screen.findByText('Review your notes first')).toBeVisible();
    expect(mic.start).not.toHaveBeenCalled();
  });

  it('buzzes once for each note that becomes ready, with no toast', async () => {
    const vibrate = vi.fn();
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: vibrate,
    });
    renderAt();
    await speak(1);
    await speak(2);
    vibrate.mockClear();

    answer(0);
    await bubbleNamed('1 ready to review');
    expect(vibrate).toHaveBeenCalledTimes(1);
    answer(1);
    await bubbleNamed('All read: 2 ready to review');
    expect(vibrate).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('asks the browser to confirm leaving while a note is unapplied, and stops when it is empty', async () => {
    const leaving = () => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    renderAt();
    expect(leaving()).toBe(false);
    await speak(1);
    expect(leaving()).toBe(true);
    answer(0);
    const dialog = within(await openReady());
    await userEvent.click(
      dialog.getByRole('button', { name: 'Apply 1 change' }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(leaving()).toBe(false);
  });

  it('has its copy in English, Romanian and Danish', () => {
    // Plural forms differ per language.
    const keys = (voice: typeof en) =>
      Object.keys(voice.inbox)
        .filter((k) => !k.startsWith('title') && !k.startsWith('failed'))
        .sort();
    expect(keys(ro)).toEqual(keys(en));
    expect(keys(da)).toEqual(keys(en));
    for (const voice of [en, ro, da]) {
      expect(voice.inbox.full).toBeTruthy();
      expect(voice.inbox.review).toBeTruthy();
    }
  });
});

import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
  waitForElementToBeRemoved,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  announcements,
  bubbleSays,
  openReady,
  MicrophoneError,
  fakeSession,
  hold,
  mic,
  recording,
  resetVoiceEnvironment,
  stubVoiceFetch,
  talkButton,
  voiceAction,
  voiceIngredient,
} from '@/test/voice';
import {
  holdFor,
  holdLongEnough,
  pressDown,
  useVoiceTimers,
} from '@/test/voiceHold';
import { renderInAppLayout, renderWithProviders, stubApi } from '@/test/render';
import { AppLayout } from '@/components/layout/AppLayout/AppLayout';
import { Route, Routes } from 'react-router-dom';
import { scanLanguagePreference } from '@/test/scan';
import { stubMotion } from '@/test/viewport';
import { resetRowFlash } from '@/lib/rowFlash';
import { voiceNote } from '@/lib/voiceNote';
import { PantryPage } from '@/pages/Pantry/PantryPage';
import { ShoppingPage } from './ShoppingPage';

/** The Voice Note's status; the refresh loader's live region is a status too, empty at rest. */
const statusNote = () => {
  const note = screen
    .getAllByRole('status')
    // Not the Gator bubble's announcement, which is a status in a toast too.
    .find(
      (status) =>
        status.textContent !== '' && !status.closest('.MuiSnackbar-root'),
    );
  if (!note) throw new Error('No status with text');
  return note;
};

const emptyList = {
  id: 'l1',
  groups: [],
  summary: { remaining: 0, checked: 0 },
};

type Setup = {
  configured?: boolean;
  note?: () => Response | Promise<Response>;
  preferredScanLanguage?: 'en' | 'ro' | 'da';
  preferredSpokenLanguage?: 'en' | 'ro' | 'da';
  preferences?: () => Promise<Response>;
  /** Extra API fakes, for a test that visits another page. */
  routes?: Record<string, () => Response | Promise<Response>>;
};

function setup({
  configured = true,
  note,
  preferredScanLanguage,
  preferredSpokenLanguage,
  preferences,
  routes,
}: Setup = {}) {
  const { fetchMock } = stubApi({
    ...(preferredScanLanguage || preferredSpokenLanguage
      ? scanLanguagePreference(
          preferredScanLanguage ?? 'en',
          preferredSpokenLanguage,
        )
      : {}),
    ...(preferences ? { 'GET /api/settings/preferences': preferences } : {}),
    'GET /api/shopping-list': () => Response.json(emptyList),
    'GET /api/credits': () =>
      Response.json({
        balance: 100,
        prices: { voice: 1 },
        lowBalanceThreshold: 10,
        history: [],
      }),
    'GET /api/voice/config': () => Response.json({ configured }),
    'POST /api/voice': () =>
      note?.() ??
      Response.json({ transcript: 'got the bread and sausages', actions: [] }),
    ...routes,
  });
  return stubVoiceFetch(fetchMock);
}

describe('Voice Note on the Shopping List', () => {
  let session: ReturnType<typeof fakeSession>;

  beforeEach(() => {
    useVoiceTimers();
    resetRowFlash();
    resetVoiceEnvironment();
    session = fakeSession();
    mic.start.mockImplementation(() => Promise.resolve(session));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('describes the mic with the Credit Price of a Voice Note', async () => {
    setup();
    renderInAppLayout(<ShoppingPage />, '/shopping');
    const button = await talkButton();
    await vi.waitFor(() =>
      expect(button).toHaveAccessibleDescription(/Costs 1 Credit/),
    );
    // The mic itself stays plain; sighted users see the price in the Listening card.
    expect(within(button).queryByText('1 Credit')).toBeNull();
    expect(button).toHaveAccessibleName('Hold to record a Voice Note');
    await hold();
    expect(statusNote()).toHaveTextContent('1 Credit');
  });

  it('is hidden when voice is not configured', async () => {
    setup({ configured: false });
    renderInAppLayout(<ShoppingPage />, '/shopping');
    await screen.findByText('Your list is empty');
    expect(
      screen.queryByRole('button', { name: /hold to record a voice note/i }),
    ).toBeNull();
  });

  it('draws Gator only while the mic is held and while the note is read', async () => {
    setup({ note: () => new Promise<Response>(() => undefined) });
    renderInAppLayout(<ShoppingPage />, '/shopping');
    const gator = (mood: string) =>
      document.querySelector(`img[data-mood="${mood}"]`);

    // At rest the mic is plain: no Gator anywhere.
    await talkButton();
    expect(gator('listening')).toBeNull();
    expect(gator('thinking')).toBeNull();

    // Held: the listening Gator sits in the Listening card, decorative beside its title.
    const button = await hold();
    expect(statusNote()).toHaveTextContent("Gator's listening");
    expect(gator('listening')).not.toBeNull();
    expect(gator('listening')).toHaveAttribute('alt', '');

    // Let go: the thinking Gator replaces it in the Gator bubble.
    fireEvent.pointerUp(button);
    await bubbleSays('Gator is working: 1 being read');
    expect(gator('listening')).toBeNull();
    expect(gator('thinking')).not.toBeNull();
    expect(gator('thinking')).toHaveAttribute('alt', '');
  });

  it('records while held, shows the elapsed time, and sends on release', async () => {
    const { sent } = setup();
    renderInAppLayout(<ShoppingPage />, '/shopping');

    const button = await hold();
    expect(statusNote()).toHaveTextContent(/Gator's listening\s*0:00/);
    await act(() => vi.advanceTimersByTimeAsync(7000));
    expect(statusNote()).toHaveTextContent(
      /Gator's listening\s*0:07\s*\/ 1:00/,
    );
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(mic.start).toHaveBeenCalledTimes(1);
    expect(sent).toHaveLength(0);

    fireEvent.pointerUp(button);

    const dialog = await openReady();
    expect(dialog).toHaveTextContent('What I heard');
    expect(session.stop).toHaveBeenCalledTimes(1);
    expect(sent).toHaveLength(1);
    // The Preferences did not load: no language goes along, the API uses the stored one.
    expect(sent[0].has('spokenLanguage')).toBe(false);
    expect(sent[0].has('locale')).toBe(false);
    expect(sent[0].get('defaultTarget')).toBe('shopping');
    expect(sent[0].get('today')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(sent[0].get('durationMs')).toBe('3000');
    expect((sent[0].get('audio') as File).name).toBe('voice-note.webm');

    await userEvent.click(screen.getByRole('button', { name: 'Discard' }));
    await userEvent.click(screen.getByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('cancels the recording and sends nothing when released before the microphone is ready', async () => {
    const { sent } = setup();
    let ready: (s: ReturnType<typeof fakeSession>) => void = () => {};
    mic.start.mockImplementation(
      () => new Promise((resolve) => (ready = resolve)),
    );
    renderInAppLayout(<ShoppingPage />, '/shopping');

    const button = await talkButton();
    pressDown(button);
    // The permission check comes first, so the microphone is asked for a moment after the press.
    await screen.findByText('Starting…');
    fireEvent.pointerUp(button);
    await act(async () => ready(session));

    await waitFor(() => expect(session.cancel).toHaveBeenCalledTimes(1));
    expect(session.stop).not.toHaveBeenCalled();
    expect(sent).toHaveLength(0);
    expect(screen.queryByText("Gator's listening")).toBeNull();
  });

  it('shows Starting… until the stream is live, then Listening', async () => {
    setup();
    let ready: (s: ReturnType<typeof fakeSession>) => void = () => {};
    mic.start.mockImplementation(
      () => new Promise((resolve) => (ready = resolve)),
    );
    renderInAppLayout(<ShoppingPage />, '/shopping');

    pressDown(await talkButton());
    expect(await screen.findByText('Starting…')).toBeVisible();
    expect(screen.queryByText("Gator's listening")).toBeNull();

    await act(async () => ready(session));
    expect(await screen.findByText("Gator's listening")).toBeVisible();
    expect(screen.queryByText('Starting…')).toBeNull();
  });

  it('treats a release under 0.3 s as a tap: nothing sent, and a tip', async () => {
    const { sent } = setup();
    renderInAppLayout(<ShoppingPage />, '/shopping');

    const button = await talkButton();
    pressDown(button);
    await screen.findByText("Gator's listening");
    await act(() => vi.advanceTimersByTimeAsync(150));
    fireEvent.pointerUp(button);

    expect(
      await screen.findByText('Hold to talk, let go to send'),
    ).toBeVisible();
    expect(session.stop).not.toHaveBeenCalled();
    expect(session.cancel).toHaveBeenCalledTimes(1);
    expect(sent).toHaveLength(0);
    expect(screen.queryByText("Gator's listening")).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();

    await act(() => vi.advanceTimersByTimeAsync(1800));
    expect(screen.queryByText('Hold to talk, let go to send')).toBeNull();
  });

  it('counts 299 ms as a tap and 300 ms as a Voice Note', async () => {
    // A clock that only moves when told to, so the boundary is exact.
    const { sent } = setup();
    renderInAppLayout(<ShoppingPage />, '/shopping');
    const button = await talkButton();
    vi.useFakeTimers();

    pressDown(button);
    await holdFor(299);
    fireEvent.pointerUp(button);
    await holdFor(0);
    expect(screen.getByText('Hold to talk, let go to send')).toBeVisible();
    expect(sent).toHaveLength(0);
    await holdFor(2000);

    // A fast microphone: the audio is exactly as long as the hold.
    session.stop.mockResolvedValue({ ...recording, durationMs: 300 });
    pressDown(button);
    await holdFor(300);
    fireEvent.pointerUp(button);
    await holdFor(100);
    expect(sent).toHaveLength(1);
  });

  it('ends with the tip, not an Alert, when the microphone recorded too little', async () => {
    const { sent } = setup();
    session.stop.mockResolvedValue({ ...recording, durationMs: 200 });
    renderInAppLayout(<ShoppingPage />, '/shopping');
    const button = await talkButton();

    pressDown(button);
    await screen.findByText("Gator's listening");
    await holdFor(350);
    fireEvent.pointerUp(button);

    expect(
      await screen.findByText('Hold to talk, let go to send'),
    ).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(sent).toHaveLength(0);
  });

  it('ends with the tip when let go after 0.3 s but before the stream is live', async () => {
    const { sent } = setup();
    let ready: (s: ReturnType<typeof fakeSession>) => void = () => {};
    mic.start.mockImplementation(
      () => new Promise((resolve) => (ready = resolve)),
    );
    renderInAppLayout(<ShoppingPage />, '/shopping');
    const button = await talkButton();

    pressDown(button);
    await screen.findByText('Starting…');
    await holdFor(400);
    fireEvent.pointerUp(button);
    await act(async () => ready(session));

    expect(
      await screen.findByText('Hold to talk, let go to send'),
    ).toBeVisible();
    expect(session.cancel).toHaveBeenCalledTimes(1);
    expect(session.stop).not.toHaveBeenCalled();
    expect(screen.queryByText('Starting…')).toBeNull();
    expect(screen.queryByText("Gator's listening")).toBeNull();
    expect(sent).toHaveLength(0);
  });

  it('drives the meter from the microphone level and names the target list', async () => {
    setup();
    session.level.mockReturnValue(1);
    renderInAppLayout(<ShoppingPage />, '/shopping');

    await hold();
    await act(() => vi.advanceTimersByTimeAsync(200));

    const bars = screen.getByTestId('level-meter').children;
    expect(bars).toHaveLength(30);
    // Newest on the right; silence on the left.
    expect((bars[29] as HTMLElement).style.height).toBe('38px');
    expect((bars[0] as HTMLElement).style.height).toBe('3px');
    const card = statusNote();
    expect(card).toHaveTextContent('Let go to send · slide off to cancel');
    expect(card).toHaveTextContent(
      'Goes to your Shopping List. Say “in the pantry” to add stock.',
    );
    expect(card).toHaveTextContent('EN');
  });

  describe('the status pill', () => {
    const error = (code: string, status: number, params = {}) =>
      Response.json({ code, params }, { status });
    const never = () => new Promise<Response>(() => undefined);

    it('reads in the Gator bubble with a polite announcement, and the page stays usable', async () => {
      setup({ note: never });
      renderInAppLayout(<ShoppingPage />, '/shopping');

      fireEvent.pointerUp(await hold());

      await bubbleSays('Gator is working: 1 being read');
      await waitFor(() =>
        expect(announcements()).toContain('Gator is working: 1 being read'),
      );
      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.getByText('Your list is empty')).toBeVisible();
    });

    /** jsdom ignores responsive rules in computed style, so the injected rule text is where `bottom` shows. */
    const cssText = () =>
      Array.from(document.styleSheets)
        .flatMap((sheet) => Array.from(sheet.cssRules))
        .map((rule) => rule.cssText)
        .join('\n');
    // 10 px gap + 60 px pill + 8 px air above the capsule.
    const clearOfPill = /bottom: calc\(78px \+/;

    it('lets taps through the tip and lifts it clear of the strip while reading', async () => {
      setup({ note: never });
      renderInAppLayout(<ShoppingPage />, '/shopping');
      fireEvent.pointerUp(await hold());
      await bubbleSays('Gator is working: 1 being read');

      // A tap too quick to be a note.
      const button = await talkButton();
      pressDown(button);
      fireEvent.pointerUp(button);

      const tip = await screen.findByText('Hold to talk, let go to send');
      expect(tip).toHaveStyle({ pointerEvents: 'none' });
      const own = tip.className.split(' ').pop() as string;
      const rules = cssText()
        .split('\n')
        .filter((line) => line.includes(own))
        .join('\n');
      expect(rules).toMatch(clearOfPill);
    });

    it('puts the 60 second stop toast clear of the Voice Inbox strip', async () => {
      setup({ note: never });
      renderInAppLayout(<ShoppingPage />, '/shopping');
      await hold();
      await act(() => vi.advanceTimersByTimeAsync(60_000));

      await bubbleSays('Gator is working: 1 being read');
      const toast = await screen.findByText(/Stopped at 1 minute/);
      expect(toast).toBeVisible();
      // The rules on the toast's own emotion classes.
      const own = [...toast.closest('.MuiSnackbar-root')!.classList].filter(
        (c) => c.startsWith('css-'),
      );
      const rule = cssText()
        .split('\n')
        .filter((line) => own.some((c) => line.includes(`.${c}`)))
        .join('\n');
      // The rule exists (its bottom transition is there)...
      expect(rule).toMatch(/transition: bottom/);
      // ...but the strip's floor lifts it with a `max()`, which jsdom's CSS parser drops, bottom and
      // all; a toast with no strip under it keeps its plain `calc()` bottom.
      expect(rule).not.toMatch(/bottom: calc\(/);
    });

    it('records a new note while one is being read', async () => {
      const { sent } = setup({ note: never });
      renderInAppLayout(<ShoppingPage />, '/shopping');
      fireEvent.pointerUp(await hold());
      await screen.findByRole('button', {
        name: 'Gator is working: 1 being read. Open Review',
      });
      mic.start.mockClear();

      const button = await hold();
      expect(mic.start).toHaveBeenCalledOnce();
      expect(statusNote()).toHaveTextContent("Gator's listening");
      fireEvent.pointerUp(button);

      expect(await bubbleSays('Gator is working: 2 being read')).toBeVisible();
      expect(sent).toHaveLength(2);
    });

    it('shows the bubble All done on success, and the Review sheet opens the note', async () => {
      setup();
      renderInAppLayout(<ShoppingPage />, '/shopping');
      fireEvent.pointerUp(await hold());
      await bubbleSays('All read: 1 ready to review');
      expect(await openReady()).toBeVisible();
      // The bubble steps aside while the sheet is up.
      expect(screen.queryByRole('button', { name: /Open Review/ })).toBeNull();
    });

    /** Opens the Voice Inbox sheet from the strip. */
    const openSheet = async () => {
      fireEvent.click(
        await screen.findByRole('button', { name: /Open Review/ }),
      );
      return screen.findByRole('dialog', { name: 'Review' });
    };
    const rowOf = (dialog: HTMLElement, text: RegExp | string) =>
      within(dialog)
        .getAllByRole('listitem')
        .find(
          (li) => within(li).queryByText(text, { exact: false }) !== null,
        ) as HTMLElement;

    it('keeps a failed note in the Voice Inbox: the bubble counts it and announces it politely, never as an alert', async () => {
      setup({ note: () => error('voice.provider_unavailable', 502) });
      renderInAppLayout(<ShoppingPage />, '/shopping');

      fireEvent.pointerUp(await hold());

      await bubbleSays('1 could not be read');
      await waitFor(() =>
        expect(announcements()).toContain('1 could not be read'),
      );
      expect(screen.queryByRole('alert')).toBeNull();
      const dialog = await openSheet();
      const row = rowOf(dialog, 'No connection. Your recording is kept.');
      expect(within(row).getByText(/Voice Note · 0:\d\d/)).toBeVisible();
      expect(
        within(row).getByRole('button', { name: /^Retry:/ }),
      ).toBeVisible();
      expect(
        within(row).getByRole('button', { name: /^Discard/ }),
      ).toBeVisible();
    });

    it('names an unexpected failure in its row, and falls back for an unknown code', async () => {
      let attempt = 0;
      setup({
        note: () =>
          ++attempt === 1
            ? error('scan.cap_reached', 429, { cap: 5 })
            : error('nonsense.code', 500),
      });
      renderInAppLayout(<ShoppingPage />, '/shopping');
      fireEvent.pointerUp(await hold());
      await bubbleSays('1 could not be read');
      fireEvent.pointerUp(await hold());
      await bubbleSays('2 could not be read');

      const dialog = await openSheet();

      expect(dialog).toHaveTextContent(
        'You have used all 5 scans for today. Try again tomorrow, or add items by hand.',
      );
      expect(dialog).toHaveTextContent(
        'Something went wrong. Please try again.',
      );
    });

    it('leaves focus in the Review dialog when a row of the sheet opens a note', async () => {
      let attempt = 0;
      setup({
        note: () =>
          ++attempt <= 2
            ? Promise.resolve(
                Response.json({ transcript: 'bread', actions: [] }),
              )
            : error('voice.provider_unavailable', 502),
      });
      renderInAppLayout(<ShoppingPage />, '/shopping');
      fireEvent.pointerUp(await hold());
      await bubbleSays('All read: 1 ready to review');
      fireEvent.pointerUp(await hold());
      await bubbleSays('All read: 2 ready to review');
      fireEvent.pointerUp(await hold());
      await bubbleSays('2 ready to review, 1 could not be read');
      fireEvent.click(screen.getByRole('button', { name: /Open Review/ }));
      const sheet = await screen.findByRole('dialog', {
        name: 'Review',
      });

      const focus = vi.spyOn(HTMLElement.prototype, 'focus');
      await userEvent.click(
        within(sheet).getAllByRole('button', { name: /^Review/ })[0],
      );

      const review = await screen.findByRole('dialog', { name: 'Review' });
      await waitFor(() =>
        expect(review).toContainElement(document.activeElement as HTMLElement),
      );
      await waitForElementToBeRemoved(sheet);
      await holdFor(100);
      expect(review).toContainElement(document.activeElement as HTMLElement);
      // The sheet closing for a note that opens does not hand focus to the voice button.
      expect(
        focus.mock.contexts.some((el) =>
          (el as HTMLElement).hasAttribute('data-voice-button'),
        ),
      ).toBe(false);
    });

    it('keeps the mic working while a note has failed', async () => {
      setup({ note: () => error('voice.provider_unavailable', 502) });
      renderInAppLayout(<ShoppingPage />, '/shopping');
      fireEvent.pointerUp(await hold());
      await bubbleSays('1 could not be read');
      mic.start.mockClear();

      pressDown(await talkButton());

      expect(await screen.findByText("Gator's listening")).toBeVisible();
      expect(mic.start).toHaveBeenCalledOnce();
      expect(screen.queryByText(/Retry or discard/)).toBeNull();
    });

    it('does not hide a ready note behind a failed one', async () => {
      let attempt = 0;
      setup({
        note: () =>
          ++attempt === 1
            ? error('voice.provider_unavailable', 502)
            : undefined!,
      });
      renderInAppLayout(<ShoppingPage />, '/shopping');
      fireEvent.pointerUp(await hold());
      await bubbleSays('1 could not be read');
      fireEvent.pointerUp(await hold());

      await bubbleSays('1 ready to review, 1 could not be read');
      expect(await openReady()).toBeVisible();
    });

    it('announces a failed note once, not again when the bubble returns after recording', async () => {
      let attempt = 0;
      setup({
        note: () =>
          ++attempt === 1
            ? error('voice.provider_unavailable', 502)
            : undefined!,
      });
      renderInAppLayout(<ShoppingPage />, '/shopping');
      fireEvent.pointerUp(await hold());
      await bubbleSays('1 could not be read');

      // Recording hides the bubble; it comes back with the same failed note.
      fireEvent.pointerUp(await hold());
      await bubbleSays('1 ready to review, 1 could not be read');
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('keeps the bubble across pages, with no alert', async () => {
      setup({
        note: () => error('voice.provider_unavailable', 502),
        routes: {
          'GET /api/pantry': () =>
            Response.json({ batches: [], runningLow: [] }),
          'GET /api/settings/family': () =>
            Response.json({ staleThresholdDays: 3, expiryOverrides: [] }),
        },
      });
      renderWithProviders(
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/shopping" element={<ShoppingPage />} />
            <Route path="/pantry" element={<PantryPage />} />
          </Route>
        </Routes>,
        { route: '/shopping' },
      );
      fireEvent.pointerUp(await hold());
      await bubbleSays('1 could not be read');

      fireEvent.click(screen.getByRole('link', { name: 'Pantry' }));
      await screen.findByRole('button', { name: 'Add batch' });
      expect(screen.queryByText('Your list is empty')).toBeNull();

      expect(await bubbleSays('1 could not be read')).toBeVisible();
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('discards one of two failed notes from the sheet, which keeps the other', async () => {
      setup({ note: () => error('voice.provider_unavailable', 502) });
      renderInAppLayout(<ShoppingPage />, '/shopping');
      fireEvent.pointerUp(await hold());
      await bubbleSays('1 could not be read');
      fireEvent.pointerUp(await hold());
      await bubbleSays('2 could not be read');

      const dialog = await openSheet();
      await userEvent.click(
        within(dialog).getAllByRole('button', { name: /^Discard/ })[0],
      );

      await waitFor(() =>
        expect(within(dialog).getAllByRole('listitem')).toHaveLength(1),
      );
      expect(screen.queryByRole('alert', { hidden: true })).toBeNull();
    });

    it('retries a failed note from its row in the same Spoken Language', async () => {
      let attempt = 0;
      const { sent } = setup({
        preferredSpokenLanguage: 'ro',
        note: () =>
          ++attempt === 1 ? error('voice.provider_unavailable', 502) : never(),
      });
      renderInAppLayout(<ShoppingPage />, '/shopping');
      fireEvent.pointerUp(await hold());
      const dialog = await openSheet();

      await userEvent.click(
        within(dialog).getByRole('button', { name: /^Retry:/ }),
      );

      await waitFor(() => expect(sent).toHaveLength(2));
      expect(sent[1].get('spokenLanguage')).toBe('ro');
      expect(
        within(dialog).queryByRole('button', { name: /^Retry:/ }),
      ).toBeNull();
      expect(dialog).toHaveTextContent('Being read');
      // Focus stays inside the sheet.
      expect(dialog.contains(document.activeElement)).toBe(true);
    });

    it('discards a failed note from its row, says so, and closes the sheet with the last one', async () => {
      setup({ note: () => error('voice.provider_unavailable', 502) });
      renderInAppLayout(<ShoppingPage />, '/shopping');
      fireEvent.pointerUp(await hold());
      const button = await talkButton();
      const dialog = await openSheet();

      await userEvent.click(
        within(dialog).getByRole('button', { name: /^Discard/ }),
      );

      expect(await screen.findByText('Recording discarded')).toBeVisible();
      // The sheet closes with its animation rather than vanishing, and focus returns to the voice button.
      await waitFor(() =>
        expect(screen.queryByRole('dialog', { name: 'Review' })).toBeNull(),
      );
      expect(screen.queryByRole('alert')).toBeNull();
      await waitFor(() => expect(button).toHaveFocus());
    });

    it('leaves the sheet usable when a note fails while it is open', async () => {
      const { reads, holdReads } = setup({ note: never });
      holdReads();
      renderInAppLayout(<ShoppingPage />, '/shopping');
      fireEvent.pointerUp(await hold());
      const dialog = await openSheet();
      await waitFor(() => expect(reads).toHaveLength(1));

      act(() => reads[0].reject(new TypeError('offline')));
      await waitFor(() => expect(reads).toHaveLength(2));
      act(() => reads[1].reject(new TypeError('offline')));

      expect(
        await within(dialog).findByRole('button', { name: /^Retry:/ }),
      ).toBeVisible();
      expect(screen.getByRole('dialog', { name: 'Review' })).toBeVisible();
    });

    it('retries a network error once by itself before it fails the note', async () => {
      const { reads, holdReads } = setup({ note: never });
      holdReads();
      renderInAppLayout(<ShoppingPage />, '/shopping');
      fireEvent.pointerUp(await hold());
      await waitFor(() => expect(reads).toHaveLength(1));

      act(() => reads[0].reject(new TypeError('offline')));

      await waitFor(() => expect(reads).toHaveLength(2));
      await bubbleSays('Gator is working: 1 being read');
      act(() =>
        reads[1].resolve(Response.json({ transcript: 'bread', actions: [] })),
      );
      expect(await bubbleSays('All read: 1 ready to review')).toBeVisible();
    });

    it('says nothing was heard on the note itself and keeps it, with Retry and Discard', async () => {
      setup({ note: () => error('voice.nothing_heard', 422) });
      renderInAppLayout(<ShoppingPage />, '/shopping');

      fireEvent.pointerUp(await hold());

      const dialog = await openSheet();
      expect(dialog).toHaveTextContent("Didn't catch anything, try again");
      expect(dialog).toHaveTextContent("This one doesn't count");
      expect(
        within(dialog).getByRole('button', { name: /^Retry:/ }),
      ).toBeVisible();
      expect(
        within(dialog).getByRole('button', { name: /^Discard/ }),
      ).toBeVisible();
      await holdFor(10_000);
      expect(screen.getByRole('dialog', { name: 'Review' })).toHaveTextContent(
        "Didn't catch anything, try again",
      );
    });

    describe('Retry in another language', () => {
      const spoken = (body: FormData) => body.get('spokenLanguage');
      const failFirst = async (
        language: 'en' | 'ro' | 'da' = 'en',
        code = 'voice.nothing_heard',
      ) => {
        const env = setup({
          note: never,
          preferredSpokenLanguage: language,
        });
        env.holdReads();
        renderInAppLayout(<ShoppingPage />, '/shopping');
        fireEvent.pointerUp(await hold());
        await waitFor(() => expect(env.reads).toHaveLength(1));
        act(() => env.reads[0].resolve(error(code, 422)));
        return { ...env, dialog: await openSheet() };
      };
      const pick = async (dialog: HTMLElement, name: string) => {
        fireEvent.click(
          within(dialog).getByRole('button', {
            name: /^Retry in another language/,
          }),
        );
        fireEvent.click(await screen.findByRole('menuitem', { name }));
      };

      it("lists the Spoken Languages by their own names, marking the note's", async () => {
        const { dialog } = await failFirst('ro');
        fireEvent.click(
          within(dialog).getByRole('button', {
            name: /^Retry in another language/,
          }),
        );
        const items = (await screen.findAllByRole('menuitem')).map(
          (i) => i.textContent,
        );
        expect(items).toEqual(['English', 'Română (current)', 'Dansk']);
        const current = (await screen.findAllByRole('menuitem')).filter((i) =>
          i.hasAttribute('aria-current'),
        );
        expect(current.map((i) => i.textContent)).toEqual(['Română (current)']);
      });

      it('re-sends a nothing-heard note in the picked language and keeps it for the next Retry', async () => {
        const { dialog, reads } = await failFirst('en');
        expect(spoken(reads[0].body)).toBe('en');

        await pick(dialog, 'Dansk');
        await waitFor(() => expect(reads).toHaveLength(2));
        expect(spoken(reads[1].body)).toBe('da');

        act(() => reads[1].resolve(error('voice.nothing_heard', 422)));
        const again = await screen.findByRole('dialog', {
          name: 'Review',
        });
        expect(again).toHaveTextContent('Dansk');
        fireEvent.click(
          await within(again).findByRole('button', { name: /^Retry:/ }),
        );
        await waitFor(() => expect(reads).toHaveLength(3));
        expect(spoken(reads[2].body)).toBe('da');
      });

      it('re-sends a failed note in the picked language', async () => {
        const { dialog, reads } = await failFirst(
          'en',
          'voice.provider_unavailable',
        );
        await pick(dialog, 'Română');
        await waitFor(() => expect(reads).toHaveLength(2));
        expect(spoken(reads[1].body)).toBe('ro');
      });

      it('puts focus on the sheet itself after a language is picked', async () => {
        const { dialog } = await failFirst('en');
        await userEvent.click(
          within(dialog).getByRole('button', {
            name: /^Retry in another language/,
          }),
        );
        await userEvent.click(
          await screen.findByRole('menuitem', { name: 'Dansk' }),
        );
        await waitFor(() => expect(dialog).toHaveFocus());
      });

      it('gives only the picked note the new language when several fail on the Voice Cap', async () => {
        const { reads, holdReads } = setup({
          note: never,
          preferredSpokenLanguage: 'en',
        });
        holdReads();
        renderInAppLayout(<ShoppingPage />, '/shopping');
        for (let i = 0; i < 3; i++) {
          fireEvent.pointerUp(await hold());
          await screen.findByRole('button', { name: /Open Review/ });
        }
        await waitFor(() => expect(reads).toHaveLength(2));
        act(() =>
          reads[0].resolve(error('voice.cap_reached', 429, { cap: 5 })),
        );
        const dialog = await openSheet();
        await waitFor(() =>
          expect(
            within(dialog).getAllByRole('button', { name: /^Retry:/ }),
          ).toHaveLength(2),
        );
        const before = reads.length;
        fireEvent.click(
          within(dialog).getAllByRole('button', {
            name: /^Retry in another language/,
          })[1],
        );
        fireEvent.click(await screen.findByRole('menuitem', { name: 'Dansk' }));
        await waitFor(() => expect(reads.length).toBeGreaterThan(before));
        // The released note is read by the other free read slot once reads[1] settles.
        act(() => reads[1].resolve(error('voice.nothing_heard', 422)));
        await waitFor(() => expect(reads).toHaveLength(before + 2));
        expect(reads.slice(before).map((r) => spoken(r.body))).toEqual([
          'da',
          'en',
        ]);
      });

      it("plain Retry re-sends in the note's own language", async () => {
        const { dialog, reads } = await failFirst('ro');
        fireEvent.click(
          within(dialog).getByRole('button', { name: /^Retry:/ }),
        );
        await waitFor(() => expect(reads).toHaveLength(2));
        expect(spoken(reads[1].body)).toBe('ro');
      });
    });

    describe('Voice Cap', () => {
      const capReached =
        (resetsAt: string | undefined, cap = 50) =>
        () =>
          error('voice.cap_reached', 429, { cap, resetsAt });

      it('fails the note with the cap on its row, keeps Retry, and dims the button', async () => {
        setup({
          note: capReached(new Date(Date.now() + 3_600_000).toISOString(), 37),
        });
        renderInAppLayout(<ShoppingPage />, '/shopping');

        fireEvent.pointerUp(await hold());

        const button = await talkButton();
        await bubbleSays('1 could not be read');
        expect(button).toHaveStyle({ opacity: '0.55' });
        const dialog = await openSheet();
        expect(dialog).toHaveTextContent("That's today's 37 Voice Notes");
        expect(dialog).toHaveTextContent(
          'Voice is back tomorrow. Scans still work.',
        );
        expect(
          within(dialog).getByRole('button', { name: /^Retry:/ }),
        ).toBeVisible();
      });

      it('shows an Out of Credits row with Retry, not the Voice Cap copy', async () => {
        setup({ note: () => error('credits.insufficient', 402) });
        renderInAppLayout(<ShoppingPage />, '/shopping');

        fireEvent.pointerUp(await hold());

        await bubbleSays('1 could not be read');
        const dialog = await openSheet();
        expect(dialog).toHaveTextContent('Out of Credits');
        expect(dialog).toHaveTextContent('Your Family has no Credits left');
        expect(dialog).not.toHaveTextContent("That's today's");
        expect(
          within(dialog).getByRole('button', { name: /^Retry:/ }),
        ).toBeVisible();
      });

      it('adds a cap row instead of recording until the reset, then records again', async () => {
        setup({
          note: capReached(new Date(Date.now() + 60_000).toISOString()),
        });
        renderInAppLayout(<ShoppingPage />, '/shopping');
        fireEvent.pointerUp(await hold());
        await bubbleSays('1 could not be read');
        await userEvent.click(
          screen.getByRole('button', { name: /Open Review/ }),
        );
        await userEvent.click(
          within(await screen.findByRole('dialog')).getByRole('button', {
            name: /^Discard/,
          }),
        );
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        mic.start.mockClear();

        pressDown(await talkButton());

        await bubbleSays('1 could not be read');
        expect(mic.start).not.toHaveBeenCalled();

        await holdFor(60_000);

        expect(await talkButton()).toHaveStyle({ opacity: '1' });
        fireEvent.pointerUp(await talkButton());
        pressDown(await talkButton());
        await screen.findByText("Gator's listening");
        expect(mic.start).toHaveBeenCalledTimes(1);
      });
    });

    it('offers only Discard when the recording was too long, closing without a "discarded" toast', async () => {
      setup({ note: () => error('voice.too_long', 413) });
      renderInAppLayout(<ShoppingPage />, '/shopping');
      fireEvent.pointerUp(await hold());

      const dialog = await openSheet();
      expect(dialog).toHaveTextContent(
        'That recording was too long. Try a shorter one.',
      );
      expect(
        within(dialog).queryByRole('button', { name: /^Retry:/ }),
      ).toBeNull();
      await userEvent.click(
        within(dialog).getByRole('button', { name: /^Discard/ }),
      );
      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.queryByText('Recording discarded')).toBeNull();
    });

    it('offers only Discard, and logs, when the recording format is not supported', async () => {
      const log = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      setup({ note: () => error('voice.unsupported_audio', 415) });
      renderInAppLayout(<ShoppingPage />, '/shopping');
      fireEvent.pointerUp(await hold());

      const dialog = await openSheet();
      expect(dialog).toHaveTextContent(
        "This browser's recording format isn't supported",
      );
      expect(
        within(dialog).queryByRole('button', { name: /^Retry:/ }),
      ).toBeNull();
      expect(
        within(dialog).getByRole('button', { name: /^Discard/ }),
      ).toBeVisible();
      expect(log).toHaveBeenCalled();
      log.mockRestore();
    });

    it('says the browser cannot record on a row with Discard only', async () => {
      setup();
      mic.start.mockRejectedValue(new MicrophoneError('unavailable'));
      renderInAppLayout(<ShoppingPage />, '/shopping');

      pressDown(await talkButton());

      await bubbleSays('1 could not be read');
      const dialog = await openSheet();
      expect(dialog).toHaveTextContent('This browser cannot record audio');
      expect(
        within(dialog).queryByRole('button', { name: /^Retry:/ }),
      ).toBeNull();
    });
  });

  describe('Spoken Language', () => {
    it('has no Spoken Language chip or menu above the Dock', async () => {
      setup();
      renderInAppLayout(<ShoppingPage />, '/shopping');
      await talkButton();
      expect(
        screen.queryByRole('button', { name: /Spoken Language/ }),
      ).toBeNull();
      expect(screen.queryByRole('menu')).toBeNull();
    });

    it("sends the Member's Spoken Language preference, not the Scan Language", async () => {
      const { sent } = setup({
        preferredScanLanguage: 'da',
        preferredSpokenLanguage: 'ro',
      });
      renderInAppLayout(<ShoppingPage />, '/shopping');
      await talkButton();
      fireEvent.pointerUp(await hold());
      await openReady();
      expect(sent[0].get('spokenLanguage')).toBe('ro');
      expect(sent[0].has('scanLanguage')).toBe(false);
    });

    it('sends no Spoken Language before the Preferences have loaded', async () => {
      const { sent } = setup({
        preferences: () => new Promise<Response>(() => {}),
      });
      renderInAppLayout(<ShoppingPage />, '/shopping');
      fireEvent.pointerUp(await hold());
      await openReady();
      expect(sent[0].has('spokenLanguage')).toBe(false);
    });
  });
});

const catalogItem = (id: string, name: string) =>
  voiceIngredient(id, name, {
    leafCategory: { id: 'leaf', name: 'Dairy' },
    parentCategory: {
      id: 'parent',
      name: 'Dairy and eggs',
      aisle: { id: 'aisle', name: 'Dairy' },
    },
    defaults: { expiryDays: null, location: null },
  });
const eggs = catalogItem('ing-eggs', 'Eggs');
const milk = catalogItem('ing-milk', 'Milk');

const action = (overrides: Record<string, unknown> = {}) =>
  voiceAction({
    target: 'shopping',
    text: 'eggs',
    ingredient: eggs,
    rows: { shoppingItem: null },
    ...overrides,
  });
const didntUnderstand = (id: string, text: string) =>
  action({
    id,
    status: 'notUnderstood',
    target: null,
    op: null,
    text,
    ingredient: null,
  });

const done = (
  actionId: string,
  list: 'shopping' | 'pantry' = 'shopping',
  extra: Record<string, unknown> = {},
) => ({
  actionId,
  list,
  rowId: `row-${actionId}`,
  alreadyDone: false,
  ...extra,
});
const appliedAll = {
  applied: [done('a1'), done('a2'), done('a3')],
  skipped: [],
};

const threeAdds = [
  action({ id: 'a1' }),
  action({
    id: 'a2',
    text: 'two litres of milk',
    ingredient: milk,
    quantity: 2,
    unit: 'l',
  }),
  action({
    id: 'a3',
    text: 'quinoa crackers',
    ingredient: null,
    name: 'Quinoa crackers',
  }),
];

describe('Reviewing a Voice Note on the Shopping List', () => {
  let session: ReturnType<typeof fakeSession>;
  let applied: unknown[];
  let listFetches: number;

  function setupReview(
    actions: unknown[],
    apply: () => Response = () => Response.json(appliedAll, { status: 201 }),
    list: unknown = emptyList,
  ) {
    applied = [];
    listFetches = 0;
    const { fetchMock } = stubApi({
      'GET /api/shopping-list': () => {
        listFetches += 1;
        return Response.json(list);
      },
      'GET /api/voice/config': () => Response.json({ configured: true }),
      'GET /api/catalog/search': () => Response.json({ results: [eggs, milk] }),
      'GET /api/catalog/aisles': () => Response.json({ aisles: [] }),
      'POST /api/voice': () =>
        Response.json(
          {
            transcript: 'eggs, two litres of milk and quinoa crackers',
            actions,
          },
          { status: 201 },
        ),
      'POST /api/voice/apply': () => apply(),
    });
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
      if (
        String(input).endsWith('/voice/apply') &&
        typeof init?.body === 'string'
      ) {
        applied.push(JSON.parse(init.body));
      }
      return fetchMock(input, init);
    });
  }

  async function openReview() {
    renderInAppLayout(<ShoppingPage />, '/shopping');
    const button = await talkButton();
    pressDown(button);
    await screen.findByText("Gator's listening");
    await holdLongEnough();
    fireEvent.pointerUp(button);
    return openReady();
  }

  beforeEach(() => {
    useVoiceTimers();
    resetRowFlash();
    resetVoiceEnvironment();
    session = fakeSession();
    mic.start.mockReset();
    mic.start.mockImplementation(() => Promise.resolve(session));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  /** The button that opens a row: the only one with aria-expanded. */
  const headerOf = (row: HTMLElement) =>
    within(row)
      .getAllByRole('button')
      .find((b) => b.hasAttribute('aria-expanded')) as HTMLElement;

  /** The row of an Ingredient: its verb and name, and the line under them. */
  const rowOf = (dialog: ReturnType<typeof within>, name: string) =>
    dialog.getByText(name, { selector: 'b' }).closest('li') as HTMLElement;

  it('opens a tall Review that the scrim and Escape cannot close, and says nothing is saved yet', async () => {
    setupReview(threeAdds);
    const dialog = await openReview();

    expect(dialog).toHaveAccessibleName('Review');
    expect(
      await within(dialog).findByText(
        '3 changes · nothing is saved until you Apply',
      ),
    ).toBeVisible();

    const scrim = document.querySelector('.MuiBackdrop-root') as HTMLElement;
    await userEvent.click(scrim);
    expect(screen.getByRole('dialog')).toBeVisible();

    // Focus is in the dialog once it has opened; jsdom's focus trap does not take it back after a
    // backdrop click, so Escape goes to the dialog itself.
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeVisible();
    expect(within(dialog).getByText('Discard this Voice Note?')).toBeVisible();
    expect(
      within(dialog).getByText(
        "Nothing changes, and you'll have to say it again.",
      ),
    ).toBeVisible();
    expect(within(dialog).queryByRole('button', { name: /^Apply/ })).toBeNull();
  });

  it('keeps reviewing when the Discard confirmation is declined, and discards on confirm with a toast', async () => {
    setupReview(threeAdds);
    const dialog = within(await openReview());

    await userEvent.click(dialog.getByRole('button', { name: 'Discard' }));
    await userEvent.click(
      dialog.getByRole('button', { name: 'Keep reviewing' }),
    );
    expect(
      dialog.getByRole('button', { name: 'Apply 3 changes' }),
    ).toBeVisible();

    await userEvent.click(dialog.getByRole('button', { name: 'Discard' }));
    await userEvent.click(dialog.getByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(applied).toHaveLength(0);
    expect(
      await screen.findByText('Voice Note discarded · Nothing was changed.'),
    ).toBeVisible();
  });

  it('draws Keep reviewing disabled, not silently blocked, while an apply is in flight', async () => {
    setupReview(threeAdds);
    const dialog = within(await openReview());

    await userEvent.click(dialog.getByRole('button', { name: 'Discard' }));
    expect(
      dialog.getByRole('button', { name: 'Keep reviewing' }),
    ).toBeEnabled();
    act(() => voiceNote.applying());
    expect(
      dialog.getByRole('button', { name: 'Keep reviewing' }),
    ).toBeDisabled();
  });

  it('shows What I heard collapsed to its first line, and opens it to the transcript and its language', async () => {
    setupReview(threeAdds);
    const dialog = within(await openReview());

    const heard = await dialog.findByRole('button', { name: /What I heard/ });
    expect(heard).toHaveAttribute('aria-expanded', 'false');
    expect(heard).toHaveTextContent(
      'eggs, two litres of milk and quinoa crackers',
    );
    expect(dialog.queryByText('English · 0:03')).toBeNull();

    await userEvent.click(heard);
    expect(heard).toHaveAttribute('aria-expanded', 'true');
    expect(dialog.getByText('English · 0:03')).toBeVisible();
    const transcript = dialog.getByText(
      'eggs, two litres of milk and quinoa crackers',
      { selector: 'p' },
    );
    expect(transcript).toHaveAttribute('lang', 'en');
  });

  it('says what every Shopping List Voice Action will do on its second line', async () => {
    const item = (
      name: string,
      quantity: number | null,
      unit: string | null,
    ) => ({
      id: `row-${name}`,
      name,
      quantity,
      unit,
      checked: false,
    });
    const bread = catalogItem('ing-bread', 'Bread');
    const butter = catalogItem('ing-butter', 'Butter');
    const spinach = catalogItem('ing-spinach', 'Spinach');
    const rice = catalogItem('ing-rice', 'Rice');
    setupReview([
      action({
        id: 'c1',
        op: 'check',
        text: 'bread',
        ingredient: bread,
        rows: { shoppingItem: item('Bread', 1, 'pcs') },
      }),
      action({
        id: 'c2',
        op: 'check',
        text: 'milk',
        ingredient: milk,
        quantity: 2,
        unit: 'l',
        rows: { shoppingItem: item('Milk', 3, 'l') },
      }),
      action({
        id: 'c3',
        op: 'check',
        text: 'sausages',
        ingredient: null,
        name: 'Sausages',
        rows: { shoppingItem: null },
      }),
      action({
        id: 'c4',
        op: 'add',
        text: 'twelve eggs',
        quantity: 12,
        unit: 'pcs',
      }),
      action({
        id: 'c5',
        op: 'uncheck',
        text: 'butter',
        ingredient: butter,
        rows: { shoppingItem: item('Butter', null, null) },
      }),
      action({
        id: 'c6',
        op: 'remove',
        text: 'spinach',
        ingredient: spinach,
        rows: { shoppingItem: item('Spinach', 200, 'g') },
      }),
      action({
        id: 'c7',
        op: 'setQuantity',
        text: 'rice',
        ingredient: rice,
        quantity: 12,
        unit: 'pcs',
        rows: { shoppingItem: item('Rice', 6, 'pcs') },
      }),
    ]);
    const dialog = within(await openReview());
    await dialog.findByText('Bread', { selector: 'b' });

    const line = (name: string) => rowOf(dialog, name).textContent;
    expect(line('Bread')).toBe('Tick BreadOn your list · 1 pcs');
    expect(line('Milk')).toBe('Tick Milk2 L, list said 3 L');
    expect(line('Sausages')).toBe(
      "Add, ticked SausagesNot on your list, so it's added ticked",
    );
    expect(line('Eggs')).toBe('Add Eggs12 pcs');
    expect(line('Butter')).toBe('Untick ButterBack on your list');
    expect(line('Spinach')).toBe('Remove SpinachComes off your list · 200 g');
    expect(line('Rice')).toBe('Change Rice12 pcs, list said 6 pcs');
  });

  it('drops a change from this Review only, so it is not applied', async () => {
    setupReview(threeAdds);
    const dialog = within(await openReview());

    await userEvent.click(
      await dialog.findByRole('button', { name: 'Drop this change: Add Eggs' }),
    );
    expect(dialog.queryByText('Eggs', { selector: 'b' })).toBeNull();
    expect(
      dialog.getByText('2 changes · nothing is saved until you Apply'),
    ).toBeVisible();
    await userEvent.click(
      dialog.getByRole('button', { name: 'Apply 2 changes' }),
    );

    await waitFor(() => expect(applied).toHaveLength(1));
    expect(
      (applied[0] as { actions: { id: string }[] }).actions.map((a) => a.id),
    ).toEqual(['a2', 'a3']);
  });

  it('shows what could not be applied as read-only entries that can be hidden', async () => {
    setupReview([
      action({
        id: 'a1',
        op: 'check',
        text: 'milk',
        ingredient: milk,
        rows: {
          shoppingItem: {
            id: 'r',
            name: 'Milk',
            quantity: null,
            unit: null,
            checked: false,
          },
        },
      }),
      action({
        id: 'a2',
        op: 'remove',
        status: 'notFound',
        text: 'cheddar',
        ingredient: null,
        name: 'Cheddar',
      }),
      didntUnderstand('a3', 'do a dance'),
    ]);
    const dialog = within(await openReview());

    const couldnt = within(
      await dialog.findByRole('region', { name: "Couldn't apply" }),
    );
    expect(couldnt.getAllByRole('listitem')).toHaveLength(2);
    expect(couldnt.getByText(/Not found:/).closest('li')).toHaveTextContent(
      'Not found: “cheddar”No Cheddar on your list.',
    );
    expect(couldnt.getByText('No Cheddar on your list.')).toBeVisible();
    expect(
      couldnt.getByText(/Didn't understand:/).closest('li'),
    ).toHaveTextContent("Didn't understand: “do a dance”");
    // Read-only: only the × is a button.
    expect(couldnt.getAllByRole('button')).toHaveLength(2);

    await userEvent.click(
      couldnt.getByRole('button', { name: 'Hide this entry: do a dance' }),
    );
    expect(dialog.queryByText(/do a dance/)).toBeNull();
    // They never counted as changes.
    expect(
      dialog.getByText('1 change · nothing is saved until you Apply'),
    ).toBeVisible();
    await userEvent.click(
      dialog.getByRole('button', { name: 'Apply 1 change' }),
    );
    await waitFor(() => expect(applied).toHaveLength(1));
    expect(
      (applied[0] as { actions: { id: string }[] }).actions.map((a) => a.id),
    ).toEqual(['a1']);
  });

  it('opens one row at a time and shows what was heard, with line 2 following each edit', async () => {
    setupReview(threeAdds);
    const dialog = within(await openReview());
    const header = (name: string) => headerOf(rowOf(dialog, name));

    await userEvent.click(header('Eggs'));
    expect(header('Eggs')).toHaveAttribute('aria-expanded', 'true');
    expect(dialog.getByText(/Heard:/)).toHaveTextContent('Heard: “eggs”');

    await userEvent.click(header('Milk'));
    expect(header('Eggs')).toHaveAttribute('aria-expanded', 'false');
    expect(header('Milk')).toHaveAttribute('aria-expanded', 'true');
    expect(dialog.getAllByText(/Heard:/)).toHaveLength(1);

    await userEvent.click(header('Eggs'));
    await userEvent.type(dialog.getByLabelText(/^Amount of Eggs,/), '12');
    await userEvent.click(dialog.getByRole('button', { name: 'pcs' }));
    expect(rowOf(dialog, 'Eggs').textContent).toContain('12 pcs');
    await userEvent.click(dialog.getByRole('button', { name: 'Done' }));
    expect(header('Eggs')).toHaveAttribute('aria-expanded', 'false');
  });

  it('applies the edited amount and unit, refreshes the list and says what was added', async () => {
    setupReview(threeAdds);
    const dialog = within(await openReview());
    const before = listFetches;

    await userEvent.click(headerOf(rowOf(dialog, 'Eggs')));
    await userEvent.type(dialog.getByLabelText(/^Amount of Eggs,/), '12');
    await userEvent.click(dialog.getByRole('button', { name: 'pcs' }));
    await userEvent.click(
      dialog.getByRole('button', { name: 'Apply 3 changes' }),
    );

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(applied).toHaveLength(1);
    expect(applied[0]).toMatchObject({
      actions: [
        { id: 'a1', ingredientId: 'ing-eggs', quantity: 12, unit: 'pcs' },
        { id: 'a2', ingredientId: 'ing-milk', quantity: 2, unit: 'l' },
        { id: 'a3', ingredientId: null, name: 'Quinoa crackers' },
      ],
    });
    expect(await screen.findByText('3 applied')).toBeVisible();
    await waitFor(() => expect(listFetches).toBeGreaterThan(before));
  });

  it('clears the amount to mean no amount, and blocks Apply while it cannot be read', async () => {
    setupReview(threeAdds);
    const dialog = within(await openReview());
    await userEvent.click(headerOf(rowOf(dialog, 'Milk')));
    const amount = dialog.getByLabelText(/^Amount of Milk,/);
    const apply = dialog.getByRole('button', { name: 'Apply 3 changes' });

    await userEvent.clear(amount);
    await userEvent.type(amount, '0');
    expect(dialog.getByText(/Enter an amount from 0.001/)).toBeVisible();
    expect(apply).toBeDisabled();

    await userEvent.clear(amount);
    expect(apply).toBeEnabled();
    expect(rowOf(dialog, 'Milk').textContent).toContain('No amount');
    await userEvent.click(apply);

    await waitFor(() => expect(applied).toHaveLength(1));
    expect(applied[0]).toMatchObject({
      actions: [{}, { id: 'a2', quantity: null, unit: null }, {}],
    });
  });

  /** Opens Milk's unit menu in its open row and picks `unit`. */
  async function pickMilkUnit(dialog: ReturnType<typeof within>, unit: string) {
    await userEvent.click(headerOf(rowOf(dialog, 'Milk')));
    await userEvent.click(dialog.getByRole('button', { name: 'Unit: L' }));
    await userEvent.click(
      within(dialog.getByRole('menu', { name: 'Units' })).getByRole(
        'menuitemradio',
        { name: unit },
      ),
    );
    await userEvent.click(
      dialog.getByRole('button', { name: 'Apply 3 changes' }),
    );
    await waitFor(() => expect(applied).toHaveLength(1));
  }

  it('sends a unit picked from the menu, keeping the number as it was', async () => {
    setupReview(threeAdds);
    await pickMilkUnit(within(await openReview()), 'ml');
    expect(applied[0]).toMatchObject({
      actions: [{}, { id: 'a2', quantity: 2, unit: 'ml' }, {}],
    });
  });

  it('sends No unit as a null unit', async () => {
    setupReview(threeAdds);
    await pickMilkUnit(within(await openReview()), 'No unit');
    expect(applied[0]).toMatchObject({
      actions: [{}, { id: 'a2', quantity: 2, unit: null }, {}],
    });
  });

  it('reads a typed "2 kg" as a quantity and a unit', async () => {
    setupReview(threeAdds);
    const dialog = within(await openReview());
    await userEvent.click(headerOf(rowOf(dialog, 'Eggs')));
    await userEvent.type(dialog.getByLabelText(/^Amount of Eggs,/), '2 kg');
    await userEvent.click(
      dialog.getByRole('button', { name: 'Apply 3 changes' }),
    );
    await waitFor(() => expect(applied).toHaveLength(1));
    expect(applied[0]).toMatchObject({
      actions: [{ id: 'a1', quantity: 2, unit: 'kg' }, {}, {}],
    });
  });

  it('swaps the shared Catalog search into the row to change the Ingredient', async () => {
    setupReview(threeAdds);
    const dialog = within(await openReview());
    await userEvent.click(headerOf(rowOf(dialog, 'Quinoa crackers')));
    expect(dialog.getByText('Unmatched')).toBeVisible();

    await userEvent.click(
      dialog.getByRole('button', {
        name: 'Change Ingredient: Quinoa crackers',
      }),
    );
    const search = await screen.findByRole('combobox');
    expect(search).toHaveValue('Quinoa crackers');
    await userEvent.clear(search);
    await userEvent.type(search, 'milk');
    await userEvent.click(await screen.findByRole('option', { name: /Milk/ }));

    expect(dialog.queryByText('Unmatched')).toBeNull();
    expect(dialog.queryByRole('combobox')).toBeNull();
    expect(dialog.queryByText('Quinoa crackers', { selector: 'b' })).toBeNull();
    await userEvent.click(
      dialog.getByRole('button', { name: 'Apply 3 changes' }),
    );
    await waitFor(() => expect(applied).toHaveLength(1));
    expect(applied[0]).toMatchObject({
      actions: expect.arrayContaining([
        expect.objectContaining({
          id: 'a3',
          ingredientId: 'ing-milk',
          name: null,
        }),
      ]) as unknown,
    });
  });

  it('rewrites the kind label when the Match changes: Add, ticked off the list, Tick on it', async () => {
    setupReview(
      [
        action({
          id: 'k1',
          op: 'check',
          text: 'bread',
          ingredient: catalogItem('ing-bread', 'Bread'),
          rows: {
            shoppingItem: {
              id: 'row-bread',
              name: 'Bread',
              quantity: 1,
              unit: 'pcs',
              checked: false,
            },
          },
        }),
      ],
      undefined,
      {
        ...emptyList,
        groups: [
          {
            aisle: null,
            items: [
              {
                id: 'row-eggs',
                ingredientId: 'ing-eggs',
                name: 'Eggs',
                quantity: 6,
                unit: 'pcs',
                checked: false,
                unmatched: false,
              },
            ],
          },
        ],
        summary: { remaining: 1, checked: 0 },
      },
    );
    const dialog = within(await openReview());
    await dialog.findByText('Bread', { selector: 'b' });
    expect(rowOf(dialog, 'Bread').textContent).toMatch(/^Tick Bread/);

    const changeTo = async (from: string, option: RegExp) => {
      const change = `Change Ingredient: ${from}`;
      // The row stays open after a change, so open it only when it is closed.
      if (!dialog.queryByRole('button', { name: change })) {
        await userEvent.click(headerOf(rowOf(dialog, from)));
      }
      await userEvent.click(dialog.getByRole('button', { name: change }));
      await userEvent.click(
        await screen.findByRole('option', { name: option }),
      );
    };
    await changeTo('Bread', /Milk/);
    expect(rowOf(dialog, 'Milk').textContent).toMatch(/^Add, ticked Milk/);
    await changeTo('Milk', /Eggs/);
    expect(rowOf(dialog, 'Eggs').textContent).toMatch(/^Tick Eggs/);
  });

  it('opens What I heard and offers only Discard when nothing was understood', async () => {
    setupReview([didntUnderstand('a1', 'do a dance')]);
    const dialog = within(await openReview());

    expect(await dialog.findByText('Nothing to apply')).toBeVisible();
    expect(
      dialog.getByRole('button', { name: /What I heard/ }),
    ).toHaveAttribute('aria-expanded', 'true');
    expect(dialog.getByRole('button', { name: 'Discard' })).toBeVisible();
    expect(dialog.queryByRole('button', { name: /^Apply/ })).toBeNull();
    expect(dialog.queryByRole('region', { name: 'Shopping List' })).toBeNull();
  });

  it('disables both buttons and shows Applying while the request is in flight', async () => {
    let finish: (response: Response) => void = () => {};
    setupReview(
      threeAdds,
      () =>
        new Promise<Response>(
          (resolve) => (finish = resolve),
        ) as unknown as Response,
    );
    const dialog = within(await openReview());

    await userEvent.click(
      dialog.getByRole('button', { name: 'Apply 3 changes' }),
    );
    const applying = await dialog.findByRole('button', { name: 'Applying' });
    expect(applying).toBeDisabled();
    expect(dialog.getByRole('button', { name: 'Discard' })).toBeDisabled();

    finish(Response.json(appliedAll, { status: 201 }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('ignores Escape, and freezes the rows, while Apply is in flight', async () => {
    let finish: (response: Response) => void = () => {};
    setupReview(
      threeAdds,
      () =>
        new Promise<Response>(
          (resolve) => (finish = resolve),
        ) as unknown as Response,
    );
    const dialog = within(await openReview());
    await userEvent.click(
      dialog.getByRole('button', { name: 'Apply 3 changes' }),
    );
    await dialog.findByRole('button', { name: 'Applying' });

    await userEvent.keyboard('{Escape}');
    expect(dialog.queryByText('Discard this Voice Note?')).toBeNull();
    expect(voiceNote.getState().phase).toBe('applying');
    expect(
      dialog
        .getByRole('button', { name: 'Drop this change: Add Eggs' })
        .closest('[inert]'),
    ).not.toBeNull();

    finish(Response.json(appliedAll, { status: 201 }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByText(/Voice Note discarded/)).toBeNull();
  });

  it('closes only the Catalog search on Escape, not the Review', async () => {
    setupReview(threeAdds);
    const dialog = within(await openReview());
    await userEvent.click(
      dialog.getByRole('button', { name: /Eggs/, expanded: false }),
    );
    await userEvent.click(dialog.getByRole('button', { name: /Change/ }));
    expect(await dialog.findByRole('combobox')).toBeVisible();

    await userEvent.keyboard('{Escape}');
    await userEvent.keyboard('{Escape}');
    expect(dialog.queryByText('Discard this Voice Note?')).toBeNull();
    expect(dialog.queryByRole('combobox')).toBeNull();
    expect(dialog.getByRole('button', { name: /Change/ })).toHaveFocus();
  });

  it('puts focus back on Discard after Keep reviewing', async () => {
    setupReview(threeAdds);
    const dialog = within(await openReview());
    await userEvent.click(dialog.getByRole('button', { name: 'Discard' }));
    await userEvent.click(
      dialog.getByRole('button', { name: 'Keep reviewing' }),
    );
    expect(dialog.getByRole('button', { name: 'Discard' })).toHaveFocus();
  });

  it('scrolls the alert into view when Apply fails', async () => {
    const scrolled = vi.fn();
    // jsdom has no scrollIntoView: stub it for this test only.
    Element.prototype.scrollIntoView = scrolled;
    try {
      setupReview(threeAdds, () =>
        Response.json(
          { code: 'internal_error', message: 'boom' },
          { status: 500 },
        ),
      );
      const dialog = within(await openReview());
      scrolled.mockClear();
      await userEvent.click(
        dialog.getByRole('button', { name: 'Apply 3 changes' }),
      );
      const alert = await dialog.findByRole('alert');
      await waitFor(() => expect(scrolled.mock.contexts).toContain(alert));
    } finally {
      // @ts-expect-error test cleanup
      delete Element.prototype.scrollIntoView;
    }
  });

  it('keeps the sheet and every edit when Apply fails, with an alert at the top', async () => {
    setupReview(threeAdds, () =>
      Response.json(
        { code: 'internal_error', message: 'boom' },
        { status: 500 },
      ),
    );
    const dialog = within(await openReview());
    await userEvent.click(headerOf(rowOf(dialog, 'Eggs')));
    await userEvent.type(dialog.getByLabelText(/^Amount of Eggs,/), '12');
    await userEvent.click(
      dialog.getByRole('button', { name: 'Apply 3 changes' }),
    );

    expect(await dialog.findByRole('alert')).toBeVisible();
    expect(screen.getByRole('dialog')).toBeVisible();
    expect(
      dialog.getByRole('button', { name: 'Apply 3 changes' }),
    ).toBeEnabled();
    expect(dialog.getByLabelText(/^Amount of Eggs,/)).toHaveValue('12');
    expect(voiceNote.getState().phase).toBe('review');
  });

  const applyAll = async () => {
    const dialog = within(await openReview());
    await userEvent.click(
      await dialog.findByRole('button', { name: /^Apply \d+ changes?$/ }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  };

  it('names what was skipped in the result toast', async () => {
    setupReview(threeAdds, () =>
      Response.json(
        {
          applied: [done('a1'), done('a2')],
          skipped: [{ id: 'a3', reason: 'shopping.quantity_too_large' }],
        },
        { status: 201 },
      ),
    );
    await applyAll();
    expect(
      await screen.findByText(
        '2 applied, 1 skipped: quinoa crackers amount too large',
      ),
    ).toBeVisible();
  });

  it('names the first two skips and counts the rest', async () => {
    setupReview(
      [...threeAdds, action({ id: 'a4', text: 'bread', name: 'Bread' })],
      () =>
        Response.json(
          {
            applied: [done('a1')],
            skipped: [
              { id: 'a2', reason: 'voice.item_not_found' },
              { id: 'a3', reason: 'shopping.quantity_too_large' },
              { id: 'a4', reason: 'voice.invalid_action' },
            ],
          },
          { status: 201 },
        ),
    );
    await applyAll();
    expect(
      await screen.findByText(
        '1 applied, 3 skipped: milk no longer on the list, quinoa crackers amount too large, +1',
      ),
    ).toBeVisible();
  });

  it('splits the count by list, naming the page list first', async () => {
    setupReview(threeAdds, () =>
      Response.json(
        {
          applied: [done('a1'), done('a2', 'pantry'), done('a3')],
          skipped: [],
        },
        { status: 201 },
      ),
    );
    await applyAll();
    expect(
      await screen.findByText('3 applied: 2 on the list, 1 in the Pantry'),
    ).toBeVisible();
  });

  it('says in a second line which actions were already done', async () => {
    setupReview(
      [
        action({
          id: 'a1',
          op: 'check',
          text: 'got eggs',
          rows: { shoppingItem: { id: 'row-a1', checked: true } },
        }),
      ],
      () =>
        Response.json(
          {
            applied: [done('a1', 'shopping', { alreadyDone: true })],
            skipped: [],
          },
          { status: 201 },
        ),
    );
    await applyAll();
    expect(await screen.findByText('1 applied')).toBeVisible();
    expect(
      screen.getByText('Eggs was already ticked, so that one counts as done.'),
    ).toBeVisible();
  });

  it('keeps the toast for 5.2 seconds without an Undo', async () => {
    setupReview(threeAdds);
    await applyAll();
    expect(await screen.findByText('3 applied')).toBeVisible();
    expect(screen.queryByRole('button', { name: /undo/i })).toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(screen.getByText('3 applied')).toBeVisible();
    await act(() => vi.advanceTimersByTimeAsync(1000));
    await waitFor(() => expect(screen.queryByText('3 applied')).toBeNull());
  });

  it('puts the result toast clear of the Dock mic', async () => {
    setupReview(threeAdds);
    await applyAll();
    await screen.findByText('3 applied');
    // jsdom's getComputedStyle ignores the responsive (media query) `bottom`, so the rule text is the only
    // place to read it; kept loose on purpose. 10 px gap above the capsule, rather than just above the Dock.
    const css = Array.from(document.styleSheets)
      .flatMap((sheet) => Array.from(sheet.cssRules))
      .map((rule) => rule.cssText)
      .join('\n');
    expect(css).toMatch(/MuiSnackbar-root \{ bottom: calc\(10px \+/);
  });

  it('puts focus on the voice button after Apply and after Discard', async () => {
    setupReview(threeAdds);
    await applyAll();
    const button = await talkButton();
    await waitFor(() => expect(button).toHaveFocus());

    // openReview renders the page again: take the first one away so there is one voice button.
    cleanup();
    const dialog = within(await openReview());
    await userEvent.click(dialog.getByRole('button', { name: 'Discard' }));
    await userEvent.click(dialog.getByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(async () => expect(await talkButton()).toHaveFocus());
  });

  describe('flashing the rows that changed', () => {
    const rows = {
      id: 'l1',
      groups: [
        {
          aisle: { id: 'aisle', name: 'Dairy', sortOrder: 1 },
          items: ['eggs', 'milk'].map((n) => ({
            id: `row-${n === 'eggs' ? 'a1' : 'a2'}`,
            ingredientId: `ing-${n}`,
            name: n === 'eggs' ? 'Eggs' : 'Milk',
            quantity: null,
            unit: null,
            checked: false,
            unmatched: false,
          })),
        },
      ],
      summary: { remaining: 2, checked: 0 },
    };
    // jsdom cannot paint, so the flash overlay is found by its marker attribute (it has no role or text).
    const flashed = () =>
      Array.from(document.querySelectorAll('[data-row-flash]')).map((el) =>
        el.closest('[role="group"]')?.getAttribute('aria-label'),
      );

    afterEach(() => stubMotion(false));

    it('flashes the rows the result names, once', async () => {
      setupReview(
        threeAdds,
        () =>
          Response.json(
            { applied: [done('a1')], skipped: [] },
            { status: 201 },
          ),
        rows,
      );
      await screen.findByText('Eggs').catch(() => undefined);
      await applyAll();
      await waitFor(() => expect(flashed()).toEqual(['Eggs']));
      // The tint sits behind the row's content: a negative z-index inside a host that is its own stacking
      // context (so it still lands above the opaque swipe surface, not behind it).
      const tint = document.querySelector('[data-row-flash]') as HTMLElement;
      expect(getComputedStyle(tint).zIndex).toBe('-1');
      expect(getComputedStyle(tint.parentElement!).isolation).toBe('isolate');
      expect(getComputedStyle(tint.parentElement!).position).toBe('relative');
      await act(() => vi.advanceTimersByTimeAsync(5000));
      expect(flashed()).toEqual([]);
    });

    it('flashes no row under reduced motion', async () => {
      stubMotion(true);
      setupReview(
        threeAdds,
        () =>
          Response.json(
            { applied: [done('a1'), done('a2')], skipped: [] },
            { status: 201 },
          ),
        rows,
      );
      await applyAll();
      await screen.findByRole('group', { name: 'Eggs' });
      expect(flashed()).toEqual([]);
    });
  });

  it('puts the Shopping List first on its own page, with the Pantry tagged "you named it"', async () => {
    setupReview([
      ...threeAdds.slice(0, 1),
      action({
        id: 'p1',
        target: 'pantry',
        op: 'add',
        text: 'yogurt in the pantry',
        ingredient: catalogItem('ing-yogurt', 'Yogurt'),
        location: 'fridge',
        rows: {},
      }),
    ]);
    const dialog = within(await openReview());
    await dialog.findByText('Yogurt', { selector: 'b' });

    expect(
      dialog.getByText(
        '2 changes on both lists · nothing is saved until you Apply',
      ),
    ).toBeVisible();
    const regions = dialog.getAllByRole('region');
    expect(regions.map((r) => r.getAttribute('aria-label'))).toEqual([
      'Shopping List',
      'Pantry',
    ]);
    expect(within(regions[0]).queryByText('you named it')).toBeNull();
    expect(within(regions[1]).getByText('you named it')).toBeVisible();
  });
});

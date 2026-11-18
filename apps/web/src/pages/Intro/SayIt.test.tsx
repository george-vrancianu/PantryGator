import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// The fake voice environment registers its mocks, so it comes before anything that reaches the microphone.
import {
  mic,
  resetVoiceEnvironment,
  stubVoiceFetch,
  talkButton,
  voiceAction,
} from '@/test/voice';
import { App } from '@/App';
import { goToSayIt, stubSetupMember, Where } from '@/test/intro';
import { renderWithProviders } from '@/test/render';
import { scanLanguagePreference } from '@/test/scan';
import { holdLongEnough, pressDown, useVoiceTimers } from '@/test/voiceHold';

const where = () => screen.getByLabelText('Where').textContent;

type Options = Parameters<typeof stubSetupMember>[0];

async function openSayIt(options: Options = {}) {
  const calls = stubSetupMember(options);
  // Wrap the stubbed API so every Voice Note upload (a FormData body) is kept.
  const voice = stubVoiceFetch(globalThis.fetch as never);
  const { sent } = voice;
  renderWithProviders(
    <>
      <App />
      <Where />
    </>,
    { route: '/intro/setup' },
  );
  await goToSayIt();
  return { calls, sent, holdReads: voice.holdReads };
}

const dimmed = () =>
  ['Home', 'Shopping', 'Pantry', 'Recipes', 'Camera'].map((name) =>
    screen.getByRole('button', { name }),
  );

describe('Setup 2, Say it', () => {
  beforeEach(() => resetVoiceEnvironment());
  afterEach(() => vi.unstubAllGlobals());

  it('shows Gator, the two example phrases and where the mic is', async () => {
    await openSayIt();
    expect(
      await screen.findByText(
        "Now just tell me what's in the cupboard, or what to buy. Leave as many notes as you like.",
      ),
    ).toBeVisible();
    expect(where()).toBe('/intro/say-it');
    expect(screen.getByText('2 of 2')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Gator, talking' })).toBeVisible();
    const examples = screen.getByRole('list', { name: 'Things you can say' });
    expect(
      within(examples).getByText('“We have rice and two tins of tomatoes”'),
    ).toBeInTheDocument();
    expect(
      within(examples).getByText('Goes straight to the Pantry'),
    ).toBeInTheDocument();
    expect(
      within(examples).getByText('“Put milk on the list”'),
    ).toBeInTheDocument();
    expect(
      within(examples).getByText('Adds it to the Shopping List'),
    ).toBeInTheDocument();
    expect(await screen.findByText('Hold the mic, talk, let go')).toBeVisible();
    expect(
      screen.getByText(
        "Your phone will ask for the microphone. Leave a few notes if you like, then review them together. Each recording is deleted once I've read it.",
      ),
    ).toBeVisible();
  });

  it('says nothing about the Pantry count when Setup has saved nothing', async () => {
    await openSayIt();
    await screen.findByText('Hold the mic, talk, let go');
    expect(screen.queryByText(/in your Pantry$/)).toBeNull();
  });

  it('lets only the mic be used: the camera and tabs are dimmed and out of the tab order', async () => {
    await openSayIt();
    const user = userEvent.setup();
    const talk = await talkButton();
    expect(talk).not.toHaveAttribute('aria-disabled');
    expect(
      screen.queryByRole('button', { name: /Spoken Language/ }),
    ).toBeNull();
    for (const control of dimmed()) {
      expect(control).toHaveAttribute('aria-disabled', 'true');
      expect(control).toHaveAttribute('tabindex', '-1');
    }
    await user.click(screen.getByRole('button', { name: 'Pantry' }));
    expect(where()).toBe('/intro/say-it');
  });

  it('skips to All set', async () => {
    const { calls } = await openSayIt();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('link', { name: 'Skip' }));
    expect(
      await screen.findByText(
        "You're all set! I'll keep an eye on your kitchen.",
      ),
    ).toBeInTheDocument();
    expect(where()).toBe('/intro/all-set');
    expect(calls.map((c) => c.key)).not.toContain('POST /api/voice');
  });

  it('is on the olive ground in the light look', async () => {
    await openSayIt();
    await screen.findByText('Hold the mic, talk, let go');
    expect(document.querySelector('[data-ground="olive"]')).not.toBeNull();
    expect(document.querySelector('[data-theme="light"]')).not.toBeNull();
  });

  describe('when the server cannot transcribe', () => {
    it('has no mic to teach: it says so and offers Continue to All set', async () => {
      await openSayIt({
        routes: {
          'GET /api/voice/config': () => Response.json({ configured: false }),
        },
      });
      expect(
        await screen.findByText(
          "Voice Notes aren't switched on here, so we'll skip this one.",
        ),
      ).toBeVisible();
      expect(screen.queryByRole('navigation')).toBeNull();
      expect(screen.queryByText('Hold the mic, talk, let go')).toBeNull();
      expect(
        screen.queryByRole('list', { name: 'Things you can say' }),
      ).toBeNull();

      const user = userEvent.setup();
      await user.click(screen.getByRole('link', { name: 'Continue' }));
      expect(
        await screen.findByText(
          "You're all set! I'll keep an eye on your kitchen.",
        ),
      ).toBeInTheDocument();
      expect(where()).toBe('/intro/all-set');
    });
  });
});

describe('Setup 2, holding the mic', () => {
  beforeEach(() => {
    useVoiceTimers();
    resetVoiceEnvironment();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const heard = {
    transcript: 'we have rice and two tins of tomatoes, put milk on the list',
    actions: [
      voiceAction({ id: 'a1', target: 'pantry', op: 'add', text: 'rice' }),
      voiceAction({ id: 'a2', target: 'shopping', op: 'add', text: 'milk' }),
    ],
  };

  async function recordNote(options: Options = {}) {
    const { sent } = await openSayIt({
      routes: {
        'POST /api/voice': () => Response.json(heard, { status: 201 }),
        ...options?.routes,
      },
    });
    const button = await talkButton();
    pressDown(button);
    await screen.findByText("Gator's listening");
    await holdLongEnough();
    return { sent, button };
  }

  it('shows the coach line and the Listening card while held, and the permission is the real one', async () => {
    await recordNote();
    expect(screen.getByText('Keep holding while you talk.')).toBeVisible();
    expect(screen.getByText("Let go when you're done.")).toBeVisible();
    expect(screen.queryByText('Hold the mic, talk, let go')).toBeNull();
    expect(
      screen
        .getByText('Keep holding while you talk.')
        .closest('[role="status"]'),
    ).not.toBeNull();
    expect(mic.start).toHaveBeenCalledTimes(1);
  });

  it('sends the Voice Note with the Pantry as its Default List and keeps it in the Voice Inbox strip', async () => {
    const { sent, button } = await recordNote();
    fireEvent.pointerUp(button);

    expect(
      await screen.findByRole('button', {
        name: 'All read: 1 ready to review. Open Review',
      }),
    ).toBeVisible();
    // Nothing opens by itself.
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(sent).toHaveLength(1);
    expect(sent[0].get('defaultTarget')).toBe('pantry');
    expect(where()).toBe('/intro/say-it');
  });

  it('takes several notes: the mic works while the first is being read, and each is in the strip', async () => {
    const { sent, holdReads } = await openSayIt();
    holdReads();
    const button = await talkButton();
    for (const count of [1, 2]) {
      pressDown(button);
      await screen.findByText("Gator's listening");
      await holdLongEnough();
      fireEvent.pointerUp(button);
      await waitFor(() => expect(sent).toHaveLength(count));
    }

    expect(mic.start).toHaveBeenCalledTimes(2);
    expect(
      await screen.findByRole('button', {
        name: 'Gator is working: 2 being read. Open Review',
      }),
    ).toBeVisible();
    expect(sent.map((note) => note.get('defaultTarget'))).toEqual([
      'pantry',
      'pantry',
    ]);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('stops at the Voice Inbox limit of 5 notes', async () => {
    const { sent, holdReads } = await openSayIt();
    holdReads();
    const button = await talkButton();
    for (const count of [1, 2, 3, 4, 5]) {
      pressDown(button);
      await screen.findByText("Gator's listening");
      await holdLongEnough();
      fireEvent.pointerUp(button);
      // Only two are read at once; the others wait their turn in the strip.
      await screen.findByRole('button', {
        name: `Gator is working: ${count} being read. Open Review`,
      });
    }

    pressDown(button);
    await holdLongEnough();
    fireEvent.pointerUp(button);

    expect(await screen.findByText('Review your notes first')).toBeVisible();
    expect(mic.start).toHaveBeenCalledTimes(5);
    expect(sent).toHaveLength(2);
  });

  it("records in the Member's Spoken Language", async () => {
    const { sent, button } = await recordNote({
      routes: scanLanguagePreference('en', 'ro'),
    });
    fireEvent.pointerUp(button);
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0].get('spokenLanguage')).toBe('ro');
  });
});

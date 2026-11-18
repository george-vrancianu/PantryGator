import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// The fake voice environment registers its mocks, so it comes before anything that reaches the microphone.
import {
  openReady,
  resetVoiceEnvironment,
  stubVoiceFetch,
  talkButton,
  voiceAction,
  voiceIngredient,
} from '@/test/voice';
import { stubSetupMember as stubMember } from '@/test/intro';
import { renderWithProviders } from '@/test/render';
import { holdLongEnough, pressDown, useVoiceTimers } from '@/test/voiceHold';
import { VoiceHostProvider, VoiceHostSlot } from '../VoiceHost/VoiceHost';
import { AppDock } from '@/components/layout/AppDock/AppDock';
import {
  APP_VOICE_SETTINGS,
  VoiceNote,
  type VoiceNoteSettings,
} from './VoiceNote';

const HEARD = {
  transcript: 'We have rice.',
  actions: [
    voiceAction({
      id: 'a1',
      target: 'pantry',
      op: 'add',
      text: 'rice',
      ingredient: voiceIngredient('rice', 'Rice'),
      defaults: { location: 'cupboard' },
    }),
  ],
};
const APPLIED = {
  applied: [
    { actionId: 'a1', list: 'pantry', rowId: 'row-a1', alreadyDone: false },
  ],
  skipped: [],
};

/** The host alone, on a page with no list of its own, driven only by its settings. */
async function host(settings?: VoiceNoteSettings, hangRead = false) {
  stubMember({
    routes: {
      'POST /api/voice': () =>
        hangRead
          ? new Promise<Response>(() => {})
          : Response.json(HEARD, { status: 201 }),
      'POST /api/voice/apply': () => Response.json(APPLIED, { status: 201 }),
    },
  });
  const { sent } = stubVoiceFetch(globalThis.fetch as never);
  renderWithProviders(
    <VoiceHostProvider>
      <VoiceHostSlot />
      <VoiceNote settings={settings} />
      <AppDock />
    </VoiceHostProvider>,
    { route: '/recipes' },
  );
  const button = await talkButton();
  pressDown(button);
  await screen.findByText("Gator's listening");
  await holdLongEnough();
  fireEvent.pointerUp(button);
  return { sent };
}

describe('the Voice Note host settings', () => {
  beforeEach(() => {
    useVoiceTimers();
    resetVoiceEnvironment();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  /** Nothing opens by itself: the Member taps the Gator bubble and presses Review in the sheet. */
  const openFromStrip = (name: string | RegExp) => openReady({ name });
  const applyOne = async () => {
    const review = await openFromStrip(/what I heard|Review/i);
    await userEvent
      .setup()
      .click(within(review).getByRole('button', { name: /Do this one|Apply/ }));
  };

  it('the Voice Inbox strip shows the read and the note waits in it', async () => {
    const { sent } = await host(APP_VOICE_SETTINGS);
    expect(await screen.findByText(/ready/i)).toBeVisible();
    expect(sent[0].get('defaultTarget')).toBe('none');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('defaultTarget: forces the Default List over the route', async () => {
    const { sent } = await host({
      ...APP_VOICE_SETTINGS,
      defaultTarget: 'pantry',
    });
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0].get('defaultTarget')).toBe('pantry');
  });

  it('review.look: setup draws the Intro Review, app keeps the app one', async () => {
    await host({
      review: { ...APP_VOICE_SETTINGS.review, look: 'setup' },
    });
    const review = await openFromStrip("Here's what I heard");
    expect(
      within(review).getByRole('button', { name: 'Do this one' }),
    ).toBeVisible();
  });

  it('review.look: app keeps the app heading', async () => {
    await host(APP_VOICE_SETTINGS);
    const review = await openFromStrip(/./);
    expect(review).toHaveAccessibleName(/Review|What I heard/i);
    expect(review).not.toHaveAccessibleName("Here's what I heard");
  });

  it('review.toastOnApply on: Apply toasts, and afterApply is told without changing the toast or look', async () => {
    const afterApply = vi.fn();
    await host({
      review: { ...APP_VOICE_SETTINGS.review, afterApply },
    });
    await applyOne();
    await vi.waitFor(() => expect(afterApply).toHaveBeenCalledTimes(1));
    expect(afterApply.mock.calls[0][0]).toEqual(APPLIED);
    expect(afterApply.mock.calls[0][1]).toHaveLength(1);
    expect(await screen.findByText(/applied/i)).toBeVisible();
  });

  it('review.toastOnApply off: Apply shows no toast and hands the result to afterApply', async () => {
    const afterApply = vi.fn();
    await host({
      review: { ...APP_VOICE_SETTINGS.review, toastOnApply: false, afterApply },
    });
    await applyOne();
    await vi.waitFor(() => expect(afterApply).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/applied/i)).not.toBeInTheDocument();
  });
});

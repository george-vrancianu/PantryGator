import { act, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetVoiceEnvironment } from '@/test/voice';
import { renderWithProviders, stubApi } from '@/test/render';
import { voiceNote } from '@/lib/voiceNote';

/** A page with no Voice Note button: the notices still speak. */
const Elsewhere = () => <p>Somewhere else</p>;

const readOn = (reply: () => Response | Promise<Response>) => {
  const { fetchMock } = stubApi({ 'POST /api/voice': reply });
  vi.stubGlobal('fetch', fetchMock);
};

/** Records a Voice Note from the fake microphone and lets go: the read starts. */
const start = async () => {
  await voiceNote.start({
    defaultTarget: 'shopping',
    spokenLanguage: 'en',
  });
  await voiceNote.stop();
};
const settled = () =>
  waitFor(() => expect(voiceNote.getState().phase).not.toBe('reading'));

describe('Voice Note notices at the app root', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    resetVoiceEnvironment();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('says a recording was cancelled, but not when it is dropped quietly', async () => {
    renderWithProviders(<Elsewhere />);
    await act(() =>
      voiceNote.start({
        defaultTarget: 'shopping',
        spokenLanguage: 'en',
      }),
    );
    act(() => voiceNote.cancel({ quiet: true }));
    expect(screen.queryByText('Cancelled. Nothing was sent.')).toBeNull();

    await act(() =>
      voiceNote.start({
        defaultTarget: 'shopping',
        spokenLanguage: 'en',
      }),
    );
    act(() => voiceNote.cancel());
    expect(
      await screen.findByText('Cancelled. Nothing was sent.'),
    ).toBeVisible();
  });

  it('says a recording was stopped at the 60-second limit', async () => {
    readOn(() => new Promise<Response>(() => undefined));
    renderWithProviders(<Elsewhere />);
    await act(() =>
      voiceNote.start({
        defaultTarget: 'shopping',
        spokenLanguage: 'en',
      }),
    );
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(
      await screen.findByText('Stopped at 1 minute · Sending what you said.'),
    ).toBeVisible();
  });

  it('says a cancelled read was not saved, on a page with no Voice Note button', async () => {
    readOn(() => new Promise<Response>(() => undefined));
    renderWithProviders(<Elsewhere />);
    await act(() => start());

    act(() => voiceNote.cancelReading(voiceNote.getState().inbox.notes[0].id));

    expect(
      await screen.findByText('Cancelled. Nothing was saved.'),
    ).toBeVisible();
  });

  it('says a failed recording was discarded', async () => {
    readOn(() =>
      Response.json(
        { code: 'voice.provider_unavailable', params: {} },
        { status: 502 },
      ),
    );
    renderWithProviders(<Elsewhere />);
    await act(() => start());
    await settled();

    act(() => voiceNote.dismiss(voiceNote.getState().inbox.notes[0].id));

    expect(await screen.findByText('Recording discarded')).toBeVisible();
  });

  it('turns Voice Notes switched off into the cached configuration, quietly', async () => {
    readOn(() =>
      Response.json(
        { code: 'voice.not_configured', params: {} },
        { status: 503 },
      ),
    );
    const { queryClient } = renderWithProviders(<Elsewhere />);
    queryClient.setQueryData(['voice', 'config'], { configured: true });

    await act(() => start());
    await settled();

    expect(queryClient.getQueryData(['voice', 'config'])).toEqual({
      configured: false,
    });
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { paintedColour } from '@pocket-pantry/ui/test/colour';
import userEvent from '@testing-library/user-event';
import { Link, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetVoiceEnvironment, stubVoiceFetch } from '../../test/voice';
import { holdLongEnough, useVoiceTimers } from '../../test/voiceHold';
import {
  renderInAppLayout,
  renderWithProviders,
  stubApi,
} from '../../test/render';
import { AppLayout } from '../../components/AppLayout';
import { PantryPage } from './PantryPage';

function setup(voiceConfigured = true) {
  const { fetchMock } = stubApi({
    'GET /api/pantry/recently-stocked': () =>
      Response.json({ ingredients: [] }),
    'GET /api/pantry': () => Response.json({ batches: [], runningLow: [] }),
    'GET /api/voice/config': () =>
      Response.json({ configured: voiceConfigured }),
    'GET /api/catalog/search': () => Response.json({ results: [] }),
  });
  return stubVoiceFetch(fetchMock);
}

const callout = () => screen.queryByText('Hold the mic, talk, let go');
const litMic = () =>
  document.querySelector('[data-dock-capsule] > div:first-child');

async function sayIt() {
  renderInAppLayout(<PantryPage />, '/pantry');
  await userEvent.click(
    await screen.findByRole('button', { name: 'Add batch' }),
  );
  await userEvent.click(await screen.findByRole('button', { name: 'Say it' }));
  await screen.findByText('Hold the mic, talk, let go');
}

describe('Say it in the Add to Pantry sheet', () => {
  beforeEach(() => {
    useVoiceTimers();
    resetVoiceEnvironment();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('closes the sheet, lights the mic and shows the callout', async () => {
    setup();
    await sayIt();
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Add to Pantry' }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByText(/two litres of milk/)).toBeInTheDocument();
    expect(paintedColour(litMic()!, 'background-color').toUpperCase()).toBe(
      '#E8CB7C',
    );
    // Nothing else is disabled.
    expect(
      screen
        .getByRole('link', { name: 'Recipes' })
        .hasAttribute('aria-disabled'),
    ).toBe(false);
    expect(
      screen
        .getByRole('link', { name: 'Camera' })
        .hasAttribute('aria-disabled'),
    ).toBe(false);
  });

  it('clears after 4.8 s', async () => {
    setup();
    await sayIt();
    await act(() => vi.advanceTimersByTimeAsync(4700));
    expect(callout()).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(200));
    expect(callout()).not.toBeInTheDocument();
  });

  it('clears on a tap outside the capsule', async () => {
    setup();
    await sayIt();
    fireEvent.pointerDown(document.body);
    expect(callout()).not.toBeInTheDocument();
  });

  it('clears when the mic is pressed, and the press starts a Voice Note for the Pantry', async () => {
    const { sent } = setup();
    await sayIt();
    const mic = await screen.findByRole('button', {
      name: /hold to record a voice note/i,
    });
    fireEvent.pointerDown(mic, { isPrimary: true });
    expect(callout()).not.toBeInTheDocument();
    await screen.findByText("Gator's listening");
    await holdLongEnough();
    fireEvent.pointerUp(mic, { isPrimary: true });
    await waitFor(() => expect(sent.length).toBeGreaterThan(0));
    expect(sent[0]!.get('defaultTarget')).toBe('pantry');
  });

  it('clears when a Voice Note is started from the keyboard', async () => {
    setup();
    await sayIt();
    const mic = await screen.findByRole('button', {
      name: /hold to record a voice note/i,
    });
    fireEvent.keyDown(mic, { key: ' ' });
    await screen.findByText("Gator's listening");
    await waitFor(() => expect(callout()).not.toBeInTheDocument());
  });

  it('does not come back after leaving through the camera and returning', async () => {
    setup();
    renderWithProviders(
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/pantry" element={<PantryPage />} />
          <Route path="/scan" element={<Link to="/pantry">Back</Link>} />
        </Route>
      </Routes>,
      { route: '/pantry' },
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Add batch' }),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Say it' }),
    );
    await screen.findByText('Hold the mic, talk, let go');
    await userEvent.click(await screen.findByRole('link', { name: 'Camera' }));
    await userEvent.click(await screen.findByRole('link', { name: 'Back' }));
    await screen.findByRole('link', { name: 'Camera' });
    expect(callout()).not.toBeInTheDocument();
    expect(paintedColour(litMic()!, 'background-color').toUpperCase()).not.toBe(
      '#E8CB7C',
    );
  });

  it('shows no Say it tile where there is no mic', async () => {
    setup(false);
    renderInAppLayout(<PantryPage />, '/pantry');
    await userEvent.click(
      await screen.findByRole('button', { name: 'Add batch' }),
    );
    await screen.findByRole('button', { name: 'Take a photo' });
    expect(screen.queryByRole('button', { name: 'Say it' })).toBeNull();
  });
});

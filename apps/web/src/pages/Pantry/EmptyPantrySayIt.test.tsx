import { resetVoiceEnvironment, stubVoiceFetch } from '../../test/voice';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderInAppLayout, stubApi } from '../../test/render';
import { useVoiceTimers } from '../../test/voiceHold';
import { PantryPage } from './PantryPage';

describe('Say it on the Empty Pantry', () => {
  beforeEach(() => {
    useVoiceTimers();
    resetVoiceEnvironment();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('lights the Dock mic with the callout and opens no sheet', async () => {
    const { fetchMock } = stubApi({
      'GET /api/pantry': () => Response.json({ batches: [], runningLow: [] }),
      'GET /api/shopping-list': () =>
        Response.json({
          id: 'l',
          groups: [],
          summary: { remaining: 0, checked: 0 },
        }),
      'GET /api/voice/config': () => Response.json({ configured: true }),
    });
    stubVoiceFetch(fetchMock);
    renderInAppLayout(<PantryPage />, '/pantry');

    await userEvent.click(
      await screen.findByRole('button', { name: 'Say it' }),
    );

    expect(
      await screen.findByText('Hold the mic, talk, let go'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('dialog', { name: 'Add to Pantry' }),
    ).not.toBeInTheDocument();
  });
});

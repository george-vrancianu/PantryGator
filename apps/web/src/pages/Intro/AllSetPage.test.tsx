import { paintedColour } from '@pocket-pantry/ui/test/colour';
import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, stubApi } from '../../test/render';
import { IntroProvider } from '../../lib/useIntro';
import { AllSetPage } from './AllSetPage';

describe('the All set page', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('paints the Go button butter, not the primary green gradient', async () => {
    const { fetchMock } = stubApi({});
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <IntroProvider>
        <AllSetPage />
      </IntroProvider>,
      { route: '/intro/all-set' },
    );

    const go = await screen.findByRole('button', { name: 'Go to my kitchen' });
    const style = getComputedStyle(go);
    // A background image paints over the colour, so none may be set.
    expect(style.backgroundImage).toBe('none');
    // The painted colour, with the Theme variable resolved: the light butter.
    expect(paintedColour(go, 'background-color')).toBe('#E8CB7C');
  });
});

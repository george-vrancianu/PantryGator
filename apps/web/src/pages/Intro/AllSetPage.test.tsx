import { paintedColour } from '@pocket-pantry/ui/test/colour';
import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, stubApi } from '@/test/render';
import { IntroProvider } from '@/lib/useIntro';
import { AllSetPage } from './AllSetPage';

describe('the All set page', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('stands on the Canopy ground with the Go button in the primary look', async () => {
    const { fetchMock } = stubApi({});
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <IntroProvider>
        <AllSetPage />
      </IntroProvider>,
      { route: '/intro/all-set' },
    );

    const go = await screen.findByRole('button', { name: 'Go to my kitchen' });
    expect(document.querySelector('[data-ground="canopy"]')).not.toBeNull();
    // On the light sheet it is the primary button, not the butter one the olive ground needed.
    expect(paintedColour(go, 'background-color')).not.toBe('#E8CB7C');
  });
});

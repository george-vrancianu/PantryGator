import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { recipeReads } from '../../lib/recipeReads';
import { renderWithProviders } from '../../test/render';
import { openBubbleSheet } from '../../test/voiceDom';
import { BackgroundHost } from './BackgroundHost';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const holdARead = () => {
  vi.stubGlobal('fetch', () => new Promise<Response>(() => {}));
  recipeReads.submit(
    { kind: 'link', url: 'https://example.com/soup' },
    'source',
  );
};

describe('BackgroundHost link reads', () => {
  it('leaves link reads to a host that asks for them (the Intro hosts Voice Notes only)', () => {
    holdARead();
    renderWithProviders(<BackgroundHost />);
    expect(screen.queryByTestId('gator-bubble')).not.toBeInTheDocument();
  });

  it('shows them when the host asks, in the Review sheet the bubble opens', async () => {
    holdARead();
    renderWithProviders(<BackgroundHost recipeReads />);
    expect(
      await screen.findByRole('button', {
        name: 'Gator is working: 1 being read. Open Review',
      }),
    ).toBeInTheDocument();
    await openBubbleSheet();
    expect(screen.getByText(/Reading a recipe link/)).toBeInTheDocument();
  });
});

describe('BackgroundHost bubble', () => {
  it('is hidden with nothing in the background', () => {
    renderWithProviders(<BackgroundHost recipeReads />);
    expect(screen.queryByTestId('gator-bubble')).not.toBeInTheDocument();
  });

  it('rests 16 above the Dock, or above the bottom inset where there is none', () => {
    holdARead();
    renderWithProviders(<BackgroundHost recipeReads dock={false} />);
    expect(screen.getByTestId('gator-bubble')).toBeInTheDocument();
  });
});

import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { authoredCss } from '../../test/stickyHeader';
import { ListeningCard } from './ListeningCard';

describe('ListeningCard', () => {
  it('keeps its 16px margins at least as wide as the left and right insets', () => {
    renderWithProviders(
      <ListeningCard
        starting
        target="pantry"
        spokenLanguage="en"
        level={() => 0}
      />,
    );
    const css = authoredCss(screen.getByRole('status'));
    expect(css).toContain('left:max(16px, env(safe-area-inset-left');
    expect(css).toContain('right:max(16px, env(safe-area-inset-right');
  });
});

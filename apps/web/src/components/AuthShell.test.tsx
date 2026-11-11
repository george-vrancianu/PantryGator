import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../test/render';
import { authoredCss } from '../test/stickyHeader';
import { AuthShell } from './AuthShell';

describe('AuthShell', () => {
  it('clears the top inset: the look pads it and the card fills only the rest of the screen', () => {
    renderWithProviders(
      <AuthShell title="Log in" subtitle="Welcome back">
        <p>Form</p>
      </AuthShell>,
    );
    const main = screen.getByRole('main');
    const look = main.parentElement!.parentElement!;
    expect(authoredCss(look)).toContain('padding-top:env(safe-area-inset-top');
    expect(authoredCss(main.parentElement!)).toContain(
      'min-height:calc(100vh - env(safe-area-inset-top',
    );
  });

  it('shows the app name beside the logo, leaving the title the only heading', () => {
    renderWithProviders(
      <AuthShell title="Create your account" subtitle="Start" back="Back">
        <p>Form</p>
      </AuthShell>,
    );
    expect(screen.getByText('PantryGator')).toBeInTheDocument();
    expect(screen.getAllByRole('heading')).toHaveLength(1);
    expect(
      screen.getByRole('heading', { name: 'Create your account' }),
    ).toBeInTheDocument();
  });
});

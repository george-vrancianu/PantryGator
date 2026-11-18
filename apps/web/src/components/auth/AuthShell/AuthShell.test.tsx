import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { authoredCss } from '@pocket-pantry/ui/test/authoredCss';
import { renderWithProviders } from '@/test/render';
import { AuthShell } from './AuthShell';

describe('AuthShell', () => {
  it('stands on the Canopy ground, clearing the top inset inside the Canopy and putting the form on the sheet', () => {
    renderWithProviders(
      <AuthShell title="Log in" subtitle="Welcome back">
        <p>Form</p>
      </AuthShell>,
    );
    const main = screen.getByRole('main');
    expect(main.closest('[data-ground]')).toHaveAttribute(
      'data-ground',
      'canopy',
    );
    const canopy = document.querySelector<HTMLElement>(
      '[data-region="canopy"]',
    )!;
    expect(authoredCss(canopy)).toContain('env(safe-area-inset-top');
    expect(main).toHaveTextContent('Form');
    expect(canopy).toHaveTextContent('PantryGator');
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

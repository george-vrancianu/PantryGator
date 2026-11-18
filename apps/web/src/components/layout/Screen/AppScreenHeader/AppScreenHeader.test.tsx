import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { AppScreenHeader } from './AppScreenHeader';

describe('AppScreenHeader', () => {
  it('starts with the logo, a link to Home, and no Home button or Settings gear', () => {
    renderWithProviders(<AppScreenHeader title="Pantry" />, {
      route: '/pantry',
    });

    const links = screen.getAllByRole('link');
    expect(links.map((l) => l.getAttribute('aria-label'))).toEqual([
      'PantryGator, go to Home',
    ]);
    expect(links[0]).toHaveAttribute('href', '/');
    expect(
      screen.queryByRole('link', { name: 'Home' }),
    ).not.toBeInTheDocument();
  });

  it('shows the logo where the Dock is hidden too', () => {
    renderWithProviders(<AppScreenHeader title="Customise" />, {
      route: '/customise',
    });

    expect(
      screen.getByRole('link', { name: 'PantryGator, go to Home' }),
    ).toHaveAttribute('href', '/');
  });

  it('leaves the logo out where Back stands', () => {
    renderWithProviders(
      <AppScreenHeader
        title="Explore"
        back={{ label: 'Back', href: '/recipes' }}
      />,
      { route: '/recipes/explore' },
    );

    expect(screen.getByRole('link', { name: 'Back' })).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'PantryGator, go to Home' }),
    ).not.toBeInTheDocument();
  });
});

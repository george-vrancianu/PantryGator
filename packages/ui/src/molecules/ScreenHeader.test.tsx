import { cleanup, fireEvent, screen } from '@testing-library/react';
import type { MouseEvent } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlusIcon } from '../atoms/icons';
import { authoredCss } from '../test/authoredCss';
import { renderWithTheme } from '../test/render';
import { ScreenHeader } from './ScreenHeader';

describe('ScreenHeader', () => {
  afterEach(cleanup);

  it('gives its 28px of top room way to the top inset instead of stacking on it', () => {
    const { container } = renderWithTheme(<ScreenHeader title="Pantry" />);
    const header = container.querySelector('header') as HTMLElement;
    expect(authoredCss(header)).toContain(
      'padding-top:max(0px, calc(28px - env(safe-area-inset-top, 0px)))',
    );
  });

  it('shows the action as the only button without `home` or `back`', () => {
    renderWithTheme(
      <ScreenHeader
        title="Pantry"
        action={{ label: 'Add', icon: <PlusIcon />, href: '/add' }}
      />,
    );

    const names = screen
      .getAllByRole('link')
      .map((link) => link.getAttribute('aria-label'));
    expect(names).toEqual(['Add']);
  });

  it('shows the subline under the title, and not without a title', () => {
    const { rerender } = renderWithTheme(
      <ScreenHeader title="New Recipe" subline={<span>Draft saved</span>} />,
    );
    expect(screen.getByText('Draft saved')).toBeTruthy();
    rerender(<ScreenHeader subline={<span>Draft saved</span>} />);
    expect(screen.queryByText('Draft saved')).toBeNull();
  });

  it('shows Home before the title with `home`', () => {
    renderWithTheme(
      <ScreenHeader title="Customise" home={{ label: 'Home' }} />,
    );

    expect(
      screen.getByRole('link', { name: 'Home' }).getAttribute('href'),
    ).toBe('/');
  });

  it('opens a menu when the action has items', async () => {
    renderWithTheme(
      <ScreenHeader
        title="Recipes"
        action={{
          label: 'Add',
          icon: <PlusIcon />,
          items: [{ label: 'New recipe', href: '/recipes/new' }],
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(
      await screen.findByRole('menuitem', { name: 'New recipe' }),
    ).toBeTruthy();
  });

  describe('back', () => {
    it('hides the badge at 0 and shows "+n" above 0, the link name carrying the count', () => {
      const { rerender } = renderWithTheme(
        <ScreenHeader
          title="Explore"
          back={{ label: 'Back', href: '/recipes', badge: 0 }}
        />,
      );
      expect(screen.queryByTestId('back-badge')).toBeNull();

      rerender(
        <ScreenHeader
          title="Explore"
          back={{ label: 'Back, 3 added', href: '/recipes', badge: 3 }}
        />,
      );
      expect(screen.getByTestId('back-badge').textContent).toBe('+3');
      expect(screen.getByRole('link', { name: 'Back, 3 added' })).toBeTruthy();
    });

    it('calls onClick with the click event, which can prevent the navigation', () => {
      const onClick = vi.fn((event: MouseEvent<HTMLElement>) =>
        event.preventDefault(),
      );
      renderWithTheme(
        <ScreenHeader
          title="Explore"
          back={{ label: 'Back', href: '/r', onClick }}
        />,
      );
      fireEvent.click(screen.getByRole('link', { name: 'Back' }));
      expect(onClick).toHaveBeenCalledTimes(1);
      expect(onClick.mock.calls[0]?.[0].defaultPrevented).toBe(true);
    });
  });
});

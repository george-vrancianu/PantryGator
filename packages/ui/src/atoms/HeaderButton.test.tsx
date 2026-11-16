import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { authoredCss } from '../test/authoredCss';
import { renderWithTheme } from '../test/render';
import { HeaderButton } from './HeaderButton';

describe('HeaderButton', () => {
  afterEach(cleanup);

  it('is a 44 high labelled button in the Canopy chip look, named by its label', () => {
    const onClick = vi.fn();
    renderWithTheme(
      <HeaderButton icon={<svg />} onClick={onClick}>
        Explore
      </HeaderButton>,
    );
    const button = screen.getByRole('button', { name: 'Explore' });
    const css = authoredCss(button);
    expect(css).toContain('height:44px');
    expect(css).toContain('--pp-canopy-chip');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('is a link when given an href', () => {
    renderWithTheme(<HeaderButton href="/settings">Settings</HeaderButton>);
    expect(
      screen.getByRole('link', { name: 'Settings' }).getAttribute('href'),
    ).toBe('/settings');
  });

  it('is the gold key as a key tone', () => {
    renderWithTheme(<HeaderButton tone="key">Save</HeaderButton>);
    expect(authoredCss(screen.getByRole('button', { name: 'Save' }))).toContain(
      '--pp-key-bg',
    );
  });
});

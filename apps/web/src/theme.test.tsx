import { Box } from '@mui/material';
import { tokens, writeAppearance } from '@pocket-pantry/ui';
import { act, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { paintedColour } from '@pocket-pantry/ui/test/colour';
import { renderWithProviders } from './test/render';
import { stubMatchMedia, stubSystemScheme } from './test/viewport';

const BG = { light: '#EDECE5', dark: '#101511' };

function store(appearance: { theme: string; matchSystem: boolean }) {
  localStorage.setItem('pp.appearance', JSON.stringify(appearance));
}

const rootTheme = () => document.documentElement.dataset.theme;
const themeColor = () =>
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content;

beforeEach(() => {
  const meta = document.createElement('meta');
  meta.name = 'theme-color';
  meta.content = '#000000';
  document.head.append(meta);
});

afterEach(() => {
  document.head.querySelector('meta[name="theme-color"]')?.remove();
  document.documentElement.removeAttribute('data-theme');
  vi.unstubAllGlobals();
});

describe('Themes', () => {
  it('follows the system on a new device: Light in light mode', () => {
    stubSystemScheme(false);
    renderWithProviders(<p>Pantry</p>);
    expect(rootTheme()).toBe('light');
    expect(themeColor()).toBe(BG.light);
  });

  it('follows the system on a new device: Dark in dark mode', () => {
    stubSystemScheme(true);
    renderWithProviders(<p>Pantry</p>);
    expect(rootTheme()).toBe('dark');
    expect(themeColor()).toBe(BG.dark);
  });

  it('switches with the system scheme while the app is open, with Match system on', () => {
    const system = stubSystemScheme(false);
    store({ theme: 'light', matchSystem: true });
    renderWithProviders(<p>Pantry</p>);
    expect(rootTheme()).toBe('light');

    act(() => system.setDark(true));
    expect(rootTheme()).toBe('dark');
    expect(themeColor()).toBe(BG.dark);

    act(() => system.setDark(false));
    expect(rootTheme()).toBe('light');
    expect(themeColor()).toBe(BG.light);
  });

  it('ignores the system scheme with Match system off', () => {
    const system = stubSystemScheme(false);
    store({ theme: 'light', matchSystem: false });
    renderWithProviders(<p>Pantry</p>);
    act(() => system.setDark(true));
    expect(rootTheme()).toBe('light');
  });

  it.each(['light', 'dark'] as const)(
    'renders in the stored %s Theme with Match system off',
    (theme) => {
      store({ theme, matchSystem: false });
      renderWithProviders(<p>Pantry</p>);
      expect(rootTheme()).toBe(theme);
      expect(themeColor()).toBe(BG[theme]);
    },
  );

  it.each(['warm', 'minimal'])('reads a stored %s Theme as Light', (theme) => {
    store({ theme, matchSystem: false });
    renderWithProviders(<p>Pantry</p>);
    expect(rootTheme()).toBe('light');
    expect(themeColor()).toBe(BG.light);
  });

  it('uses Dark in system dark mode with Match system on', () => {
    stubMatchMedia((query) => query === '(prefers-color-scheme: dark)');
    store({ theme: 'light', matchSystem: true });
    renderWithProviders(<p>Pantry</p>);
    expect(rootTheme()).toBe('dark');
  });

  it('uses Light in system light mode with Match system on, whichever Theme is chosen', () => {
    stubMatchMedia(() => false);
    store({ theme: 'dark', matchSystem: true });
    renderWithProviders(<p>Pantry</p>);
    expect(rootTheme()).toBe('light');
  });

  it('switches Theme and theme-color at once when the appearance changes', () => {
    renderWithProviders(<p>Pantry</p>);
    act(() => writeAppearance({ theme: 'dark', matchSystem: false }));
    expect(rootTheme()).toBe('dark');
    expect(themeColor()).toBe(BG.dark);
    expect(JSON.parse(localStorage.getItem('pp.appearance')!)).toEqual({
      theme: 'dark',
      matchSystem: false,
    });
  });

  it('follows a preference changed in another tab', () => {
    renderWithProviders(<p>Pantry</p>);
    const value = JSON.stringify({ theme: 'dark', matchSystem: false });
    localStorage.setItem('pp.appearance', value);
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', { key: 'pp.appearance', newValue: value }),
      );
    });
    expect(rootTheme()).toBe('dark');
    expect(themeColor()).toBe(BG.dark);
  });

  it('paints a subtree forced into Dark with dark colours under a light root', () => {
    renderWithProviders(
      <>
        <Box data-testid="page" sx={{ bgcolor: tokens.color.bg }} />
        <Box data-theme="dark">
          <Box data-testid="forced" sx={{ bgcolor: tokens.color.bg }} />
        </Box>
      </>,
    );
    expect(rootTheme()).toBe('light');
    expect(paintedColour(screen.getByTestId('page'), 'background-color')).toBe(
      BG.light,
    );
    expect(
      paintedColour(screen.getByTestId('forced'), 'background-color'),
    ).toBe(BG.dark);
  });
});

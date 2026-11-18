import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { AppDock } from './AppDock';

describe('AppDock Recipes tab', () => {
  afterEach(cleanup);

  it.each([
    ['en', 'Recipes'],
    ['ro', 'Rețete'],
    ['da', 'Opskrifter'],
  ] as const)('shows the open book labelled %s', (locale, label) => {
    renderWithProviders(<AppDock activeKey="home" />, { locale });
    const tab = screen.getByRole('link', { name: label });
    const icon = tab.querySelector('svg')!;
    expect(icon.getAttribute('aria-hidden')).toBe('true');
    expect(icon.querySelector('path')!.getAttribute('d')).toMatch(
      /^M12 7c-1\.7-1\.6/,
    );
  });
});

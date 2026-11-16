import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { paintedColour } from '@pocket-pantry/ui/test/colour';
import { renderWithProviders } from '../../../test/render';
import { PantryFilters } from './PantryFilters';

/** The handoff's chip `on` pair: accent-on-tint text on the accent tint. */
const CHIP_ON = {
  light: { text: '#1C5B3B', fill: '#E2F0E7' },
  dark: { text: '#A8E6C0', fill: '#1C3327' },
} as const;

describe('PantryFilters', () => {
  it.each(Object.keys(CHIP_ON) as (keyof typeof CHIP_ON)[])(
    'paints the chosen Location chip in the %s Theme',
    (theme) => {
      localStorage.setItem(
        'pp.appearance',
        JSON.stringify({ theme, matchSystem: false }),
      );
      renderWithProviders(
        <PantryFilters
          query=""
          onQueryChange={() => {}}
          filter="fridge"
          onFilterChange={() => {}}
          counts={{ all: 3, fridge: 2, freezer: 1, cupboard: 0, spices: 0 }}
        />,
      );
      const chip = screen.getByRole('button', {
        name: /Fridge/,
        pressed: true,
      });
      expect(paintedColour(chip, 'color')).toBe(CHIP_ON[theme].text);
      expect(paintedColour(chip, 'background-color')).toBe(CHIP_ON[theme].fill);
    },
  );
});

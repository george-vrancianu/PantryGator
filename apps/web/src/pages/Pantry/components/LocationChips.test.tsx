import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { paintedColour } from '@pocket-pantry/ui/test/colour';
import { renderWithProviders } from '../../../test/render';
import { LocationChips } from './LocationChips';

/** The handoff's selected chip: the ink fill with card-coloured text. */
const CHIP_ON = {
  light: { text: '#FFFFFF', fill: '#141A16' },
  dark: { text: '#1E2621', fill: '#EEF2ED' },
} as const;

describe('LocationChips', () => {
  it.each(Object.keys(CHIP_ON) as (keyof typeof CHIP_ON)[])(
    'paints the chosen Location chip in the %s Theme',
    (theme) => {
      localStorage.setItem(
        'pp.appearance',
        JSON.stringify({ theme, matchSystem: false }),
      );
      renderWithProviders(
        <LocationChips filter="fridge" onFilterChange={() => {}} />,
      );
      const chip = screen.getByRole('button', {
        name: 'Fridge',
        pressed: true,
      });
      const face = chip.firstElementChild as HTMLElement;
      expect(paintedColour(face, 'color')).toBe(CHIP_ON[theme].text);
      expect(paintedColour(face, 'background-color')).toBe(CHIP_ON[theme].fill);
    },
  );

  it('keeps every chip a 44 pt target in one scrolling row', () => {
    renderWithProviders(
      <LocationChips filter="all" onFilterChange={() => {}} />,
    );
    expect(screen.getAllByRole('button')).toHaveLength(5);
  });
});

import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocationChip } from '../index';
import { renderWithTheme as render } from '../test/render';

describe('LocationChip', () => {
  afterEach(cleanup);

  it('is a pressed-state button named with its count and a 44 pt target', () => {
    const onClick = vi.fn();
    render(
      <LocationChip label="Fridge" count={3} selected onClick={onClick} />,
    );
    const chip = screen.getByRole('button', {
      name: 'Fridge · 3',
      pressed: true,
    });
    fireEvent.click(chip);
    expect(onClick).toHaveBeenCalled();
    expect(getComputedStyle(chip).height).toBe('44px');
  });

  it('without a count is named by its label alone', () => {
    render(<LocationChip label="Fridge" selected={false} onClick={() => {}} />);
    expect(
      screen.getByRole('button', { name: 'Fridge', pressed: false })
        .textContent,
    ).toBe('Fridge');
  });
});

import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CanopySearchField, LocationChip, ProgressBar } from '../index';
import { renderWithTheme as render } from '../test/render';

describe('CanopySearchField', () => {
  afterEach(cleanup);

  it('is a named search box that reports what is typed', () => {
    const onChange = vi.fn();
    render(
      <CanopySearchField
        label="Search Pantry"
        placeholder="Search by name"
        value=""
        onChange={onChange}
      />,
    );
    const field = screen.getByRole('searchbox', { name: 'Search Pantry' });
    fireEvent.change(field, { target: { value: 'milk' } });
    expect(onChange).toHaveBeenCalledWith('milk');
  });
});

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
});

describe('ProgressBar on the Canopy', () => {
  afterEach(cleanup);

  it('is a 5 px bar that still reports its progress', () => {
    render(<ProgressBar tone="canopy" label="Bought" value={1} max={4} />);
    const bar = screen.getByRole('progressbar', { name: 'Bought' });
    expect(bar.getAttribute('aria-valuenow')).toBe('25');
    expect(getComputedStyle(bar).height).toBe('5px');
  });
});

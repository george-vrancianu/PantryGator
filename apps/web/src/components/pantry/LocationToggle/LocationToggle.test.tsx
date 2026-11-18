import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { LocationToggle } from './LocationToggle';

const pressed = (name: string) =>
  screen.getByRole('button', { name }).getAttribute('aria-pressed');

describe('LocationToggle', () => {
  it('names the group by its visible caption and presses the chosen Location', () => {
    const onChange = vi.fn();
    renderWithProviders(
      <LocationToggle label="Location" value="freezer" onChange={onChange} />,
    );
    const group = screen.getByRole('group', { name: 'Location' });
    const caption = screen.getByText('Location');
    expect(caption).toBeVisible();
    // An aria-label, so a CSS-uppercased caption cannot change the name's case.
    expect(group.getAttribute('aria-label')).toBe('Location');
    expect(group).not.toHaveAttribute('aria-labelledby');
    expect(caption).not.toHaveAttribute('aria-hidden');
    expect(
      within(group)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Fridge', 'Freezer', 'Cupboard', 'Spices']);
    expect(pressed('Freezer')).toBe('true');
    expect(pressed('Fridge')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: 'Spices' }));
    expect(onChange).toHaveBeenCalledWith('spices');
  });

  it('shows the Romanian labels whole, never shortened', () => {
    renderWithProviders(
      <LocationToggle label="Locație" value="spices" onChange={() => {}} />,
      { locale: 'ro' },
    );
    const group = screen.getByRole('group', { name: 'Locație' });
    expect(
      within(group)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Frigider', 'Congelator', 'Dulap', 'Condimente']);
    expect(pressed('Congelator')).toBe('false');
    expect(pressed('Condimente')).toBe('true');
  });

  it('keeps the Danish labels whole', () => {
    renderWithProviders(
      <LocationToggle label="Placering" value="fridge" onChange={() => {}} />,
      { locale: 'da' },
    );
    expect(
      within(screen.getByRole('group', { name: 'Placering' }))
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Køleskab', 'Fryser', 'Skab', 'Krydderier']);
    expect(pressed('Køleskab')).toBe('true');
  });
});

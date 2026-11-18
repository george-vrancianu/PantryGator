import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChoiceRadioGroup } from './ChoiceRadioGroup';
import { renderWithTheme as render } from '../test/render';

const choices = [
  { value: 'en', label: 'English' },
  { value: 'ro', label: 'Română', description: 'Limba română' },
];

describe('ChoiceRadioGroup', () => {
  afterEach(cleanup);

  it('names the group and checks only the chosen radio', () => {
    render(
      <ChoiceRadioGroup
        label="Language"
        hint="Pick one."
        choices={choices}
        value="en"
        onChange={() => {}}
      />,
    );
    const group = screen.getByRole('radiogroup', { name: 'Language' });
    expect(group.getAttribute('aria-describedby')).toBeTruthy();
    expect(
      (screen.getByRole('radio', { name: 'English' }) as HTMLInputElement)
        .checked,
    ).toBe(true);
    expect(
      (screen.getByRole('radio', { name: 'Română' }) as HTMLInputElement)
        .checked,
    ).toBe(false);
  });

  it('reports a newly picked choice', () => {
    const onChange = vi.fn();
    render(
      <ChoiceRadioGroup
        label="Language"
        choices={choices}
        value="en"
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Română' }));
    expect(onChange).toHaveBeenCalledWith('ro');
  });

  describe('disabled', () => {
    it('disables every radio, marks the group, and never reports a pick', () => {
      const onChange = vi.fn();
      render(
        <ChoiceRadioGroup
          label="Language"
          choices={choices}
          value="en"
          onChange={onChange}
          disabled
        />,
      );
      const group = screen.getByRole('radiogroup', { name: 'Language' });
      expect(group.getAttribute('aria-disabled')).toBe('true');
      const radios = screen.getAllByRole('radio') as HTMLInputElement[];
      expect(radios).toHaveLength(2);
      for (const radio of radios) expect(radio.disabled).toBe(true);
      fireEvent.click(radios[1]);
      expect(onChange).not.toHaveBeenCalled();
      expect(radios[0].checked).toBe(true);
    });

    it('is enabled by default', () => {
      render(
        <ChoiceRadioGroup
          label="Language"
          choices={choices}
          value="en"
          onChange={() => {}}
        />,
      );
      expect(
        screen
          .getByRole('radiogroup', { name: 'Language' })
          .getAttribute('aria-disabled'),
      ).toBeNull();
      for (const radio of screen.getAllByRole('radio')) {
        expect((radio as HTMLInputElement).disabled).toBe(false);
      }
    });
  });
});

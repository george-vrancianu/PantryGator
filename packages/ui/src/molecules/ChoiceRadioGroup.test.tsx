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

  describe('list layout', () => {
    const row = (name: string) =>
      screen.getByRole('radio', { name }).closest('label')!;

    it('keeps the radio semantics and picks like the other layouts', () => {
      const onChange = vi.fn();
      render(
        <ChoiceRadioGroup
          label="Language"
          layout="list"
          choices={choices}
          value="en"
          onChange={onChange}
        />,
      );
      expect(screen.getAllByRole('radio')).toHaveLength(2);
      fireEvent.click(screen.getByRole('radio', { name: 'Română' }));
      expect(onChange).toHaveBeenCalledWith('ro');
    });

    it('draws square rows 50 high, divided by a line, with no border on each row', () => {
      render(
        <ChoiceRadioGroup
          label="Language"
          layout="list"
          choices={choices}
          value="en"
          onChange={() => {}}
        />,
      );
      const second = getComputedStyle(row('Română'));
      expect(second.minHeight).toBe('50px');
      expect(second.borderRadius).toBe('0px');
      expect(second.borderTopWidth).toBe('1px');
      expect(getComputedStyle(row('English')).borderTopWidth).toBe('0px');
    });

    it('rows keep their own card look in the default layout', () => {
      render(
        <ChoiceRadioGroup
          label="Language"
          choices={choices}
          value="en"
          onChange={() => {}}
        />,
      );
      expect(getComputedStyle(row('Română')).borderTopWidth).toBe('2px');
    });

    it('marks the picked row with a check', () => {
      render(
        <ChoiceRadioGroup
          label="Language"
          layout="list"
          choices={choices}
          value="ro"
          onChange={() => {}}
        />,
      );
      expect(row('Română').querySelector('svg')).not.toBeNull();
      expect(row('English').querySelector('svg')).toBeNull();
    });
  });
});

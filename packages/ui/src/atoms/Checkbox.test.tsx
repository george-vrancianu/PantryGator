import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Checkbox } from '../index';
import { paintedColour } from '../test/colour';
import { renderWithTheme as render } from '../test/render';

describe('Checkbox', () => {
  afterEach(cleanup);

  /** The painted box around the native input. */
  const box = (name: string) =>
    screen.getByRole('checkbox', { name }).parentElement!;

  it('is a labelled checkbox described by its helper text', () => {
    const onChange = vi.fn();
    render(
      <Checkbox
        label="Staple"
        helperText="Kept on the list"
        checked={false}
        onChange={onChange}
      />,
    );
    const checkbox = screen.getByRole('checkbox', { name: 'Staple' });
    expect(checkbox.getAttribute('aria-describedby')).toBe(
      screen.getByText('Kept on the list').id,
    );
    fireEvent.click(checkbox);
    expect(onChange).toHaveBeenCalled();
  });

  it('is a 22 box in a 44pt target, filled with the button gradient when checked', () => {
    render(
      <div data-theme="light">
        <Checkbox label="Off" checked={false} onChange={() => undefined} />
        <Checkbox label="On" checked onChange={() => undefined} />
      </div>,
    );
    const painted = (name: string) =>
      getComputedStyle(box(name).querySelector('.pp-box')!);
    expect(getComputedStyle(box('Off')).width).toBe('44px');
    expect(getComputedStyle(box('Off')).height).toBe('44px');
    expect(painted('Off').width).toBe('22px');
    expect(painted('Off').height).toBe('22px');
    expect(painted('Off').borderRadius).toBe('var(--pp-r-box)');
    expect(painted('Off').backgroundColor).toBe('var(--pp-box-bg)');
    expect(painted('Off').boxShadow).toBe('var(--pp-shadow-box)');
    expect(painted('On').backgroundImage).toBe('var(--pp-btn-bg)');
    expect(paintedColour(box('On'), 'color')).toBe('#FFFFFF');
  });

  it('draws the keyboard focus ring on the 22 box, not the 44 target', () => {
    render(
      <Checkbox label="Ring" checked={false} onChange={() => undefined} />,
    );
    const sheet = Array.from(document.querySelectorAll('style'))
      .map((style) => style.textContent ?? '')
      .join('');
    expect(sheet).toMatch(/Mui-focusVisible \.pp-box[^{]*\{[^}]*outline:/);
    expect(sheet).not.toMatch(/\.Mui-focusVisible\s*\{[^}]*outline:/);
  });
});

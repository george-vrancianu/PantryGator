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

  it('is a 24 box with the Theme radius, filled accent when checked', () => {
    render(
      <div data-theme="light">
        <Checkbox label="Off" checked={false} onChange={() => undefined} />
        <Checkbox label="On" checked onChange={() => undefined} />
      </div>,
    );
    expect(getComputedStyle(box('Off')).width).toBe('24px');
    expect(getComputedStyle(box('Off')).height).toBe('24px');
    expect(getComputedStyle(box('Off')).borderRadius).toBe('var(--pp-r-box)');
    expect(paintedColour(box('Off'), 'background-color')).toBe(
      'RGBA(0, 0, 0, 0)',
    );
    expect(paintedColour(box('On'), 'background-color')).toBe('#1C6A43');
    expect(paintedColour(box('On'), 'color')).toBe('#FFFFFF');
  });
});

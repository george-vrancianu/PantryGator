import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Toggle } from '../index';
import { paintedColour } from '../test/colour';
import { renderWithTheme as render } from '../test/render';

describe('Toggle', () => {
  afterEach(cleanup);

  it('is a named switch that reports whether it is on', () => {
    const view = render(
      <Toggle aria-label="Match system" checked onChange={() => undefined} />,
    );
    const toggle = screen.getByRole('switch', { name: 'Match system' });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    view.rerender(
      <Toggle
        aria-label="Match system"
        checked={false}
        onChange={() => undefined}
      />,
    );
    expect(toggle.getAttribute('aria-checked')).toBe('false');
  });

  it('asks for the opposite state when pressed', () => {
    const onChange = vi.fn();
    render(<Toggle aria-label="Match system" checked onChange={onChange} />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('does nothing while disabled', () => {
    const onChange = vi.fn();
    render(
      <Toggle
        aria-label="Match system"
        checked={false}
        disabled
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('turns its track from the Theme box colour to accent', () => {
    render(
      <div data-theme="light">
        <Toggle aria-label="Off" checked={false} onChange={() => undefined} />
        <Toggle aria-label="On" checked onChange={() => undefined} />
      </div>,
    );
    const track = (name: string) => screen.getByRole('switch', { name });
    expect(paintedColour(track('Off'), 'background-color')).toBe('#9EA69D');
    expect(paintedColour(track('On'), 'background-color')).toBe('#1C6A43');
    expect(getComputedStyle(track('On')).width).toBe('46px');
    expect(getComputedStyle(track('On')).height).toBe('28px');
  });
});

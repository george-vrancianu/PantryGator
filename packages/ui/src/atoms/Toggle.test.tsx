import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Toggle } from '../index';
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

  it('turns its track from the recessed well to the button gradient', () => {
    render(
      <div data-theme="light">
        <Toggle aria-label="Off" checked={false} onChange={() => undefined} />
        <Toggle aria-label="On" checked onChange={() => undefined} />
      </div>,
    );
    const track = (name: string) => screen.getByRole('switch', { name });
    const painted = (name: string) => getComputedStyle(track(name));
    expect(painted('Off').backgroundColor).toBe('var(--pp-well-bg)');
    expect(painted('Off').boxShadow).toBe('var(--pp-shadow-well)');
    expect(painted('On').backgroundImage).toBe('var(--pp-btn-bg)');
    expect(painted('On').borderRadius).toBe('7px');
    expect(getComputedStyle(track('On')).width).toBe('48px');
    expect(getComputedStyle(track('On')).height).toBe('28px');
  });
});

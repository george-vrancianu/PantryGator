import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AddButton, Button } from '../index';
import { paintedColour } from '../test/colour';
import { renderWithTheme as render } from '../test/render';

describe('Button', () => {
  afterEach(cleanup);

  const button = (name: string) => screen.getByRole('button', { name });

  it('fills primary with the Theme button gradient: green in Light and in Dark', () => {
    render(
      <>
        <div data-theme="light">
          <Button>Light</Button>
        </div>
        <div data-theme="dark">
          <Button>Dark</Button>
        </div>
      </>,
    );
    expect(paintedColour(button('Light'), 'background-image')).toBe(
      'LINEAR-GRADIENT(180DEG,#2A8257 0%,#1A6540 100%)',
    );
    expect(paintedColour(button('Light'), 'color')).toBe('#FFFFFF');
    expect(paintedColour(button('Dark'), 'background-image')).toBe(
      'LINEAR-GRADIENT(180DEG,#2A8257 0%,#1A6540 100%)',
    );
    expect(paintedColour(button('Dark'), 'color')).toBe('#FFFFFF');
  });

  it('paints the handoff variants from the Theme', () => {
    render(
      <div data-theme="light">
        <Button variant="secondary">Secondary</Button>
        <Button variant="tonal">Tonal</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="danger">Danger</Button>
      </div>,
    );
    expect(paintedColour(button('Secondary'), 'background-color')).toBe(
      '#FFFFFF',
    );
    expect(paintedColour(button('Tonal'), 'background-color')).toBe('#E2F0E7');
    expect(paintedColour(button('Tonal'), 'color')).toBe('#1C5B3B');
    expect(paintedColour(button('Ghost'), 'background-color')).toBe(
      'RGBA(0, 0, 0, 0)',
    );
    expect(paintedColour(button('Ghost'), 'color')).toBe('#1C6A43');
    expect(paintedColour(button('Danger'), 'background-color')).toBe('#FBE5DB');
    expect(paintedColour(button('Danger'), 'color')).toBe('#A53A12');
  });

  it('takes the Theme control radius', () => {
    render(
      <div data-theme="light">
        <Button variant="tonal">Save</Button>
      </div>,
    );
    expect(getComputedStyle(button('Save')).borderRadius).toBe(
      'var(--pp-r-ctl)',
    );
  });

  it('is 46 high, or 36 when small', () => {
    render(
      <>
        <Button variant="tonal">Save</Button>
        <Button variant="tonal" size="sm">
          Undo
        </Button>
      </>,
    );
    expect(getComputedStyle(button('Save')).height).toBe('46px');
    expect(getComputedStyle(button('Undo')).height).toBe('36px');
  });

  it('is a 52 high primary with the button gradient and line, 44 when small', () => {
    render(
      <div data-theme="light">
        <Button>Save</Button>
        <Button size="sm">Undo</Button>
      </div>,
    );
    const save = getComputedStyle(button('Save'));
    expect(save.height).toBe('52px');
    expect(save.borderRadius).toBe('var(--pp-r-btn)');
    expect(save.backgroundImage).toBe('var(--pp-btn-bg)');
    // jsdom drops a var() border-color, so read the rule the primary variant emits.
    const rules = Array.from(document.styleSheets)
      .flatMap((sheet) => Array.from(sheet.cssRules))
      .map((rule) => rule.cssText)
      .join('');
    expect(rules).toContain('border-color: var(--pp-btn-line)');
    expect(save.fontSize).toBe('15.5px');
    const undo = getComputedStyle(button('Undo'));
    expect(undo.height).toBe('44px');
    expect(undo.borderRadius).toBe('var(--pp-r-ctl)');
  });

  it('is a 44 high secondary', () => {
    render(<Button variant="secondary">Cancel</Button>);
    expect(getComputedStyle(button('Cancel')).height).toBe('44px');
  });

  it('fades to .45 when disabled', () => {
    render(<Button disabled>Save</Button>);
    expect(getComputedStyle(button('Save')).opacity).toBe('0.45');
  });
});

describe('AddButton', () => {
  afterEach(cleanup);

  it('is a named 52 x 52 accent button with the Theme Add-button radius', () => {
    render(
      <div data-theme="light">
        <AddButton aria-label="Add items" />
      </div>,
    );
    const add = screen.getByRole('button', { name: 'Add items' });
    expect(paintedColour(add, 'background-color')).toBe('#1C6A43');
    expect(paintedColour(add, 'color')).toBe('#FFFFFF');
    expect(getComputedStyle(add).width).toBe('52px');
    expect(getComputedStyle(add).height).toBe('52px');
    expect(getComputedStyle(add).borderRadius).toBe('var(--pp-r-fab)');
  });
});

import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Card } from '../index';
import { paintedColour } from '../test/colour';
import { renderWithTheme as render } from '../test/render';

describe('Card', () => {
  afterEach(cleanup);

  const card = (name: string) => screen.getByText(name);

  it('paints the Theme card background', () => {
    render(
      <>
        <div data-theme="light">
          <Card>Light</Card>
        </div>
        <div data-theme="dark">
          <Card>Dark</Card>
        </div>
      </>,
    );
    expect(paintedColour(card('Light'), 'background-color')).toBe('#FFFFFF');
    expect(paintedColour(card('Dark'), 'background-color')).toBe('#1E2621');
  });

  it("takes the Theme's card edge: border width, radius and shadow", () => {
    render(<Card>Edge</Card>);
    const style = getComputedStyle(card('Edge'));
    expect(style.borderTopStyle).toBe('solid');
    expect(style.borderTopWidth).toBe('var(--pp-bw)');
    expect(style.borderRadius).toBe('var(--pp-r-card)');
    expect(style.boxShadow).toBe('var(--pp-shadow-card)');
  });

  it('pads a stat card 14 16, a media card 10 10 14 and a list card 4 16', () => {
    render(
      <>
        <Card>Stat</Card>
        <Card variant="media">Media</Card>
        <Card variant="list">List</Card>
      </>,
    );
    const padding = (name: string) => {
      const s = getComputedStyle(card(name));
      return [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft];
    };
    expect(padding('Stat')).toEqual(['14px', '16px', '14px', '16px']);
    expect(padding('Media')).toEqual(['10px', '10px', '14px', '10px']);
    expect(padding('List')).toEqual(['4px', '16px', '4px', '16px']);
  });

  it('renders as the element it is given, e.g. a section', () => {
    render(
      <Card component="section" aria-label="Summary">
        Summary
      </Card>,
    );
    expect(screen.getByRole('region', { name: 'Summary' })).toBe(
      card('Summary'),
    );
  });
});

import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Tag } from '../index';
import { paintedColour } from '../test/colour';
import { renderWithTheme as render } from '../test/render';

describe('Tag', () => {
  afterEach(cleanup);

  it("paints each tone with the Theme's pair", () => {
    render(
      <div data-theme="dark">
        <Tag tone="accent">On list</Tag>
        <Tag tone="ok">In Pantry</Tag>
        <Tag tone="soon">2 days</Tag>
        <Tag tone="urgent">Expired</Tag>
        <Tag tone="neutral">Gone</Tag>
      </div>,
    );
    const pair = (name: string) => [
      paintedColour(screen.getByText(name), 'background-color'),
      paintedColour(screen.getByText(name), 'color'),
    ];
    expect(pair('On list')).toEqual(['#1C3327', '#A8E6C0']);
    expect(pair('In Pantry')).toEqual(['#1C3327', '#A8E6C0']);
    expect(pair('2 days')).toEqual(['#352C13', '#EDD084']);
    expect(pair('Expired')).toEqual(['#3A2118', '#FFAB8E']);
    expect(pair('Gone')).toEqual(['#0D120F', '#9DA89F']);
  });

  it('is an 11 px bold tag', () => {
    render(<Tag tone="ok">In Pantry</Tag>);
    const style = getComputedStyle(screen.getByText('In Pantry'));
    expect(style.fontSize).toBe('11px');
    expect(style.fontWeight).toBe('700');
    expect(style.borderRadius).toBe('var(--pp-r-tag)');
  });
});

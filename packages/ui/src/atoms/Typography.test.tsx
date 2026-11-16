import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Typography } from '../index';
import { paintedColour } from '../test/colour';
import { renderWithTheme as render } from '../test/render';

describe('Section label', () => {
  afterEach(cleanup);

  it('is 12/700 muted caps with .07 em tracking', () => {
    render(
      <div data-theme="dark">
        <Typography variant="sectionLabel">To buy</Typography>
      </div>,
    );
    const label = screen.getByText('To buy');
    const style = getComputedStyle(label);
    expect(paintedColour(label, 'color')).toBe('#9DA89F');
    expect(style.fontSize).toBe('12px');
    expect(style.fontWeight).toBe('700');
    expect(style.textTransform).toBe('uppercase');
    expect(style.letterSpacing).toBe('0.07em');
  });
});

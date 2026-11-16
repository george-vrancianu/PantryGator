import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ProgressBar } from '../index';
import { paintedColour } from '../test/colour';
import { renderWithTheme as render } from '../test/render';

describe('ProgressBar', () => {
  afterEach(cleanup);

  it('fills with accent on the chip track, in either size', () => {
    render(
      <div data-theme="dark">
        <ProgressBar label="Default" value={1} max={3} />
        <ProgressBar label="Large" value={1} max={3} size="large" />
      </div>,
    );
    for (const name of ['Default', 'Large']) {
      const bar = screen.getByRole('progressbar', { name });
      expect(paintedColour(bar, 'background-color')).toBe('#0D120F');
      expect(paintedColour(bar.firstElementChild!, 'background-color')).toBe(
        '#7FD3A0',
      );
    }
  });

  it('reports how far along it is', () => {
    render(<ProgressBar label="Bought" value={1} max={4} />);
    expect(
      screen
        .getByRole('progressbar', { name: 'Bought' })
        .getAttribute('aria-valuenow'),
    ).toBe('25');
  });
});

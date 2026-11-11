import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { authoredCss } from '../test/authoredCss';
import { SafeAreaBand } from './SafeAreaBand';

describe('SafeAreaBand', () => {
  afterEach(cleanup);

  it('is a fixed, inert strip the height of the top inset, over the status bar', () => {
    const { getByTestId } = render(<SafeAreaBand />);
    const band = getByTestId('safe-area-band');
    const css = authoredCss(band);
    expect(band.getAttribute('aria-hidden')).toBe('true');
    expect(css).toContain('position:fixed');
    expect(css).toMatch(/height:\s*env\(safe-area-inset-top/);
    expect(css).toContain('pointer-events:none');
  });

  it('paints the colour it is given, the page background otherwise', () => {
    const { getByTestId, rerender } = render(<SafeAreaBand />);
    expect(authoredCss(getByTestId('safe-area-band'))).toContain(
      'background-color:var(--mui-palette-background-default',
    );
    rerender(<SafeAreaBand color="rgb(1, 2, 3)" />);
    expect(authoredCss(getByTestId('safe-area-band'))).toContain(
      'background-color:rgb(1, 2, 3)',
    );
  });
});

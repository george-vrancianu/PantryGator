import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Dialog } from '../index';
import { authoredCss } from '../test/authoredCss';
import { renderWithTheme as render } from '../test/render';

describe('Dialog side insets', () => {
  afterEach(cleanup);

  it('pads a phone sheet by the left and right insets so landscape content clears the notch', () => {
    render(
      <Dialog open onClose={() => {}} title="Sheet">
        Body
      </Dialog>,
    );
    const css = authoredCss(screen.getByRole('dialog'));
    expect(css).toMatch(/padding-left:\s*env\(safe-area-inset-left/);
    expect(css).toMatch(/padding-right:\s*env\(safe-area-inset-right/);
  });

  it('keeps a centred dialog at least as far from each edge as the insets', () => {
    render(
      <Dialog open onClose={() => {}} title="Centred" centred>
        Body
      </Dialog>,
    );
    const css = authoredCss(screen.getByRole('dialog'));
    expect(css).toContain('margin-left:max(32px, env(safe-area-inset-left');
    expect(css).toContain('margin-right:max(32px, env(safe-area-inset-right');
  });
});

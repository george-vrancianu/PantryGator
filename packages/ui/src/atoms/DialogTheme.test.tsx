import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Dialog } from '../index';
import { paintedColour } from '../test/colour';
import { THEMES } from '../theme/themes';
import { renderWithTheme as render } from '../test/render';

describe('Dialog theme', () => {
  afterEach(cleanup);

  it('takes a forced Theme though it portals out of the screen that opened it', () => {
    render(
      <div data-theme="warm">
        <Dialog open onClose={() => {}} title="Forced" theme="dark">
          Body
        </Dialog>
      </div>,
    );
    const root = screen
      .getByRole('dialog')
      .closest<HTMLElement>('.MuiDialog-root')!;
    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(root.closest('[data-theme="warm"]')).toBeNull();
    expect(paintedColour(screen.getByRole('dialog'), 'background-color')).toBe(
      THEMES.dark.surface.toUpperCase(),
    );
  });

  it('sets no Theme by default', () => {
    render(
      <Dialog open onClose={() => {}} title="Plain">
        Body
      </Dialog>,
    );
    expect(
      screen
        .getByRole('dialog')
        .closest('.MuiDialog-root')!
        .hasAttribute('data-theme'),
    ).toBe(false);
  });
});

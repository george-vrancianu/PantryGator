import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Snackbar } from '../index';
import { renderWithTheme as render } from '../test/render';

const emittedCss = () =>
  Array.from(document.querySelectorAll('style'))
    .map((tag) => tag.textContent)
    .join('');

describe('Snackbar', () => {
  afterEach(cleanup);

  it('keeps `right` in force from the sm breakpoint up, where MUI centres it on the window', () => {
    render(
      <Snackbar open onClose={() => {}} right={168}>
        Hello
      </Snackbar>,
    );
    const root = screen.getByText('Hello').closest('.MuiSnackbar-root');
    const className = Array.from(root?.classList ?? []).find((c) =>
      c.startsWith('css-'),
    );
    const css = emittedCss();
    const rules = [
      ...css.matchAll(new RegExp(`\\.${className}\\{([^}]*)\\}`, 'g')),
    ];
    // The last rule that sets `left` wins (the later of equal specificity): it must be ours.
    const lastLeft = rules
      .map((m) => m[1])
      .filter((body) => body.includes('left:'))
      .at(-1);
    expect(lastLeft).toContain('right:168px');
    expect(lastLeft).toContain('transform:none');
    expect(css).toContain('min-width:600px');
  });

  it('keeps a numeric `bottom` in force from the sm breakpoint up, where MUI sets 24px', () => {
    render(
      <Snackbar open onClose={() => {}} bottom={150}>
        Hello
      </Snackbar>,
    );
    const root = screen.getByText('Hello').closest('.MuiSnackbar-root');
    const className = Array.from(root?.classList ?? []).find((c) =>
      c.startsWith('css-'),
    );
    const rules = [
      ...emittedCss().matchAll(new RegExp(`\\.${className}\\{([^}]*)\\}`, 'g')),
    ];
    const lastBottom = rules
      .map((m) => m[1])
      .filter((body) => body.includes('bottom:'))
      .at(-1);
    expect(lastBottom).toContain('bottom:150px');
  });
});

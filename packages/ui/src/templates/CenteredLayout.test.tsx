import { cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CenteredLayout } from '../index';
import { authoredCss } from '../test/authoredCss';
import { renderWithTheme as render } from '../test/render';

describe('CenteredLayout', () => {
  afterEach(cleanup);

  it('fills the screen below the top inset, which the look around it pads', () => {
    const { container } = render(<CenteredLayout>Form</CenteredLayout>);
    expect(authoredCss(container.firstElementChild as HTMLElement)).toContain(
      'min-height:calc(100vh - env(safe-area-inset-top',
    );
  });
});

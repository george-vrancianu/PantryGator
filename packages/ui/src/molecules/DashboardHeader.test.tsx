import { cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { authoredCss } from '../test/authoredCss';
import { renderWithTheme } from '../test/render';
import { DashboardHeader } from './DashboardHeader';

describe('DashboardHeader', () => {
  afterEach(cleanup);

  it('gives its 28px of top room way to the top inset instead of stacking on it', () => {
    const { container } = renderWithTheme(
      <DashboardHeader greeting="Good morning" actions={null} />,
    );
    const header = container.querySelector('header') as HTMLElement;
    expect(authoredCss(header)).toContain(
      'padding-top:max(0px, calc(28px - env(safe-area-inset-top, 0px)))',
    );
  });
});

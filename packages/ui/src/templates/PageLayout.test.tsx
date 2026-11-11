import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PageLayout } from '../index';
import { authoredCss } from '../test/authoredCss';

describe('PageLayout', () => {
  afterEach(cleanup);

  const bottom = (container: HTMLElement) =>
    getComputedStyle(container.firstElementChild as HTMLElement).paddingBottom;

  it('clears the Dock and the capsule above it by default, rising with the bottom inset (132px with none)', () => {
    const { container } = render(<PageLayout>Page</PageLayout>);
    expect(authoredCss(container.firstElementChild as HTMLElement)).toContain(
      'padding-bottom:calc(max(28px, env(safe-area-inset-bottom',
    );
    expect(authoredCss(container.firstElementChild as HTMLElement)).toContain(
      '+ 104px)',
    );
  });

  it('reserves the given clearance instead when a row hangs above the Dock', () => {
    const { container } = render(
      <PageLayout dockClearance="calc(200px + env(safe-area-inset-bottom, 0px))">
        Page
      </PageLayout>,
    );
    expect(bottom(container)).toContain('200px');
    expect(bottom(container)).toContain('safe-area-inset-bottom');
  });

  it('reserves little room without the Dock', () => {
    const { container } = render(
      <PageLayout withDock={false}>Page</PageLayout>,
    );
    expect(bottom(container)).toBe('24px');
  });

  it('pads the top by the safe-area inset so the first row clears the Dynamic Island', () => {
    const { container } = render(<PageLayout>Page</PageLayout>);
    expect(authoredCss(container.firstElementChild as HTMLElement)).toMatch(
      /padding-top:\s*env\(safe-area-inset-top/,
    );
  });

  it('keeps the side gutters at least as wide as the left and right insets', () => {
    const { container } = render(<PageLayout>Page</PageLayout>);
    const css = authoredCss(container.firstElementChild as HTMLElement);
    expect(css).toContain('max(20px, env(safe-area-inset-left');
    expect(css).toContain('max(20px, env(safe-area-inset-right');
  });

  it('paints the page and its band from the Theme background', () => {
    const { container, getByTestId } = render(<PageLayout>Page</PageLayout>);
    const bg = 'background-color:var(--mui-palette-background-default';
    expect(authoredCss(container.firstElementChild as HTMLElement)).toContain(
      bg,
    );
    expect(authoredCss(getByTestId('safe-area-band'))).toContain(bg);
  });

  it('draws a fixed band the height of the top inset, in the page background, over the status bar', () => {
    const { getByTestId } = render(<PageLayout>Page</PageLayout>);
    const css = authoredCss(getByTestId('safe-area-band'));
    expect(css).toContain('position:fixed');
    expect(css).toMatch(/height:\s*env\(safe-area-inset-top/);
    expect(css).toMatch(/background-color:/);
  });
});

import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { EditorCard } from './EditorCard';
import { authoredCss } from '../test/authoredCss';
import { renderWithTheme as render } from '../test/render';

describe('EditorCard', () => {
  afterEach(cleanup);

  it('has no padding of its own and clips its blocks to the corners', () => {
    render(<EditorCard data-testid="card">content</EditorCard>);
    const style = getComputedStyle(screen.getByTestId('card'));
    expect(style.padding).toBe('0px');
    expect(style.overflow).toBe('hidden');
  });

  it('separates its blocks and list items by a hairline', () => {
    render(<EditorCard data-testid="card">content</EditorCard>);
    const css = authoredCss(screen.getByTestId('card'));
    expect(css).toContain('>*+*');
    expect(css).toContain('>ol>li+li');
  });

  it('keeps a host sx', () => {
    render(
      <EditorCard data-testid="card" sx={{ mt: '9px' }}>
        content
      </EditorCard>,
    );
    expect(getComputedStyle(screen.getByTestId('card')).marginTop).toBe('9px');
  });
});

import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AddRow, EditorCard } from './EditorCard';
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

describe('AddRow', () => {
  afterEach(cleanup);

  it('is a button named by its label that reports a click', () => {
    const onClick = vi.fn();
    render(<AddRow label="Add a step" onClick={onClick} />);
    fireEvent.click(screen.getByRole('button', { name: /Add a step/ }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('draws a dashed circle with a plus, hidden from assistive technology', () => {
    render(<AddRow label="Add a step" onClick={() => {}} />);
    const plus = screen.getByText('+');
    expect(plus.getAttribute('aria-hidden')).toBe('true');
    expect(authoredCss(plus)).toContain('dashed');
  });

  it('is 48 high', () => {
    render(<AddRow label="Add a step" onClick={() => {}} />);
    expect(
      getComputedStyle(screen.getByRole('button', { name: /Add a step/ }))
        .minHeight,
    ).toBe('48px');
  });
});

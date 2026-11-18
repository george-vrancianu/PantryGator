import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AddRow } from './AddRow';
import { authoredCss } from '../test/authoredCss';
import { renderWithTheme as render } from '../test/render';

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

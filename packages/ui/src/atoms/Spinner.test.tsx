import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Spinner } from './Spinner';

describe('Spinner', () => {
  it('is announced by its label', () => {
    render(<Spinner label="Loading" />);
    expect(screen.getByRole('progressbar', { name: 'Loading' })).toBeTruthy();
  });

  it('is decorative without a label, at the size asked', () => {
    const { container } = render(<Spinner size={14} />);
    const spinner = container.firstElementChild as HTMLElement;
    expect(spinner.getAttribute('aria-hidden')).toBe('true');
    expect(spinner.style.width).toBe('14px');
  });
});

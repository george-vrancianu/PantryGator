import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { authoredCss } from '../test/authoredCss';
import { StepNumber } from './StepNumber';

describe('StepNumber', () => {
  afterEach(cleanup);

  it('is hidden from assistive technology: the list already numbers its steps', () => {
    render(<StepNumber>3</StepNumber>);
    expect(screen.getByText('3').getAttribute('aria-hidden')).toBe('true');
  });

  it('is a filled disc by default and a dashed outline for an "add" row', () => {
    const { rerender } = render(<StepNumber>1</StepNumber>);
    expect(authoredCss(screen.getByText('1'))).not.toContain('dashed');
    rerender(<StepNumber dashed>+</StepNumber>);
    expect(authoredCss(screen.getByText('+'))).toContain('dashed');
  });
});

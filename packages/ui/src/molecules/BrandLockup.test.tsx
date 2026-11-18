import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BrandLockup } from './BrandLockup';

const motion = (container: HTMLElement) =>
  container.querySelector('img')?.getAttribute('data-motion');

describe('BrandLockup', () => {
  afterEach(cleanup);

  it('hops in on mount by default', () => {
    const { container } = render(<BrandLockup name="Pocket Pantry" />);
    expect(motion(container)).toBe('entrance');
  });

  it('skips the entrance when asked', () => {
    const { container } = render(
      <BrandLockup name="Pocket Pantry" entrance={false} />,
    );
    expect(motion(container)).toBe('idle');
  });

  it('says the name it is given, as a paragraph and not a heading', () => {
    render(<BrandLockup name="Pocket Pantry" />);
    expect(screen.getByText('Pocket Pantry').tagName).toBe('P');
    expect(screen.queryByRole('heading')).toBeNull();
  });
});

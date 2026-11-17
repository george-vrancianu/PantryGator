import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StapleStar } from './StapleStar';

const star = (on: boolean) => {
  const { container } = render(<StapleStar on={on} />);
  const svg = container.querySelector('svg');
  if (!svg) throw new Error('no svg');
  return svg;
};

describe('StapleStar', () => {
  it('fills with the star colour inside a star outline when on', () => {
    const svg = star(true);
    expect(svg.style.fill).toBe('var(--pp-star-fill)');
    expect(svg.style.stroke).toBe('var(--mui-palette-pp-star)');
  });

  it('is an outline in the deco colour when off', () => {
    const svg = star(false);
    expect(svg.style.fill).toBe('none');
    expect(svg.style.stroke).toBe('var(--pp-deco)');
  });
});

import { cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { IngredientIcon } from '../index';
import { paintedColour } from '../test/colour';
import { renderWithTheme as render } from '../test/render';

const DAIRY = '244cde4d-f9a5-5df8-9f40-5e1f48fd4fcf';

describe('IngredientIcon', () => {
  afterEach(cleanup);

  const iconIn = (container: HTMLElement, theme: string) =>
    container.querySelector(`[data-theme="${theme}"] svg`)!;

  it("fills the body with its Aisle's tint for the Theme it sits in", () => {
    const { container } = render(
      <>
        <div data-theme="light">
          <IngredientIcon aisleId={DAIRY} />
        </div>
        <div data-theme="dark">
          <IngredientIcon aisleId={DAIRY} />
        </div>
      </>,
    );
    expect(paintedColour(iconIn(container, 'light'), 'fill')).toBe('#E3ECF3');
    expect(paintedColour(iconIn(container, 'dark'), 'fill')).toBe('#1D2C38');
  });

  it('names the tint it uses', () => {
    const { container } = render(
      <>
        <IngredientIcon aisleId={DAIRY} />
        <IngredientIcon aisleId="admin-made-aisle" />
        <IngredientIcon />
      </>,
    );
    const tints = Array.from(container.querySelectorAll('svg')).map((svg) =>
      svg.getAttribute('data-ingredient-tint'),
    );
    expect(tints).toEqual(['dairy', 'neutral', 'neutral']);
  });

  it("fills an Aisle without a tint with the Theme's neutral chip", () => {
    const { container } = render(
      <div data-theme="dark">
        <IngredientIcon aisleId="admin-made-aisle" />
      </div>,
    );
    expect(paintedColour(iconIn(container, 'dark'), 'fill')).toBe('#0D120F');
  });
});

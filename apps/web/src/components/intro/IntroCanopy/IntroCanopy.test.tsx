import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { IntroCanopy, IntroCanopyFrame } from './IntroCanopy';

describe('IntroCanopy', () => {
  it('puts the top on the Canopy band and the children in the sheet, inside main', () => {
    const { container } = renderWithProviders(
      <IntroCanopy top={<h1>On the canopy</h1>}>
        <p>On the sheet</p>
      </IntroCanopy>,
    );
    const band = container.querySelector<HTMLElement>('[data-region="canopy"]');
    expect(band).not.toBeNull();
    expect(
      within(band as HTMLElement).getByRole('heading', {
        name: 'On the canopy',
      }),
    ).toBeInTheDocument();
    const main = screen.getByRole('main');
    expect(within(main).getByText('On the sheet')).toBeInTheDocument();
    expect(within(main).queryByText('On the canopy')).toBeNull();
  });

  it('stands under the Canopy ground', () => {
    const { container } = renderWithProviders(
      <IntroCanopy top="top">sheet</IntroCanopy>,
    );
    expect(container.querySelector('[data-ground="canopy"]')).not.toBeNull();
  });

  it('IntroCanopyFrame draws the frame without its own ground', () => {
    const { container } = renderWithProviders(
      <IntroCanopyFrame top="top">sheet</IntroCanopyFrame>,
    );
    expect(container.querySelector('[data-region="canopy"]')).not.toBeNull();
    expect(screen.getByRole('main')).toHaveTextContent('sheet');
    expect(container.querySelector('[data-ground]')).toBeNull();
  });
});

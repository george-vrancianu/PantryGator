import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { SourceText } from './SourceText';

describe('SourceText', () => {
  it('prefixes receipt text with "On receipt"', () => {
    renderWithProviders(<SourceText text="LAPTE UHT 1L" mode="receipt" />);
    expect(screen.getByText('On receipt: LAPTE UHT 1L')).toHaveAttribute(
      'title',
      'LAPTE UHT 1L',
    );
  });

  it.each(['product', 'ingredients'] as const)(
    'prefixes %s text with "Read"',
    (mode) => {
      renderWithProviders(<SourceText text="Grana Padano" mode={mode} />);
      expect(screen.getByText('Read: Grana Padano')).toBeInTheDocument();
    },
  );

  it('renders nothing without text', () => {
    const { container } = renderWithProviders(
      <SourceText text={null} mode="receipt" />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

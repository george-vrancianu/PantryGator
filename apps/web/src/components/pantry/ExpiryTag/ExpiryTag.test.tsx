import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { ExpiryTag } from './ExpiryTag';

describe('ExpiryTag', () => {
  it('shows the abbreviation to the eye and the full pluralised phrase to a screen reader', () => {
    renderWithProviders(
      <ExpiryTag tag={{ tone: 'soon', kind: 'daysLeft', days: 3 }} />,
    );
    expect(screen.getByText('3 d left')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('3 days left')).not.toHaveAttribute('aria-hidden');
  });

  it.each([
    ['en', 'days', 1, '1 day'],
    ['da', 'daysLeft', 3, '3 dage tilbage'],
    ['ro', 'days', 1, '1 zi'],
    ['ro', 'daysLeft', 3, 'încă 3 zile'],
    ['ro', 'days', 25, '25 de zile'],
  ] as const)('reads %s %s %i as "%s"', (locale, kind, days, spoken) => {
    renderWithProviders(
      <ExpiryTag
        tag={
          kind === 'days'
            ? { tone: 'ok', kind, days }
            : { tone: 'soon', kind, days }
        }
      />,
      { locale },
    );
    expect(screen.getByText(spoken)).not.toHaveAttribute('aria-hidden');
  });

  it('leaves words that are already whole as they are', () => {
    renderWithProviders(<ExpiryTag tag={{ tone: 'urgent', kind: 'today' }} />);
    expect(screen.getByText('Today')).toBeInTheDocument();
  });
});

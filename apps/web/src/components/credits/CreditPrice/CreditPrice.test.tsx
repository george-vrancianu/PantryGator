import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, stubApi } from '@/test/render';
import { CreditPrice } from './CreditPrice';

describe('CreditPrice', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('draws the Credit icon and the number, and names the price in words for a screen reader', async () => {
    const { fetchMock } = stubApi({
      'GET /api/credits': () =>
        Response.json({
          balance: 100,
          prices: { scan: 2 },
          lowBalanceThreshold: 10,
          history: [],
        }),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<CreditPrice kind="scan" data-testid="price" />);

    const words = await screen.findByText('2 Credits');
    const price = screen.getByTestId('price');
    expect(price.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('2')).toHaveAttribute('aria-hidden', 'true');
    expect(words).not.toHaveAttribute('aria-hidden');
  });
});

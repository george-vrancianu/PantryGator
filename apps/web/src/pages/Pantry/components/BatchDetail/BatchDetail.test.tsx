import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Batch } from '@/lib/pantry';
import { renderWithProviders } from '@/test/render';
import { BatchDetail } from './BatchDetail';

const batch = (over: Partial<Batch>): Batch => ({
  id: 'b1',
  name: 'Milk',
  ingredientId: 'i1',
  unmatched: false,
  aisle: null,
  amountScale: null,
  defaultUnit: null,
  quantity: 500,
  unit: 'g',
  location: 'fridge',
  expiryDate: '2026-11-20',
  defaultExpiryDays: null,
  productDescription: null,
  createdAt: '2026-11-01T00:00:00Z',
  ...over,
});

const today = new Date(2026, 10, 18);

function renderBatch(b: Batch, sameAmount?: boolean) {
  return renderWithProviders(
    <ul>
      <BatchDetail
        batch={b}
        index={0}
        today={today}
        onRemove={vi.fn()}
        onLeft={vi.fn()}
        peek={false}
        onLearned={vi.fn()}
        sameAmount={sameAmount}
      />
    </ul>,
  );
}

describe('BatchDetail action names', () => {
  it('names a Batch by amount and name when its amount is unique', () => {
    renderBatch(batch({}));
    expect(
      screen.getByRole('button', { name: 'Edit 500 g Milk' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Remove 500 g Milk' }),
    ).toBeTruthy();
  });

  it('adds the expiry when another Batch shares the amount', () => {
    renderBatch(batch({}), true);
    expect(
      screen.getByRole('button', { name: /^Edit 500 g Milk, .*20/ }),
    ).toBeTruthy();
  });

  it('says "no date" for a Batch without an expiry that shares its amount', () => {
    renderBatch(batch({ expiryDate: null }), true);
    expect(
      screen.getByRole('button', { name: 'Edit 500 g Milk, no date' }),
    ).toBeTruthy();
  });
});

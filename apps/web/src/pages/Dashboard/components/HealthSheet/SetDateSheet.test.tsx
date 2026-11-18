import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { Batch } from '@/lib/pantry';
import { renderWithProviders } from '@/test/render';
import { stubMotion } from '@/test/viewport';
import { SetDateSheet } from './SetDateSheet';

const undated = (id: string, name: string, days: number): Batch => ({
  id,
  name,
  ingredientId: `ing-${id}`,
  unmatched: false,
  aisle: null,
  amountScale: null,
  defaultUnit: null,
  defaultExpiryDays: days,
  quantity: null,
  unit: null,
  location: 'fridge',
  expiryDate: null,
  productDescription: null,
  createdAt: new Date().toISOString(),
});

const isoIn = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

function Host({
  first,
  second,
  onSave,
}: {
  first: Batch;
  second: Batch;
  onSave: (batch: Batch, expiryDate: string) => void;
}) {
  const [batch, setBatch] = useState<Batch | null>(first);
  return (
    <>
      {/* Closes the sheet and opens it on the second Batch in one go, before the close transition ends. */}
      <button onClick={() => setBatch(null)}>close</button>
      <button onClick={() => setBatch(second)}>open second</button>
      <SetDateSheet batch={batch} onClose={() => undefined} onSave={onSave} />
    </>
  );
}

describe('SetDateSheet', () => {
  it("opens on the new Batch's usual date when reopened before the last close finished", async () => {
    stubMotion(true);
    const onSave = vi.fn();
    const jam = undated('jam', 'Jam', 365);
    const user = userEvent.setup();
    renderWithProviders(
      <Host
        first={undated('pesto', 'Pesto', 30)}
        second={jam}
        onSave={onSave}
      />,
    );
    await screen.findByRole('dialog', { name: 'Expires' });
    act(() => {
      screen.getByText('close').click();
      screen.getByText('open second').click();
    });

    const picker = await screen.findByRole('dialog', { name: 'Expires' });
    await user.click(within(picker).getByRole('button', { name: 'Done' }));

    expect(onSave).toHaveBeenCalledWith(jam, isoIn(365));
  });
});

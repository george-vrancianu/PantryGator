import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Unit } from '@/lib/catalog';
import { renderWithProviders } from '@/test/render';
import { LineAmountField } from './LineAmountField';

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

const setupUser = () =>
  userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

function Harness({ error = false }: { error?: boolean }) {
  const [quantity, setQuantity] = useState('200');
  const [unit, setUnit] = useState<Unit>('g');
  return (
    <>
      <LineAmountField
        name="Flour"
        quantity={quantity}
        unit={unit}
        onQuantityChange={setQuantity}
        onUnitChange={setUnit}
        error={error}
        errorId="flour-error"
      />
      <output>{`${quantity}|${unit}`}</output>
    </>
  );
}

describe('LineAmountField', () => {
  it('holds the quantity and the unit in one field', () => {
    renderWithProviders(<Harness />);

    const quantity = screen.getByRole('textbox', { name: 'Quantity of Flour' });
    const unit = screen.getByRole('combobox', { name: 'Unit of Flour' });
    expect(quantity).toHaveValue('200');
    expect(unit).toHaveValue('g');
    expect(quantity.closest('.MuiOutlinedInput-root')).toContainElement(unit);
  });

  it('changes the quantity and the unit independently', async () => {
    const user = setupUser();
    renderWithProviders(<Harness />);

    const quantity = screen.getByRole('textbox', { name: 'Quantity of Flour' });
    await user.clear(quantity);
    await user.type(quantity, '1.5');
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Unit of Flour' }),
      'kg',
    );

    expect(screen.getByRole('status')).toHaveTextContent('1.5|kg');
  });

  it('points an invalid quantity at its message', () => {
    renderWithProviders(<Harness error />);

    const quantity = screen.getByRole('textbox', { name: 'Quantity of Flour' });
    expect(quantity).toHaveAttribute('aria-invalid', 'true');
    expect(quantity).toHaveAttribute('aria-describedby', 'flour-error');
  });
});

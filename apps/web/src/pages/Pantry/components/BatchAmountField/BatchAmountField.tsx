import { Box } from '@pocket-pantry/ui';
import { useState, type FocusEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { AmountField } from '@/components/catalog/AmountField/AmountField';
import type { Unit } from '@/lib/catalog';
import type { AmountScale } from '@/lib/usualAmounts';

type Props = {
  /** Name of the Ingredient, for the amount's accessible name. */
  name: string;
  /** The Ingredient's Amount Scale; null or left out for an Unmatched name (Usual Amounts from the unit alone). */
  amountScale?: AmountScale | null;
  quantity: string;
  unit: Unit;
  quantityValid: boolean;
  onQuantityChange: (quantity: string) => void;
  onUnitChange: (unit: Unit) => void;
  /** Enter in the amount input. */
  onSubmit: () => void;
};

/** The Batch amount, flagged invalid once it is left or submitted. A Batch amount always has a unit. */
export function BatchAmountField({
  name,
  amountScale,
  quantity,
  unit,
  quantityValid,
  onQuantityChange,
  onUnitChange,
  onSubmit,
}: Props) {
  const { t } = useTranslation('pantry');
  // Typing "500 kg" passes through invalid text ("500 "), so the error waits until the amount is left or submitted.
  const [touched, setTouched] = useState(false);

  return (
    <Box
      onBlur={(event: FocusEvent<HTMLElement>) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setTouched(true);
      }}
    >
      <AmountField
        name={name}
        quantity={quantity}
        unit={unit}
        onQuantityChange={(next, nextUnit) => {
          onQuantityChange(next);
          if (nextUnit) onUnitChange(nextUnit);
        }}
        onUnitChange={(next) => {
          if (next) onUnitChange(next);
        }}
        error={touched && !quantityValid ? t('common:amount.invalid') : null}
        onSubmit={() => {
          setTouched(true);
          onSubmit();
        }}
        allowNoUnit={false}
        amountScale={amountScale}
        label={t('common:amount.placeholder')}
        height={56}
      />
    </Box>
  );
}

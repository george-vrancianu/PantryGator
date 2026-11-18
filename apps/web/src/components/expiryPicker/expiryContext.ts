import type { TFunction } from 'i18next';
import { formatAmount } from '@/lib/amount';
import type { StorageLocation, Unit } from '@/lib/catalog';
import { parseAmountText } from '@/lib/pantry';

/**
 * The expiry sheet's context line from a form's current values: "Greek yogurt · 500 g · Fridge". A blank name or
 * an amount that is empty or not (yet) valid is left out.
 */
export function expiryContext(
  {
    name,
    quantity,
    unit,
    location,
  }: {
    name: string;
    /** The amount as typed. */
    quantity: string;
    unit: Unit | null;
    location: StorageLocation;
  },
  language: string,
  t: TFunction,
): string {
  const amount = parseAmountText(quantity);
  return [
    name.trim(),
    amount.valid && amount.value !== null && unit !== null
      ? formatAmount(amount.value, unit, language, t)
      : '',
    t(`common:locations.${location}`),
  ]
    .filter(Boolean)
    .join(' · ');
}

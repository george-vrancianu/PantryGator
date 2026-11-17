import { exceedsMaxQuantity } from '../common/quantity';
import type { ingredientUnit } from '../database/schema';

type PantryUnit = (typeof ingredientUnit.enumValues)[number];

export type ScanQuantityInput = {
  quantityType: 'count' | 'package_size' | 'measured' | null;
  purchasedCount: number | null;
  quantityPerItem: number | null;
  quantityUnit: string | null;
};

export type DerivedScanQuantity = {
  quantityType: Exclude<ScanQuantityInput['quantityType'], null>;
  purchasedCount: number;
  quantityPerItem: number | null;
  quantityUnit: string | null;
  quantity: number;
  unit: string;
};

const UNIT_ALIASES: Record<string, string> = {
  buc: 'item',
  bucata: 'item',
  bucati: 'item',
  piece: 'item',
  pieces: 'item',
  pc: 'item',
  pcs: 'item',
  item: 'item',
  items: 'item',
  gram: 'g',
  grams: 'g',
  gr: 'g',
  g: 'g',
  kilogram: 'kg',
  kilograms: 'kg',
  kgs: 'kg',
  kg: 'kg',
  milligram: 'mg',
  milligrams: 'mg',
  mg: 'mg',
  milliliter: 'ml',
  milliliters: 'ml',
  millilitre: 'ml',
  millilitres: 'ml',
  ml: 'ml',
  centiliter: 'cl',
  centiliters: 'cl',
  centilitre: 'cl',
  centilitres: 'cl',
  cl: 'cl',
  liter: 'l',
  liters: 'l',
  litre: 'l',
  litres: 'l',
  l: 'l',
};

export function normalizeUnit(unit: string): string {
  const normalized = unit.trim().toLocaleLowerCase('en-US').replaceAll('.', '');
  return UNIT_ALIASES[normalized] ?? normalized;
}

/** Scan units onto the Pantry's units; anything else yields no quantity. */
export function toPantryQuantity(
  quantity: number | null,
  unit: string | null,
): { quantity: number | null; unit: PantryUnit | null } {
  if (quantity === null || unit === null) return { quantity: null, unit: null };
  const scaled = (factor: number, to: PantryUnit) => ({
    quantity: Math.round(quantity * factor * 1000) / 1000,
    unit: to,
  });
  const converted = (() => {
    switch (unit) {
      case 'g':
      case 'kg':
      case 'ml':
      case 'l':
        return scaled(1, unit);
      case 'item':
        return scaled(1, 'pcs');
      case 'cl':
        return scaled(10, 'ml');
      case 'mg':
        return scaled(0.001, 'g');
      default:
        return null;
    }
  })();
  // numeric(10,3) on the Batch: a quantity that rounds to nothing is no quantity.
  // And one past the Batch maximum would fail validation on save.
  return converted &&
    converted.quantity >= 0.001 &&
    !exceedsMaxQuantity(converted.quantity)
    ? converted
    : { quantity: null, unit: null };
}

/** `toPantryQuantity` for a unit as printed: normalised first; no quantity without a unit. */
export function toPantryQuantityFromText(
  quantity: number | null,
  unit: string | null,
): ReturnType<typeof toPantryQuantity> {
  return toPantryQuantity(quantity, unit === null ? null : normalizeUnit(unit));
}

function roundQuantity(value: number): number {
  return Number(value.toFixed(6));
}

function extractPrintedQuantity(
  sourceText: string,
): Pick<ScanQuantityInput, 'quantityPerItem' | 'quantityUnit'> | null {
  const matches = [
    ...sourceText.matchAll(/(\d+(?:[.,]\d+)?)\s*(mg|kg|g|ml|cl|l)\b/giu),
  ];
  const match = matches.at(-1);
  if (!match) return null;

  const quantity = Number(match[1].replace(',', '.'));
  if (!Number.isFinite(quantity) || quantity <= 0) return null;

  return {
    quantityPerItem: quantity,
    quantityUnit: normalizeUnit(match[2]),
  };
}

export function deriveScanQuantity(
  input: ScanQuantityInput,
  sourceText = '',
): DerivedScanQuantity | null {
  if (!input.quantityType || !input.purchasedCount) return null;

  const printedQuantity = extractPrintedQuantity(sourceText);
  const quantityType =
    input.quantityType === 'count' && printedQuantity
      ? 'package_size'
      : input.quantityType;

  if (quantityType === 'count') {
    return {
      quantityType,
      purchasedCount: input.purchasedCount,
      quantityPerItem: null,
      quantityUnit: null,
      quantity: roundQuantity(input.purchasedCount),
      unit: 'item',
    };
  }

  const quantityPerItem =
    printedQuantity?.quantityPerItem ?? input.quantityPerItem;
  const quantityUnit = printedQuantity?.quantityUnit ?? input.quantityUnit;
  if (!quantityPerItem || !quantityUnit) return null;

  const multiplier = quantityType === 'package_size' ? input.purchasedCount : 1;
  return {
    quantityType,
    purchasedCount: input.purchasedCount,
    quantityPerItem,
    quantityUnit: normalizeUnit(quantityUnit),
    quantity: roundQuantity(quantityPerItem * multiplier),
    unit: normalizeUnit(quantityUnit),
  };
}

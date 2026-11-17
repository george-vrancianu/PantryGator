import { toPantryQuantityFromText } from '../scan/scan-quantity';

/** An Open Food Facts quantity such as "200 g" or "1,5 l" as a Pantry quantity and unit; a multipack, an unknown unit or free text gives none. */
export function parseNetQuantity(
  text: string | null,
): ReturnType<typeof toPantryQuantityFromText> {
  const match = /^\s*(\d+(?:[.,]\d+)?)\s*([a-zA-Z]+\.?)\s*$/u.exec(text ?? '');
  if (!match) return { quantity: null, unit: null };
  return toPantryQuantityFromText(Number(match[1].replace(',', '.')), match[2]);
}

import { keepConfident, type ResolvedMatch } from './catalog-matching';
import type { ReceiptScanResult } from './receipt-scan.schemas';
import {
  MAX_RAW_NAME,
  isLowConfidence,
  type ExclusionReason,
  type ProposedLine,
} from './proposed-line';
import { toPantryQuantity } from './scan-quantity';

type ReceiptLine = ReceiptScanResult['lines'][number];

export type { ResolvedMatch };

/** Lines that are part of the receipt's arithmetic, never worth showing on Review. */
const ARITHMETIC_LINES: ReadonlySet<ReceiptLine['lineType']> = new Set([
  'subtotal',
  'total',
  'tax',
  'payment',
  'discount',
]);

/** From what kind of line it is, never from the model's wording. */
function exclusionReason(lineType: ReceiptLine['lineType']): ExclusionReason {
  switch (lineType) {
    case 'fee':
    case 'deposit':
      return lineType;
    case 'product':
      return 'not_food';
    default:
      return 'other';
  }
}

/**
 * A Receipt Scan result as proposed lines for the Review screen, in receipt
 * order. Arithmetic lines (totals, tax, payment, discounts) are dropped; other
 * lines the Scan left out of the Pantry stay, marked `excluded` with their
 * reason code, so the Member can re-include them. `resolve` supplies the validated
 * Catalog Ingredient for a line. The Match rule is `keepConfident`: a model
 * Match below `threshold` is dropped, which makes the line Unmatched, while a
 * Match found by exact name is kept.
 */
export function receiptProposedLines(
  result: ReceiptScanResult,
  resolve: (line: ReceiptLine) => ResolvedMatch | null,
  threshold: number,
): ProposedLine[] {
  return result.lines
    .filter((line) => !ARITHMETIC_LINES.has(line.lineType))
    .map((line): ProposedLine => {
      if (!line.includeInPantry) {
        return {
          name: (line.productName ?? line.sourceText).slice(0, MAX_RAW_NAME),
          sourceText: line.sourceText.slice(0, MAX_RAW_NAME),
          match: null,
          lowConfidence: false,
          quantity: null,
          unit: null,
          expiryDate: null,
          productDescription: null,
          excluded: { reason: exclusionReason(line.lineType) },
        };
      }
      const resolved = resolve(line);
      return {
        name: (line.fallbackIngredientName ?? line.sourceText).slice(
          0,
          MAX_RAW_NAME,
        ),
        sourceText: line.sourceText.slice(0, MAX_RAW_NAME),
        match: keepConfident(resolved, line.matchConfidence, threshold),
        lowConfidence: isLowConfidence(line.confidence, threshold),
        ...toPantryQuantity(line.quantity, line.unit),
        expiryDate: null,
        productDescription: line.productName,
      };
    });
}

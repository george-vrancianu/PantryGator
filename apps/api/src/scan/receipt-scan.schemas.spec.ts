import {
  parseReceiptScanOutput,
  ReceiptScanOutputError,
} from './receipt-scan.schemas';
import { deriveScanQuantity } from './scan-quantity';

describe('receipt scan schemas', () => {
  const emptyReceipt = { merchantName: null, purchaseDate: null, lines: [] };

  it('ignores non-message output items when extracting structured receipt text', () => {
    expect(
      parseReceiptScanOutput({
        status: 'completed',
        output: [
          { type: 'reasoning', summary: [] },
          {
            type: 'message',
            content: [
              { type: 'output_text', text: JSON.stringify(emptyReceipt) },
            ],
          },
        ],
      }),
    ).toEqual(emptyReceipt);
  });

  it('reports truncated output before attempting to parse its unfinished JSON', () => {
    expect(() =>
      parseReceiptScanOutput({
        status: 'incomplete',
        incomplete_details: { reason: 'max_output_tokens' },
        output: [
          {
            type: 'message',
            content: [{ type: 'output_text', text: '{"lines":[' }],
          },
        ],
      }),
    ).toThrow('cut off before it finished');
  });

  it('does not accept a valid-looking partial result from an incomplete response', () => {
    expect(() =>
      parseReceiptScanOutput({
        status: 'incomplete',
        incomplete_details: { reason: 'max_output_tokens' },
        output: [
          {
            type: 'message',
            content: [
              { type: 'output_text', text: JSON.stringify(emptyReceipt) },
            ],
          },
        ],
      }),
    ).toThrow(ReceiptScanOutputError);
  });

  it('distinguishes refused and empty scans from invalid receipt fields', () => {
    expect(() =>
      parseReceiptScanOutput({
        status: 'completed',
        output: [
          {
            type: 'message',
            content: [
              { type: 'refusal', refusal: 'Cannot process this image.' },
            ],
          },
        ],
      }),
    ).toThrow('receipt image could not be processed');
    expect(() =>
      parseReceiptScanOutput({ status: 'completed', output: [] }),
    ).toThrow('no readable result');
  });

  it('still rejects malformed dates and malformed JSON', () => {
    const wrap = (text: string) => ({
      status: 'completed',
      output: [{ type: 'message', content: [{ type: 'output_text', text }] }],
    });
    expect(() =>
      parseReceiptScanOutput(
        wrap(JSON.stringify({ ...emptyReceipt, purchaseDate: '25/09/2026' })),
      ),
    ).toThrow();
    expect(() => parseReceiptScanOutput(wrap('{not json}'))).toThrow(
      SyntaxError,
    );
  });

  it('preserves the ordered audit for matched, unmatched, and excluded lines', () => {
    const result = {
      merchantName: 'Example Market',
      purchaseDate: '2026-09-24',
      lines: [
        {
          lineNumber: 1,
          sourceText: 'PIEPT PUI 500G',
          lineType: 'product',
          includeInPantry: true,
          exclusionReason: null,
          productName: 'Chicken breast',
          productType: 'Meat',
          matchedIngredientIndex: 7,
          matchedCategory: 'Meat',
          matchConfidence: 0.96,
          fallbackIngredientName: 'Chicken Breast',
          matchExplanation:
            'The Romanian receipt text means chicken breast and matches the catalog ingredient.',
          quantityType: 'package_size',
          purchasedCount: 1,
          quantityPerItem: 500,
          quantityUnit: 'g',
          confidence: 0.95,
        },
        {
          lineNumber: 2,
          sourceText: 'SPECIAL MIX',
          lineType: 'product',
          includeInPantry: true,
          exclusionReason: null,
          productName: 'Special mix',
          productType: 'Food',
          matchedIngredientIndex: null,
          matchedCategory: null,
          matchConfidence: 0.25,
          fallbackIngredientName: 'Special Mix',
          matchExplanation:
            'The receipt wording is too generic to identify a catalog ingredient confidently.',
          quantityType: 'count',
          purchasedCount: 1,
          quantityPerItem: null,
          quantityUnit: null,
          confidence: 0.7,
        },
        {
          lineNumber: 3,
          sourceText: 'DISCOUNT -2.50',
          lineType: 'discount',
          includeInPantry: false,
          exclusionReason: 'This is a discount, not a purchased pantry item.',
          productName: null,
          productType: null,
          matchedIngredientIndex: null,
          matchedCategory: null,
          matchConfidence: 0,
          fallbackIngredientName: null,
          matchExplanation:
            'The line is a receipt discount and is excluded from the pantry.',
          quantityType: null,
          purchasedCount: null,
          quantityPerItem: null,
          quantityUnit: null,
          confidence: 0.99,
        },
      ],
    };

    expect(
      parseReceiptScanOutput({
        output: [
          {
            content: [{ type: 'output_text', text: JSON.stringify(result) }],
          },
        ],
      }),
    ).toEqual(result);
  });

  it('derives package totals from a size embedded in the receipt name', () => {
    expect(
      deriveScanQuantity(
        {
          quantityType: 'package_size',
          purchasedCount: 2,
          quantityPerItem: 500,
          quantityUnit: 'g',
        },
        '2 X PIEPT PUI DEZ 650G',
      ),
    ).toEqual({
      quantityType: 'package_size',
      purchasedCount: 2,
      quantityPerItem: 650,
      quantityUnit: 'g',
      quantity: 1300,
      unit: 'g',
    });
  });

  it('handles locale-formatted measured quantities and plain counts', () => {
    expect(
      deriveScanQuantity(
        {
          quantityType: 'measured',
          purchasedCount: 1,
          quantityPerItem: 1,
          quantityUnit: 'kg',
        },
        'BANANE 1,240 KG',
      ),
    ).toMatchObject({ quantity: 1.24, unit: 'kg' });

    expect(
      deriveScanQuantity({
        quantityType: 'count',
        purchasedCount: 3,
        quantityPerItem: null,
        quantityUnit: null,
      }),
    ).toMatchObject({ quantity: 3, unit: 'item' });
  });

  it('promotes a count to package size when the printed line contains a unit', () => {
    expect(
      deriveScanQuantity(
        {
          quantityType: 'count',
          purchasedCount: 1,
          quantityPerItem: null,
          quantityUnit: null,
        },
        'PIEPT PUI DEZ 650G',
      ),
    ).toMatchObject({
      quantityType: 'package_size',
      quantityPerItem: 650,
      quantity: 650,
      unit: 'g',
    });
  });
});

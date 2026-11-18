import { describe, expect, it } from 'vitest';
import { createI18n, type Locale } from '@/i18n';

describe('the "Added" toast copy', () => {
  it.each([
    ['en', 'Added Milk · 500 ml · Fridge', 'Added Milk · Fridge'],
    ['ro', 'Adăugat Milk · 500 ml · Frigider', 'Adăugat Milk · Frigider'],
    ['da', 'Tilføjet Milk · 500 ml · Køleskab', 'Tilføjet Milk · Køleskab'],
  ] as [Locale, string, string][])(
    'takes the name, amount and Location as separate parts in %s',
    async (locale, withAmount, withoutAmount) => {
      const { t } = createI18n(locale);
      const parts = { name: 'Milk', amount: '500 ml', location: 'X' };
      const place = t('common:locations.fridge');
      expect(
        t('pantry:form.addedToastAmount', { ...parts, location: place }),
      ).toBe(withAmount);
      expect(t('pantry:form.addedToast', { ...parts, location: place })).toBe(
        withoutAmount,
      );
    },
  );
});

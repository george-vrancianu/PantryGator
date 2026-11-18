import { Box, Typography } from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';
import type { CatalogAllergen } from '@/lib/catalog';

/** "Product data: Open Food Facts": the credit its ODbL licence requires wherever its values are shown. */
export function OpenFoodFactsCredit() {
  const { t } = useTranslation('pantry');
  return (
    <Typography variant="caption" color="text.secondary">
      {t('form.prefill.credit')}
    </Typography>
  );
}

/** The listed Allergens the matched Ingredient is not tagged with: informational, tags nothing. */
export function ListedAllergensNote({
  allergens,
}: {
  allergens: readonly CatalogAllergen[];
}) {
  const { t, i18n } = useTranslation('pantry');
  if (allergens.length === 0) return null;
  return (
    <Typography variant="caption" color="text.secondary">
      {t('form.prefill.listsAllergens', {
        names: new Intl.ListFormat(i18n.language, {
          type: 'conjunction',
        }).format(allergens.map((a) => a.name)),
      })}
    </Typography>
  );
}

/** The credit and the Allergen note of a Barcode card's lookup, or nothing when it has neither. */
export function BarcodeLookupNotes({
  lookup,
  mb,
}: {
  /** Space below, only when something shows. */
  mb?: string;
  lookup: {
    fromOpenFoodFacts: boolean;
    missingAllergens: readonly CatalogAllergen[];
  };
}) {
  if (!lookup.fromOpenFoodFacts && lookup.missingAllergens.length === 0)
    return null;
  return (
    <Box sx={{ display: 'grid', gap: '2px', mb }}>
      {lookup.fromOpenFoodFacts ? <OpenFoodFactsCredit /> : null}
      <ListedAllergensNote allergens={lookup.missingAllergens} />
    </Box>
  );
}

import { Alert, Spinner, Stack, Typography } from '@pocket-pantry/ui';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { translateApiError } from '@/i18n/translateApiError';
import { useAdminRecipeAllergens } from '@/lib/adminRecipes';

/**
 * The Allergens the Recipe is known to contain, read-only and worked out from its Ingredient
 * Lines (ADR 0014), so an Admin can sanity-check a Catalog Recipe against its Ingredients' tags.
 */
export function RecipeAllergens({ recipeId }: { recipeId: string }) {
  const { t } = useTranslation(['admin', 'errors']);
  const headingId = useId();
  const { data, error } = useAdminRecipeAllergens(recipeId);
  return (
    <Stack spacing={1} component="section" aria-labelledby={headingId}>
      <Typography id={headingId} component="h2" variant="h6">
        {t('admin:recipe.allergens.title')}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {t('admin:recipe.allergens.hint')}
      </Typography>
      {error ? <Alert>{translateApiError(t, error)}</Alert> : null}
      {!data && !error ? <Spinner label={t('admin:recipe.loading')} /> : null}
      {data && data.items.length === 0 ? (
        <Typography>{t('admin:recipe.allergens.none')}</Typography>
      ) : null}
      {data && data.items.length > 0 ? (
        <Stack
          component="ul"
          spacing={0.5}
          sx={{ m: 0, p: 0, listStyle: 'none' }}
        >
          {data.items.map((item) => (
            <li key={item.allergen.id}>
              <strong>{item.allergen.name}</strong>
              {item.optionalOnly
                ? ` (${t('admin:recipe.allergens.optional')})`
                : ''}
              {': '}
              {[...new Set(item.lines.map((line) => line.ingredientName))].join(
                ', ',
              )}
            </li>
          ))}
        </Stack>
      ) : null}
      {data && data.uncheckedCount > 0 ? (
        <Typography variant="body2" color="text.secondary">
          {t('admin:recipe.allergens.unchecked', {
            count: data.uncheckedCount,
          })}
        </Typography>
      ) : null}
    </Stack>
  );
}

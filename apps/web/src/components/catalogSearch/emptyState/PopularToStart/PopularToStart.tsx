import { useTranslation } from 'react-i18next';
import { formatAmount } from '@/lib/amount';
import { FALLBACK_LOCATION } from '@/lib/catalog';
import { defaultAmount } from '@/lib/usualAmounts';
import { usePopularToStart } from '@/lib/popularToStart';
import { useEmptyStateSearch } from '../context';
import { IngredientTile } from '../IngredientTile/IngredientTile';
import { TileSection } from '../TileSection/TileSection';

/** The empty state of a Family with nothing Recently Stocked: a fixed starter list, each with its usual amount and Location. */
export function PopularToStart() {
  const { t, i18n } = useTranslation('catalog');
  const search = useEmptyStateSearch();
  const popular = usePopularToStart(i18n.language);
  if (!search || !popular.data || popular.data.length === 0) return null;
  return (
    <TileSection heading={t('search.popularToStart')}>
      {popular.data.map((ingredient) => {
        const quantity = defaultAmount(
          ingredient.defaultUnit,
          ingredient.amountScale,
        );
        const amount = formatAmount(
          quantity,
          ingredient.defaultUnit,
          i18n.language,
          t,
        );
        const location = t(
          `common:locations.${ingredient.defaults.location ?? FALLBACK_LOCATION}`,
        );
        return (
          <IngredientTile
            key={ingredient.id}
            ingredientId={ingredient.id}
            aisleId={ingredient.parentCategory.aisle.id}
            name={ingredient.name}
            why={{
              text: `${amount} · ${location}`,
              color: 'text.secondary',
            }}
            label={t('search.popularLabel', {
              name: ingredient.name,
              amount,
              location,
            })}
            onSelect={() => search.select(ingredient)}
          />
        );
      })}
    </TileSection>
  );
}

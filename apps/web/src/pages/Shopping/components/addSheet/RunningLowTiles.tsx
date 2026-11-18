import { tokens } from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';
import { useEmptyStateSearch } from '@/components/catalogSearch/emptyState/context';
import { IngredientTile } from '@/components/catalogSearch/emptyState/IngredientTile/IngredientTile';
import { TileSection } from '@/components/catalogSearch/emptyState/TileSection/TileSection';
import type { Suggestion } from '../../../../lib/suggestions';

/**
 * "Running low": the Ingredients the Family flagged. Kept apart from the Gone
 * tiles (they are still in the Pantry). No dismiss: turning the flag off in the
 * Pantry is what removes one. Picking a tile selects it through the search.
 */
export function RunningLowTiles({ runningLow }: { runningLow: Suggestion[] }) {
  const search = useEmptyStateSearch();
  const { t } = useTranslation('shopping');
  if (!search || runningLow.length === 0) return null;
  return (
    <TileSection
      heading={t('suggestions.runningLowLabel')}
      count={runningLow.length}
    >
      {runningLow.map(({ ingredientId, aisle, name, ingredient }) => (
        <IngredientTile
          key={ingredientId}
          ingredientId={ingredientId}
          aisleId={aisle?.id ?? null}
          name={name}
          why={{
            glyph: '▽',
            text: t('suggestions.runningLowWhy'),
            color: tokens.color.soonIcon,
          }}
          label={t('suggestions.runningLowTile', { name })}
          onSelect={() => search.select(ingredient)}
        />
      ))}
    </TileSection>
  );
}

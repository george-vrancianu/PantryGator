import { Box, tokens } from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';
import { RecipeRowLayout } from '@/components/recipe/RecipeRowLayout/RecipeRowLayout';
import { StatusPills } from '@/components/recipe/StatusPills/StatusPills';
import type { CookTonightCard } from '@/lib/cookTonight';
import { totalMinutes, type RecipeListItem } from '@/lib/recipes';
import { OwnerBadge } from '@/components/recipe/OwnerBadge/OwnerBadge';

type Props = {
  recipe: RecipeListItem;
  /** The Recipe's cook-tonight card, when it has one. */
  card: CookTonightCard | undefined;
  /** Variants are labelled with their Base Recipe only while a search or filter is active. */
  filtering: boolean;
  /** Choose the Recipe instead of opening it, as the Meal plan's Recipe picker does. */
  onSelect?: () => void;
  /** Where the row opens, when not the Recipe itself (Cook Tonight opens the card's best match). */
  to?: string;
  /** Tags the active filter matched: shown first, with the accent ring. */
  matchedTagIds?: readonly string[];
};

/** A list row: title, meta and status pills on the left, total time and a chevron on the right. */
export function RecipeRow({
  recipe,
  card,
  filtering,
  onSelect,
  to,
  matchedTagIds,
}: Props) {
  const { t } = useTranslation('recipes');
  const meta = [
    recipe.difficulty ? t(`difficulty.${recipe.difficulty}`) : null,
    recipe.variantCount > 0
      ? t('variantCount', { count: recipe.variantCount })
      : null,
  ].filter((part): part is string => Boolean(part));
  return (
    <RecipeRowLayout
      title={
        <>
          {recipe.title} <OwnerBadge owner={recipe.owner} />
        </>
      }
      above={
        filtering && recipe.base ? (
          <Box
            sx={{ fontSize: 13, fontWeight: 600, color: tokens.color.accent }}
          >
            {t('variantOf', { base: recipe.base.title })}
          </Box>
        ) : null
      }
      meta={meta}
      tags={recipe.tags}
      matchedTagIds={matchedTagIds}
      minutes={totalMinutes(recipe)}
      pills={
        card || recipe.allergyWarning ? (
          <StatusPills
            recipeId={recipe.id}
            card={card}
            warning={recipe.allergyWarning}
          />
        ) : null
      }
      to={onSelect ? undefined : (to ?? `/recipes/${recipe.id}`)}
      onClick={onSelect}
    />
  );
}

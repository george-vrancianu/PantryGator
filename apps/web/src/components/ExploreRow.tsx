import { Box, tokens } from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';
import type { CookTonightCard } from '../lib/cookTonight';
import type { AddState } from '../lib/addToFamily';
import { totalMinutes, type RecipeListItem } from '../lib/recipes';
import { AddToFamilyButton } from './AddToFamilyButton';
import { InFamilyPill } from './InFamilyPill';
import { RecipeRowLayout } from './RecipeRowLayout';
import { StatusPills } from './StatusPills';

type Props = {
  recipe: RecipeListItem;
  state: AddState;
  onAdd: () => void;
  /** The Recipe's Cook Tonight card, when it has one. */
  card?: CookTonightCard | undefined;
  /** Variants are labelled with their Base only while a search or filter is active. */
  filtering?: boolean;
  /** Where tapping the row body goes (the quick view, later); without it the body is not a control. */
  onOpen?: () => void;
  /** In "You can make this", which already says it: leaves out the Can make pill. */
  hideCanMake?: boolean;
  /** Tags the active filter matched: shown first, with the accent ring. */
  matchedTagIds?: readonly string[];
  /** In a card group (Explore): the Canopy row look. */
  grouped?: boolean;
};

/** A Catalog Recipe row with its one-tap add button; shared by Explore and the empty Recipes page. */
export function ExploreRow({
  recipe,
  state,
  onAdd,
  card,
  filtering = false,
  onOpen,
  hideCanMake = false,
  matchedTagIds,
  grouped = false,
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
          {recipe.title}
          {state.status === 'none' ? null : (
            <>
              {' '}
              <InFamilyPill />
            </>
          )}
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
            hideCanMake={hideCanMake}
          />
        ) : null
      }
      onClick={onOpen}
      grouped={grouped}
      trailing={
        <AddToFamilyButton title={recipe.title} state={state} onAdd={onAdd} />
      }
    />
  );
}

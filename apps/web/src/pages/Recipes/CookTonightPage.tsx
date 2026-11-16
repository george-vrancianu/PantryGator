import { Alert, Box, Spinner, Stack } from '@pocket-pantry/ui';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Screen } from '../../components/layout/Screen';
import { HiddenByAllergiesNote } from '../../components/HiddenByAllergiesNote';
import { translateApiError } from '../../i18n/translateApiError';
import {
  canMakeCards,
  useCookTonight,
  type CookTonightCard,
} from '../../lib/cookTonight';
import { recipeHref } from '../../lib/recipeHref';
import { localIso } from '../../lib/pantry';
import type { RecipeListItem } from '../../lib/recipes';
import { RecipeRow } from './components/RecipeRow';
import { SectionLabel } from './components/SectionLabel';

/** Cook Tonight: the Recipes the Family Can Make, then those one ingredient short. */
export function CookTonightPage() {
  const { t } = useTranslation(['recipes', 'common']);
  // "Show" in the hidden-by-Allergies note asks for the Recipes the Allergies left out.
  const [showHidden, setShowHidden] = useState(false);
  const cookTonight = useCookTonight(
    // oxlint-disable-next-line react/purity -- "today" must follow the clock across midnight; freezing it would leave a Member on a stale day
    localIso(new Date()),
    showHidden,
    'family',
  );
  const cards = cookTonight.data?.cards ?? [];
  return (
    <>
      <Screen
        title={t('recipes:cookTonightPage.title')}
        back={{ label: t('recipes:back'), href: '/recipes' }}
      />
      <Stack spacing={1.5} useFlexGap>
        <HiddenByAllergiesNote
          count={cookTonight.data?.hiddenByAllergiesCount ?? 0}
          onShow={() => setShowHidden(true)}
        />
        {cookTonight.error ? (
          <Alert>{translateApiError(t, cookTonight.error)}</Alert>
        ) : null}
        {cookTonight.isPending ? <Spinner label={t('common:loading')} /> : null}
        <CardSection
          label={t('recipes:cookTonightPage.canMake')}
          cards={canMakeCards(cards)}
        />
        <CardSection
          label={t('recipes:cookTonightPage.oneShort')}
          cards={cards.filter((card) => !card.canMake)}
        />
      </Stack>
    </>
  );
}

/** A titled list of cards; left out entirely when it has none. */
function CardSection({
  label,
  cards,
}: {
  label: string;
  cards: CookTonightCard[];
}) {
  const headingId = useId();
  if (cards.length === 0) return null;
  return (
    <section>
      <SectionLabel id={headingId}>{label}</SectionLabel>
      <Box
        component="ul"
        aria-labelledby={headingId}
        sx={{ listStyle: 'none', m: 0, p: 0 }}
      >
        {cards.map((card) => (
          <RecipeRow
            key={card.base.id}
            recipe={baseRow(card)}
            card={card}
            filtering={false}
            to={recipeHref(card.recipe)}
          />
        ))}
      </Box>
    </section>
  );
}

/**
 * The card as a row for its Base Recipe, so a best match that is a Variant shows as
 * "Can Make {Variant}". Time, owner and Allergies are the best match's, the Recipe opened.
 */
function baseRow(card: CookTonightCard): RecipeListItem {
  const { recipe } = card;
  return {
    id: card.base.id,
    title: card.base.title,
    parentId: null,
    base: null,
    tags: recipe.tags,
    variantCount: 0,
    servings: recipe.servings,
    prepMinutes: recipe.prepMinutes,
    cookMinutes: recipe.cookMinutes,
    difficulty: null,
    owner: recipe.owner,
    familyCopyId: null,
    copiedFromId: null,
    allergyWarning: recipe.allergyWarning,
  };
}

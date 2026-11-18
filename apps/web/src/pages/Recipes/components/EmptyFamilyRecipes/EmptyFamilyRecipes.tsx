import {
  Box,
  Button,
  CompassIcon,
  displayType,
  Stack,
  tokens,
} from '@pocket-pantry/ui';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyPotPanel } from '@/components/gator/EmptyPotPanel/EmptyPotPanel';
import { ExploreRow } from '@/components/recipe/ExploreRow/ExploreRow';
import type { useAddToFamily } from '@/lib/addToFamily';
import { FIRST_RECIPE_WAYS } from '@/lib/firstRecipeWays';
import {
  canMakeBases,
  useCookTonight,
  type CookTonightCard,
} from '@/lib/cookTonight';
import { localIso } from '@/lib/pantry';
import { STARTER_BROWSE, STARTER_SCOPE } from '@/lib/prefetchStarters';
import { useRecipes, type RecipeListItem } from '@/lib/recipes';
import { SectionLabel } from '../SectionLabel/SectionLabel';

type AddApi = ReturnType<typeof useAddToFamily>;

/** Opens a starter's quick view. The page owns the sheet: it must outlive this empty state, which goes away on the first add. */
export type QuickViewOpen = (
  recipe: RecipeListItem,
  card: CookTonightCard | undefined,
) => void;

const STARTERS = 3;

/** Up to three Catalog Bases the Family can make now, each one tap from being added. Hidden when there are none. */
function Starters({
  add,
  stateOf,
  onQuickView,
}: AddApi & { onQuickView: QuickViewOpen }) {
  const { t } = useTranslation('recipes');
  const recipes = useRecipes(STARTER_BROWSE, { scope: STARTER_SCOPE });
  const cookTonight = useCookTonight(
    // oxlint-disable-next-line react/purity -- "today" must follow the clock across midnight
    localIso(new Date()),
    false,
    STARTER_SCOPE,
  );
  const headingId = useId();
  const cards = cookTonight.data?.cards ?? [];
  const starters = canMakeBases(cards, recipes.data?.recipes ?? [])
    // Defensive: bases only.
    .filter((recipe) => recipe.parentId === null)
    .slice(0, STARTERS);
  if (starters.length === 0) return null;
  return (
    <>
      <section>
        <SectionLabel id={headingId}>{t('emptyFamily.starters')}</SectionLabel>
        <Box
          component="ul"
          aria-labelledby={headingId}
          sx={{ listStyle: 'none', m: 0, p: 0 }}
        >
          {starters.map((recipe) => (
            <ExploreRow
              key={recipe.id}
              recipe={recipe}
              state={stateOf(recipe)}
              onAdd={() => add(recipe)}
              card={cards.find((card) => card.base.id === recipe.id)}
              hideCanMake
              onOpen={() =>
                onQuickView(
                  recipe,
                  cards.find((card) => card.base.id === recipe.id),
                )
              }
            />
          ))}
        </Box>
      </section>
    </>
  );
}

/** `/recipes` for a Family with no live Recipes: chef Gator, the three ways forward and a few starters (ADR 0029). */
export function EmptyFamilyRecipes({
  onNewRecipe,
  onQuickView,
  add,
  stateOf,
}: AddApi & {
  /** Opens the header's "+" menu. */
  onNewRecipe: () => void;
  onQuickView: QuickViewOpen;
}) {
  const { t } = useTranslation('recipes');
  return (
    <Stack spacing={0} useFlexGap sx={{ pt: '4px' }}>
      <EmptyPotPanel />
      <Box
        component="h2"
        sx={{
          ...displayType,
          fontSize: 22,
          textAlign: 'center',
          m: 0,
          mt: '16px',
        }}
      >
        {t('emptyFamily.title')}
      </Box>
      <Box
        sx={{
          fontSize: 14,
          color: tokens.color.muted,
          textAlign: 'center',
          maxWidth: '31ch',
          mx: 'auto',
          mt: '16px',
        }}
      >
        {t('emptyFamily.body')}
      </Box>
      <Stack spacing={1} useFlexGap sx={{ mt: '20px', mb: '24px' }}>
        {FIRST_RECIPE_WAYS.map((way) =>
          way.id === 'explore' ? (
            <Button
              key={way.id}
              variant="primary"
              fullWidth
              href={way.href}
              startIcon={<CompassIcon size={20} />}
              sx={{ minHeight: 48 }}
            >
              {t(way.labelKey)}
            </Button>
          ) : (
            <Button
              key={way.id}
              variant="secondary"
              fullWidth
              // New Recipe opens the Recipes page's header "+" menu (it has the editor and the draft choices).
              {...(way.id === 'newRecipe'
                ? { onClick: onNewRecipe }
                : { href: way.href })}
            >
              {t(way.labelKey)}
            </Button>
          ),
        )}
      </Stack>
      <Starters add={add} stateOf={stateOf} onQuickView={onQuickView} />
    </Stack>
  );
}

import {
  Box,
  Button,
  CompassIcon,
  displayType,
  Stack,
  tokens,
} from '@pocket-pantry/ui';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyPotPanel } from '@/components/gator/EmptyPotPanel/EmptyPotPanel';
import { ExploreRow } from '@/components/recipe/ExploreRow/ExploreRow';
import { QuickViewSheet } from '../QuickViewSheet/QuickViewSheet';
import type { useAddToFamily } from '@/lib/addToFamily';
import { canMakeBases, useCookTonight } from '@/lib/cookTonight';
import { localIso } from '@/lib/pantry';
import {
  useRecipes,
  type RecipeBrowse,
  type RecipeListItem,
} from '@/lib/recipes';
import { SectionLabel } from '../SectionLabel/SectionLabel';

type AddApi = ReturnType<typeof useAddToFamily>;

const STARTERS = 3;
const NO_BROWSE: RecipeBrowse = {
  search: '',
  tagIds: [],
};

/** Up to three Catalog Bases the Family can make now, each one tap from being added. Hidden when there are none. */
function Starters({ add, stateOf }: AddApi) {
  const { t } = useTranslation('recipes');
  const recipes = useRecipes(NO_BROWSE, { scope: 'catalog' });
  const cookTonight = useCookTonight(
    // oxlint-disable-next-line react/purity -- "today" must follow the clock across midnight
    localIso(new Date()),
    false,
    'catalog',
  );
  const headingId = useId();
  const [quick, setQuick] = useState<RecipeListItem | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);
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
              onOpen={() => {
                setQuick(recipe);
                setQuickOpen(true);
              }}
            />
          ))}
        </Box>
      </section>
      {quick ? (
        <QuickViewSheet
          recipe={quick}
          open={quickOpen}
          onClose={() => setQuickOpen(false)}
          card={cards.find((card) => card.base.id === quick.id)}
          state={stateOf(quick)}
          onAdd={(recipe) => void add(recipe)}
          stateOf={stateOf}
        />
      ) : null}
    </>
  );
}

/** `/recipes` for a Family with no live Recipes: chef Gator, the three ways forward and a few starters (ADR 0029). */
export function EmptyFamilyRecipes({
  onNewRecipe,
  add,
  stateOf,
}: AddApi & {
  /** Opens the header's "+" menu. */
  onNewRecipe: () => void;
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
        <Button
          variant="primary"
          fullWidth
          href="/recipes/explore"
          startIcon={<CompassIcon size={20} />}
          sx={{ minHeight: 48 }}
        >
          {t('emptyFamily.explore')}
        </Button>
        <Button variant="secondary" fullWidth href="/recipes/from-link">
          {t('emptyFamily.fromLink')}
        </Button>
        <Button variant="secondary" fullWidth href="/recipes/from-text">
          {t('emptyFamily.fromText')}
        </Button>
        <Button variant="secondary" fullWidth onClick={onNewRecipe}>
          {t('emptyFamily.newRecipe')}
        </Button>
      </Stack>
      <Starters add={add} stateOf={stateOf} />
    </Stack>
  );
}

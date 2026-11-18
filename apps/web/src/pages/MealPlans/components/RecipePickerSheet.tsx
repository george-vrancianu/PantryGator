import { Alert, Box, Sheet, Spinner, Typography } from '@pocket-pantry/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ExploreRow } from '@/components/recipe/ExploreRow/ExploreRow';
import { copyToFamily, refreshAfterCopy } from '../../../lib/addToFamily';
import { translateApiError } from '../../../i18n/translateApiError';
import {
  isFiltering,
  useRecipes,
  type RecipeBrowse,
} from '../../../lib/recipes';
import { RecipeFilters } from '@/components/recipe/RecipeFilters/RecipeFilters';
import { RecipeRow } from '@/components/recipe/RecipeRow/RecipeRow';

type Props = {
  open: boolean;
  /** "Dinner on Fri 16 Oct". */
  context: string;
  /** A failed slot write, shown here because the picker covers the page. */
  error: string | null;
  /** A slot write is running; picks are ignored until it settles. */
  busy: boolean;
  onPick: (recipeId: string) => void;
  onClose: () => void;
};

/**
 * The Family's Recipes first, then an Explore section of Catalog Recipes (ADR 0029): Plans use
 * Family Recipes only, so picking a Catalog Recipe Adds it to the Family and plans the copy.
 * Both lists share the Recipes list's search box (no Tags filter here).
 */
export function RecipePickerSheet({
  open,
  context,
  error,
  busy,
  onPick,
  onClose,
}: Props) {
  const { t } = useTranslation(['mealPlans', 'recipes', 'common']);
  const [browse, setBrowse] = useState<RecipeBrowse>({
    search: '',
    tagIds: [],
  });
  // Plan Slots never hide (ADR 0012): "Hide Recipes with my Allergies" must not narrow what
  // a Member can plan, so the picker always asks for the hidden Recipes too.
  const recipes = useRecipes(browse, {
    includeVariants: true,
    showHidden: true,
    scope: 'family',
    enabled: open,
  });
  const explore = useRecipes(browse, {
    includeVariants: true,
    showHidden: true,
    scope: 'catalog',
    enabled: open,
  });
  const queryClient = useQueryClient();
  const [addingId, setAddingId] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const items = recipes.data?.recipes ?? [];
  // A Catalog Recipe the Family already has is listed above as its copy.
  const catalogItems = (explore.data?.recipes ?? []).filter(
    (recipe) => recipe.familyCopyId === null,
  );
  // Not `useAddToFamily`: the sheet closes on a pick, so there is no Undo to offer.
  const pickCatalog = async (recipe: {
    id: string;
    familyCopyId: string | null;
  }) => {
    if (busy || addingId) return;
    setAddError(null);
    setAddingId(recipe.id);
    try {
      const copy = await copyToFamily(recipe.id);
      await refreshAfterCopy(queryClient);
      onPick(copy.id);
    } catch (error) {
      setAddError(translateApiError(t, error));
    } finally {
      setAddingId(null);
    }
  };
  const filtering = isFiltering(browse);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('mealPlans:picker.title')}
      subtitle={context}
      toolbar={<RecipeFilters value={browse} onChange={setBrowse} />}
    >
      <Box sx={{ px: 3, pb: 2 }}>
        {error ? <Alert>{error}</Alert> : null}
        {addError ? <Alert>{addError}</Alert> : null}
        {recipes.error ? (
          <Alert>{translateApiError(t, recipes.error)}</Alert>
        ) : null}
        {recipes.isPending ? <Spinner label={t('common:loading')} /> : null}
        {recipes.data && items.length === 0 ? (
          <Typography color="text.secondary">
            {filtering
              ? t('recipes:noMatches')
              : t('mealPlans:picker.emptyFamily')}
          </Typography>
        ) : null}
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {items.map((recipe) => (
            <RecipeRow
              key={recipe.id}
              recipe={recipe}
              card={undefined}
              filtering
              onSelect={() => {
                if (!busy) onPick(recipe.id);
              }}
            />
          ))}
        </Box>
        {explore.error ? (
          <Alert>{translateApiError(t, explore.error)}</Alert>
        ) : null}
        {explore.isPending ? (
          <Spinner label={t('mealPlans:picker.exploreLoading')} />
        ) : null}
        {catalogItems.length > 0 ? (
          <section>
            <Typography
              component="h3"
              variant="h3"
              id="picker-explore"
              sx={{ mt: 2 }}
            >
              {t('mealPlans:picker.explore')}
            </Typography>
            <Typography variant="meta" color="text.secondary">
              {t('mealPlans:picker.exploreHint')}
            </Typography>
            <Box
              component="ul"
              aria-labelledby="picker-explore"
              sx={{ listStyle: 'none', m: 0, p: 0 }}
            >
              {catalogItems.map((recipe) => (
                <ExploreRow
                  key={recipe.id}
                  recipe={recipe}
                  state={{ status: addingId === recipe.id ? 'adding' : 'none' }}
                  onAdd={() => void pickCatalog(recipe)}
                  onOpen={() => void pickCatalog(recipe)}
                  filtering
                />
              ))}
            </Box>
          </section>
        ) : null}
      </Box>
    </Sheet>
  );
}

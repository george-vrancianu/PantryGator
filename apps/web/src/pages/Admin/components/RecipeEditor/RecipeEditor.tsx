import { Alert, Spinner, Stack } from '@pocket-pantry/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { translateApiError } from '@/i18n/translateApiError';
import type { AdminCatalog } from '@/lib/admin';
import { useAdminRecipe } from '@/lib/adminRecipes';
import type { RecipeDraft } from '@/lib/recipeDraft';
import { RecipeAllergens } from '../RecipeAllergens/RecipeAllergens';
import { RecipeActions } from '../RecipeActions/RecipeActions';
import { RecipeGuidance } from '../RecipeGuidance/RecipeGuidance';
import { RecipeForm } from '../RecipeForm/RecipeForm';
import { RecipeTips } from '@/components/recipeEditor/RecipeTips';
import { RecipeTranslations } from '../RecipeTranslations/RecipeTranslations';

type Props = {
  /** Null to author a new Base Recipe. */
  recipeId: string | null;
  catalog: AdminCatalog;
  /** Open another Recipe's editor (a new Base Recipe or Variant after it is made). */
  onOpen: (id: string) => void;
  onClose: () => void;
};

/**
 * Create a Base Recipe, or edit a saved Recipe: its document, actions (make a
 * Variant, archive), Tips and per-locale translations. Tips and translations
 * need saved Steps and lines, so they appear once the Recipe exists.
 */
export function RecipeEditor({ recipeId, catalog, onOpen, onClose }: Props) {
  const { t } = useTranslation(['admin', 'common', 'errors']);
  const query = useAdminRecipe(recipeId);
  const recipe = query.data;
  // The form as it is now (unsaved edits included), which Suggest Guidance below it reads.
  const [page, setPage] = useState<RecipeDraft | null>(null);

  if (recipeId === null) {
    return (
      <RecipeForm
        catalog={catalog}
        onSaved={(r) => onOpen(r.id)}
        onCancel={onClose}
      />
    );
  }
  if (!recipe) {
    return query.error ? (
      <Alert>{translateApiError(t, query.error)}</Alert>
    ) : (
      <Spinner label={t('admin:recipe.loading')} />
    );
  }
  return (
    <Stack spacing={4}>
      <RecipeForm
        recipe={recipe}
        catalog={catalog}
        onSaved={() => {}}
        onCancel={onClose}
        onDraftChange={setPage}
      />
      <RecipeActions recipe={recipe} onOpen={onOpen} />
      <RecipeAllergens recipeId={recipe.id} />
      <RecipeTips recipe={recipe} />
      <RecipeGuidance recipe={recipe} catalog={catalog} page={page} />
      <RecipeTranslations recipe={recipe} catalog={catalog} />
    </Stack>
  );
}

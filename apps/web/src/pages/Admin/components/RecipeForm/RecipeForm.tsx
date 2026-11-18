import { Box } from '@pocket-pantry/ui';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CatalogSearch } from '@/components/catalogSearch/CatalogSearch/CatalogSearch';
import { BrowseByAisle } from '@/components/catalogSearch/emptyState/BrowseByAisle/BrowseByAisle';
import { type AdminCatalog } from '@/lib/admin';
import {
  useCreateRecipe,
  useUpdateRecipe,
  type AdminRecipe,
} from '@/lib/adminRecipes';
import {
  documentOf,
  draftOf,
  emptyDraft,
  hasProblems,
  newKey,
  problemsOf,
  type RecipeDraft,
} from '@/lib/recipeDraft';
import { EditorForm } from '@/components/EditorForm';
import { RecipeLinesSection } from '@/components/recipeEditor/RecipeLinesSection';
import { RecipeMetaFields } from '../RecipeMetaFields/RecipeMetaFields';
import { RecipeStepsSection } from '@/components/recipeEditor/RecipeStepsSection';

type Props = {
  /** Omit to create a new Base Recipe. */
  recipe?: AdminRecipe;
  catalog: AdminCatalog;
  onSaved: (recipe: AdminRecipe) => void;
  onCancel: () => void;
  /** Tells the editor what the form holds now, for siblings that read it (Suggest Guidance). */
  onDraftChange?: (draft: RecipeDraft) => void;
};

/**
 * The Recipe document: metadata, ordered Ingredient Lines and ordered Steps.
 * Saving sends the whole document; lines and Steps that carry an id are
 * updated in place, so their translations and Step Tips stay put.
 */
export function RecipeForm({
  recipe,
  catalog,
  onSaved,
  onCancel,
  onDraftChange,
}: Props) {
  const { t, i18n } = useTranslation(['admin', 'recipes', 'common', 'catalog']);
  const create = useCreateRecipe();
  const update = useUpdateRecipe(recipe?.id ?? '');
  const write = recipe ? update : create;
  const [draft, setDraft] = useState<RecipeDraft>(() =>
    recipe ? draftOf(recipe, catalog, i18n.language) : emptyDraft(),
  );
  useEffect(() => onDraftChange?.(draft), [draft, onDraftChange]);
  const [searchKey, setSearchKey] = useState(0);
  const [addedKey, setAddedKey] = useState<number | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  /** Counts saves on Edit, each of which reseeds the draft (so open Undo toasts go). */
  const [saves, setSaves] = useState(0);
  const [titleTouched, setTitleTouched] = useState(false);
  const problems = problemsOf(draft);
  const showTitleError = problems.title && (titleTouched || !!recipe);
  const tipCount = (stepId?: string) =>
    stepId
      ? (recipe?.tips.filter((tip) => tip.stepId === stepId).length ?? 0)
      : 0;

  const change = (patch: Partial<RecipeDraft>) => {
    setJustSaved(false);
    setDraft((current) => ({ ...current, ...patch }));
  };
  const submit = () =>
    write.mutate(documentOf(draft), {
      onSuccess: (result) => {
        const saved = result as AdminRecipe;
        if (recipe) {
          // Reseed so lines and Steps added now carry their new ids.
          setDraft(draftOf(saved, catalog, i18n.language));
          setSaves((count) => count + 1);
          setJustSaved(true);
        }
        onSaved(saved);
      },
    });

  return (
    <EditorForm
      heading={
        recipe
          ? t('admin:recipe.editHeading', { title: recipe.title })
          : t('admin:recipe.new')
      }
      error={write.error}
      canSave={!hasProblems(problems)}
      saving={write.isPending}
      onSubmit={submit}
      onCancel={onCancel}
      saveLabel={recipe ? t('admin:recipe.save') : t('admin:recipe.create')}
    >
      <RecipeMetaFields
        draft={draft}
        problems={problems}
        titleLabel={t('admin:recipe.fields.title')}
        showTitleError={showTitleError}
        onChange={change}
        onTitleBlur={() => setTitleTouched(true)}
      />

      <RecipeLinesSection
        lines={draft.lines}
        problems={problems}
        focusKey={addedKey}
        seedKey={String(saves)}
        onChange={(lines) => change({ lines })}
      >
        <CatalogSearch
          emptyState={<BrowseByAisle />}
          key={searchKey}
          inline
          label={t('catalog:search.addIngredient')}
          placeholder={t('catalog:search.addIngredient')}
          scope="shared"
          onSelect={(ingredient) => {
            const key = newKey();
            setAddedKey(key);
            change({
              lines: [
                ...draft.lines,
                {
                  key,
                  ingredientId: ingredient.id,
                  name: ingredient.name,
                  quantity: '',
                  unit: ingredient.defaultUnit,
                  optional: false,
                  note: '',
                },
              ],
            });
            setSearchKey((value) => value + 1);
          }}
        />
      </RecipeLinesSection>

      <RecipeStepsSection
        seedKey={String(saves)}
        steps={draft.steps}
        problems={problems}
        tipCount={(step) => tipCount(step.id)}
        onChange={(steps) => change({ steps })}
      />
      <Box role="status">
        {justSaved && recipe ? t('admin:recipe.saved') : null}
      </Box>
    </EditorForm>
  );
}

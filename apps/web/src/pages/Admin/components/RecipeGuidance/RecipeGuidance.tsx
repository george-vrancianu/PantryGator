import { Alert, Button, Stack, TextField, Typography } from '@pocket-pantry/ui';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { translateApiError } from '@/i18n/translateApiError';
import { localName, type AdminCatalog } from '@/lib/admin';
import {
  suggestCatalogGuidance,
  useAdminRecipes,
  useSetGuidance,
  type AdminRecipe,
} from '@/lib/adminRecipes';
import {
  draftOf,
  suggestionRecipeOf,
  type RecipeDraft,
} from '@/lib/recipeDraft';
import { useGuidanceSuggestion } from '@/components/recipeEditor/SuggestGuidance/SuggestGuidance';
import {
  guidanceProblems,
  toGuidanceDraft,
  toGuidanceInput,
  type GuidanceDraft,
} from '@/lib/guidanceDraft';
import {
  GuidanceFields,
  type RecipePickerProps,
} from '@/components/recipeEditor/GuidanceFields/GuidanceFields';

type Props = {
  recipe: AdminRecipe;
  catalog: AdminCatalog;
  /** The Recipe form above as it is now (unsaved edits included), which Suggest Guidance reads; absent, the saved Recipe. */
  page?: RecipeDraft | null;
};

/**
 * Pairings, Nutrition Note and Eating Moments of a saved Recipe, saved together
 * through the guidance endpoint (its own Save, like Tips are separate from the
 * Recipe document). Saved Pairings keep their id so translations survive.
 */
export function RecipeGuidance({ recipe, catalog, page }: Props) {
  const { t, i18n } = useTranslation(['admin', 'recipes', 'errors']);
  const save = useSetGuidance(recipe.id);
  const [draft, setDraft] = useState<GuidanceDraft>(() =>
    toGuidanceDraft(recipe),
  );
  const [done, setDone] = useState(false);
  const suggestion = useGuidanceSuggestion({
    draft,
    onChange: (next) => {
      setDone(false);
      setDraft(next);
    },
    send: (guidance) =>
      suggestCatalogGuidance({
        recipe: suggestionRecipeOf(
          page ?? draftOf(recipe, catalog, i18n.language),
          'admin',
        ),
        guidance,
        recipeId: recipe.id,
      }),
  });
  const problems = guidanceProblems(draft);

  const submit = async () => {
    try {
      const result = await save.mutateAsync(toGuidanceInput(draft));
      setDraft(toGuidanceDraft(result as AdminRecipe));
      setDone(true);
    } catch {
      // The error is shown below.
    }
  };

  // Archived Eating Moments stay named (and removable) where a Recipe uses them.
  const momentOptions = catalog.eatingMoments.map((m) => ({
    id: m.id,
    name: localName(m, i18n.language),
    archived: m.archived,
  }));
  const RecipePicker = useMemo(
    () =>
      function Picker(props: RecipePickerProps) {
        return <AdminRecipePicker {...props} recipeId={recipe.id} />;
      },
    [recipe.id],
  );

  return (
    <Stack
      spacing={2}
      component="section"
      aria-label={t('admin:recipe.guidance.title')}
    >
      <Typography variant="sectionLabel" color="text.secondary">
        {t('admin:recipe.guidance.title')}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {t('admin:recipe.guidance.hint')}
      </Typography>
      {save.error ? <Alert>{translateApiError(t, save.error)}</Alert> : null}
      <GuidanceFields
        draft={draft}
        onChange={(next) => {
          setDone(false);
          setDraft(next);
        }}
        momentOptions={momentOptions}
        RecipePicker={RecipePicker}
        suggestion={suggestion}
        ingredientScope="shared"
        ingredientName={(id) => {
          const item = catalog.ingredients.find((i) => i.id === id);
          return item ? localName(item, i18n.language) : undefined;
        }}
      />
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Button
          disabled={
            save.isPending ||
            problems.pairing ||
            problems.note ||
            problems.linkPosition !== null
          }
          onClick={() => void submit()}
        >
          {save.isPending
            ? t('admin:recipe.guidance.saving')
            : t('admin:recipe.guidance.save')}
        </Button>
        <Typography role="status" variant="body2">
          {done ? t('admin:recipe.guidance.saved') : null}
        </Typography>
      </Stack>
    </Stack>
  );
}

/** The Admin links to any Catalog Recipe except this one; an archived one only if already linked. */
function AdminRecipePicker({
  label,
  value,
  onChange,
  recipeId,
}: RecipePickerProps & { recipeId: string }) {
  const { t, i18n } = useTranslation(['admin']);
  const recipes = useAdminRecipes();
  const options = (recipes.data ?? [])
    .filter((r) => r.id !== recipeId && (!r.archived || r.id === value))
    .sort((a, b) => a.title.localeCompare(b.title, i18n.language));
  return (
    <TextField
      select
      label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      slotProps={{ select: { native: true } }}
    >
      <option value="">{t('admin:recipe.guidance.pairings.choose')}</option>
      {options.map((r) => (
        <option key={r.id} value={r.id}>
          {r.archived
            ? `${r.title} (${t('admin:recipe.archivedBadge')})`
            : r.title}
        </option>
      ))}
    </TextField>
  );
}

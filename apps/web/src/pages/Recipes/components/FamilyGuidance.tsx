import { Stack, TextField } from '@pocket-pantry/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRecipeFilters, useRecipes } from '../../../lib/recipes';
import type {
  MomentOption,
  RecipePickerProps,
} from '@/components/recipeEditor/GuidanceFields/GuidanceFields';

/** The live Eating Moments the Member can pick, named in their locale. */
export function useMomentOptions(): MomentOption[] {
  const filters = useRecipeFilters().data;
  return (filters?.eatingMoments ?? []).map((m) => ({
    id: m.id,
    name: m.name,
    archived: false,
  }));
}

/** Links a Pairing to a Recipe the Member can see: search by title, then choose. */
export function FamilyRecipePicker({
  label,
  value,
  valueLabel,
  onChange,
  excludeId,
}: RecipePickerProps & { excludeId?: string }) {
  const { t } = useTranslation(['recipes', 'admin']);
  const [search, setSearch] = useState('');
  // Pairing links never hide a Recipe, whatever "Hide Recipes with my Allergies" says.
  const results = useRecipes({ search, tagIds: [] }, { showHidden: true });
  const options = (results.data?.recipes ?? []).filter(
    (r) => r.id !== excludeId,
  );
  const known = options.some((r) => r.id === value);
  return (
    <Stack spacing={1}>
      <TextField
        label={`${t('recipes:search')} (${label})`}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <TextField
        select
        label={label}
        value={value}
        onChange={(event) =>
          onChange(
            event.target.value,
            options.find((r) => r.id === event.target.value)?.title,
          )
        }
        slotProps={{ select: { native: true } }}
      >
        <option value="">{t('admin:recipe.guidance.pairings.choose')}</option>
        {value && !known ? (
          <option value={value}>
            {valueLabel ?? t('recipes:family.linkedRecipeUnavailable')}
          </option>
        ) : null}
        {options.map((r) => (
          <option key={r.id} value={r.id}>
            {r.title}
          </option>
        ))}
      </TextField>
    </Stack>
  );
}

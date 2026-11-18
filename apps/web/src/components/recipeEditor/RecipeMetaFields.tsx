import { Stack, TextField } from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';
import { DIFFICULTIES, type Difficulty } from '../../lib/recipeVocabulary';
import { RecipeTagsField } from './RecipeTagsField';
import type { DraftProblems, RecipeDraft } from '../../lib/recipeDraft';

type Props = {
  draft: RecipeDraft;
  problems: DraftProblems;
  titleLabel: string;
  showTitleError: boolean;
  onChange: (patch: Partial<RecipeDraft>) => void;
  onTitleBlur: () => void;
};

/** Title, servings, times, difficulty and Tags of a Recipe draft. */
export function RecipeMetaFields({
  draft,
  problems,
  titleLabel,
  showTitleError,
  onChange,
  onTitleBlur,
}: Props) {
  const { t } = useTranslation(['admin', 'recipes']);
  return (
    <>
      <TextField
        label={titleLabel}
        value={draft.title}
        onChange={(event) => onChange({ title: event.target.value })}
        onBlur={onTitleBlur}
        error={showTitleError}
        helperText={
          showTitleError ? t('admin:recipe.invalid.title') : undefined
        }
        required
      />
      <Stack direction="row" spacing={1}>
        <TextField
          label={t('admin:recipe.fields.servings')}
          value={draft.servings}
          onChange={(event) => onChange({ servings: event.target.value })}
          error={problems.servings}
          helperText={
            problems.servings ? t('admin:recipe.invalid.servings') : undefined
          }
          slotProps={{ htmlInput: { inputMode: 'numeric' } }}
          required
        />
        <TextField
          label={t('admin:recipe.fields.prepMinutes')}
          value={draft.prepMinutes}
          onChange={(event) => onChange({ prepMinutes: event.target.value })}
          error={problems.prepMinutes}
          helperText={
            problems.prepMinutes ? t('admin:recipe.invalid.minutes') : undefined
          }
          slotProps={{ htmlInput: { inputMode: 'numeric' } }}
        />
        <TextField
          label={t('admin:recipe.fields.cookMinutes')}
          value={draft.cookMinutes}
          onChange={(event) => onChange({ cookMinutes: event.target.value })}
          error={problems.cookMinutes}
          helperText={
            problems.cookMinutes ? t('admin:recipe.invalid.minutes') : undefined
          }
          slotProps={{ htmlInput: { inputMode: 'numeric' } }}
        />
      </Stack>
      <TextField
        select
        label={t('admin:recipe.fields.difficulty')}
        value={draft.difficulty}
        onChange={(event) =>
          onChange({ difficulty: event.target.value as Difficulty | '' })
        }
        slotProps={{ select: { native: true } }}
      >
        <option value="">{t('admin:recipe.fields.difficultyNone')}</option>
        {DIFFICULTIES.map((level) => (
          <option key={level} value={level}>
            {t(`recipes:difficulty.${level}`)}
          </option>
        ))}
      </TextField>
      <RecipeTagsField
        scope="admin"
        value={draft.tagIds}
        onChange={(tagIds) => onChange({ tagIds })}
      />
    </>
  );
}

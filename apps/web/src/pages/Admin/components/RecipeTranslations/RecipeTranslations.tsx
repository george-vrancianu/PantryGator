import { Alert, Button, Stack, TextField, Typography } from '@pocket-pantry/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LOCALES, type Locale } from '@/i18n/resources';
import { translateApiError } from '@/i18n/translateApiError';
import { localName, type AdminCatalog } from '@/lib/admin';
import {
  useSetRecipeTranslations,
  type AdminRecipe,
  type TranslationsInput,
} from '@/lib/adminRecipes';

type Props = { recipe: AdminRecipe; catalog: AdminCatalog };

/**
 * Per-locale text of a saved Recipe: title, Steps, Ingredient Line notes and
 * Tips, plus guidance (Pairings, Eating Moment reasons, Nutrition Note).
 * English is the source; a blank field falls back to it. Each locale saves in
 * one request with only what changed (blanking a field deletes it).
 */
export function RecipeTranslations({ recipe, catalog }: Props) {
  const { t } = useTranslation(['admin', 'errors']);
  const save = useSetRecipeTranslations(recipe.id);
  return (
    <Stack
      spacing={2}
      component="section"
      aria-label={t('admin:recipe.translations.title')}
    >
      <Typography variant="sectionLabel" color="text.secondary">
        {t('admin:recipe.translations.title')}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {t('admin:recipe.translations.hint')}
      </Typography>
      {save.error ? <Alert>{translateApiError(t, save.error)}</Alert> : null}
      {LOCALES.filter((locale) => locale !== 'en').map((locale) => (
        <LocaleBlock
          key={locale}
          locale={locale}
          recipe={recipe}
          catalog={catalog}
          saving={save.isPending}
          onSave={(input) => save.mutateAsync({ locale, input })}
        />
      ))}
    </Stack>
  );
}

type BlockProps = {
  locale: Locale;
  recipe: AdminRecipe;
  catalog: AdminCatalog;
  saving: boolean;
  onSave: (input: TranslationsInput) => Promise<unknown>;
};

function LocaleBlock({ locale, recipe, catalog, saving, onSave }: BlockProps) {
  const { t, i18n } = useTranslation('admin');
  const language = t(`locales.${locale}`);
  const saved = recipe.translations[locale];
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);

  const current = (key: string, savedValue: string | null | undefined) =>
    edits[key] ?? savedValue ?? '';
  const set = (key: string, value: string) => {
    setDone(false);
    setEdits((existing) => ({ ...existing, [key]: value }));
  };

  /** null deletes, a string sets, undefined leaves it alone. */
  const change = (
    key: string,
    savedValue: string | null | undefined,
  ): string | null | undefined => {
    if (edits[key] === undefined) return undefined;
    const value = edits[key].trim();
    if (value === (savedValue ?? '')) return undefined;
    return value === '' ? null : value;
  };

  const input: TranslationsInput = { steps: {}, lines: {}, tips: {} };
  const title = change('title', saved?.title);
  if (title !== undefined) input.title = title;
  for (const step of recipe.steps) {
    const value = change(`step:${step.id}`, saved?.steps[step.id]);
    if (value !== undefined) input.steps![step.id] = value;
  }
  for (const line of recipe.lines) {
    if (line.note === null) continue;
    const value = change(`line:${line.id}`, saved?.lines[line.id]);
    if (value !== undefined) input.lines![line.id] = value;
  }
  for (const tip of recipe.tips) {
    const value = change(`tip:${tip.id}`, saved?.tips[tip.id]);
    if (value !== undefined) input.tips![tip.id] = value;
  }
  const note = change('nutritionNote', saved?.nutritionNote);
  if (note !== undefined) input.nutritionNote = note;
  const pairings: NonNullable<TranslationsInput['pairings']> = {};
  const incompletePairings: number[] = [];
  for (const [index, pairing] of recipe.pairings.entries()) {
    const savedPairing = saved?.pairings[pairing.id];
    const label = change(`pairing:${pairing.id}:label`, savedPairing?.label);
    const reason = change(`pairing:${pairing.id}:reason`, savedPairing?.reason);
    if (label === undefined && reason === undefined) continue;
    const nextLabel =
      label === undefined ? (savedPairing?.label ?? null) : label;
    const nextReason =
      reason === undefined ? (savedPairing?.reason ?? null) : reason;
    if (nextLabel === null && nextReason === null) {
      pairings[pairing.id] = null;
    } else if (nextLabel === null || nextReason === null) {
      // Label and reason are saved together: wait until both are filled.
      incompletePairings.push(index + 1);
    } else {
      pairings[pairing.id] = { label: nextLabel, reason: nextReason };
    }
  }
  if (Object.keys(pairings).length > 0) input.pairings = pairings;
  const moments: NonNullable<TranslationsInput['eatingMoments']> = {};
  for (const use of recipe.eatingMoments) {
    if (use.reason === null) continue;
    const value = change(
      `moment:${use.eatingMomentId}`,
      saved?.eatingMoments[use.eatingMomentId],
    );
    if (value !== undefined) moments[use.eatingMomentId] = value;
  }
  if (Object.keys(moments).length > 0) input.eatingMoments = moments;
  const changed =
    incompletePairings.length === 0 &&
    (input.title !== undefined ||
      input.nutritionNote !== undefined ||
      input.pairings !== undefined ||
      input.eatingMoments !== undefined ||
      Object.keys(input.steps!).length +
        Object.keys(input.lines!).length +
        Object.keys(input.tips!).length >
        0);

  const field = (
    key: string,
    label: string,
    source: string,
    savedValue: string | null | undefined,
  ) => (
    <TextField
      key={key}
      label={label}
      value={current(key, savedValue)}
      onChange={(event) => set(key, event.target.value)}
      helperText={t('recipe.translations.source', { text: source })}
      multiline
    />
  );

  return (
    <Stack
      component="fieldset"
      spacing={1.5}
      sx={{ border: 0, p: 0, m: 0, minWidth: 0 }}
    >
      <Typography component="legend" variant="body2" sx={{ fontWeight: 700 }}>
        {language}
      </Typography>
      {field(
        'title',
        t('recipe.translations.title_field', { language }),
        recipe.title,
        saved?.title,
      )}
      {recipe.steps.map((step, index) =>
        field(
          `step:${step.id}`,
          t('recipe.translations.step', { number: index + 1, language }),
          step.text,
          saved?.steps[step.id],
        ),
      )}
      {recipe.lines.map((line) => {
        if (line.note === null) return null;
        const ingredient = catalog.ingredients.find(
          (item) => item.id === line.ingredientId,
        );
        const name = ingredient
          ? localName(ingredient, i18n.language)
          : t('recipe.lines.unknown');
        return field(
          `line:${line.id}`,
          t('recipe.translations.line', { name, language }),
          line.note,
          saved?.lines[line.id],
        );
      })}
      {recipe.tips.map((tip) => {
        const members = recipe.tips.filter(
          (other) => other.stepId === tip.stepId,
        );
        const stepIndex = recipe.steps.findIndex(
          (step) => step.id === tip.stepId,
        );
        const group =
          tip.stepId === null
            ? t('recipe.tips.groupRecipe')
            : t('recipe.tips.groupStep', { number: stepIndex + 1 });
        return field(
          `tip:${tip.id}`,
          t('recipe.translations.tip', {
            position: members.indexOf(tip) + 1,
            group,
            language,
          }),
          tip.text,
          saved?.tips[tip.id],
        );
      })}
      {incompletePairings.map((position) => (
        <Typography key={position} variant="body2" color="error" role="alert">
          {t('recipe.translations.pairingIncomplete', { position, language })}
        </Typography>
      ))}
      {recipe.nutritionNote !== null
        ? field(
            'nutritionNote',
            t('recipe.translations.nutritionNote', { language }),
            recipe.nutritionNote,
            saved?.nutritionNote,
          )
        : null}
      {recipe.pairings.map((pairing, index) => {
        const savedPairing = saved?.pairings[pairing.id];
        const position = index + 1;
        return [
          field(
            `pairing:${pairing.id}:label`,
            t('recipe.translations.pairingLabel', { position, language }),
            pairing.label,
            savedPairing?.label,
          ),
          field(
            `pairing:${pairing.id}:reason`,
            t('recipe.translations.pairingReason', { position, language }),
            pairing.reason,
            savedPairing?.reason,
          ),
        ];
      })}
      {recipe.eatingMoments.map((use) => {
        if (use.reason === null) return null;
        const moment = catalog.eatingMoments.find(
          (item) => item.id === use.eatingMomentId,
        );
        const name = moment ? localName(moment, i18n.language) : '';
        return field(
          `moment:${use.eatingMomentId}`,
          t('recipe.translations.eatingMomentReason', { name, language }),
          use.reason,
          saved?.eatingMoments[use.eatingMomentId],
        );
      })}
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Button
          variant="secondary"
          disabled={saving || !changed}
          onClick={() =>
            void onSave(input)
              .then(() => {
                setEdits({});
                setDone(true);
              })
              .catch(() => {})
          }
        >
          {t('recipe.translations.save', { language })}
        </Button>
        <Typography role="status" variant="body2">
          {done ? t('recipe.translations.saved', { language }) : null}
        </Typography>
      </Stack>
    </Stack>
  );
}

import { Alert, Button, Chip, Stack, Typography } from '@pocket-pantry/ui';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { translateApiError } from '@/i18n/translateApiError';
import {
  localName,
  useSetIngredientAllergens,
  type AdminAllergen,
  type AdminIngredient,
} from '@/lib/admin';

type Props = {
  ingredient: AdminIngredient;
  allergens: AdminAllergen[];
};

/**
 * The Allergens a shared Ingredient contains. Saving marks it checked, so an Ingredient with
 * nothing picked is recorded as containing none. A retired Allergen can be kept or removed, not
 * newly added.
 */
export function IngredientAllergens({ ingredient, allergens }: Props) {
  const { t, i18n } = useTranslation(['admin', 'errors']);
  const headingId = useId();
  const save = useSetIngredientAllergens(ingredient.id);
  const [chosen, setChosen] = useState(() => new Set(ingredient.allergenIds));
  const [saved, setSaved] = useState(false);
  const offered = allergens.filter(
    (allergen) =>
      !allergen.archived || ingredient.allergenIds.includes(allergen.id),
  );

  const toggle = (id: string) => {
    const next = new Set(chosen);
    if (!next.delete(id)) next.add(id);
    setChosen(next);
    setSaved(false);
  };

  return (
    <Stack spacing={1} component="section" aria-labelledby={headingId}>
      <Typography id={headingId} component="h2" variant="h6">
        {t('admin:ingredient.allergens.title')}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {t('admin:ingredient.allergens.hint')}
      </Typography>
      {ingredient.allergensReviewPending && !saved ? (
        <Typography
          role="status"
          aria-label={t('admin:ingredient.allergens.reviewTitle')}
          variant="body2"
          sx={{ fontWeight: 700 }}
        >
          {t('admin:ingredient.allergens.reviewHint')}
        </Typography>
      ) : null}
      <Stack
        direction="row"
        role="group"
        aria-labelledby={headingId}
        sx={{ flexWrap: 'wrap', gap: 1 }}
      >
        {offered.map((allergen) => (
          <Chip
            key={allergen.id}
            label={localName(allergen, i18n.language)}
            selected={chosen.has(allergen.id)}
            disabled={save.isPending}
            onClick={() => toggle(allergen.id)}
          />
        ))}
      </Stack>
      {save.error ? <Alert>{translateApiError(t, save.error)}</Alert> : null}
      {saved ? (
        <Typography role="status" variant="body2">
          {t('admin:ingredient.allergens.saved')}
        </Typography>
      ) : null}
      <div>
        <Button
          variant="secondary"
          disabled={save.isPending}
          onClick={() =>
            save.mutate(
              // Keep the list's order so the saved set reads the same everywhere.
              allergens.filter((a) => chosen.has(a.id)).map((a) => a.id),
              { onSuccess: () => setSaved(true) },
            )
          }
        >
          {t('admin:ingredient.allergens.save')}
        </Button>
      </div>
    </Stack>
  );
}

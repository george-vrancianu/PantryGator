import {
  Alert,
  Card,
  Checkbox,
  Chip,
  Stack,
  Typography,
  SectionHeading,
} from '@pocket-pantry/ui';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useAllergies,
  useMemberPreferences,
  useSaveAllergies,
  useSaveHideRecipesWithAllergies,
} from '@/lib/settings';

/**
 * The Member's own Allergies, picked from the Allergen list. Each pick is saved at once. An
 * Allergy is not a Member Preference: the Family can see it, and it stays with the Member.
 */
export function AllergiesSection() {
  const { t } = useTranslation('settings');
  const id = useId();
  const query = useAllergies();
  const save = useSaveAllergies();
  const view = query.data;
  const preferences = useMemberPreferences();
  const saveHide = useSaveHideRecipesWithAllergies();
  const toggle = (allergenId: string) => {
    if (!view) return;
    const chosen = new Set(view.allergenIds);
    if (!chosen.delete(allergenId)) chosen.add(allergenId);
    // Keep the Allergen list's order, so the saved set reads the same everywhere.
    save.mutate(
      view.allergens.filter((a) => chosen.has(a.id)).map((a) => a.id),
    );
  };
  return (
    <Stack component="section" spacing={1} aria-labelledby={`${id}-title`}>
      <SectionHeading id={`${id}-title`} title={t('allergies.title')} />
      <Card>
        <Stack spacing={1.5}>
          <Typography variant="meta" color="text.secondary">
            {t('allergies.hint')} {t('allergies.familyCanSee')}{' '}
            {t('allergies.noAccount')}
          </Typography>
          {query.isError ? <Alert>{t('allergies.loadFailed')}</Alert> : null}
          {view ? (
            <Stack
              direction="row"
              sx={{ flexWrap: 'wrap', gap: 1 }}
              role="group"
              aria-label={t('allergies.title')}
            >
              {view.allergens.map((allergen) => (
                <Chip
                  key={allergen.id}
                  label={allergen.name}
                  selected={view.allergenIds.includes(allergen.id)}
                  disabled={save.isPending}
                  onClick={() => toggle(allergen.id)}
                />
              ))}
            </Stack>
          ) : null}
          {save.isError ? <Alert>{t('allergies.saveFailed')}</Alert> : null}
          {/* A Member Preference, unlike the Allergies above: private, and it follows the Member. */}
          <Checkbox
            label={t('allergies.hideRecipes')}
            helperText={t('allergies.hideRecipesHint')}
            checked={preferences.data?.hideRecipesWithAllergies ?? false}
            disabled={!preferences.data || saveHide.isPending}
            onChange={(event) => saveHide.mutate(event.target.checked)}
          />
          {saveHide.isError ? (
            <Alert>{t('allergies.hideSaveFailed')}</Alert>
          ) : null}
        </Stack>
      </Card>
    </Stack>
  );
}

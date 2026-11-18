import {
  Alert,
  Button,
  Card,
  Chip,
  Stack,
  TextField,
  Typography,
} from '@pocket-pantry/ui';
import { useId, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { translateApiError } from '@/i18n/translateApiError';
import {
  useAddFamilyAllergy,
  useFamilyAllergies,
  useRemoveFamilyAllergy,
} from '@/lib/settings';
import { SectionHeading } from '@/components/SectionHeading';

/**
 * The Family's Allergies for people without an account, such as a child, each with an optional label.
 * Any Member can add or remove one; they count as every Member's own Allergies (ADR 0014).
 */
export function FamilyAllergiesSection() {
  const { t } = useTranslation(['settings', 'common']);
  const id = useId();
  const query = useFamilyAllergies();
  const add = useAddFamilyAllergy();
  const remove = useRemoveFamilyAllergy();
  const [allergenId, setAllergenId] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const view = query.data;
  const busy = add.isPending || remove.isPending;
  const error = [add.error, remove.error].find(Boolean);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!allergenId) return;
    add.mutate(
      { allergenId, label: label.trim() || null },
      {
        onSuccess: () => {
          setAllergenId(null);
          setLabel('');
        },
      },
    );
  };

  return (
    <Stack component="section" spacing={1} aria-labelledby={`${id}-title`}>
      <SectionHeading id={`${id}-title`} title={t('familyAllergies.title')} />
      <Card>
        <Stack spacing={1.5}>
          <Typography variant="meta" color="text.secondary">
            {t('familyAllergies.hint')}
          </Typography>
          {query.isError ? (
            <Alert>{t('familyAllergies.loadFailed')}</Alert>
          ) : null}
          {view && view.familyAllergies.length === 0 ? (
            <Typography variant="meta" color="text.secondary">
              {t('familyAllergies.empty')}
            </Typography>
          ) : null}
          {view && view.familyAllergies.length > 0 ? (
            <Stack
              component="ul"
              spacing={1}
              sx={{ listStyle: 'none', m: 0, p: 0 }}
            >
              {view.familyAllergies.map((row) => {
                const who = row.label ?? t('familyAllergies.family');
                return (
                  <Stack
                    key={row.id}
                    component="li"
                    direction="row"
                    sx={{
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 1,
                    }}
                  >
                    <Typography>
                      <strong>{who}</strong> {row.allergen.name}
                    </Typography>
                    <Button
                      variant="ghost"
                      disabled={busy}
                      aria-label={t('familyAllergies.remove', {
                        allergen: row.allergen.name,
                        who,
                      })}
                      onClick={() => remove.mutate(row.id)}
                    >
                      {t('common:row.remove')}
                    </Button>
                  </Stack>
                );
              })}
            </Stack>
          ) : null}
          {view ? (
            <Stack component="form" spacing={1.5} onSubmit={submit}>
              <Stack
                direction="row"
                sx={{ flexWrap: 'wrap', gap: 1 }}
                role="group"
                aria-label={t('familyAllergies.allergen')}
              >
                {view.allergens.map((allergen) => (
                  <Chip
                    key={allergen.id}
                    label={allergen.name}
                    selected={allergenId === allergen.id}
                    disabled={busy}
                    onClick={() =>
                      setAllergenId(
                        allergenId === allergen.id ? null : allergen.id,
                      )
                    }
                  />
                ))}
              </Stack>
              <TextField
                id={`${id}-label`}
                label={t('familyAllergies.label')}
                helperText={t('familyAllergies.labelHint')}
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                slotProps={{ htmlInput: { maxLength: 60 } }}
              />
              <Button type="submit" disabled={!allergenId || busy}>
                {t('familyAllergies.add')}
              </Button>
            </Stack>
          ) : null}
          {error ? <Alert>{translateApiError(t, error)}</Alert> : null}
        </Stack>
      </Card>
    </Stack>
  );
}

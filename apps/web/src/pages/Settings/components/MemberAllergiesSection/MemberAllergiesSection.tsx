import {
  Alert,
  Card,
  Stack,
  Typography,
  SectionHeading,
} from '@pocket-pantry/ui';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { useFamilyAllergies } from '@/lib/settings';

/**
 * The other Members' Allergies, read-only: each Member sets only their own, in the You tab, and
 * the Family can see them (ADR 0014). Absent when the Member is alone in the Family.
 */
export function MemberAllergiesSection() {
  const { t } = useTranslation('settings');
  const id = useId();
  const query = useFamilyAllergies();
  const members = query.data?.members ?? [];
  if (!query.isError && members.length === 0) return null;
  return (
    <Stack component="section" spacing={1} aria-labelledby={`${id}-title`}>
      <SectionHeading id={`${id}-title`} title={t('memberAllergies.title')} />
      <Card>
        <Stack spacing={1.5}>
          <Typography variant="meta" color="text.secondary">
            {t('memberAllergies.hint')}
          </Typography>
          {query.isError ? (
            <Alert>{t('memberAllergies.loadFailed')}</Alert>
          ) : null}
          <Stack
            component="ul"
            spacing={1}
            sx={{ listStyle: 'none', m: 0, p: 0 }}
          >
            {members.map((member) => (
              <Stack
                key={member.id}
                component="li"
                direction="row"
                sx={{ justifyContent: 'space-between', gap: 2 }}
              >
                <Typography sx={{ fontWeight: 700 }}>{member.name}</Typography>
                <Typography color="text.secondary" sx={{ textAlign: 'right' }}>
                  {member.allergens.length > 0
                    ? member.allergens.map((a) => a.name).join(', ')
                    : t('memberAllergies.none')}
                </Typography>
              </Stack>
            ))}
          </Stack>
        </Stack>
      </Card>
    </Stack>
  );
}

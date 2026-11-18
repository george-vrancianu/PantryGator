import { TextField } from '@pocket-pantry/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LOCALES, type Locale } from '@/i18n/resources';
import {
  useAddSharedSynonym,
  type FamilySynonymCandidate,
} from '@/lib/familySynonymsQueue';
import { ReviewSheet } from '../ReviewSheet/ReviewSheet';

type Props = {
  candidate: FamilySynonymCandidate;
  open: boolean;
  onClose: () => void;
  onExited: () => void;
  onDone: () => void;
};

/** A Family Synonym candidate in a sheet: Add as Synonym, in a chosen language, for every family. */
export function FamilySynonymAdd({
  candidate,
  open,
  onClose,
  onExited,
  onDone,
}: Props) {
  const { t } = useTranslation('admin');
  const add = useAddSharedSynonym();
  const [locale, setLocale] = useState<Locale>('en');

  return (
    <ReviewSheet
      open={open}
      onClose={onClose}
      onExited={onExited}
      size="content"
      title={t('familySynonyms.addTitle', { name: candidate.name })}
      subtitle={t('familySynonyms.addHint', {
        ingredient: candidate.ingredient.name,
      })}
      error={add.error}
      form={{
        onSubmit: () => {
          if (add.isPending) return;
          add.mutate(
            {
              normalizedName: candidate.normalizedName,
              ingredientId: candidate.ingredient.id,
              locale,
            },
            { onSuccess: onDone },
          );
        },
        canSubmit: true,
        saving: add.isPending,
        submitLabel: t('familySynonyms.add'),
        savingLabel: t('familySynonyms.adding'),
      }}
    >
      <TextField
        select
        label={t('familySynonyms.language')}
        value={locale}
        onChange={(event) => setLocale(event.target.value as Locale)}
        slotProps={{ select: { native: true } }}
      >
        {LOCALES.map((code) => (
          <option key={code} value={code}>
            {t(`locales.${code}`)}
          </option>
        ))}
      </TextField>
    </ReviewSheet>
  );
}

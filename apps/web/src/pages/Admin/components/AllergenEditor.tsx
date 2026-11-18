import { Alert, Button, Stack, TextField, Typography } from '@pocket-pantry/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { translateApiError } from '../../../i18n/translateApiError';
import {
  localName,
  useArchiveAllergen,
  useSaveAllergen,
  type AdminAllergen,
} from '../../../lib/admin';
import { EditorForm } from '../../../components/EditorForm';
import { TranslationsEditor } from './TranslationsEditor';

type Props = {
  /** Omit to create a new Allergen; it goes last. */
  allergen?: AdminAllergen;
  onDone: () => void;
};

/**
 * Create, rename, translate, retire or bring back an Allergen. It is never deleted: tags and
 * Allergies keep pointing at it, so a retired Allergen is only hidden from the pickers.
 */
export function AllergenEditor({ allergen, onDone }: Props) {
  const { t, i18n } = useTranslation(['admin', 'errors']);
  const save = useSaveAllergen(allergen?.id);
  const retire = useArchiveAllergen();
  const [name, setName] = useState(allergen?.name ?? '');

  return (
    <EditorForm
      after={
        <>
          {allergen ? (
            <Stack spacing={1}>
              {allergen.archived ? (
                <Typography variant="body2" color="text.secondary">
                  {t('admin:allergen.retiredNote')}
                </Typography>
              ) : null}
              {retire.error ? (
                <Alert>{translateApiError(t, retire.error)}</Alert>
              ) : null}
              <div>
                <Button
                  variant="secondary"
                  disabled={retire.isPending}
                  onClick={() =>
                    retire.mutate(
                      { id: allergen.id, archive: !allergen.archived },
                      { onSuccess: onDone },
                    )
                  }
                >
                  {allergen.archived
                    ? t('admin:allergen.unretire')
                    : t('admin:allergen.retire')}
                </Button>
              </div>
            </Stack>
          ) : null}
          {allergen ? (
            <TranslationsEditor
              entityType="allergen"
              entityId={allergen.id}
              name={allergen.name}
              translations={allergen.translations}
              synonyms={false}
            />
          ) : null}
        </>
      }
      heading={
        allergen
          ? t('admin:allergen.edit', {
              name: localName(allergen, i18n.language),
            })
          : t('admin:allergen.new')
      }
      error={save.error}
      canSave={name.trim() !== ''}
      saving={save.isPending}
      onSubmit={() => save.mutate({ name: name.trim() }, { onSuccess: onDone })}
      onCancel={onDone}
    >
      <TextField
        label={t('admin:allergen.name')}
        value={name}
        onChange={(event) => setName(event.target.value)}
        required
      />
    </EditorForm>
  );
}

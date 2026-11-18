import { Alert, Button, Stack, TextField, Typography } from '@pocket-pantry/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { translateApiError } from '../../../i18n/translateApiError';
import {
  localName,
  useArchiveEatingMoment,
  useSaveEatingMoment,
  type AdminEatingMoment,
} from '../../../lib/admin';
import { EditorForm } from '../../../components/EditorForm';
import { TranslationsEditor } from './TranslationsEditor';

type Props = {
  /** Omit to create a new Eating Moment; it goes last. */
  moment?: AdminEatingMoment;
  onDone: () => void;
};

/**
 * Create, rename, translate, archive or unarchive an Eating Moment. It is never
 * deleted (Recipes keep using it); its place in the order is set in the list.
 */
export function EatingMomentEditor({ moment, onDone }: Props) {
  const { t, i18n } = useTranslation(['admin', 'errors']);
  const save = useSaveEatingMoment(moment?.id);
  const archive = useArchiveEatingMoment();
  const [name, setName] = useState(moment?.name ?? '');

  return (
    <EditorForm
      after={
        <>
          {moment ? (
            <Stack spacing={1}>
              {moment.archived ? (
                <Typography variant="body2" color="text.secondary">
                  {t('admin:eatingMoment.archivedNote')}
                </Typography>
              ) : null}
              {archive.error ? (
                <Alert>{translateApiError(t, archive.error)}</Alert>
              ) : null}
              <div>
                <Button
                  variant="secondary"
                  disabled={archive.isPending}
                  onClick={() =>
                    archive.mutate(
                      { id: moment.id, archive: !moment.archived },
                      { onSuccess: onDone },
                    )
                  }
                >
                  {moment.archived
                    ? t('admin:eatingMoment.unarchive')
                    : t('admin:eatingMoment.archive')}
                </Button>
              </div>
            </Stack>
          ) : null}
          {moment ? (
            <TranslationsEditor
              entityType="eating_moment"
              entityId={moment.id}
              name={moment.name}
              translations={moment.translations}
              synonyms={false}
            />
          ) : null}
        </>
      }
      heading={
        moment
          ? t('admin:eatingMoment.edit', {
              name: localName(moment, i18n.language),
            })
          : t('admin:eatingMoment.new')
      }
      error={save.error}
      canSave={name.trim() !== ''}
      saving={save.isPending}
      onSubmit={() => save.mutate({ name: name.trim() }, { onSuccess: onDone })}
      onCancel={onDone}
    >
      <TextField
        label={t('admin:eatingMoment.name')}
        value={name}
        onChange={(event) => setName(event.target.value)}
        required
      />
    </EditorForm>
  );
}

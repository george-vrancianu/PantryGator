import { TextField } from '@pocket-pantry/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  localName,
  useDeleteAisle,
  useSaveAisle,
  type AdminAisle,
} from '@/lib/admin';
import { EditorForm } from '@/components/editor/EditorForm/EditorForm';
import { TranslationsEditor } from '../TranslationsEditor/TranslationsEditor';

type Props = {
  /** Omit to create a new Aisle; it goes last in the shop order. */
  aisle?: AdminAisle;
  onDone: () => void;
};

/** Create, rename, translate or delete an Aisle. Its place in the shop order is set in the list. */
export function AisleEditor({ aisle, onDone }: Props) {
  const { t, i18n } = useTranslation('admin');
  const save = useSaveAisle(aisle?.id);
  const remove = useDeleteAisle();
  const [name, setName] = useState(aisle?.name ?? '');

  return (
    <EditorForm
      after={
        <>
          {aisle ? (
            <TranslationsEditor
              entityType="aisle"
              entityId={aisle.id}
              name={aisle.name}
              translations={aisle.translations}
            />
          ) : null}
        </>
      }
      heading={
        aisle
          ? t('aisle.edit', { name: localName(aisle, i18n.language) })
          : t('aisle.new')
      }
      error={save.error ?? remove.error}
      canSave={name.trim() !== ''}
      saving={save.isPending}
      onSubmit={() => save.mutate({ name: name.trim() }, { onSuccess: onDone })}
      onCancel={onDone}
      onDelete={
        aisle ? () => remove.mutate(aisle.id, { onSuccess: onDone }) : undefined
      }
      deleting={remove.isPending}
    >
      <TextField
        label={t('aisle.name')}
        value={name}
        onChange={(event) => setName(event.target.value)}
        required
      />
    </EditorForm>
  );
}

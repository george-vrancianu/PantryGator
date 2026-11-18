import { TextField } from '@pocket-pantry/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  localName,
  useDeleteTagGroup,
  useSaveTagGroup,
  type AdminTagGroup,
} from '@/lib/admin';
import { EditorForm } from '@/components/editor/EditorForm/EditorForm';
import { TranslationsEditor } from '../TranslationsEditor/TranslationsEditor';

type Props = {
  /** Omit to create a new Tag Group; it goes last. */
  group?: AdminTagGroup;
  onDone: () => void;
};

/** Create, rename, translate or delete (when empty) a Tag Group; its place in the order is set in the list. */
export function TagGroupEditor({ group, onDone }: Props) {
  const { t, i18n } = useTranslation('admin');
  const save = useSaveTagGroup(group?.id);
  const remove = useDeleteTagGroup();
  const [name, setName] = useState(group?.name ?? '');

  return (
    <EditorForm
      after={
        <>
          {group ? (
            <TranslationsEditor
              entityType="tag_group"
              entityId={group.id}
              name={group.name}
              translations={group.translations}
              synonyms={false}
            />
          ) : null}
        </>
      }
      heading={
        group
          ? t('tagGroup.edit', { name: localName(group, i18n.language) })
          : t('tagGroup.new')
      }
      error={save.error ?? remove.error}
      canSave={name.trim() !== ''}
      saving={save.isPending}
      onSubmit={() => save.mutate({ name: name.trim() }, { onSuccess: onDone })}
      onCancel={onDone}
      onDelete={
        group ? () => remove.mutate(group.id, { onSuccess: onDone }) : undefined
      }
      deleting={remove.isPending}
    >
      <TextField
        label={t('tagGroup.name')}
        value={name}
        onChange={(event) => setName(event.target.value)}
        required
      />
    </EditorForm>
  );
}

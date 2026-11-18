import { TextField } from '@pocket-pantry/ui';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  localName,
  useDeleteCatalogTag,
  useSaveCatalogTag,
  type AdminCatalogTag,
  type AdminTagGroup,
} from '@/lib/admin';
import { ConfirmPrompt } from '@/components/confirm/ConfirmAction/ConfirmAction';
import { EditorForm } from '@/components/editor/EditorForm/EditorForm';
import { ApiError } from '@/lib/api';
import { MAX_TAG_NAME_LENGTH } from '@/lib/tags';
import { TranslationsEditor } from '../TranslationsEditor/TranslationsEditor';

type Props = {
  /** Omit to create a new Catalog Tag. */
  tag?: AdminCatalogTag;
  groups: AdminTagGroup[];
  onDone: () => void;
};

/** The expected refusal of an unconfirmed delete of a Tag Recipes carry. */
function isInUse(error: unknown): error is ApiError {
  return error instanceof ApiError && error.code === 'catalog.tag_in_use';
}

/**
 * Create, rename, move, translate or delete a Catalog Tag. Deleting always asks once: an unused Tag gets a plain confirm, and
 * one Recipes carry (by the server's count) says how many will lose it. A same-named Family Tag is folded into it by the server, silently.
 */
export function CatalogTagEditor({ tag, groups, onDone }: Props) {
  const { t, i18n } = useTranslation('admin');
  const save = useSaveCatalogTag(tag?.id);
  const remove = useDeleteCatalogTag();
  const [name, setName] = useState(tag?.name ?? '');
  const [groupId, setGroupId] = useState(tag?.groupId ?? groups[0]?.id ?? '');
  // Which delete prompt is open: 'unused' (the overview says no Recipe carries the Tag), or the server's count of
  // Recipes carrying it once it has refused an unconfirmed delete.
  const [asking, setAsking] = useState<'unused' | number | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);

  useEffect(() => {
    if (asking === null && restoreFocus.current) {
      restoreFocus.current = false;
      triggerRef.current?.focus();
    }
  }, [asking]);

  const deleteTag = (confirm: boolean) => {
    if (!tag) return;
    remove.mutate(
      { id: tag.id, confirm },
      {
        onSuccess: onDone,
        onError: (error) => {
          if (isInUse(error)) {
            setAsking(Number(error.params.count ?? tag.recipeCount));
          }
        },
      },
    );
  };

  const onDeleteRequest = !tag
    ? undefined
    : () => {
        if (remove.isPending || asking !== null) return;
        if (tag.recipeCount > 0) deleteTag(false);
        else setAsking('unused');
      };
  const deletePrompt =
    tag && asking !== null ? (
      <ConfirmPrompt
        message={
          asking === 'unused'
            ? t('tag.deleteConfirmUnused')
            : t('tag.deleteConfirm', { count: asking })
        }
        disabled={remove.isPending}
        onConfirm={() => deleteTag(asking !== 'unused')}
        onCancel={() => {
          restoreFocus.current = true;
          setAsking(null);
        }}
      />
    ) : undefined;

  return (
    <EditorForm
      after={
        <>
          {tag ? (
            <TranslationsEditor
              entityType="tag"
              entityId={tag.id}
              name={tag.name}
              translations={tag.translations}
              synonyms={false}
            />
          ) : null}
        </>
      }
      heading={
        tag
          ? t('tag.edit', { name: localName(tag, i18n.language) })
          : t('tag.new')
      }
      error={save.error ?? (isInUse(remove.error) ? null : remove.error)}
      canSave={name.trim() !== '' && groupId !== ''}
      saving={save.isPending}
      onSubmit={() =>
        save.mutate({ name: name.trim(), groupId }, { onSuccess: onDone })
      }
      onCancel={onDone}
      onDeleteRequest={onDeleteRequest}
      deletePrompt={deletePrompt}
      deleteTriggerRef={triggerRef}
    >
      <TextField
        label={t('tag.name')}
        value={name}
        onChange={(event) => setName(event.target.value)}
        slotProps={{ htmlInput: { maxLength: MAX_TAG_NAME_LENGTH } }}
        required
      />
      <TextField
        select
        label={t('tag.group')}
        value={groupId}
        onChange={(event) => setGroupId(event.target.value)}
        slotProps={{ select: { native: true } }}
      >
        {groups.map((group) => (
          <option key={group.id} value={group.id}>
            {localName(group, i18n.language)}
          </option>
        ))}
      </TextField>
    </EditorForm>
  );
}

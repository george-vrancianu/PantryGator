import { TextField } from '@pocket-pantry/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  localName,
  useDeleteCategory,
  useSaveCategory,
  type AdminCatalog,
  type AdminLeafCategory,
  type AdminParentCategory,
  type CategoryKind,
} from '@/lib/admin';
import { LOCATIONS, type StorageLocation } from '@/lib/catalog';
import { EditorForm } from '@/components/editor/EditorForm/EditorForm';
import { TranslationsEditor } from '../TranslationsEditor/TranslationsEditor';

type Props = {
  kind: CategoryKind;
  /** Omit to create a new Category. */
  category?: AdminParentCategory | AdminLeafCategory;
  catalog: AdminCatalog;
  onDone: () => void;
};

const MAX_EXPIRY_DAYS = 3650;

/** The seeded top-level Other Parent (the API's seedId.parent('other')): the server refuses to delete it. */
const OTHER_PARENT_ID = '06aa911a-270a-58da-9f4c-b4438a117a41';

/** Blank means "inherit" (null); anything else must be a whole number of days. */
function parseExpiry(text: string): number | null | 'invalid' {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const days = Number(trimmed);
  return Number.isInteger(days) && days >= 0 && days <= MAX_EXPIRY_DAYS
    ? days
    : 'invalid';
}

/** Create or edit a Parent Category (carries the Aisle) or a Leaf Category. */
export function CategoryEditor({ kind, category, catalog, onDone }: Props) {
  const { t, i18n } = useTranslation(['admin', 'errors']);
  const save = useSaveCategory(kind, category?.id);
  const remove = useDeleteCategory(kind);
  const [name, setName] = useState(category?.name ?? '');
  const initialOwner =
    category === undefined
      ? undefined
      : 'aisleId' in category
        ? category.aisleId
        : category.parentId;
  const owners = kind === 'parent' ? catalog.aisles : catalog.parentCategories;
  const [ownerId, setOwnerId] = useState(initialOwner ?? owners[0]?.id ?? '');
  const [expiry, setExpiry] = useState(
    category?.defaultExpiryDays?.toString() ?? '',
  );
  const [location, setLocation] = useState<StorageLocation | ''>(
    category?.defaultLocation ?? '',
  );
  const isOther =
    category !== undefined && 'isOther' in category && category.isOther;
  const expiryDays = parseExpiry(expiry);
  const expiryInvalid = expiryDays === 'invalid';

  const heading = category
    ? t(
        kind === 'parent'
          ? 'admin:category.editParent'
          : 'admin:category.editLeaf',
        {
          name: localName(category, i18n.language),
        },
      )
    : t(
        kind === 'parent'
          ? 'admin:category.newParent'
          : 'admin:category.newLeaf',
      );

  return (
    <EditorForm
      after={
        <>
          {category ? (
            <TranslationsEditor
              entityType={
                kind === 'parent' ? 'parent_category' : 'leaf_category'
              }
              entityId={category.id}
              name={category.name}
              translations={category.translations}
            />
          ) : null}
        </>
      }
      heading={heading}
      error={save.error ?? remove.error}
      canSave={name.trim() !== '' && !expiryInvalid}
      saving={save.isPending}
      onSubmit={() => {
        if (expiryDays === 'invalid') return;
        save.mutate(
          {
            name: name.trim(),
            ...(kind === 'parent'
              ? { aisleId: ownerId }
              : { parentId: ownerId }),
            defaultExpiryDays: expiryDays,
            defaultLocation: location === '' ? null : location,
          },
          { onSuccess: onDone },
        );
      }}
      onCancel={onDone}
      onDelete={
        category && !isOther && category.id !== OTHER_PARENT_ID
          ? () => remove.mutate(category.id, { onSuccess: onDone })
          : undefined
      }
      deleting={remove.isPending}
    >
      <TextField
        label={t('admin:category.name')}
        value={name}
        onChange={(event) => setName(event.target.value)}
        required
      />
      <TextField
        select
        label={
          kind === 'parent'
            ? t('admin:category.aisle')
            : t('admin:category.parent')
        }
        value={ownerId}
        onChange={(event) => setOwnerId(event.target.value)}
        disabled={isOther}
        helperText={isOther ? t('admin:category.otherLeafNote') : undefined}
        slotProps={{ select: { native: true } }}
      >
        {owners.map((owner) => (
          <option key={owner.id} value={owner.id}>
            {localName(owner, i18n.language)}
          </option>
        ))}
      </TextField>
      <TextField
        label={t('admin:category.defaultExpiryDays')}
        type="number"
        value={expiry}
        onChange={(event) => setExpiry(event.target.value)}
        error={expiryInvalid}
        helperText={
          expiryInvalid
            ? t('admin:category.expiryInvalid', { max: MAX_EXPIRY_DAYS })
            : undefined
        }
        slotProps={{ htmlInput: { min: 0, max: MAX_EXPIRY_DAYS } }}
      />
      <TextField
        select
        label={t('admin:category.defaultLocation')}
        value={location}
        onChange={(event) =>
          setLocation(event.target.value as StorageLocation | '')
        }
        slotProps={{ select: { native: true } }}
      >
        <option value="">{t('admin:locations.none')}</option>
        {LOCATIONS.map((value) => (
          <option key={value} value={value}>
            {t(`common:locations.${value}`)}
          </option>
        ))}
      </TextField>
    </EditorForm>
  );
}

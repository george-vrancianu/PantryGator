import { LayersIcon } from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';
import { localName, useReorderAisles, type AdminAisle } from '@/lib/admin';
import { ReorderList } from '../ReorderList/ReorderList';

type Props = {
  /** In shop order. */
  aisles: AdminAisle[];
  onCreate: () => void;
  onEdit: (id: string) => void;
};

/**
 * The Aisles in shop order (the order the Shopping List is grouped in), numbered, with
 * Move up / Move down buttons so the order can be changed from the keyboard.
 */
export function AisleList({ aisles, onCreate, onEdit }: Props) {
  const { t, i18n } = useTranslation('admin');
  const reorder = useReorderAisles();
  return (
    <ReorderList
      items={aisles.map((aisle) => ({
        id: aisle.id,
        name: localName(aisle, i18n.language),
        aisleId: aisle.id,
      }))}
      icon={LayersIcon}
      reorder={reorder}
      onCreate={onCreate}
      onEdit={onEdit}
      labels={{
        title: t('aisle.title'),
        hint: t('aisle.hint'),
        newLabel: t('aisle.new'),
        edit: (name) => t('aisle.edit', { name }),
        moveUp: (name) => t('aisle.moveUp', { name }),
        moveDown: (name) => t('aisle.moveDown', { name }),
        moved: (name, position, total) =>
          t('aisle.moved', { name, position, total }),
      }}
    />
  );
}

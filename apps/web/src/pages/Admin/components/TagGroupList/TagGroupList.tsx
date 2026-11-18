import { TagIcon } from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';
import {
  localName,
  useReorderTagGroups,
  type AdminTagGroup,
} from '@/lib/admin';
import { ReorderList } from '../ReorderList/ReorderList';

type Props = {
  /** In display order. */
  groups: AdminTagGroup[];
  onCreate: () => void;
  onEdit: (id: string) => void;
};

/** The Tag Groups in display order, numbered, with Move up / Move down buttons so the order can be changed from the keyboard. */
export function TagGroupList({ groups, onCreate, onEdit }: Props) {
  const { t, i18n } = useTranslation('admin');
  const reorder = useReorderTagGroups();
  return (
    <ReorderList
      items={groups.map((group) => ({
        id: group.id,
        name: localName(group, i18n.language),
      }))}
      icon={TagIcon}
      reorder={reorder}
      onCreate={onCreate}
      onEdit={onEdit}
      labels={{
        title: t('tagGroup.title'),
        hint: t('tagGroup.hint'),
        newLabel: t('tagGroup.new'),
        empty: t('tagGroup.empty'),
        edit: (name) => t('tagGroup.edit', { name }),
        moveUp: (name) => t('tagGroup.moveUp', { name }),
        moveDown: (name) => t('tagGroup.moveDown', { name }),
        moved: (name, position, total) =>
          t('tagGroup.moved', { name, position, total }),
      }}
    />
  );
}

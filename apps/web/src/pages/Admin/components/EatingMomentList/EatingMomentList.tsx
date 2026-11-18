import { ClockIcon } from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';
import {
  localName,
  useReorderEatingMoments,
  type AdminEatingMoment,
} from '@/lib/admin';
import { ReorderList } from '../ReorderList/ReorderList';

type Props = {
  /** In display order, archived ones included. */
  moments: AdminEatingMoment[];
  onCreate: () => void;
  onEdit: (id: string) => void;
};

/**
 * The Eating Moments in display order, numbered, archived ones included and marked, with
 * Move up / Move down buttons so the order can be changed from the keyboard.
 */
export function EatingMomentList({ moments, onCreate, onEdit }: Props) {
  const { t, i18n } = useTranslation('admin');
  const reorder = useReorderEatingMoments();
  return (
    <ReorderList
      items={moments.map((moment) => ({
        id: moment.id,
        name: localName(moment, i18n.language),
        badge: moment.archived ? t('eatingMoment.archivedBadge') : undefined,
      }))}
      icon={ClockIcon}
      reorder={reorder}
      onCreate={onCreate}
      onEdit={onEdit}
      labels={{
        title: t('eatingMoment.title'),
        hint: t('eatingMoment.hint'),
        newLabel: t('eatingMoment.new'),
        empty: t('eatingMoment.empty'),
        edit: (name) => t('eatingMoment.edit', { name }),
        moveUp: (name) => t('eatingMoment.moveUp', { name }),
        moveDown: (name) => t('eatingMoment.moveDown', { name }),
        moved: (name, position, total) =>
          t('eatingMoment.moved', { name, position, total }),
      }}
    />
  );
}

import { CheckIcon, ShoppingIcon, Tag } from '@pocket-pantry/ui';
import type { TFunction } from 'i18next';
import type { WindowSlot } from '@/lib/mealPlan';
import { statusLabel } from './mealPlanText';

/** A slot's forecast status as a Tag: the Widget's marks, reused by the Meal Plan page. */
export const statusMark = (
  slot: Pick<WindowSlot, 'status' | 'issues'>,
  t: TFunction<'dashboard'>,
) => {
  const label = statusLabel(t, slot);
  switch (slot.status) {
    case 'covered':
      return (
        <Tag tone="accent" icon={<CheckIcon size={12} strokeWidth={3} />}>
          {label}
        </Tag>
      );
    case 'onList':
      return (
        <Tag tone="soon" icon={<ShoppingIcon size={12} strokeWidth={2.4} />}>
          {label}
        </Tag>
      );
    case 'short':
      return <Tag tone="urgent">{label}</Tag>;
    case 'unavailable':
      return <Tag tone="neutral">{label}</Tag>;
  }
};

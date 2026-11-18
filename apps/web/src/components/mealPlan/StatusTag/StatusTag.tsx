import { CheckIcon, ShoppingIcon, Tag } from '@pocket-pantry/ui';
import type { ReactNode } from 'react';
import type { SlotStatus } from '@/lib/mealPlan';
import { slotStatusTone } from '@/lib/statusTone';

/** The icon a status carries by default: Covered a check, On list a trolley, the others none. */
const defaultIcon = (status: SlotStatus): ReactNode => {
  switch (status) {
    case 'covered':
      return <CheckIcon size={12} strokeWidth={3} />;
    case 'onList':
      return <ShoppingIcon size={12} strokeWidth={2.4} />;
    case 'short':
    case 'unavailable':
      return undefined;
  }
};

/** A Meal Plan forecast status as a Tag: tone and icon come from the one status mapping. */
export function StatusTag({
  status,
  icon,
  children,
}: {
  status: SlotStatus;
  /** Replaces the status's own icon. */
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Tag tone={slotStatusTone[status]} icon={icon ?? defaultIcon(status)}>
      {children}
    </Tag>
  );
}

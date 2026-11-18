import { CheckIcon, ShoppingIcon, Tag } from '@pocket-pantry/ui';
import type { ReactNode } from 'react';
import type { SlotStatus } from '@/lib/mealPlan';
import { slotStatusTone } from '@/lib/statusTone';

/** The icon each status carries by default, a check for Covered and a trolley for On list. */
const statusIcon: Partial<Record<SlotStatus, ReactNode>> = {
  covered: <CheckIcon size={12} strokeWidth={3} />,
  onList: <ShoppingIcon size={12} strokeWidth={2.4} />,
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
    <Tag tone={slotStatusTone[status]} icon={icon ?? statusIcon[status]}>
      {children}
    </Tag>
  );
}

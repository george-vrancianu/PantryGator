import { CheckIcon, ShoppingIcon, Tag, type TagTone } from '@pocket-pantry/ui';
import type { ReactNode } from 'react';
import type { SlotStatus } from '@/lib/mealPlan';
import { slotStatusTone } from '@/lib/statusTone';

/** One row per status: its tone (from the one status mapping) and the icon it carries by default, a check for Covered and a trolley for On list. */
const statusLook: Record<SlotStatus, { tone: TagTone; icon: ReactNode }> = {
  covered: {
    tone: slotStatusTone.covered,
    icon: <CheckIcon size={12} strokeWidth={3} />,
  },
  onList: {
    tone: slotStatusTone.onList,
    icon: <ShoppingIcon size={12} strokeWidth={2.4} />,
  },
  short: { tone: slotStatusTone.short, icon: undefined },
  unavailable: { tone: slotStatusTone.unavailable, icon: undefined },
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
    <Tag tone={statusLook[status].tone} icon={icon ?? statusLook[status].icon}>
      {children}
    </Tag>
  );
}

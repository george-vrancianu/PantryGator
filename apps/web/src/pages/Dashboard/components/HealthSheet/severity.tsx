import {
  BatteryLowIcon,
  CalendarIcon,
  CookIcon,
  DeleteIcon,
  palette,
  StarIcon,
} from '@pocket-pantry/ui';
import type { ReactNode } from 'react';
import type { HealthTodoKey } from '@/lib/health';

/** Severity icon and colour pair of each Health To-do; colour is never the only signal. */
export const SEVERITY: Record<
  HealthTodoKey,
  { icon: ReactNode; background: string; color: string }
> = {
  expired: {
    icon: <DeleteIcon size={16} strokeWidth={2.2} />,
    background: palette('error-light'),
    color: palette('error-main'),
  },
  missingStaples: {
    icon: <StarIcon size={16} strokeWidth={2.2} />,
    background: palette('error-light'),
    color: palette('error-main'),
  },
  expiringSoon: {
    icon: <CookIcon size={16} strokeWidth={2.2} />,
    background: palette('warning-light'),
    color: palette('warning-main'),
  },
  runningLow: {
    icon: <BatteryLowIcon size={16} strokeWidth={2.2} />,
    background: palette('secondary-main'),
    color: palette('secondary-contrastText'),
  },
  undated: {
    icon: <CalendarIcon size={16} strokeWidth={2.2} />,
    background: palette('pp-chip'),
    color: palette('text-primary'),
  },
};

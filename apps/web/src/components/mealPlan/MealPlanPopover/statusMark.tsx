import type { TFunction } from 'i18next';
import { StatusTag } from '@/components/mealPlan/StatusTag/StatusTag';
import type { WindowSlot } from '@/lib/mealPlan';
import { statusLabel } from './mealPlanText';

/** A slot's forecast status as a Tag: the Widget's marks, reused by the Meal Plan page. */
export const statusMark = (
  slot: Pick<WindowSlot, 'status' | 'issues'>,
  t: TFunction<'mealPlans'>,
) => <StatusTag status={slot.status}>{statusLabel(t, slot)}</StatusTag>;

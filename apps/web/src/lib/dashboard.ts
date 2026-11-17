import { useQuery } from '@tanstack/react-query';
import { apiRequest } from './api';
import type { Batch } from './pantry';
import type { ShoppingList } from './shopping';

export type WidgetType =
  | 'use-soon'
  | 'shopping'
  | 'pantry-stock'
  | 'suggestions'
  | 'cook-tonight'
  | 'meal-plan'
  | 'budget'
  | 'nutrition';
/** `tall` is two rows high on the four-column grid (900 px and up) and behaves as `wide` below it. */
export type WidgetSize = 'small' | 'wide' | 'tall';

/** One Widget on a Member's Dashboard. The same type may appear more than once. */
export type WidgetInstance = { id: string; type: WidgetType; size: WidgetSize };
export type DashboardLayout = { widgets: WidgetInstance[] };

export const DASHBOARD_LAYOUT_KEY = ['dashboard-layout'] as const;

/** The signed-in Member's own layout (a default one until they customise it). */
export function useDashboardLayout() {
  return useQuery({
    queryKey: DASHBOARD_LAYOUT_KEY,
    queryFn: () => apiRequest<DashboardLayout>('/dashboard-layout'),
  });
}

/** The three soonest-expiring Batches (already expired ones first); Batches without an expiry never qualify. */
export function soonestExpiring(batches: Batch[]): Batch[] {
  return batches
    .filter((batch) => batch.expiryDate !== null)
    .sort((a, b) =>
      (a.expiryDate as string).localeCompare(b.expiryDate as string),
    )
    .slice(0, 3);
}

/** Names of the first unchecked Shopping Items, in Aisle order, and whether more remain. */
export function firstUncheckedNames(list: ShoppingList) {
  const names = list.groups
    .flatMap((group) => group.items)
    .filter((item) => !item.checked)
    .map((item) => item.name);
  return { names: names.slice(0, 3), hasMore: names.length > 3 };
}

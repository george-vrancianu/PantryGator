import type { TFunction } from 'i18next';
import type { HealthTodo } from '@/lib/health';

/** The weekday the Expiring Soon window ends on: today plus the Stale Threshold. */
export function expiringSoonDay(
  today: Date,
  staleThresholdDays: number,
  locale: string,
): string {
  const end = new Date(today);
  end.setDate(end.getDate() + staleThresholdDays);
  return new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(end);
}

/** "Toss 2 expired", "Use 3 by Sun". `day` is only read by Expiring Soon. */
export function todoTitle(
  t: TFunction<'dashboard'>,
  todo: Pick<HealthTodo, 'key' | 'itemIds'>,
  day: string,
): string {
  return t(`health.todo.${todo.key}.title`, {
    count: todo.itemIds.length,
    day,
  });
}

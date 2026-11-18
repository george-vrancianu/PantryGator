import type { TFunction } from 'i18next';
import { formatRowAmount } from '@/lib/amount';
import { ageDays, partitionForgotten, type HealthTodo } from '@/lib/health';
import {
  fullDate,
  daysUntil,
  localIso,
  type Batch,
  type IsoDate,
} from '@/lib/pantry';
import type { Staple } from '@/lib/staples';

/** One Batch or Ingredient of an open Health To-do, ready to draw. */
export type TodoItem = {
  id: string;
  name: string;
  ingredientId: string | null;
  aisleId: string | null;
  /** The muted detail line: amount, Location and so on. */
  line: string;
  /** Set for Expiring Soon items, which carry the days-left Tag. */
  expiryDate: IsoDate | null;
  forgotten: boolean;
};

type Context = {
  t: TFunction<'dashboard'>;
  locale: string;
  today: Date;
  batches: Batch[];
  staples: Staple[];
};

const DOT = ' · ';

/** Duration in the largest whole unit that fits: "22 days", "7 months", "2 years". */
function duration(days: number, locale: string): string {
  const [value, unit] =
    days >= 365
      ? [Math.floor(days / 365), 'year']
      : days >= 60
        ? [Math.floor(days / 30), 'month']
        : [days, 'day'];
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit,
    unitDisplay: 'long',
  }).format(value);
}

/** "Wed" for the last week, a date beyond it. */
function sinceDay(expiryDate: IsoDate, today: Date, locale: string): string {
  const daysAgo = -daysUntil(expiryDate, today);
  if (daysAgo > 6) return fullDate(expiryDate, today, locale);
  const [y, m, d] = expiryDate.split('-').map(Number);
  return new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(
    new Date(y, m - 1, d),
  );
}

/** Aisle order, then name; Batches and Ingredients without an Aisle last. */
function byAisle<T extends { aisle: Batch['aisle']; name: string }>(
  a: T,
  b: T,
): number {
  return (
    (a.aisle?.sortOrder ?? Infinity) - (b.aisle?.sortOrder ?? Infinity) ||
    a.name.localeCompare(b.name)
  );
}

/**
 * The items of a Health To-do in display order. Expired, Expiring Soon and the Forgotten Batches keep the
 * order the scoring module gave; the rest (undated Batches, Staples, Running low) go in Aisle order.
 */
export function todoItems(
  todo: Pick<HealthTodo, 'key' | 'itemIds'>,
  { t, locale, today, batches, staples }: Context,
): TodoItem[] {
  const todayIso = localIso(today);
  const batchById = new Map(batches.map((batch) => [batch.id, batch]));
  const amountOf = (batch: Batch) => formatRowAmount(batch, locale, t);
  const where = (batch: Batch) =>
    t(`common:locations.${batch.location}`).toLocaleLowerCase(locale);
  const fromBatch = (batch: Batch, line: string[]): TodoItem => ({
    id: batch.id,
    name: batch.name,
    ingredientId: batch.ingredientId,
    aisleId: batch.aisle?.id ?? null,
    line: line.join(DOT),
    expiryDate: null,
    forgotten: false,
  });
  const present = (parts: Array<string | null>) =>
    parts.filter((part): part is string => part !== null);
  const toBatches = () => todo.itemIds.flatMap((id) => batchById.get(id) ?? []);

  switch (todo.key) {
    case 'expired':
      return toBatches().map((batch) =>
        fromBatch(
          batch,
          present([
            amountOf(batch),
            where(batch),
            t('health.line.since', {
              day: sinceDay(batch.expiryDate as IsoDate, today, locale),
            }),
          ]),
        ),
      );
    case 'expiringSoon':
      return toBatches().map((batch) => ({
        ...fromBatch(batch, present([amountOf(batch), where(batch)])),
        expiryDate: batch.expiryDate,
      }));
    case 'undated': {
      const { forgotten, rest } = partitionForgotten(toBatches(), todayIso);
      rest.sort(byAisle);
      return [
        ...forgotten.map((batch) => ({
          ...fromBatch(batch, [
            t('health.line.inLocation', {
              duration: duration(ageDays(batch, todayIso), locale),
              location: where(batch),
            }),
          ]),
          forgotten: true,
        })),
        ...rest.map((batch) =>
          fromBatch(
            batch,
            present([
              amountOf(batch),
              where(batch),
              t('health.line.age', { count: ageDays(batch, todayIso) }),
            ]),
          ),
        ),
      ];
    }
    case 'missingStaples': {
      const ids = new Set(todo.itemIds);
      return staples
        .filter((staple) => ids.has(staple.ingredientId))
        .sort(byAisle)
        .map((staple) => {
          const usual = formatRowAmount(staple, locale, t);
          return {
            id: staple.ingredientId,
            name: staple.name,
            ingredientId: staple.ingredientId,
            aisleId: staple.aisle?.id ?? null,
            line: present([
              t('health.line.staple'),
              usual === null ? null : t('health.line.usual', { amount: usual }),
              t('health.line.noneLeft'),
            ]).join(DOT),
            expiryDate: null,
            forgotten: false,
          };
        });
    }
    case 'runningLow':
      return todo.itemIds
        .flatMap((ingredientId) => {
          const stocked = batches.find(
            (batch) =>
              batch.ingredientId === ingredientId &&
              (batch.expiryDate === null ||
                daysUntil(batch.expiryDate, today) >= 0),
          );
          return stocked ? [stocked] : [];
        })
        .sort(byAisle)
        .map((batch) => ({
          ...fromBatch(batch, present([amountOf(batch), where(batch)])),
          id: batch.ingredientId as string,
        }));
  }
}

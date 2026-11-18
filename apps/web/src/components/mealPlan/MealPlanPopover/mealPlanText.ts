import type { TFunction } from 'i18next';
import { formatAmount } from '@/lib/amount';
import type { Unit } from '@/lib/catalog';
import {
  type BaseUnit,
  type PlanIssue,
  type ReasonMeal,
  type SlotStatus,
  type WindowDay,
  unlistedShortCount,
} from '@/lib/mealPlan';
import { dateLocale, fromIso, type IsoDate } from '@/lib/pantry';

type T = TFunction<'mealPlans'>;

const format = (
  language: string,
  iso: IsoDate,
  options: Intl.DateTimeFormatOptions,
) =>
  new Intl.DateTimeFormat(dateLocale(language), options).format(fromIso(iso));

/** "Saturday 17 October". */
export const fullDate = (language: string, iso: IsoDate) =>
  format(language, iso, { weekday: 'long', day: 'numeric', month: 'long' });

export const shortWeekday = (language: string, iso: IsoDate) =>
  format(language, iso, { weekday: 'short' });

export const longWeekday = (language: string, iso: IsoDate) =>
  format(language, iso, { weekday: 'long' });

/** "Fri 16 Oct". */
export const dayLabel = (language: string, iso: IsoDate) =>
  format(language, iso, { weekday: 'short', day: 'numeric', month: 'short' });

/** A slot's forecast status in words: "Covered", "On list", "2 short", "No longer available". */
export const statusLabel = (
  t: T,
  slot: { status: SlotStatus; issues: PlanIssue[] },
): string =>
  slot.status === 'short'
    ? t('forecast.status.short', {
        count: Math.max(1, unlistedShortCount(slot)),
      })
    : t(`forecast.status.${slot.status}`);

const dayNumber = (iso: IsoDate) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
};

/** "Today", "Tomorrow", then the short weekday. */
export function relativeDay(
  t: T,
  language: string,
  iso: IsoDate,
  today: IsoDate,
): string {
  const offset = dayNumber(iso) - dayNumber(today);
  if (offset === 0) return t('forecast.today');
  if (offset === 1) return t('forecast.tomorrow');
  return shortWeekday(language, iso);
}

/** "Today", "Tomorrow", then the long weekday: the popover's title. */
export function dayTitle(
  t: T,
  language: string,
  iso: IsoDate,
  today: IsoDate,
): string {
  const offset = dayNumber(iso) - dayNumber(today);
  if (offset === 0) return t('forecast.today');
  if (offset === 1) return t('forecast.tomorrow');
  return longWeekday(language, iso);
}

/** An amount in g, ml or pcs as the Pantry words it: kg and l from 1000. */
export function baseAmount(
  t: T,
  language: string,
  quantity: number,
  unit: BaseUnit | null,
): string {
  const shown = readableAmount(quantity, unit);
  return shown.unit
    ? formatAmount(shown.quantity, shown.unit, language, t as TFunction)
    : new Intl.NumberFormat(language).format(shown.quantity);
}

/** A base amount as it reads best: 1500 g as 1.5 kg, 2000 ml as 2 l, anything else as it is. */
export function readableAmount(
  quantity: number,
  unit: BaseUnit | null,
): { quantity: number; unit: Unit | null } {
  if (unit === 'g' && quantity >= 1000)
    return { quantity: Math.round(quantity) / 1000, unit: 'kg' };
  if (unit === 'ml' && quantity >= 1000)
    return { quantity: Math.round(quantity) / 1000, unit: 'l' };
  return { quantity, unit: unit as Unit | null };
}

/**
 * The amount part of an issue line: "need 600 g" for a missing Ingredient, "short 1.5 kg" for a
 * short one (amounts normalised to kg / l), "amount unknown" for an uncertain one, null with no quantity.
 */
export function issueDetail(
  t: T,
  language: string,
  issue: PlanIssue,
): string | null {
  if (issue.kind === 'uncertain') return t('forecast.line.unknown');
  if (issue.quantity === null) return null;
  return t(
    issue.kind === 'missing' ? 'forecast.line.need' : 'forecast.line.short',
    { amount: baseAmount(t, language, issue.quantity, issue.unit) },
  );
}

/** The accessible name of a day column: "Saturday 17 October: 2 meals, short". */
export function columnName(t: T, language: string, day: WindowDay): string {
  const unavailable = day.slots.filter((slot) => slot.unavailable).length;
  let summary: string;
  if (day.slots.length === 0) {
    summary = t('forecast.aria.nothing');
  } else if (day.status === 'unavailable') {
    summary = t('forecast.aria.allUnavailable', { count: day.slots.length });
  } else {
    summary = t('forecast.aria.meals', {
      count: day.slots.length - unavailable,
      status: t(`forecast.aria.status.${day.status as 'covered'}`),
    });
    if (unavailable > 0) {
      summary += `, ${t('forecast.aria.alsoUnavailable', { count: unavailable })}`;
    }
  }
  return t('forecast.aria.column', {
    date: fullDate(language, day.date),
    summary,
  });
}

/** Who the earlier meals were: one by Recipe, two by Mealtime, more as a count. */
function mealsText(
  t: T,
  language: string,
  meals: ReasonMeal[],
  today: IsoDate,
): string {
  const mealOf = (name: string, meal: ReasonMeal) =>
    t('forecast.reason.mealOf', {
      day: relativeDay(t, language, meal.date, today),
      name,
    });
  if (meals.length === 1) return mealOf(meals[0].recipeTitle, meals[0]);
  if (meals.length === 2) {
    return t('forecast.reason.and', {
      first: mealOf(
        t(`forecast.slot.${meals[0].mealtime}`).toLocaleLowerCase(language),
        meals[0],
      ),
      second: mealOf(
        t(`forecast.slot.${meals[1].mealtime}`).toLocaleLowerCase(language),
        meals[1],
      ),
    });
  }
  return t('forecast.reason.earlierMeals', { count: meals.length });
}

/** The line under a short ingredient saying why; null when there is nothing to say. */
export function reasonText(
  t: T,
  language: string,
  issue: PlanIssue,
  today: IsoDate,
): string | null {
  const { reason } = issue;
  switch (reason.code) {
    case 'usesLast':
      return t(
        reason.meals.length === 1
          ? 'forecast.reason.usesLast'
          : 'forecast.reason.useLast',
        { who: mealsText(t, language, reason.meals, today) },
      );
    case 'expires':
      return t('forecast.reason.expires', {
        day: relativeDay(t, language, reason.date, today),
      });
    case 'notInPantry':
      return t('forecast.reason.notInPantry');
    case 'onlyLeftAfter':
      return t('forecast.reason.onlyLeftAfter', {
        amount: baseAmount(t, language, reason.amount, reason.unit),
        who: mealsText(t, language, reason.meals, today),
      });
    case 'onlyInPantry':
      return t('forecast.reason.onlyInPantry', {
        amount: baseAmount(t, language, reason.amount, reason.unit),
      });
    case 'noQuantity':
      return null;
  }
}

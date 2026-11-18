import { useQuery } from '@tanstack/react-query';
import type { CompactAllergyWarning } from './recipes';
import { apiRequest } from './api';
import { fromIso, localDate, localIso, type IsoDate } from './pantry';
import { normalizeName } from './normalizeName';
import { mealPlanQueryKey } from './queryKeys';

export type Mealtime = 'breakfast' | 'lunch' | 'dinner';
/** Breakfast, Lunch, Dinner: the order of the bars and of a day's meals. */
export const MEALTIMES: readonly Mealtime[] = ['breakfast', 'lunch', 'dinner'];

export type SlotStatus = 'covered' | 'onList' | 'short' | 'unavailable';
export type DayStatus = SlotStatus | 'empty';
export type BaseUnit = 'g' | 'ml' | 'pcs';

/** Mirrors of the API's `MealWindowView` and the types it is built from (apps/api/src/meal-plans). */
export type ReasonMeal = {
  date: IsoDate;
  mealtime: Mealtime;
  recipeId: string;
  recipeTitle: string;
};

export type PlanReason =
  | { code: 'usesLast'; meals: ReasonMeal[] }
  | { code: 'expires'; date: IsoDate }
  | { code: 'notInPantry' }
  | {
      code: 'onlyLeftAfter';
      amount: number;
      unit: BaseUnit;
      meals: ReasonMeal[];
    }
  | { code: 'onlyInPantry'; amount: number; unit: BaseUnit }
  | { code: 'noQuantity' };

export type PlanIssue = {
  ingredientId: string | null;
  name: string;
  /** `short`: some was taken. `missing`: none. `uncertain`: no Batch quantity to judge by. */
  kind: 'short' | 'missing' | 'uncertain';
  quantity: number | null;
  unit: BaseUnit | null;
  onList: boolean;
  reason: PlanReason;
};

export type WindowSlot = {
  dayIndex: number;
  date: IsoDate;
  mealtime: Mealtime;
  planId: string;
  recipeId: string;
  recipeTitle: string;
  servings: number;
  servingsOverride: number | null;
  unavailable: boolean;
  /** The Allergy Warning for the reader, naming whose Allergy it is; never hides the slot. */
  allergyWarning: CompactAllergyWarning | null;
  minutes: number | null;
  aisle: { id: string; name: string; sortOrder: number } | null;
  status: SlotStatus;
  issues: PlanIssue[];
};

export type WindowDay = {
  date: IsoDate;
  status: DayStatus;
  /** The plan covering this date; null for a day outside every plan. */
  planId: string | null;
  slots: WindowSlot[];
};

export type PlanTag =
  | { kind: 'short'; count: number }
  | { kind: 'coveredOnceYouShop' }
  | { kind: 'allCovered' }
  | { kind: 'none' };

export type MealPlanSummary = {
  id: string;
  name: string | null;
  startDate: IsoDate;
  days: number;
  servings: number;
};

export const addDaysIso = (iso: IsoDate, days: number): IsoDate => {
  const date = fromIso(iso);
  return localIso(
    localDate(date.getFullYear(), date.getMonth(), date.getDate() + days),
  );
};

/** The last day of a plan. */
export const planEnd = (plan: Pick<MealPlanSummary, 'startDate' | 'days'>) =>
  addDaysIso(plan.startDate, plan.days - 1);

export type MealWindow = {
  today: IsoDate;
  /** Planned days only, today to the last day with a Plan Slot; gap days are `empty`. */
  days: WindowDay[];
  tag: PlanTag;
  plan: MealPlanSummary | null;
  /** When the first plan starting beyond the window begins. */
  nextPlanStart: IsoDate | null;
  /** The id of that plan, for linking to it. */
  nextPlanId: string | null;
  /** What Add missing for the window would put on the Shopping List: one entry per Ingredient not on it yet. */
  missing: MissingItem[];
};

/** Mirror of the API's `MissingItemView`. */
export type MissingItem = {
  ingredientId: string | null;
  name: string;
  quantity: number | null;
  unit: BaseUnit | null;
  recipeIds: string[];
};

/** What Add missing covers; the server works out the amounts itself, so none is ever sent. */
export type AddMissingScope =
  | { scope: 'window' }
  | { scope: 'plan'; planId: string }
  | { scope: 'date'; date: IsoDate }
  | { scope: 'ingredient'; ingredientId: string; planId?: string }
  | { scope: 'ingredient'; name: string; planId?: string };

/** Mirror of the API's `AddedMissingView`: the Shopping Items created (Undo deletes them) and how many Ingredients were added. */
export type AddedMissing = { createdIds: string[]; count: number };

/** Identifies an Ingredient across issues: its id, or the normalised name of an Unmatched one (as the server's forecast does). */
export const ingredientKey = (
  issue: Pick<PlanIssue, 'ingredientId' | 'name'>,
): string => issue.ingredientId ?? `name:${normalizeName(issue.name)}`;

/** Issues Add missing would put on the list: not uncertain, not on it already. */
const isAddable = (issue: PlanIssue) =>
  issue.kind !== 'uncertain' && !issue.onList;

/** The Ingredients of a day that Add missing for that day would add. */
export function dayMissing(day: {
  slots: Pick<WindowSlot, 'status' | 'issues'>[];
}): PlanIssue[] {
  const byKey = new Map<string, PlanIssue>();
  for (const slot of day.slots) {
    if (slot.status === 'unavailable') continue;
    for (const issue of slot.issues) {
      if (isAddable(issue) && !byKey.has(ingredientKey(issue))) {
        byKey.set(ingredientKey(issue), issue);
      }
    }
  }
  return [...byKey.values()];
}

const WORST_FIRST: SlotStatus[] = ['short', 'onList', 'covered'];

/**
 * The window as it will read once the scope is on the Shopping List: the issues the scope
 * adds turn "On list" (a day's Add also covers the earlier days needing the same Ingredients,
 * but not later days), so short slots become on list and the missing list loses them. It flips
 * the issues the server's Add covers, by presence only; the refetch that follows corrects the amounts.
 */
export function flipOnList(view: MealWindow, add: AddMissingScope): MealWindow {
  const onTheDate = new Set(
    add.scope === 'date'
      ? view.days
          .filter((day) => day.date === add.date)
          .flatMap(dayMissing)
          .map(ingredientKey)
      : [],
  );
  const matches = (day: WindowDay, issue: PlanIssue): boolean => {
    if (!isAddable(issue)) return false;
    if (add.scope === 'window') return true;
    // A day's Add covers that day and the earlier days needing the same Ingredients.
    if (add.scope === 'date') {
      return day.date <= add.date && onTheDate.has(ingredientKey(issue));
    }
    // The Widget never sends a plan scope; it covers the same days as the window it shows.
    if (add.scope === 'plan') return day.planId === add.planId;
    // An Ingredient scope with a plan covers that plan's days only.
    if (add.planId && day.planId !== add.planId) return false;
    return 'ingredientId' in add
      ? issue.ingredientId === add.ingredientId
      : issue.ingredientId === null &&
          ingredientKey(issue) ===
            ingredientKey({ ingredientId: null, name: add.name });
  };
  const days = view.days.map((day): WindowDay => {
    const slots = day.slots.map((slot): WindowSlot => {
      if (slot.status === 'unavailable') return slot;
      const issues = slot.issues.map((issue) =>
        matches(day, issue) ? { ...issue, onList: true } : issue,
      );
      const short = issues.some(isAddable);
      return {
        ...slot,
        issues,
        status: short
          ? 'short'
          : issues.some((issue) => issue.kind !== 'uncertain' && issue.onList)
            ? 'onList'
            : slot.status,
      };
    });
    const status =
      day.slots.length === 0
        ? day.status
        : (WORST_FIRST.find((s) => slots.some((sl) => sl.status === s)) ??
          'unavailable');
    return { ...day, slots, status };
  });
  // Only the issues the scope adds turn "On list"; an Ingredient needed on a day it
  // does not cover stays on the missing list.
  const stillShort = new Set(
    days
      .flatMap((day) => day.slots)
      .filter((slot) => slot.status !== 'unavailable')
      .flatMap((slot) => slot.issues.filter(isAddable).map(ingredientKey)),
  );
  const counted = days
    .flatMap((day) => day.slots)
    .filter((slot) => slot.status !== 'unavailable');
  const short = counted.filter((slot) => slot.status === 'short').length;
  const tag: PlanTag =
    counted.length === 0
      ? { kind: 'none' }
      : short > 0
        ? { kind: 'short', count: short }
        : counted.some((slot) => slot.status === 'onList')
          ? { kind: 'coveredOnceYouShop' }
          : { kind: 'allCovered' };
  return {
    ...view,
    days,
    tag,
    missing: view.missing.filter((item) => stillShort.has(ingredientKey(item))),
  };
}

export const mealWindowQueryKey = [...mealPlanQueryKey, 'window'] as const;

/** The Plan Forecast for the next 7 days from the Member's `today` (local date). */
export function useMealWindow(today: IsoDate) {
  return useQuery({
    queryKey: [...mealWindowQueryKey, today],
    queryFn: () =>
      apiRequest<MealWindow>(
        `/meal-plans/window?${new URLSearchParams({ today })}`,
      ),
  });
}

/** The bar of one Mealtime in a day column: its slot's status, or `empty` with nothing planned there. */
export type BarStatus = SlotStatus | 'empty';

/** Three bars, Breakfast then Lunch then Dinner. */
export function barStatuses(day: WindowDay): BarStatus[] {
  return MEALTIMES.map(
    (mealtime) =>
      day.slots.find((slot) => slot.mealtime === mealtime)?.status ?? 'empty',
  );
}

/** What the 16 pt mark of a day column shows; `count` is the number of short meals. */
export type DayMark = { kind: DayStatus; count: number };

export function dayMark(day: WindowDay): DayMark {
  const count = day.slots.filter((slot) => slot.status === 'short').length;
  // A day of only unavailable Recipes has nothing to judge, like an empty one.
  return {
    kind: day.status === 'unavailable' ? 'empty' : day.status,
    count,
  };
}

/** The Recipe shown under the bars of a narrow window: Dinner, else the last planned meal. */
export function dayHeadline(day: WindowDay): WindowSlot | undefined {
  return (
    day.slots.find((slot) => slot.mealtime === 'dinner') ??
    day.slots[day.slots.length - 1]
  );
}

/** A day's slots in Mealtime order. */
export function slotsInOrder(day: WindowDay): WindowSlot[] {
  return [...day.slots].sort(
    (a, b) => MEALTIMES.indexOf(a.mealtime) - MEALTIMES.indexOf(b.mealtime),
  );
}

/** How many short ingredients a slot lists that are not on the Shopping List yet. */
export function unlistedShortCount(slot: Pick<WindowSlot, 'issues'>): number {
  return slot.issues.filter(
    (issue) => issue.kind !== 'uncertain' && !issue.onList,
  ).length;
}

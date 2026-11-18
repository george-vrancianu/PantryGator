import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { ApiError, apiRequest } from './api';
import type { CompactAllergyWarning } from './recipes';
import {
  MEALTIMES,
  ingredientKey,
  dayMissing,
  type DayStatus,
  addDaysIso,
  planEnd,
  type MealPlanSummary,
  type Mealtime,
  type PlanIssue,
  type PlanTag,
  type SlotStatus,
} from './mealPlan';
import { dateLocale, fromIso, type IsoDate } from './pantry';
import { mealPlanQueryKey } from './queryKeys';
import { translateApiError } from '../i18n/translateApiError';

/** Keep in step with MAX_PLAN_DAYS, MAX_START_AHEAD_DAYS and MAX_NAME_LENGTH in apps/api/src/meal-plans/meal-plans.schemas.ts. */
export const MAX_PLAN_DAYS = 7;
export const MAX_START_AHEAD_DAYS = 14;
export const MAX_NAME_LENGTH = 60;

/** Mirror of the API's `PlanSlotView`; `status` and `issues` are empty on a past day. */
export type PlanSlot = {
  dayIndex: number;
  date: IsoDate;
  mealtime: Mealtime;
  recipeId: string;
  recipeTitle: string;
  servings: number;
  servingsOverride: number | null;
  unavailable: boolean;
  /** The Allergy Warning for the reader, naming whose Allergy it is; never hides the slot. */
  allergyWarning: CompactAllergyWarning | null;
  status: SlotStatus | null;
  issues: PlanIssue[];
};

/** Mirror of the API's `MealPlanView`. */
export type MealPlanDetail = MealPlanSummary & {
  slots: PlanSlot[];
  forecast: { tag: PlanTag; days: { date: IsoDate; status: DayStatus }[] };
};

export type PlanInput = {
  name?: string | null;
  startDate?: IsoDate;
  days?: number;
  servings?: number;
};

export type SlotKey = { dayIndex: number; mealtime: Mealtime };

export type PlanPhase = 'past' | 'current' | 'upcoming';

export function planPhase(
  plan: Pick<MealPlanSummary, 'startDate' | 'days'>,
  today: IsoDate,
): PlanPhase {
  if (planEnd(plan) < today) return 'past';
  return plan.startDate > today ? 'upcoming' : 'current';
}

/** "20–26 Oct", or "20 Oct" for a one-day plan. */
export function dateRange(
  plan: Pick<MealPlanSummary, 'startDate' | 'days'>,
  language: string,
): string {
  const format = new Intl.DateTimeFormat(dateLocale(language), {
    day: 'numeric',
    month: 'short',
  });
  const start = fromIso(plan.startDate);
  if (plan.days === 1) return format.format(start);
  return format.formatRange(start, fromIso(planEnd(plan)));
}

/** The plan's name, else its dates. */
export const planTitle = (
  plan: Pick<MealPlanSummary, 'name' | 'startDate' | 'days'>,
  language: string,
): string => plan.name || dateRange(plan, language);

/** The words for a Meal Plan error; an overlap names the other plan. */
export function planErrorMessage(
  t: TFunction,
  language: string,
  error: unknown,
): string {
  if (error instanceof ApiError && error.code === 'meal_plan.overlap') {
    const other = error.params as Partial<MealPlanSummary>;
    const dates =
      other.startDate && other.days
        ? dateRange({ startDate: other.startDate, days: other.days }, language)
        : '';
    // An unnamed plan is titled by its dates, so naming it as well would say them twice.
    return other.name
      ? t('errors:meal_plan.overlap', { other: other.name, dates })
      : t('errors:meal_plan.overlapUnnamed', { dates });
  }
  return translateApiError(t, error);
}

const plansKey = [...mealPlanQueryKey, 'list'] as const;
const planKey = (id: string, today: IsoDate) =>
  [...mealPlanQueryKey, 'plan', id, today] as const;

export function useMealPlans() {
  return useQuery({
    queryKey: plansKey,
    queryFn: () =>
      apiRequest<{ mealPlans: MealPlanSummary[] }>('/meal-plans').then(
        (body) => body.mealPlans,
      ),
  });
}

const query = (today: IsoDate) => `?${new URLSearchParams({ today })}`;

export function useMealPlan(id: string, today: IsoDate) {
  return useQuery({
    queryKey: planKey(id, today),
    queryFn: () =>
      apiRequest<MealPlanDetail>(`/meal-plans/${id}${query(today)}`),
  });
}

/** Every Meal Plan write; each refreshes the plans, the open plan and the Widget. */
export function useMealPlanMutations(today: IsoDate) {
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: mealPlanQueryKey });
  const q = query(today);
  const options = { onSettled: refresh };
  return {
    create: useMutation({
      mutationFn: (input: PlanInput) =>
        apiRequest<MealPlanDetail>(`/meal-plans${q}`, {
          method: 'POST',
          body: input,
        }),
      ...options,
    }),
    update: useMutation({
      mutationFn: ({ id, ...input }: PlanInput & { id: string }) =>
        apiRequest<MealPlanDetail>(`/meal-plans/${id}${q}`, {
          method: 'PATCH',
          body: input,
        }),
      ...options,
    }),
    remove: useMutation({
      mutationFn: (id: string) =>
        apiRequest<void>(`/meal-plans/${id}`, { method: 'DELETE' }),
      ...options,
    }),
    setSlot: useMutation({
      mutationFn: ({
        id,
        dayIndex,
        mealtime,
        ...body
      }: SlotKey & { id: string; recipeId: string; servings?: number }) =>
        apiRequest<MealPlanDetail>(
          `/meal-plans/${id}/slots/${dayIndex}/${mealtime}${q}`,
          { method: 'PUT', body },
        ),
      ...options,
    }),
    clearSlot: useMutation({
      mutationFn: ({ id, dayIndex, mealtime }: SlotKey & { id: string }) =>
        apiRequest<void>(
          `/meal-plans/${id}/slots/${dayIndex}/${mealtime}${q}`,
          { method: 'DELETE' },
        ),
      ...options,
    }),
    fill: useMutation({
      mutationFn: ({
        id,
        onlyWhatIHave,
      }: {
        id: string;
        onlyWhatIHave: boolean;
      }) =>
        apiRequest<MealPlanDetail>(`/meal-plans/${id}/fill${q}`, {
          method: 'POST',
          body: { onlyWhatIHave },
        }),
      ...options,
    }),
  };
}

export type PlanDay = {
  dayIndex: number;
  date: IsoDate;
  past: boolean;
  /** The day's slots in Mealtime order, by Mealtime. */
  slots: Partial<Record<Mealtime, PlanSlot>>;
};

/** Every day of the plan with its slots, empty days included. */
export function planDays(plan: MealPlanDetail, today: IsoDate): PlanDay[] {
  return Array.from({ length: plan.days }, (_, dayIndex) => {
    const date = addDaysIso(plan.startDate, dayIndex);
    const slots: PlanDay['slots'] = {};
    for (const slot of plan.slots) {
      if (slot.dayIndex === dayIndex) slots[slot.mealtime] = slot;
    }
    return { dayIndex, date, past: date < today, slots };
  });
}

/** The Ingredients Add missing would add for a day (or the whole plan): not uncertain, not on the list yet. */
export function missingFor(days: PlanDay[]): PlanIssue[] {
  const seen = new Map<string, PlanIssue>();
  for (const day of days) {
    const slots = MEALTIMES.flatMap((mealtime) => {
      const slot = day.slots[mealtime];
      return slot?.status ? [{ ...slot, status: slot.status }] : [];
    });
    for (const issue of dayMissing({ slots })) {
      seen.set(ingredientKey(issue), issue);
    }
  }
  return [...seen.values()];
}

/** The first day with a short slot and how many slots are short, for "3 slots short from Thu". */
export function shortSummary(
  days: PlanDay[],
): { count: number; from: IsoDate } | null {
  let count = 0;
  let from: IsoDate | null = null;
  for (const day of days) {
    for (const slot of Object.values(day.slots)) {
      if (slot.status === 'short') {
        count += 1;
        from ??= day.date;
      }
    }
  }
  return from ? { count, from } : null;
}

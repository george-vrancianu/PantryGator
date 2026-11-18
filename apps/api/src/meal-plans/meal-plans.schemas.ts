import { z } from 'zod';
import { type CompactAllergyWarning } from '../recipes/recipes.schemas';
import type { AisleView } from '../catalog/ingredient-placement';
import { mealtime } from '../database/schema';
import type {
  BaseUnit,
  DayStatus,
  IssueKind,
  Mealtime,
  PlanTag,
  SlotStatus,
} from '../recipes/matching/plan-forecast';

export const MAX_PLAN_DAYS = 7;
/** How many days from today the Widget looks at. */
export const WINDOW_DAYS = 7;
export const MAX_SERVINGS = 1000;
export const MAX_NAME_LENGTH = 60;
/** How far ahead of the Member's today a plan may start. */
export const MAX_START_AHEAD_DAYS = 14;

/** `today` is the Member's local date; it defaults to the server's UTC date. */
export const mealPlanQuery = z.object({
  today: z.iso.date().optional(),
});
export type MealPlanQuery = z.infer<typeof mealPlanQuery>;

/**
 * How far a client's `today` may be from the server's UTC date on a write. Time
 * zones span UTC-12 to UTC+14, so a real local date is always within a day of it.
 */
export const MAX_TODAY_SKEW_DAYS = 1;

const name = z.string().trim().max(MAX_NAME_LENGTH);
const startDate = z.iso.date();
const days = z.number().int().min(1).max(MAX_PLAN_DAYS);
const servings = z.number().int().min(1).max(MAX_SERVINGS);

/** An empty name is no name. */
export const nameOrNull = (value: string | null | undefined) =>
  value ? value : null;

/** `servings` defaults to the number of Members in the Family. */
export const createMealPlanBody = z.object({
  name: name.nullable().optional(),
  startDate,
  days,
  servings: servings.optional(),
});
export type CreateMealPlanBody = z.infer<typeof createMealPlanBody>;

export const updateMealPlanBody = z
  .object({
    name: name.nullable().optional(),
    startDate: startDate.optional(),
    days: days.optional(),
    servings: servings.optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: 'Provide at least one field',
  });
export type UpdateMealPlanBody = z.infer<typeof updateMealPlanBody>;

export const mealPlanIdParam = z.object({ id: z.uuid() });

export const slotParams = z.object({
  id: z.uuid(),
  dayIndex: z.coerce
    .number()
    .int()
    .min(0)
    .max(MAX_PLAN_DAYS - 1),
  mealtime: z.enum(mealtime.enumValues),
});
export type SlotParams = z.infer<typeof slotParams>;

/** `servings` overrides the plan's for this slot; leave it out to follow the plan. */
export const setSlotBody = z.object({
  recipeId: z.uuid(),
  servings: servings.optional(),
});
export type SetSlotBody = z.infer<typeof setSlotBody>;

/** `onlyWhatIHave` limits Fill to Recipes the Pantry can still cover. */
export const fillBody = z.object({ onlyWhatIHave: z.boolean() });
export type FillBody = z.infer<typeof fillBody>;

/**
 * What Add missing covers: the Widget's window, one plan, one date, or one
 * Ingredient, optionally within one plan (a Catalog `ingredientId`, or the `name` of an Unmatched one).
 * The client never sends amounts; the server works the forecast out again.
 */
export const addMissingBody = z.discriminatedUnion('scope', [
  z.object({ scope: z.literal('window') }),
  z.object({ scope: z.literal('plan'), planId: z.uuid() }),
  z.object({ scope: z.literal('date'), date: z.iso.date() }),
  z
    .object({
      scope: z.literal('ingredient'),
      /** Limits the Ingredient to this plan's days (from today on). */
      planId: z.uuid().optional(),
      ingredientId: z.uuid().nullable().optional(),
      name: z.string().trim().min(1).max(100).optional(),
    })
    .refine((body) => !body.ingredientId !== !body.name, {
      message: 'Provide either ingredientId or name',
      path: ['ingredientId'],
    }),
]);
export type AddMissingBody = z.infer<typeof addMissingBody>;

/** `createdIds` are the Shopping Items newly created (Undo deletes them); `count` is how many Ingredients were added, merged ones included. */
export type AddedMissingView = { createdIds: string[]; count: number };

export type MealPlanSummary = {
  id: string;
  name: string | null;
  startDate: string;
  days: number;
  servings: number;
};

/** A slot that used up stock the reader's slot also needs. */
export type ReasonMealView = {
  date: string;
  mealtime: Mealtime;
  recipeId: string;
  recipeTitle: string;
};

/** Why a line is short, as codes and params; the client words it. */
export type PlanReasonView =
  | { code: 'usesLast'; meals: ReasonMealView[] }
  | { code: 'expires'; date: string }
  | { code: 'notInPantry' }
  | {
      code: 'onlyLeftAfter';
      amount: number;
      unit: BaseUnit;
      meals: ReasonMealView[];
    }
  | { code: 'onlyInPantry'; amount: number; unit: BaseUnit }
  | { code: 'noQuantity' };

/** One Ingredient (or Unmatched name) a Plan Slot is short of, or can't judge. */
export type PlanIssueView = {
  /** Null for an Unmatched line. */
  ingredientId: string | null;
  /** The Ingredient's name in the request locale, or the Unmatched name as typed. */
  name: string;
  /** `short`: some was taken. `missing`: none. `uncertain`: no Batch quantity to judge by. */
  kind: IssueKind;
  /** The amount needed in g, ml or pcs; null when the line has no quantity. */
  quantity: number | null;
  unit: BaseUnit | null;
  /** Already on the active Shopping List. */
  onList: boolean;
  reason: PlanReasonView;
};

export type PlanSlotView = {
  dayIndex: number;
  /** The plan's start date plus `dayIndex`. */
  date: string;
  mealtime: Mealtime;
  recipeId: string;
  recipeTitle: string;
  /** What the slot cooks for: its own override, else the plan's. */
  servings: number;
  /** The slot's own Servings; null follows the plan. */
  servingsOverride: number | null;
  /** The Recipe has been archived since. */
  unavailable: boolean;
  /**
   * The Allergy Warning for the reading Member, naming whose Allergy it is (ADR 0014). Never
   * hides the slot; null when nothing they must avoid is, or might be, in the Recipe.
   */
  allergyWarning: CompactAllergyWarning | null;
  /** The Plan Forecast; null on a past day. */
  status: SlotStatus | null;
  /** Empty on a past day and on an unavailable slot. */
  issues: PlanIssueView[];
};

export type MealPlanView = MealPlanSummary & {
  slots: PlanSlotView[];
  forecast: {
    tag: PlanTag;
    /** Each day of the plan from the Member's today; empty days included. */
    days: { date: string; status: DayStatus }[];
  };
};

/**
 * What one Fill did: the slots it filled, and the slots it left empty only because the Family's
 * Allergies ruled out the Recipes that would have gone there.
 */
export type FillResult = { filled: number; emptyForAllergies: number };

/** The Meal Plan after Fill, with what Fill did. */
export type FilledMealPlanView = MealPlanView & { fill: FillResult };

/** One Ingredient (or Unmatched name) the forecast says is missing, ready for Add missing. */
export type MissingItemView = {
  ingredientId: string | null;
  /** The Ingredient's name in the request locale, or the Unmatched name as typed. */
  name: string;
  /** Shortfalls added up in g, ml or pcs; null when any has no quantity or they mix dimensions (g with pcs). */
  quantity: number | null;
  unit: BaseUnit | null;
  /** The Recipes that need it: its Source Recipes. */
  recipeIds: string[];
};

export type WindowSlotView = Omit<PlanSlotView, 'status'> & {
  planId: string;
  /** Prep plus cook minutes; null when the Recipe has neither. */
  minutes: number | null;
  /** The Aisle of the Recipe's first Ingredient Line, which tints its tile. */
  aisle: AisleView | null;
  status: SlotStatus;
};

export type WindowDayView = {
  date: string;
  status: DayStatus;
  /** The Meal Plan covering this date, if any (a gap day inside a plan has one). */
  planId: string | null;
  slots: WindowSlotView[];
};

/** The Widget's read: the Plan Forecast from `today` for up to `WINDOW_DAYS` days. */
export type MealWindowView = {
  today: string;
  /** Planned days only: today to the last date with a slot, gap days `empty`. */
  days: WindowDayView[];
  tag: PlanTag;
  /** The plan covering today, else the next one; null with no plan ahead. */
  plan: MealPlanSummary | null;
  /** When the first plan starting beyond the window begins. */
  nextPlanStart: string | null;
  /** The id of that plan, for linking to it. */
  nextPlanId: string | null;
  /** What Add missing would add for the whole window. */
  missing: MissingItemView[];
};

import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, asc, count, desc, eq, gte, isNull, ne } from 'drizzle-orm';
import type { CatalogLocale } from '../catalog/catalog.schemas';
import { ApiException } from '../common/api-exception';
import { addDays } from '../common/dates';
import type { AppConfig } from '../config/env';
import { DATABASE } from '../database/database.constants';
import type { Database, Executor } from '../database/database.types';
import { mealPlanSlots, mealPlans, recipes, user } from '../database/schema';
import { lockMemberAndFamily, runLocked } from '../family/family-locks';
import {
  fillPlan,
  randomTieBreaker,
  slotsEmptiedByAllergies,
} from '../recipes/matching/plan-fill';
import {
  dayStatus,
  isAddable,
  keyOf,
  planTag,
  type BaseUnit,
  type SlotStatus,
} from '../recipes/matching/plan-forecast';
import { recipeTitles, visibleTo } from '../recipes/recipe-view';
import { ShoppingService } from '../shopping/shopping.service';
import { normalizeName } from '../catalog/normalize';
import { SettingsService } from '../settings/settings.service';
import { utcToday } from '../shopping/batch-presence';
import { loadSlotWarnings } from './plan-allergies';
import { loadFill } from './plan-fill.loader';
import {
  forecastFieldsOf,
  loadForecast,
  planEnd,
  slotKey,
} from './plan-forecast.loader';
import {
  MAX_SERVINGS,
  WINDOW_DAYS,
  MAX_START_AHEAD_DAYS,
  nameOrNull,
  type AddedMissingView,
  type AddMissingBody,
  type CreateMealPlanBody,
  type FillBody,
  type MealPlanSummary,
  type FilledMealPlanView,
  type MealPlanView,
  type MealWindowView,
  type PlanSlotView,
  type SetSlotBody,
  type SlotParams,
  type UpdateMealPlanBody,
} from './meal-plans.schemas';

type PlanRow = typeof mealPlans.$inferSelect;

const summary = (row: PlanRow): MealPlanSummary => ({
  id: row.id,
  name: row.name,
  startDate: row.startDate,
  days: row.days,
  servings: row.servings,
});

const notFound = () => new ApiException(404, 'meal_plan.not_found');

/**
 * Meal Plans are Family data: any Member reads and edits them, and another
 * Family's plan is a 404. Every write holds the Family lock, which serialises
 * the plan cap and the no-overlap rule.
 */
@Injectable()
export class MealPlansService {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    private readonly settings: SettingsService,
    private readonly shopping: ShoppingService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async list(memberId: string): Promise<{ mealPlans: MealPlanSummary[] }> {
    const familyId = await this.settings.familyIdOf(memberId);
    const rows = await this.database
      .select()
      .from(mealPlans)
      .where(eq(mealPlans.familyId, familyId))
      .orderBy(desc(mealPlans.startDate), asc(mealPlans.id));
    return { mealPlans: rows.map(summary) };
  }

  async get(
    memberId: string,
    id: string,
    locale: CatalogLocale,
    today = utcToday(),
  ): Promise<MealPlanView> {
    const familyId = await this.settings.familyIdOf(memberId);
    return this.view(this.database, memberId, familyId, id, locale, today);
  }

  /**
   * The Widget's read: the Plan Forecast from the Member's `today` for up to
   * `WINDOW_DAYS` days across plans. Planned days run to the last date that has
   * a slot, so gap days inside the window come back `empty`.
   */
  async window(
    memberId: string,
    locale: CatalogLocale,
    today = utcToday(),
  ): Promise<MealWindowView> {
    const familyId = await this.settings.familyIdOf(memberId);
    const through = addDays(today, WINDOW_DAYS - 1);
    const { plans, forecast, slots, missing } = await loadForecast(
      this.database,
      familyId,
      locale,
      today,
      through,
    );
    const warnings = await loadSlotWarnings(
      this.database,
      familyId,
      memberId,
      locale,
      [...slots.values()].map((slot) => slot.recipeId),
    );
    // The plan covering today, else the next one to start.
    const headline =
      plans.find((plan) => plan.startDate <= today && planEnd(plan) >= today) ??
      plans.find((plan) => plan.startDate > today);
    const beyond = plans.find((plan) => plan.startDate > through);
    return {
      today,
      days: forecast.days.map((day) => ({
        date: day.date,
        status: day.status,
        planId:
          plans.find(
            (plan) => plan.startDate <= day.date && planEnd(plan) >= day.date,
          )?.id ?? null,
        slots: day.slots.map((slot) => {
          const view = slots.get(slot.id);
          if (!view) {
            throw new Error(`Plan Slot ${slot.id} has no forecast view`);
          }
          return {
            ...view,
            allergyWarning: warnings.get(view.recipeId) ?? null,
          };
        }),
      })),
      tag: forecast.tag,
      plan: headline ? summary(headline) : null,
      nextPlanStart: beyond?.startDate ?? null,
      nextPlanId: beyond?.id ?? null,
      missing,
    };
  }

  /**
   * Add missing: works the Plan Forecast out again for the scope and adds the
   * shortfalls to the Shopping List, one item per Ingredient with its Source
   * Recipes. Ingredients already on the list, uncertain issues, Pantry Basics,
   * optional lines and unavailable slots are left out by the forecast itself.
   * A date adds what that day needs plus the earlier days' need for the same
   * Ingredients, since the list is used up in forecast order.
   */
  async addMissing(
    memberId: string,
    body: AddMissingBody,
    locale: CatalogLocale,
    today = utcToday(),
  ): Promise<AddedMissingView> {
    const familyId = await this.settings.familyIdOf(memberId);
    const { through, keepSlot, keepIssue } = await this.addScope(
      familyId,
      body,
      today,
    );
    const { forecast, missingOf } = await loadForecast(
      this.database,
      familyId,
      locale,
      today,
      through,
    );
    // A day's Add covers that day and the earlier days needing the same Ingredients.
    const onTheDate =
      body.scope === 'date'
        ? new Set(
            forecast.days
              .filter((day) => day.date === body.date)
              .flatMap((day) => day.slots)
              .filter((slot) => slot.status !== 'unavailable')
              .flatMap((slot) => slot.issues.filter(isAddable).map(keyOf)),
          )
        : null;
    const days = forecast.days.map((day) => ({
      ...day,
      slots: day.slots
        .filter((slot) => keepSlot(day.date, slot.id))
        .map((slot) => ({
          ...slot,
          issues: slot.issues.filter(
            (issue) =>
              keepIssue(issue) &&
              (onTheDate === null || onTheDate.has(keyOf(issue))),
          ),
        })),
    }));
    const entries = missingOf(days).map((item) => {
      const { quantity, unit } = readable(item.quantity, item.unit);
      return {
        item: {
          ...(item.ingredientId
            ? { ingredientId: item.ingredientId }
            : { name: item.name }),
          ...(quantity !== null && unit !== null && { quantity, unit }),
        },
        recipeIds: item.recipeIds,
      };
    });
    if (entries.length === 0) return { createdIds: [], count: 0 };
    const { insertedIds } = await this.shopping.addItemsWithSourceRecipes(
      memberId,
      entries,
      locale,
    );
    return { createdIds: insertedIds, count: entries.length };
  }

  /**
   * What an Add missing scope covers: the last date to forecast to, which slots
   * count and which issues count. The ingredient scope adds the window-wide
   * total for that Ingredient (not one day's amount), as the Widget's per-line +
   * deliberately does. With a `planId` it covers that plan's days from
   * today on instead (beyond the window).
   */
  private async addScope(
    familyId: string,
    body: AddMissingBody,
    today: string,
  ): Promise<{
    through: string;
    keepSlot: (date: string, slotId: string) => boolean;
    keepIssue: (issue: {
      ingredientId: string | null;
      name: string | null;
    }) => boolean;
  }> {
    const windowEnd = addDays(today, WINDOW_DAYS - 1);
    const everything = () => true;
    switch (body.scope) {
      case 'window':
        return {
          through: windowEnd,
          keepSlot: everything,
          keepIssue: everything,
        };
      case 'plan': {
        const plan = await this.findPlan(this.database, familyId, body.planId);
        return {
          through: planEnd(plan),
          keepSlot: (_date, slotId) => slotId.startsWith(`${plan.id}:`),
          keepIssue: everything,
        };
      }
      case 'date':
        return {
          through: body.date,
          keepSlot: (date) => date <= body.date,
          keepIssue: everything,
        };
      case 'ingredient': {
        const { ingredientId, name, planId } = body;
        const wanted = normalizeName(name ?? '');
        const plan = planId
          ? await this.findPlan(this.database, familyId, planId)
          : null;
        return {
          through: plan ? planEnd(plan) : windowEnd,
          keepSlot: plan
            ? (_date, slotId) => slotId.startsWith(`${plan.id}:`)
            : everything,
          keepIssue: (issue) =>
            ingredientId
              ? issue.ingredientId === ingredientId
              : issue.ingredientId === null &&
                normalizeName(issue.name ?? '') === wanted,
        };
      }
    }
  }

  async create(
    memberId: string,
    body: CreateMealPlanBody,
    locale: CatalogLocale,
    today = utcToday(),
  ): Promise<MealPlanView> {
    return runLocked(this.database, async (tx) => {
      const { familyId } = await lockMemberAndFamily(tx, memberId);
      const existing = await tx
        .select()
        .from(mealPlans)
        .where(eq(mealPlans.familyId, familyId));
      const cap = this.config.get('MEAL_PLAN_CAP', { infer: true });
      if (existing.length >= cap) {
        throw new ApiException(409, 'meal_plan.cap_reached', { cap });
      }
      assertStartDate(body.startDate, today);
      assertNoOverlap(existing, body.startDate, body.days);
      const [{ members }] = await tx
        .select({ members: count() })
        .from(user)
        .where(eq(user.familyId, familyId));
      const [row] = await tx
        .insert(mealPlans)
        .values({
          familyId,
          name: nameOrNull(body.name),
          startDate: body.startDate,
          days: body.days,
          servings:
            body.servings ?? Math.min(Math.max(members, 1), MAX_SERVINGS),
        })
        .returning();
      return this.view(tx, memberId, familyId, row.id, locale, today);
    });
  }

  async update(
    memberId: string,
    id: string,
    body: UpdateMealPlanBody,
    locale: CatalogLocale,
    today = utcToday(),
  ): Promise<MealPlanView> {
    return runLocked(this.database, async (tx) => {
      const { familyId } = await lockMemberAndFamily(tx, memberId);
      const plan = await this.findPlan(tx, familyId, id);
      const startDate = body.startDate ?? plan.startDate;
      const days = body.days ?? plan.days;

      const moved = startDate !== plan.startDate;
      if (moved) {
        // Moving would re-date past slots and make them editable again.
        if (plan.startDate < today) {
          throw new ApiException(400, 'meal_plan.already_started');
        }
        assertStartDate(startDate, today);
      }
      if (moved || days > plan.days) {
        const others = await tx
          .select()
          .from(mealPlans)
          .where(
            and(eq(mealPlans.familyId, familyId), ne(mealPlans.id, plan.id)),
          );
        assertNoOverlap(others, startDate, days);
      }
      if (days < plan.days) {
        const pastEnd = and(
          eq(mealPlanSlots.mealPlanId, plan.id),
          gte(mealPlanSlots.dayIndex, days),
        );
        const dropped = await tx
          .select({ dayIndex: mealPlanSlots.dayIndex })
          .from(mealPlanSlots)
          .where(pastEnd);
        // Past days are read-only, so their slots can't be dropped either.
        if (dropped.some((slot) => isPast(plan, slot.dayIndex, today))) {
          throw new ApiException(400, 'meal_plan.day_in_past');
        }
        await tx.delete(mealPlanSlots).where(pastEnd);
      }
      await tx
        .update(mealPlans)
        .set({
          ...(body.name !== undefined && { name: nameOrNull(body.name) }),
          startDate,
          days,
          ...(body.servings !== undefined && { servings: body.servings }),
        })
        .where(eq(mealPlans.id, plan.id));
      return this.view(tx, memberId, familyId, plan.id, locale, today);
    });
  }

  async remove(memberId: string, id: string): Promise<void> {
    await runLocked(this.database, async (tx) => {
      const { familyId } = await lockMemberAndFamily(tx, memberId);
      const plan = await this.findPlan(tx, familyId, id);
      await tx.delete(mealPlans).where(eq(mealPlans.id, plan.id));
    });
  }

  /** Puts a Recipe in a slot, replacing what was there. Omitting `servings` follows the plan. */
  async setSlot(
    memberId: string,
    { id, dayIndex, mealtime }: SlotParams,
    body: SetSlotBody,
    locale: CatalogLocale,
    today = utcToday(),
  ): Promise<MealPlanView> {
    return runLocked(this.database, async (tx) => {
      const { familyId } = await lockMemberAndFamily(tx, memberId);
      const plan = await this.findPlan(tx, familyId, id);
      assertEditableDay(plan, dayIndex, today);
      const [recipe] = await tx
        .select({ id: recipes.id, familyId: recipes.familyId })
        .from(recipes)
        .where(
          and(
            eq(recipes.id, body.recipeId),
            visibleTo(familyId),
            isNull(recipes.archivedAt),
          ),
        );
      if (!recipe) throw new ApiException(404, 'meal_plan.recipe_not_found');
      // Plans use Family Recipes only (ADR 0029): a Catalog Recipe is added to the Family first.
      if (recipe.familyId === null) {
        throw new ApiException(409, 'meal_plan.recipe_not_in_family');
      }
      const servings = body.servings ?? null;
      await tx
        .insert(mealPlanSlots)
        .values({
          mealPlanId: plan.id,
          dayIndex,
          mealtime,
          recipeId: recipe.id,
          servings,
        })
        .onConflictDoUpdate({
          target: [
            mealPlanSlots.mealPlanId,
            mealPlanSlots.dayIndex,
            mealPlanSlots.mealtime,
          ],
          set: { recipeId: recipe.id, servings },
        });
      return this.view(tx, memberId, familyId, plan.id, locale, today);
    });
  }

  /**
   * Fill: puts Recipes into the plan's empty slots on the Member's today or
   * later (ADR 0012). Slots that already hold a Recipe and past days are never
   * touched. Random among equally ranked Recipes, so pressing Fill again can
   * give different ones.
   */
  async fill(
    memberId: string,
    id: string,
    body: FillBody,
    locale: CatalogLocale,
    today = utcToday(),
  ): Promise<FilledMealPlanView> {
    return runLocked(this.database, async (tx) => {
      const { familyId } = await lockMemberAndFamily(tx, memberId);
      const plan = await this.findPlan(tx, familyId, id);
      const { emptySlots, ...loaded } = await loadFill(
        tx,
        familyId,
        plan,
        today,
        memberId,
      );
      const fillInput = {
        today,
        ...loaded,
        staleThresholdDays: await this.settings.staleThresholdOf(familyId),
        onlyWhatIHave: body.onlyWhatIHave,
      };
      const choices = fillPlan({ ...fillInput, tieBreaker: randomTieBreaker });
      // Slots a Recipe the Allergies block would have taken: filled when nothing is blocked,
      // not filled now. Only asked when some Recipe is blocked.
      const emptyForAllergies = loaded.recipes.some((r) => r.blocksFill)
        ? slotsEmptiedByAllergies(fillInput)
        : 0;
      const rows = choices.flatMap(({ slotId, recipeId }) => {
        const at = emptySlots.get(slotId);
        return at ? [{ mealPlanId: plan.id, ...at, recipeId }] : [];
      });
      // A slot filled in the meantime is the Member's: never replace it.
      if (rows.length > 0) {
        await tx.insert(mealPlanSlots).values(rows).onConflictDoNothing();
      }
      const view = await this.view(
        tx,
        memberId,
        familyId,
        plan.id,
        locale,
        today,
      );
      return {
        ...view,
        fill: { filled: rows.length, emptyForAllergies },
      };
    });
  }

  /** Empties a slot; clearing an empty one is fine. */
  async clearSlot(
    memberId: string,
    { id, dayIndex, mealtime }: SlotParams,
    today = utcToday(),
  ): Promise<void> {
    await runLocked(this.database, async (tx) => {
      const { familyId } = await lockMemberAndFamily(tx, memberId);
      const plan = await this.findPlan(tx, familyId, id);
      assertEditableDay(plan, dayIndex, today);
      await tx
        .delete(mealPlanSlots)
        .where(
          and(
            eq(mealPlanSlots.mealPlanId, plan.id),
            eq(mealPlanSlots.dayIndex, dayIndex),
            eq(mealPlanSlots.mealtime, mealtime),
          ),
        );
    });
  }

  private async findPlan(
    executor: Executor,
    familyId: string,
    id: string,
  ): Promise<PlanRow> {
    const [plan] = await executor
      .select()
      .from(mealPlans)
      .where(and(eq(mealPlans.id, id), eq(mealPlans.familyId, familyId)));
    if (!plan) throw notFound();
    return plan;
  }

  private async view(
    executor: Executor,
    memberId: string,
    familyId: string,
    id: string,
    locale: CatalogLocale,
    today: string,
  ): Promise<MealPlanView> {
    const plan = await this.findPlan(executor, familyId, id);
    const rows = await executor
      .select({ slot: mealPlanSlots, recipe: recipes })
      .from(mealPlanSlots)
      .innerJoin(recipes, eq(recipes.id, mealPlanSlots.recipeId))
      .where(eq(mealPlanSlots.mealPlanId, plan.id));
    const titles = await recipeTitles(
      executor,
      rows.map((row) => row.recipe),
      locale,
    );
    const { slots: forecasted } = await loadForecast(
      executor,
      familyId,
      locale,
      today,
      planEnd(plan),
    );
    const warnings = await loadSlotWarnings(
      executor,
      familyId,
      memberId,
      locale,
      rows.map((row) => row.recipe.id),
    );
    const order = { breakfast: 0, lunch: 1, dinner: 2 };
    const slots = rows
      .map(({ slot, recipe }): PlanSlotView => ({
        dayIndex: slot.dayIndex,
        date: addDays(plan.startDate, slot.dayIndex),
        mealtime: slot.mealtime,
        recipeId: recipe.id,
        recipeTitle: titles.get(recipe.id) ?? recipe.title,
        servings: slot.servings ?? plan.servings,
        servingsOverride: slot.servings,
        unavailable: recipe.archivedAt !== null,
        allergyWarning: warnings.get(recipe.id) ?? null,
        ...forecastFieldsOf(
          forecasted.get(slotKey(plan.id, slot.dayIndex, slot.mealtime)),
        ),
      }))
      .sort(
        (a, b) =>
          a.dayIndex - b.dayIndex || order[a.mealtime] - order[b.mealtime],
      );
    // Past days carry no status; the tag and day statuses cover today onwards.
    const upcoming = slots.filter(
      (slot): slot is PlanSlotView & { status: SlotStatus } =>
        slot.status !== null,
    );
    const days = [];
    for (let i = 0; i < plan.days; i++) {
      const date = addDays(plan.startDate, i);
      if (date < today) continue;
      days.push({
        date,
        status: dayStatus(upcoming.filter((slot) => slot.date === date)),
      });
    }
    return {
      ...summary(plan),
      slots,
      forecast: { tag: planTag(upcoming), days },
    };
  }
}

/** 1000 g or ml or more reads as kg or l; counts never convert. */
function readable(
  quantity: number | null,
  unit: BaseUnit | null,
): { quantity: number | null; unit: 'g' | 'kg' | 'ml' | 'l' | 'pcs' | null } {
  if (quantity === null || unit === null) return { quantity: null, unit: null };
  if (unit === 'g' && quantity >= 1000) {
    return { quantity: Math.round(quantity) / 1000, unit: 'kg' };
  }
  if (unit === 'ml' && quantity >= 1000) {
    return { quantity: Math.round(quantity) / 1000, unit: 'l' };
  }
  return { quantity, unit };
}

/** From the Member's today up to `MAX_START_AHEAD_DAYS` later. */
function assertStartDate(startDate: string, today: string): void {
  if (startDate < today) {
    throw new ApiException(400, 'meal_plan.start_date_in_past');
  }
  if (startDate > addDays(today, MAX_START_AHEAD_DAYS)) {
    throw new ApiException(400, 'meal_plan.start_date_too_far', {
      max: MAX_START_AHEAD_DAYS,
    });
  }
}

/** Plans that only touch at the edges (one ends Tuesday, the next starts Wednesday) don't overlap. */
function assertNoOverlap(
  others: PlanRow[],
  startDate: string,
  days: number,
): void {
  const end = addDays(startDate, days - 1);
  const clash = others.find(
    (other) => other.startDate <= end && startDate <= planEnd(other),
  );
  if (clash) {
    throw new ApiException(409, 'meal_plan.overlap', {
      id: clash.id,
      name: clash.name,
      startDate: clash.startDate,
      days: clash.days,
    });
  }
}

/** The day must be inside the plan and not before the Member's today. */
function assertEditableDay(
  plan: Pick<PlanRow, 'startDate' | 'days'>,
  dayIndex: number,
  today: string,
): void {
  if (dayIndex >= plan.days) {
    throw new ApiException(400, 'meal_plan.day_out_of_range', {
      days: plan.days,
    });
  }
  if (isPast(plan, dayIndex, today)) {
    throw new ApiException(400, 'meal_plan.day_in_past');
  }
}

/** A day is past once its date is before the Member's today. */
const isPast = (
  plan: Pick<PlanRow, 'startDate'>,
  dayIndex: number,
  today: string,
) => addDays(plan.startDate, dayIndex) < today;

import { seedId } from '../../catalog/seed/seed-ids';
import { addDays } from '../../common/dates';
import { isExpiringSoon, isUnexpired } from './batch-freshness';
import {
  compareRecipeMatches,
  matchRecipe,
  type MatchBatch,
  type MatchLine,
  type RecipeMatch,
} from './pantry-match';
import {
  compareSlotOrder,
  forecastPlan,
  stockLeft,
  type ForecastBatch,
  type ForecastListEntry,
  type ForecastRecipe,
  type ForecastSlot,
  type Mealtime,
} from './plan-forecast';

/**
 * Fill: picks Recipes for a Meal Plan's empty slots (ADR 0012). Pure, like
 * `plan-forecast.ts`: no database, no Nest. It reuses `forecastPlan` for what
 * the Pantry covers on each day and ADR 0007's order (`matchRecipe`,
 * `compareRecipeMatches`) for ranking, so neither is worked out twice.
 */

export type EatingMomentUse = {
  momentId: string;
  polarity: 'good_for' | 'avoid';
};

/** A Recipe Fill may place, or one a filled slot already uses. */
export type FillRecipe = ForecastRecipe & {
  id: string;
  /** The Base Recipe's id: a Base Recipe and its Variants share it. */
  groupId: string;
  moments: EatingMomentUse[];
  /**
   * Any Allergy of the Family (any Member's, or a Family Allergy) is in a required, checked
   * line, as `deriveAllergens` decides. Fill never places such a Recipe, whatever the hide
   * preference; a slot the Member filled with one is left alone.
   */
  blocksFill: boolean;
};

/** A Plan Slot of the plan, or an empty one (`recipeId` null). */
export type FillSlot = Omit<ForecastSlot, 'recipeId'> & {
  recipeId: string | null;
};

/** Picks one of the tied options: random in production, fixed in tests. */
export type TieBreaker = <T>(tied: readonly T[]) => T;

export const randomTieBreaker: TieBreaker = (tied) =>
  tied[Math.floor(Math.random() * tied.length)];

export type FillInput = {
  /** The Member's local date (YYYY-MM-DD). Empty slots before it are left alone. */
  today: string;
  /**
   * The plan's slots, filled and empty, plus the Family's other filled slots
   * that share its stock or its variety window (other plans, recent days).
   */
  slots: readonly FillSlot[];
  /** Every Recipe the Family can see, and any a filled slot uses; archived ones are never placed. */
  recipes: readonly FillRecipe[];
  /** The ids of the Eating Moments that exist, to find the ones Mealtimes map to. */
  eatingMomentIds: readonly string[];
  /** The Family's Batches that are unexpired on `today`. */
  batches: readonly ForecastBatch[];
  shoppingList: readonly ForecastListEntry[];
  /** The Family's stale threshold, for Expiring Soon in ranking. */
  staleThresholdDays: number;
  /** Place only Recipes the Pantry covers, and never break a slot that was covered. */
  onlyWhatIHave: boolean;
  tieBreaker: TieBreaker;
};

export type FillChoice = { slotId: string; recipeId: string };

/** The Eating Moments (by seed slug) each Mealtime prefers; Dinner has none. */
const PREFERRED_MOMENTS: Record<Mealtime, readonly string[]> = {
  breakfast: ['morning', 'brunch'],
  lunch: ['light-lunch'],
  dinner: [],
};

/** Days either side of a use in which its Base Recipe group may not repeat. */
const VARIETY_DAYS = 2;

type Option = { recipe: FillRecipe; preferred: boolean; match: RecipeMatch };

const compareOptions = (a: Option, b: Option) =>
  Number(b.preferred) - Number(a.preferred) ||
  compareRecipeMatches(a.match, b.match);

/**
 * Chooses a Recipe for each empty slot from today on, in forecast order, so
 * each choice uses up stock for the slots after it. Returns choices for empty
 * slots only; a slot nothing suits is left out.
 */
export function fillPlan(input: FillInput): FillChoice[] {
  const recipeById = new Map(input.recipes.map((r) => [r.id, r]));
  const forecastRecipes: Record<string, ForecastRecipe> = {};
  for (const { id, servings, archived, lines } of input.recipes) {
    forecastRecipes[id] = { servings, archived, lines };
  }
  const candidates = input.recipes
    .filter((recipe) => !recipe.archived && !recipe.blocksFill)
    .sort((a, b) => a.id.localeCompare(b.id));
  const groupOf = (recipeId: string) =>
    recipeById.get(recipeId)?.groupId ?? recipeId;
  const forecast = (slots: readonly ForecastSlot[]) =>
    forecastPlan({
      today: input.today,
      slots,
      recipes: forecastRecipes,
      batches: input.batches,
      shoppingList: input.shoppingList,
    });

  const ordered = [...input.slots].sort(compareSlotOrder);
  /** The Member's picks and the choices made so far. */
  const placed: ForecastSlot[] = [];
  for (const slot of ordered) {
    if (slot.recipeId !== null)
      placed.push({ ...slot, recipeId: slot.recipeId });
  }

  const choices: FillChoice[] = [];
  for (const slot of ordered) {
    if (slot.recipeId !== null || slot.date < input.today) continue;
    const recipe = choose(slot);
    if (!recipe) continue;
    choices.push({ slotId: slot.id, recipeId: recipe.id });
    placed.push({ ...slot, recipeId: recipe.id });
  }
  return choices;

  function choose(slot: FillSlot): FillRecipe | null {
    const nearbyDates = new Set(
      Array.from({ length: 2 * VARIETY_DAYS + 1 }, (_, i) =>
        addDays(slot.date, i - VARIETY_DAYS),
      ),
    );
    const recent = new Set(
      placed
        .filter((used) => nearbyDates.has(used.date))
        .map((used) => groupOf(used.recipeId)),
    );

    const mapped = PREFERRED_MOMENTS[slot.mealtime]
      .map((slug) => seedId.eatingMoment(slug))
      .filter((id) => input.eatingMomentIds.includes(id));
    const allowed = candidates.filter(
      (recipe) =>
        !recent.has(recipe.groupId) &&
        !recipe.moments.some(
          (use) => use.polarity === 'avoid' && mapped.includes(use.momentId),
        ),
    );
    if (allowed.length === 0) return null;

    const fits = input.onlyWhatIHave ? makeable(slot) : () => true;
    const stock = stockFor(slot);
    const options: Option[] = [];
    for (const recipe of allowed) {
      const match = matchRecipe({
        lines: recipe.lines.map((line, i): MatchLine => ({
          ...line,
          id: String(i),
        })),
        recipeServings: recipe.servings,
        requestedServings: slot.servings,
        stock,
      });
      // A Recipe the stock already can't cover can't pass the forecast either:
      // stockFor and the forecast agree on expiry, on the benefit of the doubt
      // for uncomparable Batches, and on skipping Pantry Basics and optional
      // lines, so a short match is never covered in the forecast.
      if (input.onlyWhatIHave && match.shortOrMissingCount > 0) continue;
      if (!fits(recipe)) continue;
      options.push({
        recipe,
        preferred: recipe.moments.some(
          (use) => use.polarity === 'good_for' && mapped.includes(use.momentId),
        ),
        match,
      });
    }
    if (options.length === 0) return null;

    const best = options.sort(compareOptions)[0];
    const tied = options.filter((o) => compareOptions(o, best) === 0);
    // Each Base Recipe group puts forward its best member: pick the group, then the member.
    const byGroup = new Map<string, Option[]>();
    for (const option of tied) {
      const members = byGroup.get(option.recipe.groupId) ?? [];
      members.push(option);
      byGroup.set(option.recipe.groupId, members);
    }
    const groups = [...byGroup.values()];
    const group = pick(groups);
    return pick(group).recipe;
  }

  function pick<T>(tied: readonly T[]): T {
    return tied.length === 1 ? tied[0] : input.tieBreaker(tied);
  }

  /** The Batches as they stand on the slot's day, after the slots before it. */
  function stockFor(slot: FillSlot): MatchBatch[] {
    const before = placed.filter((used) => compareSlotOrder(used, slot) < 0);
    return stockLeft({
      today: input.today,
      slots: before,
      recipes: forecastRecipes,
      batches: input.batches,
      shoppingList: input.shoppingList,
    })
      .filter((batch) => isUnexpired(batch.expiryDate, slot.date))
      .map((batch) => ({
        ingredientId: batch.ingredientId,
        name: batch.name,
        quantity: batch.quantity,
        unit: batch.unit,
        expiringSoon: isExpiringSoon(
          batch.expiryDate,
          slot.date,
          input.staleThresholdDays,
        ),
      }));
  }

  /**
   * "Only what I have": no short or missing required line for the slot, and no
   * slot that was covered stops being covered by taking this Recipe's ingredients.
   */
  function makeable(slot: FillSlot): (recipe: FillRecipe) => boolean {
    const baseline = new Map(
      forecast(placed).slots.map((s) => [s.id, s.status]),
    );
    return (recipe) => {
      const after = forecast([
        ...placed,
        { ...slot, recipeId: recipe.id },
      ]).slots;
      const own = after.find((s) => s.id === slot.id);
      if (own?.status !== 'covered') return false;
      // The Shopping List is not stock: a covered slot must stay covered.
      return !after.some(
        (s) => baseline.get(s.id) === 'covered' && s.status !== 'covered',
      );
    };
  }
}

/**
 * How many more empty slots Fill would fill if the Family's Allergies blocked no Recipe. Both
 * runs break ties the same fixed way, so only `blocksFill` differs between them and the answer
 * does not move with the random pick of the Fill that is saved. Greedy runs can still part ways
 * (a blocked Recipe may use up stock or the variety window), so this is an estimate and never
 * below 0.
 */
export function slotsEmptiedByAllergies(
  input: Omit<FillInput, 'tieBreaker'>,
): number {
  const tieBreaker: TieBreaker = (tied) => tied[0];
  const blocked = fillPlan({ ...input, tieBreaker }).length;
  const unblocked = fillPlan({
    ...input,
    recipes: input.recipes.map((recipe) => ({ ...recipe, blocksFill: false })),
    tieBreaker,
  }).length;
  return Math.max(0, unblocked - blocked);
}

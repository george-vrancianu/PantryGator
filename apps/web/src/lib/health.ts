import type { StorageLocation } from './catalog';
import {
  daysUntil,
  defaultExpiryDate,
  fromIso,
  isExpiringSoon,
  localIso,
  type IsoDate,
} from './pantry';

/**
 * Pantry Health: the 0-100 score of how well a Family's Pantry is kept, and the Health To-dos behind
 * it. Pure and client-side; the Widget feeds it what the Dashboard already loads.
 */

/** A Pantry holding fewer Batches than this gets no score, only a progress ring. */
export const MIN_BATCHES_FOR_SCORE = 10;

export const FACTORS = ['fresh', 'supply', 'dated', 'rotation'] as const;
export type HealthFactor = (typeof FACTORS)[number];

/** Each Health Factor's share of the total, in percent. */
export const FACTOR_WEIGHTS: Record<HealthFactor, number> = {
  fresh: 30,
  supply: 45,
  dated: 10,
  rotation: 15,
};

/** How long an undated Batch may sit in a Location before it counts as Forgotten, in days. */
export const FORGOTTEN_AFTER_DAYS: Record<StorageLocation, number> = {
  fridge: 21,
  freezer: 180,
  cupboard: 365,
  spices: 730,
};

export type HealthBatch = {
  id: string;
  /** Null for an Unmatched Batch. */
  ingredientId: string | null;
  location: StorageLocation;
  expiryDate: IsoDate | null;
  /** The Default Expiry in days, resolved by the server; null when there is none. */
  defaultExpiryDays: number | null;
  createdAt: string;
};

export type HealthInput = {
  /** The device's local date. */
  today: IsoDate;
  staleThresholdDays: number;
  batches: HealthBatch[];
  staples: Array<{ ingredientId: string }>;
  /** Ingredient ids flagged Running low. */
  runningLow: ReadonlySet<string>;
  /** Ingredient ids on the Shopping List, checked or not. */
  onShoppingList: ReadonlySet<string>;
  /** Ingredient ids whose missing-Staple Suggestion was dismissed. */
  dismissed: ReadonlySet<string>;
};

export type Verdict = 'good' | 'some' | 'attention';

export const verdictOf = (total: number): Verdict =>
  total >= 85 ? 'good' : total >= 65 ? 'some' : 'attention';

export type PantryHealth =
  | { scored: false; batchCount: number }
  | {
      scored: true;
      /** A factor with nothing to measure is absent, and its weight goes to the others. */
      factors: Partial<Record<HealthFactor, number>>;
      total: number;
      verdict: Verdict;
    };

/** The Health Factors that have a value, in display order. Empty when there is no score. */
export function presentFactors(health: PantryHealth): [HealthFactor, number][] {
  if (!health.scored) return [];
  return FACTORS.flatMap((factor): [HealthFactor, number][] => {
    const value = health.factors[factor];
    return value === undefined ? [] : [[factor, value]];
  });
}

const todayDate = (input: HealthInput) => fromIso(input.today);

const daysLeft = (batch: HealthBatch, input: HealthInput) =>
  daysUntil(batch.expiryDate as IsoDate, todayDate(input));

/** Not expired: undated, or expiring today or later. */
const isLive = (batch: HealthBatch, input: HealthInput) =>
  batch.expiryDate === null || daysLeft(batch, input) >= 0;

/** Whole days since the Batch was added, by the device's calendar. */
export const ageDays = (
  batch: Pick<HealthBatch, 'createdAt'>,
  today: IsoDate,
) => -daysUntil(localIso(new Date(batch.createdAt)), fromIso(today));

const overdueRatio = (batch: HealthBatch, input: HealthInput) =>
  ageDays(batch, input.today) / FORGOTTEN_AFTER_DAYS[batch.location];

/** An undated Batch older than its Location's limit. A dated Batch is never Forgotten. */
export function isForgotten(batch: HealthBatch, today: IsoDate): boolean {
  return (
    batch.expiryDate === null &&
    ageDays(batch, today) > FORGOTTEN_AFTER_DAYS[batch.location]
  );
}

/** The Ingredients that have a live (unexpired) Batch, built once per input. */
function stockedIds(input: HealthInput): Set<string> {
  const stocked = new Set<string>();
  for (const batch of input.batches) {
    if (batch.ingredientId !== null && isLive(batch, input))
      stocked.add(batch.ingredientId);
  }
  return stocked;
}

/** Whether a Staple is missing and not dismissed. */
function isMissingStaple(
  ingredientId: string,
  input: HealthInput,
  stocked: Set<string>,
): boolean {
  return !input.dismissed.has(ingredientId) && !stocked.has(ingredientId);
}

type SupplyState =
  'stocked' | 'lowListed' | 'low' | 'missingListed' | 'missing';

/** What each Supply state earns (ADR 0018). */
const SUPPLY_CREDIT: Record<SupplyState, number> = {
  stocked: 1,
  lowListed: 0.8,
  low: 0.1,
  missingListed: 0.5,
  missing: 0,
};

function supplyState(
  id: string,
  stocked: boolean,
  input: HealthInput,
): SupplyState {
  const listed = input.onShoppingList.has(id);
  if (!stocked) return listed ? 'missingListed' : 'missing';
  if (!input.runningLow.has(id)) return 'stocked';
  return listed ? 'lowListed' : 'low';
}

/** What each Ingredient in Supply earns: the credit by its stock, Running low and Shopping List state. */
function supplyCredits(input: HealthInput): number[] {
  const stockedSet = stockedIds(input);
  const stocked = [...stockedSet];
  const missing = new Set(
    input.staples
      .map((staple) => staple.ingredientId)
      .filter((id) => isMissingStaple(id, input, stockedSet)),
  );
  return [
    ...stocked.map((id) => SUPPLY_CREDIT[supplyState(id, true, input)]),
    ...[...missing].map((id) => SUPPLY_CREDIT[supplyState(id, false, input)]),
  ];
}

/** The mean, or null when there is nothing to measure. */
const mean = (values: number[]) =>
  values.length === 0
    ? null
    : values.reduce((a, b) => a + b, 0) / values.length;

export function pantryHealth(input: HealthInput): PantryHealth {
  const { batches } = input;
  if (batches.length < MIN_BATCHES_FOR_SCORE)
    return { scored: false, batchCount: batches.length };

  const dated = batches.filter((batch) => batch.expiryDate !== null);
  const fresh = mean(
    dated.map((batch) => {
      const days = daysLeft(batch, input);
      if (days < 0) return 0;
      return isExpiringSoon(days, input.staleThresholdDays) ? 0.6 : 1;
    }),
  );
  const supply = mean(supplyCredits(input));
  const datedShare = dated.length / batches.length;
  const rotation =
    1 -
    batches.filter((batch) => isForgotten(batch, input.today)).length /
      batches.length;

  const percent = (value: number | null) =>
    value === null ? null : Math.round(value * 100);
  const measured = {
    fresh: percent(fresh),
    supply: percent(supply),
    dated: percent(datedShare),
    rotation: percent(rotation),
  };
  const factors: Partial<Record<HealthFactor, number>> = {};
  let weighted = 0;
  let weights = 0;
  for (const factor of FACTORS) {
    const value = measured[factor];
    if (value === null) continue;
    factors[factor] = value;
    weighted += FACTOR_WEIGHTS[factor] * value;
    weights += FACTOR_WEIGHTS[factor];
  }
  // weights is never 0: Dated and Rotation always have a value once there is a score (ADR 0018).
  const total = Math.round(weighted / weights);
  return { scored: true, factors, total, verdict: verdictOf(total) };
}

/**
 * The date "Date all" gives a Batch: its Default Expiry counted from the day it was added, or from today
 * when that date has already passed. Null when the Batch has no Default Expiry.
 */
export function usualExpiryDate(
  batch: Pick<HealthBatch, 'createdAt' | 'defaultExpiryDays'>,
  today: IsoDate,
): IsoDate | null {
  if (batch.defaultExpiryDays === null) return null;
  const fromAdded = defaultExpiryDate(
    batch.defaultExpiryDays,
    new Date(batch.createdAt),
  );
  return fromAdded < today
    ? defaultExpiryDate(batch.defaultExpiryDays, fromIso(today))
    : fromAdded;
}

export type HealthTodoKey =
  'expired' | 'missingStaples' | 'expiringSoon' | 'runningLow' | 'undated';
/** The Health To-do keys in display order. */
export const HEALTH_TODO_KEYS: HealthTodoKey[] = [
  'expired',
  'missingStaples',
  'expiringSoon',
  'runningLow',
  'undated',
];
export type HealthTodoGroup = 'now' | 'week' | 'tidy';

export type HealthTodo = {
  key: HealthTodoKey;
  group: HealthTodoGroup;
  factor: HealthFactor;
  /** Batch ids (expired, expiringSoon, undated) or Ingredient ids (missingStaples, runningLow). */
  itemIds: string[];
  /** Points the bulk fix adds to the score; 0 hides the pill (also while not scored). */
  gain: number;
};

type PendingTodo = Omit<HealthTodo, 'gain'>;

/** The input without these Batches (ids), as after Toss or Used. */
export function withoutBatches(
  input: HealthInput,
  ids: Iterable<string>,
): HealthInput {
  const gone = new Set(ids);
  return {
    ...input,
    batches: input.batches.filter((batch) => !gone.has(batch.id)),
  };
}

/** The input with these Ingredients (ids) on the Shopping List, as after an Add. */
export function withOnShoppingList(
  input: HealthInput,
  ingredientIds: Iterable<string>,
): HealthInput {
  return {
    ...input,
    onShoppingList: new Set([...input.onShoppingList, ...ingredientIds]),
  };
}

/** The input with these Batches given these expiry dates (by Batch id), as after dating them. */
export function withExpiryDates(
  input: HealthInput,
  dates: ReadonlyMap<string, IsoDate | null>,
): HealthInput {
  return {
    ...input,
    batches: input.batches.map((batch) => ({
      ...batch,
      expiryDate: dates.has(batch.id)
        ? (dates.get(batch.id) as IsoDate | null)
        : batch.expiryDate,
    })),
  };
}

/** The input after the bulk fix of a Health To-do, or null when the fix cannot be simulated. */
function afterFix(todo: PendingTodo, input: HealthInput): HealthInput | null {
  switch (todo.key) {
    case 'expired':
      return withoutBatches(input, todo.itemIds);
    case 'missingStaples':
    case 'runningLow':
      return withOnShoppingList(input, todo.itemIds);
    case 'undated': {
      const ids = new Set(todo.itemIds);
      const dates = new Map<string, IsoDate | null>();
      for (const batch of input.batches)
        if (ids.has(batch.id))
          dates.set(batch.id, usualExpiryDate(batch, input.today));
      return withExpiryDates(input, dates);
    }
    case 'expiringSoon': // The fix is cooking, which cannot be simulated.
      return null;
  }
}

/** Points the bulk fix adds to the score, 0 when it adds none, cannot be simulated or the Pantry is not scored. */
function gainOf(todo: PendingTodo, input: HealthInput): number {
  const now = pantryHealth(input);
  const fixed = afterFix(todo, input);
  if (!now.scored || fixed === null) return 0;
  const after = pantryHealth(fixed);
  return after.scored ? Math.max(0, after.total - now.total) : 0;
}

const byDaysLeft = (input: HealthInput) => (a: HealthBatch, b: HealthBatch) =>
  daysLeft(a, input) - daysLeft(b, input);

/**
 * The Health To-dos in group order (Now, This week, Tidy up). Items of Ingredient-based to-dos and the
 * undated rest keep the order given; putting them in Aisle order is the caller's job.
 */
export function healthTodos(input: HealthInput): HealthTodo[] {
  const dated = input.batches.filter((batch) => batch.expiryDate !== null);
  const expired = dated
    .filter((batch) => daysLeft(batch, input) < 0)
    .sort(byDaysLeft(input));
  const expiringSoon = dated
    .filter((batch) =>
      isExpiringSoon(daysLeft(batch, input), input.staleThresholdDays),
    )
    .sort(byDaysLeft(input));
  const stockedSet = stockedIds(input);
  const missingStaples = input.staples
    .map((staple) => staple.ingredientId)
    .filter(
      (id) =>
        isMissingStaple(id, input, stockedSet) && !input.onShoppingList.has(id),
    );
  const runningLow = [...input.runningLow].filter(
    (id) => !input.onShoppingList.has(id) && stockedSet.has(id),
  );
  const undated = input.batches.filter((batch) => batch.expiryDate === null);
  const forgotten = undated
    .filter((batch) => isForgotten(batch, input.today))
    .sort((a, b) => overdueRatio(b, input) - overdueRatio(a, input));
  const rest = undated.filter((batch) => !isForgotten(batch, input.today));

  const todos: PendingTodo[] = [
    {
      key: 'expired',
      group: 'now',
      factor: 'fresh',
      itemIds: expired.map((batch) => batch.id),
    },
    {
      key: 'missingStaples',
      group: 'now',
      factor: 'supply',
      itemIds: missingStaples,
    },
    {
      key: 'expiringSoon',
      group: 'week',
      factor: 'fresh',
      itemIds: expiringSoon.map((batch) => batch.id),
    },
    {
      key: 'runningLow',
      group: 'week',
      factor: 'supply',
      itemIds: runningLow,
    },
    {
      key: 'undated',
      group: 'tidy',
      factor: 'dated',
      itemIds: [...forgotten, ...rest].map((batch) => batch.id),
    },
  ];
  return todos
    .filter((todo) => todo.itemIds.length > 0)
    .map((todo) => ({ ...todo, gain: gainOf(todo, input) }));
}

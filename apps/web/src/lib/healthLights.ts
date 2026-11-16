// Pantry Health lights: which dashboard lights are on. Pure, no I/O.
// The three counts are the item counts of the Health To-dos that lib/health.ts builds
// (`expired`, `useSoon`, `runningLow`), so a light and its To-do in the sheet always agree.

/** "Fresh in" stays on while something was stocked today or on one of the two days before. */
export const FRESH_IN_DAYS = 2;
/** "Nothing new" takes over once nothing has been stocked for this many days. */
export const NOTHING_NEW_AFTER_DAYS = 14;
/** Counts above this read "9+". */
export const LIGHT_COUNT_CAP = 9;

export type HealthLightId = 'expired' | 'soon' | 'low' | 'fresh' | 'nothingNew';

export type HealthLight = {
  id: HealthLightId;
  on: boolean;
  /** Shown bottom-right of a lit lamp. null = this light never shows a count. */
  count: number | null;
};

export type HealthLightsInput = {
  /** Batches past their date (the `expired` Health To-do). */
  expired: number;
  /** Batches inside the Expiring Soon window (the `expiringSoon` Health To-do). */
  useSoon: number;
  /** Ingredients flagged Running low, in stock and not on the Shopping List (the `runningLow` Health To-do). */
  runningLow: number;
  /** When the Family last stocked something, from the API (later of Stock history and newest Batch). null = never. */
  lastStockedAt: Date | string | null;
  /** The device's local date. */
  today: Date;
};

/** Whole local calendar days from `from` to `to` (0 = same day, negative = `from` is later). */
export function wholeDaysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / 86_400_000);
}

/** Always four lights: Expired, Use soon, Running low, then Fresh in (lit or unlit) or Nothing new (lit). */
export function healthLights(
  input: HealthLightsInput,
): [HealthLight, HealthLight, HealthLight, HealthLight] {
  return [
    { id: 'expired', on: input.expired > 0, count: input.expired },
    { id: 'soon', on: input.useSoon > 0, count: input.useSoon },
    { id: 'low', on: input.runningLow > 0, count: input.runningLow },
    arrivalLight(input.lastStockedAt, input.today),
  ];
}

function arrivalLight(
  lastStockedAt: Date | string | null,
  today: Date,
): HealthLight {
  if (lastStockedAt === null) return { id: 'fresh', on: false, count: null };
  const stocked =
    typeof lastStockedAt === 'string' ? new Date(lastStockedAt) : lastStockedAt;
  const days = wholeDaysBetween(stocked, today);
  if (days <= FRESH_IN_DAYS) return { id: 'fresh', on: true, count: null };
  if (days >= NOTHING_NEW_AFTER_DAYS)
    return { id: 'nothingNew', on: true, count: null };
  return { id: 'fresh', on: false, count: null };
}

/** The count as drawn in the lamp: "3", or "9+" past the cap. Empty for 0 and for lights without a count. */
export function lightCountLabel(light: HealthLight): string {
  if (!light.on || light.count === null || light.count <= 0) return '';
  return light.count > LIGHT_COUNT_CAP
    ? `${LIGHT_COUNT_CAP}+`
    : String(light.count);
}

/** Needle rotation in degrees for a 0-100 score: -60 at 0, 0 (straight up) at 50, +60 at 100. */
export function dialAngle(score: number): number {
  const s = Math.min(100, Math.max(0, score));
  return -60 + 120 * (s / 100);
}

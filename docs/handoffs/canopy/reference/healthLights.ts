// Pantry health — which dashboard lights are on, and where the needle points.
// Pure functions, no I/O. Suggested home: apps/web/src/lib/healthLights.ts, next to lib/health.ts.
// The three counts are the item counts of the health to-dos that lib/health.ts already builds
// (`expired`, `useSoon`, `runningLow`), so a light and its to-do in the sheet always agree.

/** "Fresh in" stays on while the newest Batch was added today or on one of the two days before. */
export const FRESH_IN_DAYS = 2;
/** "Stale" takes over once nothing has been added for this many days. */
export const STALE_AFTER_DAYS = 14;
/** Counts above this read "9+". */
export const LIGHT_COUNT_CAP = 9;

export type HealthLightId = 'expired' | 'soon' | 'low' | 'fresh' | 'stale';

export interface HealthLight {
  id: HealthLightId;
  on: boolean;
  /** Shown bottom-right of a lit lamp. null = this light never shows a count. */
  count: number | null;
}

export interface HealthLightsInput {
  /** Batches past their date (the `expired` to-do). */
  expired: number;
  /** Batches inside the Expiring soon window (the `useSoon` to-do). */
  useSoon: number;
  /** Ingredients flagged Running low, still in stock and not on the Shopping List (the `runningLow` to-do). */
  runningLow: number;
  /** When the newest Batch was added: max(createdAt) over the Family's Batches. null = no Batches. */
  lastAddedAt: Date | string | null;
  /** The device's local date, as in the expiry handoff. */
  today: Date;
}

/** Whole local calendar days from `from` to `to` (0 = same day, negative = `from` is later). */
export function wholeDaysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / 86_400_000);
}

/**
 * Always four lights, in this order: Expired, Use soon, Running low, and position 4,
 * which is Fresh in (lit or unlit) or Stale (always lit when it is there).
 */
export function healthLights(input: HealthLightsInput): [HealthLight, HealthLight, HealthLight, HealthLight] {
  const expired: HealthLight = { id: 'expired', on: input.expired > 0, count: input.expired };
  const soon: HealthLight = { id: 'soon', on: input.useSoon > 0, count: input.useSoon };
  const low: HealthLight = { id: 'low', on: input.runningLow > 0, count: input.runningLow };
  return [expired, soon, low, arrivalLight(input.lastAddedAt, input.today)];
}

function arrivalLight(lastAddedAt: Date | string | null, today: Date): HealthLight {
  if (lastAddedAt === null) return { id: 'fresh', on: false, count: null };
  const added = typeof lastAddedAt === 'string' ? new Date(lastAddedAt) : lastAddedAt;
  const days = wholeDaysBetween(added, today);
  if (days <= FRESH_IN_DAYS) return { id: 'fresh', on: true, count: null };
  if (days >= STALE_AFTER_DAYS) return { id: 'stale', on: true, count: null };
  return { id: 'fresh', on: false, count: null };
}

/** The count as drawn in the lamp: "3", or "9+" past the cap. Empty for 0 and for lights without a count. */
export function lightCountLabel(light: HealthLight): string {
  if (!light.on || light.count === null || light.count <= 0) return '';
  return light.count > LIGHT_COUNT_CAP ? `${LIGHT_COUNT_CAP}+` : String(light.count);
}

/** Needle rotation in degrees for a 0–100 score: −60° at 0, 0° (straight up) at 50, +60° at 100. */
export function dialAngle(score: number): number {
  const s = Math.min(100, Math.max(0, score));
  return -60 + 120 * (s / 100);
}

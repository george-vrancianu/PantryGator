import { describe, expect, it } from 'vitest';
// The seed's plan is plain data with no imports, so the real Pantry Health can score it here.
import {
  DEMO_BATCHES,
  DEMO_RUNNING_LOW,
  DEMO_SHOPPING,
  DEMO_STAPLES,
} from '../../../api/src/demo/demo-plan';
import { pantryHealth, type HealthInput } from './health';

/** The Pantry `demo:seed` writes, as the Dashboard would read it on the seed day. Slugs stand in for ids. */
function demoInput(today: string): HealthInput {
  const day = new Date(`${today}T12:00:00Z`);
  const shift = (days: number) =>
    new Date(day.getTime() + days * 86_400_000).toISOString();
  return {
    today: today as HealthInput['today'],
    staleThresholdDays: 3,
    batches: DEMO_BATCHES.map((batch, index) => ({
      id: String(index),
      ingredientId: batch.ingredient,
      location: batch.location,
      expiryDate:
        batch.expiresIn === null
          ? null
          : (shift(batch.expiresIn).slice(0, 10) as HealthInput['today']),
      defaultExpiryDays: null,
      createdAt: shift(-batch.addedDaysAgo),
    })),
    staples: DEMO_STAPLES.map((ingredientId) => ({ ingredientId })),
    runningLow: new Set(DEMO_RUNNING_LOW),
    onShoppingList: new Set(
      DEMO_SHOPPING.flatMap((item) =>
        item.ingredient ? [item.ingredient] : [],
      ),
    ),
    dismissed: new Set(),
  };
}

describe('the demo:seed Pantry', () => {
  // Any day gives the same score: every date in the plan is an offset from the seed day.
  it.each(['2026-11-11', '2027-03-01', '2028-02-29'])(
    'scores medium Pantry Health (70-80) when seeded on %s',
    (today) => {
      const health = pantryHealth(demoInput(today));
      expect(health.scored).toBe(true);
      if (!health.scored) return;
      expect(health.verdict).toBe('some');
      expect(health.total).toBeGreaterThanOrEqual(70);
      expect(health.total).toBeLessThanOrEqual(80);
    },
  );
});

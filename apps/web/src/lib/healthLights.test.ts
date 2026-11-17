import { describe, expect, it } from 'vitest';
import {
  FRESH_IN_DAYS,
  NOTHING_NEW_AFTER_DAYS,
  dialAngle,
  healthLights,
  lightCountLabel,
  wholeDaysBetween,
  type HealthLightsInput,
} from './healthLights';

const today = new Date(2026, 10, 16, 15, 30);
const daysAgo = (days: number) => new Date(2026, 10, 16 - days, 3, 0);

const input = (
  overrides: Partial<HealthLightsInput> = {},
): HealthLightsInput => ({
  expired: 0,
  useSoon: 0,
  runningLow: 0,
  lastStockedAt: daysAgo(5),
  today,
  ...overrides,
});

describe('healthLights', () => {
  it('has four lights in order: Expired, Use soon, Running low, then Fresh in or Nothing new', () => {
    expect(healthLights(input()).map((light) => light.id)).toEqual([
      'expired',
      'soon',
      'low',
      'fresh',
    ]);
  });

  it.each([
    ['expired', 0, false],
    ['expired', 1, true],
    ['useSoon', 0, false],
    ['useSoon', 4, true],
    ['runningLow', 0, false],
    ['runningLow', 2, true],
  ] as const)(
    'lights %s exactly when its count is above 0 (%i is %s)',
    (key, count, on) => {
      const index = { expired: 0, useSoon: 1, runningLow: 2 }[key];
      const light = healthLights(input({ [key]: count }))[index];
      expect(light.on).toBe(on);
      expect(light.count).toBe(count);
    },
  );

  it.each([
    [0, 'fresh', true],
    [1, 'fresh', true],
    [FRESH_IN_DAYS, 'fresh', true],
    [3, 'fresh', false],
    [13, 'fresh', false],
    [NOTHING_NEW_AFTER_DAYS, 'nothingNew', true],
    [40, 'nothingNew', true],
  ] as const)('position 4 after %i days is %s, lit %s', (days, id, on) => {
    const light = healthLights(input({ lastStockedAt: daysAgo(days) }))[3];
    expect(light).toEqual({ id, on, count: null });
  });

  it('shows an unlit Fresh in for a Pantry that was never stocked', () => {
    expect(healthLights(input({ lastStockedAt: null }))[3]).toEqual({
      id: 'fresh',
      on: false,
      count: null,
    });
  });

  it('counts a time in the future as fresh', () => {
    expect(healthLights(input({ lastStockedAt: daysAgo(-2) }))[3].on).toBe(
      true,
    );
  });

  it('reads the time as an ISO string from the API', () => {
    expect(
      healthLights(input({ lastStockedAt: daysAgo(20).toISOString() }))[3].id,
    ).toBe('nothingNew');
  });

  it('counts calendar days by the device date, not 24-hour spans', () => {
    expect(
      wholeDaysBetween(
        new Date(2026, 10, 15, 23, 59),
        new Date(2026, 10, 16, 0, 1),
      ),
    ).toBe(1);
  });

  it('draws counts above 9 as 9+ and nothing for unlit lights or lights without a count', () => {
    const [expired, soon, , fresh] = healthLights(
      input({ expired: 12, useSoon: 0, lastStockedAt: daysAgo(0) }),
    );
    expect(lightCountLabel(expired)).toBe('9+');
    expect(lightCountLabel(soon)).toBe('');
    expect(lightCountLabel(fresh)).toBe('');
    expect(lightCountLabel(healthLights(input({ expired: 3 }))[0])).toBe('3');
  });
});

describe('dialAngle', () => {
  it('gives -60, 0 and 60 degrees for 0, 50 and 100 and clamps outside', () => {
    expect(dialAngle(0)).toBe(-60);
    expect(dialAngle(50)).toBe(0);
    expect(dialAngle(100)).toBe(60);
    expect(dialAngle(-20)).toBe(-60);
    expect(dialAngle(140)).toBe(60);
  });
});

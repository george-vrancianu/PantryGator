import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MealWindow, WindowDay } from '@/lib/mealPlan';
import { renderWithProviders, stubApi } from '@/test/render';
import { iso, useFixedToday } from '@/test/mealPlans';
import { MealPlanWidget } from './MealPlanWidget';

const slotOn = (offset: number) => ({
  dayIndex: offset,
  date: iso(offset),
  mealtime: 'dinner' as const,
  planId: 'p1',
  recipeId: 'r1',
  recipeTitle: 'Lemon pasta',
  servings: 2,
  servingsOverride: null,
  unavailable: false,
  minutes: 25,
  allergyWarning: null,
  aisle: null,
  status: 'covered' as const,
  issues: [],
});

const day = (offset: number, planned: boolean): WindowDay => ({
  date: iso(offset),
  status: planned ? 'covered' : 'empty',
  planId: 'p1',
  slots: planned ? [slotOn(offset)] : [],
});

const windowOf = (over: Partial<MealWindow>): MealWindow => ({
  today: iso(0),
  days: [],
  tag: { kind: 'allCovered' },
  plan: null,
  nextPlanStart: null,
  nextPlanId: null,
  missing: [],
  ...over,
});

function setup(view: MealWindow) {
  const { fetchMock } = stubApi({
    'GET /api/meal-plans/window': () => Response.json(view),
  });
  vi.stubGlobal('fetch', fetchMock);
  renderWithProviders(<MealPlanWidget size="wide" columns={2} />);
}

describe('Meal plan Widget links', () => {
  beforeEach(useFixedToday);
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('links the header to the plan covering today', async () => {
    setup(
      windowOf({
        days: [day(0, true), day(1, true)],
        plan: { id: 'p1', name: null, startDate: iso(0), days: 2, servings: 2 },
      }),
    );
    expect(
      await screen.findByRole('link', { name: /Meal plan · 2 days/ }),
    ).toHaveAttribute('href', '/meal-plans/p1');
  });

  it('links Edit day to the plan opened on that day', async () => {
    setup(windowOf({ days: [day(0, true), day(1, true)] }));
    const u = userEvent.setup();
    await u.click((await screen.findAllByRole('button', { name: /meal/ }))[1]);
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByRole('link', { name: 'Edit day' }),
    ).toHaveAttribute('href', `/meal-plans/p1?day=${iso(1)}`);
  });

  it('links Plan a meal on an empty day of a plan to that plan and day', async () => {
    setup(windowOf({ days: [day(0, true), day(1, false)] }));
    const u = userEvent.setup();
    await u.click((await screen.findAllByRole('button', { name: /./ }))[1]);
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByRole('link', { name: 'Plan a meal' }),
    ).toHaveAttribute('href', `/meal-plans/p1?day=${iso(1)}`);
  });

  it('links Start a plan on a day outside every plan to a new plan starting that day', async () => {
    const outside = { ...day(1, false), planId: null };
    setup(windowOf({ days: [day(0, true), outside] }));
    const u = userEvent.setup();
    await u.click((await screen.findAllByRole('button', { name: /./ }))[1]);
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByRole('link', { name: 'Start a plan' }),
    ).toHaveAttribute('href', `/meal-plans/new?start=${iso(1)}`);
  });

  it('links Plan your week to a new plan starting today', async () => {
    setup(windowOf({ days: [], tag: { kind: 'none' } }));
    expect(
      await screen.findByRole('link', { name: 'Plan your week' }),
    ).toHaveAttribute('href', `/meal-plans/new?start=${iso(0)}`);
  });
});
